import { HttpsError, logger, platform, randomInt, db, RULES, FieldValue, newId, rollExpr, addLog, loadCampaign, loadCharacter, assertCanControl, str, clamp, DEFAULT_SETTINGS } from "./common.js";
import {
  ABILITIES, STANDARD_ARRAY, POINT_BUY_TOTAL, pointBuySpent, mod, profBonus, hpAtLevel1, hpAverageGain,
  spellSlotsFor, spellLimits, classResources, levelUpChoices, XP_TABLE, derive,
} from "../engine.js";

const R = RULES;
const sameMultiset = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

function expandItems(items) {
  const out = [];
  for (const it of items || []) {
    const eq = R.equipment[it.index];
    if (eq?.contents?.length) {
      for (const c of eq.contents) {
        const sub = R.equipment[c.index];
        out.push({ index: c.index, name: sub?.name || c.index, qty: c.count * (it.count || 1) });
      }
    } else out.push({ index: it.index, name: eq?.name || it.name || it.index, qty: it.count || 1 });
  }
  return out;
}

function mergeInventory(list) {
  const map = new Map();
  for (const it of list) {
    const k = it.index || it.name;
    if (map.has(k)) map.get(k).qty += it.qty; else map.set(k, { ...it });
  }
  return [...map.values()].map((it) => ({ id: newId(8), equipped: false, notes: "", ...it }));
}

/** Équipe automatiquement la meilleure armure, un bouclier et deux armes au départ. */
function autoEquip(ch) {
  const inv = ch.inventory;
  const armors = inv.filter((i) => R.equipment[i.index]?.ac && !R.equipment[i.index].cats.includes("shields"));
  if (armors.length) {
    const best = armors.sort((a, b) => R.equipment[b.index].ac.base - R.equipment[a.index].ac.base)[0];
    best.equipped = true;
  }
  const shield = inv.find((i) => R.equipment[i.index]?.cats?.includes("shields"));
  const weapons = inv.filter((i) => R.equipment[i.index]?.damage);
  const twoH = weapons.some((w) => (R.equipment[w.index].props || []).includes("two-handed"));
  if (shield && !(twoH && ch.class !== "fighter" && ch.class !== "paladin")) shield.equipped = true;
  weapons.slice(0, 2).forEach((w) => (w.equipped = true));
}

function buildSlots(ch, prev = {}) {
  const slots = {};
  for (const [lvl, n] of Object.entries(spellSlotsFor(R, ch))) slots[lvl] = { max: n, used: Math.min(prev[lvl]?.used || 0, n) };
  return slots;
}
function buildResources(ch, prev = {}) {
  const res = {};
  for (const [k, r] of Object.entries(classResources(R, ch))) res[k] = { ...r, used: Math.min(prev[k]?.used || 0, r.max) };
  return res;
}

function validateSpells(ch, cantrips, spells, limits) {
  const cls = ch.class;
  for (const s of cantrips) { const sp = R.spells[s]; if (!sp || sp.level !== 0 || !sp.classes.includes(cls)) throw new HttpsError("invalid-argument", `Tour de magie invalide : ${s}`); }
  for (const s of spells) { const sp = R.spells[s]; if (!sp || sp.level < 1 || sp.level > limits.maxLevel || !sp.classes.includes(cls)) throw new HttpsError("invalid-argument", `Sort invalide : ${s}`); }
  if (new Set(cantrips).size !== cantrips.length || new Set(spells).size !== spells.length) throw new HttpsError("invalid-argument", "Sort en double.");
}

export async function rollAbilityScores(uid, { campaignId }) {
  const { data: c } = await loadCampaign(campaignId, uid);
  const ref = db.doc(`campaigns/${campaignId}/abilityRolls/${uid}`);
  const prev = await ref.get();
  if (prev.exists && prev.data().used === false) return prev.data(); // un seul tirage par personnage : pas de « re-roll » caché
  const sets = Array.from({ length: 6 }, () => rollExpr("4d6kh3"));
  const values = sets.map((s) => s.total);
  const out = { values, details: sets.map((s) => ({ dice: s.groups[0].values })) /* pas de tableaux de tableaux dans Firestore */, used: false, at: Date.now() };
  await ref.set(out);
  await addLog(campaignId, { type: "roll", uid, authorName: c.memberNames?.[uid] || "Joueur", label: "Caractéristiques (4d6, on garde les 3 meilleurs) ×6",
    roll: { expr: "6×4d6kh3", total: values.reduce((a, b) => a + b, 0), list: values, groups: sets.map((s) => s.groups[0]) } });
  return out;
}

export async function createCharacter(uid, { campaignId, draft }) {
  const { ref: cref, data: c } = await loadCampaign(campaignId, uid);
  const d = draft || {};
  const cls = R.classes[d.class]; const sp = R.species[d.species]; const bg = R.backgrounds[d.background];
  if (!cls || !sp || !bg) throw new HttpsError("invalid-argument", "Classe, espèce ou historique invalide.");
  if (sp.subspecies.length && !sp.subspecies.includes(d.subspecies)) throw new HttpsError("invalid-argument", "Choisis une lignée.");
  if (c.worldId) {
    const w = (await db.doc(`worlds/${c.worldId}`).get()).data();
    const okC = w?.setup?.allowedClasses; const okS = w?.setup?.allowedSpecies;
    if (okC?.length && !okC.includes(d.class)) throw new HttpsError("invalid-argument", "Cette classe n'existe pas dans ce monde (réglage de l'hôte).");
    if (okS?.length && !okS.includes(d.species)) throw new HttpsError("invalid-argument", "Ce peuple n'existe pas dans ce monde (réglage de l'hôte).");
  }
  const name = str(d.name, 60).trim();
  if (!name) throw new HttpsError("invalid-argument", "Ton personnage a besoin d'un nom.");

  // Caractéristiques de base
  const base = {}; for (const a of ABILITIES) base[a] = parseInt(d.base?.[a], 10);
  const vals = ABILITIES.map((a) => base[a]);
  let rollRef = null;
  if (d.abilityMethod === "standard") { if (!sameMultiset(vals, STANDARD_ARRAY)) throw new HttpsError("invalid-argument", "Le tableau standard doit être utilisé tel quel."); }
  else if (d.abilityMethod === "pointbuy") { if (pointBuySpent(base) > POINT_BUY_TOTAL) throw new HttpsError("invalid-argument", "Trop de points dépensés."); }
  else if (d.abilityMethod === "roll") {
    rollRef = db.doc(`campaigns/${campaignId}/abilityRolls/${uid}`);
    const r = await rollRef.get();
    if (!r.exists || r.data().used || !sameMultiset(vals, r.data().values)) throw new HttpsError("invalid-argument", "Les valeurs ne correspondent pas aux dés lancés.");
  } else throw new HttpsError("invalid-argument", "Méthode de caractéristiques inconnue.");

  // Bonus d'historique : +2/+1 ou +1/+1/+1 parmi les trois caractéristiques de l'historique
  const bonus = d.bgBonus || {}; const bk = Object.keys(bonus).filter((k) => bonus[k]);
  const bv = bk.map((k) => bonus[k]).sort().join(",");
  if (!bk.every((k) => bg.abilities.includes(k)) || !(bv === "1,2" || bv === "1,1,1")) throw new HttpsError("invalid-argument", "Bonus d'historique invalide (+2/+1 ou +1/+1/+1).");
  const abilities = {}; for (const a of ABILITIES) abilities[a] = Math.min(20, base[a] + (bonus[a] || 0));

  // Compétences
  const skills = new Set(bg.skills);
  const cs = d.classSkills || [];
  if (cs.length !== cls.skills.choose || !cs.every((s) => cls.skills.from.includes(s) && !bg.skills.includes(s))) throw new HttpsError("invalid-argument", `Choisis ${cls.skills.choose} compétences de classe (différentes de celles de l'historique).`);
  cs.forEach((s) => skills.add(s));
  const feats = [bg.feat.index].filter(Boolean);
  const traits = [...sp.traits, ...(d.subspecies ? R.subspecies[d.subspecies]?.traits || [] : [])];
  if (d.species === "human") {
    if (!R.skills[d.humanSkill] || skills.has(d.humanSkill)) throw new HttpsError("invalid-argument", "Choisis la compétence bonus de l'humain.");
    skills.add(d.humanSkill);
    if (R.feats[d.humanFeat]?.type !== "origin") throw new HttpsError("invalid-argument", "Choisis le don d'origine bonus de l'humain.");
    if (d.humanFeat !== bg.feat.index || R.feats[d.humanFeat].repeatable) feats.push(d.humanFeat);
  }
  const lvl1 = cls.levels["1"].features;
  if (lvl1.some((f) => f.endsWith("fighting-style"))) {
    if (R.feats[d.fightingStyle]?.type !== "fighting-style") throw new HttpsError("invalid-argument", "Choisis un style de combat.");
    feats.push(d.fightingStyle);
  }
  let expertise = [];
  if (lvl1.some((f) => f.endsWith("-expertise"))) {
    expertise = (d.expertise || []).slice(0, 2);
    if (expertise.length !== 2 || !expertise.every((s) => skills.has(s))) throw new HttpsError("invalid-argument", "Choisis 2 compétences maîtrisées pour l'Expertise.");
  }

  // Équipement
  const pick = (opts, i) => { const o = opts?.[0]?.options?.[parseInt(i, 10)]; if (opts?.length && !o) throw new HttpsError("invalid-argument", "Choix d'équipement invalide."); return o || { items: [], gold: 0 }; };
  const ce = pick(cls.equipment, d.equipClass); const be = pick(bg.equipment, d.equipBg);
  const inventory = mergeInventory(expandItems([...ce.items, ...be.items]));
  const gold = (ce.gold || 0) + (be.gold || 0);

  const ch = {
    ownerUid: uid, ownerName: c.memberNames?.[uid] || "Joueur", name,
    species: d.species, subspecies: d.subspecies || null, class: d.class, subclass: null, background: d.background,
    level: 1, xp: 0, abilities, baseAbilities: base, abilityMethod: d.abilityMethod, bgBonus: bonus,
    skills: [...skills], expertise, feats, traits, extraProfs: [],
    inventory, gold, conditions: [], exhaustion: 0, inspiration: false, deathSaves: { success: 0, fail: 0 },
    appearance: str(d.appearance, 1500), backstory: str(d.backstory, 4000), portrait: str(d.portrait, 8) || "🛡️",
    origin: str(d.origin, 120), notes: "", levelUpReady: false, alive: true,
  };
  autoEquip(ch);
  const hpMax = hpAtLevel1(R, ch);
  ch.hp = { max: hpMax, current: hpMax, temp: 0 };
  ch.hitDice = { die: cls.hitDie, total: 1, remaining: 1 };
  ch.slots = buildSlots(ch); ch.resources = buildResources(ch);
  const lim = spellLimits(R, ch);
  const cantrips = (d.cantrips || []).slice(0, 10); const spells = (d.spells || []).slice(0, 30);
  if (cls.castAbility && lim.prepared) {
    validateSpells(ch, cantrips, spells, lim);
    if (cantrips.length !== lim.cantrips) throw new HttpsError("invalid-argument", `Choisis ${lim.cantrips} tours de magie.`);
    if (spells.length !== lim.prepared) throw new HttpsError("invalid-argument", `Choisis ${lim.prepared} sorts préparés.`);
  }
  ch.spells = { cantrips: cls.castAbility ? cantrips : [], prepared: cls.castAbility ? spells : [], book: d.class === "wizard" ? [...spells] : [] };
  ch.featureList = [...lvl1];
  ch.createdAt = Date.now();

  const ref = db.collection(`campaigns/${campaignId}/characters`).doc();
  await ref.set(ch);
  await cref.update({ [`activeCharacters.${uid}`]: ref.id });
  if (rollRef) await rollRef.update({ used: true });
  await addLog(campaignId, { type: "system", text: `${ch.portrait} ${name}, ${R.species[d.species].nameFr.toLowerCase()} ${R.classes[d.class].nameFr.toLowerCase()} (${R.backgrounds[d.background].nameFr.toLowerCase()}), rejoint l'aventure !` });
  return { id: ref.id };
}

export async function levelUp(uid, { campaignId, characterId, choices = {} }) {
  const { data: c } = await loadCampaign(campaignId, uid);
  const { ref, data: ch } = await loadCharacter(campaignId, characterId);
  assertCanControl(c, uid, ch);
  const settings = { ...DEFAULT_SETTINGS, ...(c.settings || {}) };
  const newLevel = ch.level + 1;
  if (newLevel > 20) throw new HttpsError("failed-precondition", "Niveau maximum atteint.");
  if (!(ch.levelUpReady || ch.xp >= XP_TABLE[ch.level])) throw new HttpsError("failed-precondition", "Pas encore assez d'expérience.");
  const need = levelUpChoices(R, ch, newLevel);
  const upd = {}; const next = { ...ch, level: newLevel };

  if (need.subclass) {
    const sc = R.subclasses[choices.subclass];
    if (!sc || sc.class !== ch.class) throw new HttpsError("invalid-argument", "Choisis ta sous-classe.");
    next.subclass = choices.subclass;
  }
  next.feats = [...(ch.feats || [])]; next.abilities = { ...ch.abilities };
  if (need.asi || need.epicBoon) {
    const a = choices.asi || {};
    if (a.mode === "asi" || (need.asi && !a.mode)) {
      const inc = a.inc || {}; const vals = Object.values(inc).map(Number).sort().join(",");
      if (!(vals === "2" || vals === "1,1") || !Object.keys(inc).every((k) => ABILITIES.includes(k))) throw new HttpsError("invalid-argument", "Amélioration : +2 à une caractéristique ou +1 à deux.");
      const cap = need.epicBoon ? 30 : 20;
      for (const [k, v] of Object.entries(inc)) next.abilities[k] = Math.min(cap, next.abilities[k] + Number(v));
    } else if (a.mode === "feat") {
      const f = R.feats[a.feat];
      const okType = need.epicBoon ? ["epic-boon", "general"] : ["general", "origin"];
      if (!f || !okType.includes(f.type) || (next.feats.includes(a.feat) && !f.repeatable)) throw new HttpsError("invalid-argument", "Don invalide.");
      next.feats.push(a.feat);
      if (a.inc) for (const [k, v] of Object.entries(a.inc)) if (ABILITIES.includes(k)) next.abilities[k] = Math.min(need.epicBoon ? 30 : 20, next.abilities[k] + clamp(Number(v), 0, 1));
    } else throw new HttpsError("invalid-argument", "Choix d'amélioration manquant.");
  }
  if (need.fightingStyle) {
    if (R.feats[choices.fightingStyle]?.type !== "fighting-style" || next.feats.includes(choices.fightingStyle)) throw new HttpsError("invalid-argument", "Choisis un style de combat.");
    next.feats.push(choices.fightingStyle);
  }
  next.expertise = [...(ch.expertise || [])];
  if (need.expertise) {
    const e = choices.expertise || [];
    if (e.length !== 2 || !e.every((s) => ch.skills.includes(s) && !next.expertise.includes(s))) throw new HttpsError("invalid-argument", "Choisis 2 compétences pour l'Expertise.");
    next.expertise.push(...e);
  }
  // Points de vie
  const conMod = mod(next.abilities.con);
  let gain; let rollInfo = null;
  if (settings.hpMethod === "roll") { const r = rollExpr(`1d${need.hitDie}`); gain = r.total; rollInfo = r; }
  else gain = hpAverageGain(need.hitDie);
  gain = Math.max(1, gain + conMod) + ((ch.traits || []).includes("dwarven-toughness") ? 1 : 0);
  // Rétroactif si la CON a augmenté
  const conDelta = (conMod - mod(ch.abilities.con)) * ch.level;
  next.hp = { ...ch.hp, max: ch.hp.max + gain + conDelta, current: ch.hp.current + gain + conDelta };
  next.hitDice = { ...ch.hitDice, total: newLevel, remaining: (ch.hitDice?.remaining || 0) + 1 };
  // Sorts
  const lim = spellLimits(R, next, newLevel);
  const curC = ch.spells?.cantrips || []; const curP = ch.spells?.prepared || [];
  const addC = (choices.cantrips || []).filter((s) => !curC.includes(s));
  const addP = (choices.spells || []).filter((s) => !curP.includes(s));
  if (R.classes[ch.class].castAbility) {
    validateSpells(next, addC, addP, lim);
    if (addC.length > need.newCantrips || addP.length > need.newPrepared) throw new HttpsError("invalid-argument", "Trop de nouveaux sorts.");
  }
  next.spells = { cantrips: [...curC, ...addC], prepared: [...curP, ...addP], book: ch.class === "wizard" ? [...new Set([...(ch.spells?.book || []), ...addP, ...(choices.bookSpells || []).filter((s) => R.spells[s]?.classes.includes("wizard") && R.spells[s].level <= lim.maxLevel).slice(0, 2)])] : [] };
  next.slots = buildSlots(next, ch.slots); next.resources = buildResources(next, ch.resources);
  next.featureList = [...(ch.featureList || []), ...need.features];

  Object.assign(upd, { level: newLevel, subclass: next.subclass || ch.subclass || null, feats: next.feats, abilities: next.abilities,
    expertise: next.expertise, hp: next.hp, hitDice: next.hitDice, spells: next.spells, slots: next.slots,
    resources: next.resources, featureList: next.featureList, levelUpReady: false });
  await ref.update(upd);
  await addLog(campaignId, { type: "system", text: `⭐ ${ch.name} passe au niveau ${newLevel} ! (+${gain + conDelta} PV${rollInfo ? `, dé de vie : ${rollInfo.total}` : ""})` });
  return { ok: true, gain };
}

export async function rest(uid, { campaignId, characterId, type }) {
  const { data: c } = await loadCampaign(campaignId, uid);
  const { ref, data: ch } = await loadCharacter(campaignId, characterId);
  assertCanControl(c, uid, ch);
  const grant = c.state?.restGrant;
  const granted = grant && grant.type && (grant.type === type || grant.type === "long") && Date.now() - grant.at < 3 * 3600e3;
  if (c.ownerUid !== uid && !granted) throw new HttpsError("failed-precondition", "Le MJ n'a pas encore accordé de repos.");
  if (!["short", "long"].includes(type)) throw new HttpsError("invalid-argument", "Type de repos inconnu.");
  const used = new Set(grant?.usedBy?.[type] || []);
  if (c.ownerUid !== uid && used.has(characterId)) throw new HttpsError("failed-precondition", "Repos déjà pris.");
  const res = { ...(ch.resources || {}) };
  for (const k of Object.keys(res)) if (type === "long" || res[k].rest === "short") res[k] = { ...res[k], used: 0 };
  const upd = { resources: res };
  if (type === "long") {
    upd.hp = { ...ch.hp, current: ch.hp.max, temp: 0 };
    upd.slots = Object.fromEntries(Object.entries(ch.slots || {}).map(([k, v]) => [k, { ...v, used: 0 }]));
    upd.hitDice = { ...ch.hitDice, remaining: ch.hitDice.total };
    upd.exhaustion = Math.max(0, (ch.exhaustion || 0) - 1);
    upd.deathSaves = { success: 0, fail: 0 };
    upd.conditions = (ch.conditions || []).filter((x) => !["unconscious", "prone"].includes(x));
  } else if (ch.class === "warlock") {
    upd.slots = Object.fromEntries(Object.entries(ch.slots || {}).map(([k, v]) => [k, { ...v, used: 0 }]));
  }
  await ref.update(upd);
  await db.doc(`campaigns/${campaignId}`).update({ [`state.restGrant.usedBy.${type}`]: FieldValue.arrayUnion(characterId) });
  await addLog(campaignId, { type: "system", text: `${ch.portrait || ""} ${ch.name} prend un repos ${type === "long" ? "long 🌙" : "court ☕"}.` });
  return { ok: true };
}

export async function inventory(uid, { campaignId, characterId, action, itemId, targetCharacterId, qty = 1, notes }) {
  const { data: c } = await loadCampaign(campaignId, uid);
  const { ref, data: ch } = await loadCharacter(campaignId, characterId);
  assertCanControl(c, uid, ch);
  if (c.state?.combat?.active && ["equip", "unequip"].includes(action)) {
    const it = ch.inventory.find((i) => i.id === itemId);
    const eq = R.equipment[it?.index];
    if (eq?.ac && !eq.cats.includes("shields")) throw new HttpsError("failed-precondition", "On n'enfile pas une armure en plein combat !");
  }
  const inv = [...(ch.inventory || [])];
  const i = inv.findIndex((x) => x.id === itemId);
  if (i < 0) throw new HttpsError("not-found", "Objet introuvable.");
  const it = { ...inv[i] };
  const n = clamp(parseInt(qty, 10) || 1, 1, it.qty || 1);
  let msg = null;
  if (action === "equip" || action === "unequip") {
    it.equipped = action === "equip";
    const eq = R.equipment[it.index];
    if (it.equipped && eq?.ac) {
      const isShield = eq.cats.includes("shields");
      inv.forEach((o, j) => { const e2 = R.equipment[o.index]; if (j !== i && o.equipped && e2?.ac && e2.cats.includes("shields") === isShield) inv[j] = { ...o, equipped: false }; });
    }
    inv[i] = it;
  } else if (action === "notes") { it.notes = str(notes, 300); inv[i] = it; }
  else if (action === "use" || action === "drop") {
    it.qty = (it.qty || 1) - n;
    if (it.qty <= 0) inv.splice(i, 1); else inv[i] = it;
    msg = `${ch.name} ${action === "use" ? "utilise" : "abandonne"} ${n > 1 ? n + "× " : ""}${it.name}.`;
  } else if (action === "give") {
    const { ref: tref, data: t } = await loadCharacter(campaignId, targetCharacterId);
    it.qty = (it.qty || 1) - n;
    if (it.qty <= 0) inv.splice(i, 1); else inv[i] = it;
    const tinv = [...(t.inventory || [])];
    const same = tinv.find((x) => x.index && x.index === inv[i]?.index && !x.magic);
    if (same && !it.magic) same.qty += n; else tinv.push({ ...it, id: newId(8), qty: n, equipped: false });
    await tref.update({ inventory: tinv });
    msg = `${ch.name} donne ${n > 1 ? n + "× " : ""}${it.name} à ${t.name}.`;
  } else throw new HttpsError("invalid-argument", "Action inconnue.");
  await ref.update({ inventory: inv });
  if (msg) await addLog(campaignId, { type: "system", text: msg });
  return { ok: true };
}

export async function giveGold(uid, { campaignId, characterId, targetCharacterId, amount }) {
  const { data: c } = await loadCampaign(campaignId, uid);
  const { ref, data: ch } = await loadCharacter(campaignId, characterId);
  assertCanControl(c, uid, ch);
  const n = parseInt(amount, 10);
  if (!(n > 0) || n > (ch.gold || 0)) throw new HttpsError("invalid-argument", "Montant invalide.");
  const { ref: tref, data: t } = await loadCharacter(campaignId, targetCharacterId);
  await ref.update({ gold: (ch.gold || 0) - n });
  await tref.update({ gold: (t.gold || 0) + n });
  await addLog(campaignId, { type: "system", text: `${ch.name} donne ${n} po à ${t.name}.` });
  return { ok: true };
}

export async function setPrepared(uid, { campaignId, characterId, cantrips, prepared }) {
  const { data: c } = await loadCampaign(campaignId, uid);
  const { ref, data: ch } = await loadCharacter(campaignId, characterId);
  assertCanControl(c, uid, ch);
  if (c.state?.combat?.active) throw new HttpsError("failed-precondition", "Pas de changement de sorts en plein combat.");
  const lim = spellLimits(R, ch);
  validateSpells(ch, cantrips || [], prepared || [], lim);
  if ((cantrips || []).length > lim.cantrips || (prepared || []).length > lim.prepared) throw new HttpsError("invalid-argument", "Trop de sorts.");
  // Les tours de magie ne changent qu'à la montée de niveau (sauf hôte)
  if (c.ownerUid !== uid && !sameMultiset(cantrips || [], ch.spells?.cantrips || [])) throw new HttpsError("invalid-argument", "Les tours de magie se changent à la montée de niveau.");
  if (ch.class === "wizard" && !(prepared || []).every((s) => (ch.spells?.book || []).includes(s))) throw new HttpsError("invalid-argument", "Un magicien ne prépare que des sorts de son grimoire.");
  await ref.update({ "spells.cantrips": cantrips || [], "spells.prepared": prepared || [] });
  return { ok: true };
}

export async function castSpell(uid, { campaignId, characterId, spell, slotLevel }) {
  const { data: c } = await loadCampaign(campaignId, uid);
  const { ref, data: ch } = await loadCharacter(campaignId, characterId);
  assertCanControl(c, uid, ch);
  const sp = R.spells[spell];
  if (!sp) throw new HttpsError("invalid-argument", "Sort inconnu.");
  const known = [...(ch.spells?.cantrips || []), ...(ch.spells?.prepared || []), ...(ch.extraSpells || [])];
  if (!known.includes(spell)) throw new HttpsError("failed-precondition", "Ce sort n'est pas préparé.");
  let slot = 0;
  if (sp.level > 0) {
    slot = parseInt(slotLevel, 10) || sp.level;
    if (slot < sp.level) throw new HttpsError("invalid-argument", "Emplacement trop faible.");
    const s = ch.slots?.[slot];
    if (!s || s.used >= s.max) throw new HttpsError("failed-precondition", `Plus d'emplacement de niveau ${slot}.`);
    await ref.update({ [`slots.${slot}.used`]: s.used + 1 });
  }
  // Dés de dégâts / soins suivant le niveau
  let dmg = null;
  const dd = sp.damage?.damage_at_slot_level; const dc = sp.damage?.damage_at_character_level; const heal = sp.heal;
  if (dd) dmg = dd[String(slot)] || dd[String(sp.level)];
  else if (dc) { const keys = Object.keys(dc).map(Number).filter((k) => k <= ch.level); dmg = dc[String(Math.max(...keys))]; }
  let healExpr = null;
  if (heal) healExpr = heal[String(slot)] || heal[String(sp.level)];
  const d = derive(R, ch);
  const ADD_MOD = ["cure-wounds", "healing-word", "mass-cure-wounds", "mass-healing-word"];
  if (healExpr) {
    healExpr = healExpr.replace(/\s*\+\s*MOD/i, "").replace(/\s+/g, "");
    if (ADD_MOD.includes(spell) && d.spell) { const m = d.mods[d.spell.ability]; if (m) healExpr += (m > 0 ? "+" : "") + m; }
  }
  await addLog(campaignId, { type: "system", characterId, text: `✨ ${ch.name} lance ${sp.name}${slot ? ` (niveau ${slot})` : ""}.` });
  return { ok: true, damage: dmg, damageType: sp.damage?.damage_type?.index, heal: healExpr, attack: sp.attack, save: sp.save, dc: d.spell?.dc };
}

export async function useResource(uid, { campaignId, characterId, key, delta = 1 }) {
  const { data: c } = await loadCampaign(campaignId, uid);
  const { ref, data: ch } = await loadCharacter(campaignId, characterId);
  assertCanControl(c, uid, ch);
  const r = ch.resources?.[key];
  if (!r) throw new HttpsError("not-found", "Ressource inconnue.");
  const used = clamp((r.used || 0) + parseInt(delta, 10), 0, r.max);
  if (used === r.used) throw new HttpsError("failed-precondition", delta > 0 ? "Plus d'utilisation disponible." : "Déjà au maximum.");
  await ref.update({ [`resources.${key}.used`]: used });
  if (delta > 0) await addLog(campaignId, { type: "system", characterId, text: `${ch.name} utilise : ${r.label}.` });
  return { ok: true };
}

/** Ajustements manuels réservés à l'hôte (corriger une erreur, récompense hors MJ...). */
export async function hostAdjust(uid, { campaignId, characterId, patch = {} }) {
  await loadCampaign(campaignId, uid, { ownerOnly: true });
  const { ref, data: ch } = await loadCharacter(campaignId, characterId);
  const upd = {};
  if (patch.hpDelta) { const cur = clamp(ch.hp.current + parseInt(patch.hpDelta, 10), 0, ch.hp.max); upd.hp = { ...ch.hp, current: cur }; }
  if (patch.hpMax) upd["hp.max"] = clamp(parseInt(patch.hpMax, 10), 1, 999);
  if (patch.temp != null) upd["hp.temp"] = clamp(parseInt(patch.temp, 10), 0, 999);
  if (patch.xpDelta) upd.xp = Math.max(0, (ch.xp || 0) + parseInt(patch.xpDelta, 10));
  if (patch.goldDelta) upd.gold = Math.max(0, (ch.gold || 0) + parseInt(patch.goldDelta, 10));
  if (patch.levelUpReady != null) upd.levelUpReady = !!patch.levelUpReady;
  if (patch.inspiration != null) upd.inspiration = !!patch.inspiration;
  if (Array.isArray(patch.conditions)) upd.conditions = patch.conditions.filter((x) => R.conditions[x]);
  if (patch.exhaustion != null) upd.exhaustion = clamp(parseInt(patch.exhaustion, 10), 0, 6);
  if (patch.addItem?.name) {
    const eq = R.equipment[patch.addItem.index] || R.magicItems[patch.addItem.index];
    upd.inventory = [...(ch.inventory || []), { id: newId(8), index: patch.addItem.index || null, name: str(patch.addItem.name, 80) || eq?.name,
      qty: clamp(parseInt(patch.addItem.qty, 10) || 1, 1, 999), equipped: false, notes: str(patch.addItem.notes, 300), magic: !!R.magicItems[patch.addItem.index],
      bonus: clamp(parseInt(patch.addItem.bonus, 10) || 0, 0, 3) }];
  }
  if (patch.removeItemId) upd.inventory = (upd.inventory || ch.inventory || []).filter((i) => i.id !== patch.removeItemId);
  if (patch.alive != null) upd.alive = !!patch.alive;
  if (patch.deathSaves) upd.deathSaves = { success: clamp(patch.deathSaves.success | 0, 0, 3), fail: clamp(patch.deathSaves.fail | 0, 0, 3) };
  await ref.update(upd);
  await addLog(campaignId, { type: "system", text: `🛠️ L'hôte ajuste la fiche de ${ch.name}.` });
  return { ok: true };
}

/** Application des PV utilisée par le MJ et les dés (gère PV temporaires, 0 PV, mort instantanée). */
export function applyHpChange(ch, amount) {
  const hp = { ...ch.hp }; const out = { notes: [] };
  const upd = {};
  if (amount < 0) {
    let dmg = -amount;
    if (hp.temp > 0) { const t = Math.min(hp.temp, dmg); hp.temp -= t; dmg -= t; }
    const before = hp.current;
    hp.current = Math.max(0, hp.current - dmg);
    if (before > 0 && hp.current === 0) {
      const overflow = dmg - before;
      if (overflow >= hp.max) { upd.alive = false; out.notes.push("mort instantanée (dégâts massifs)"); }
      else { upd.conditions = [...new Set([...(ch.conditions || []), "unconscious", "prone"])]; upd.deathSaves = { success: 0, fail: 0 }; out.notes.push("tombe inconscient à 0 PV"); }
    } else if (before === 0 && dmg > 0) {
      const ds = { ...(ch.deathSaves || { success: 0, fail: 0 }) }; ds.fail = Math.min(3, ds.fail + 1);
      upd.deathSaves = ds; out.notes.push("échec de jet contre la mort (blessé à terre)");
      if (ds.fail >= 3) { upd.alive = false; out.notes.push("meurt"); }
    }
  } else if (amount > 0) {
    const was0 = hp.current === 0;
    hp.current = Math.min(hp.max, hp.current + amount);
    if (was0 && hp.current > 0) { upd.conditions = (ch.conditions || []).filter((x) => x !== "unconscious"); upd.deathSaves = { success: 0, fail: 0 }; out.notes.push("reprend conscience"); }
  }
  upd.hp = hp;
  return { upd, ...out };
}
