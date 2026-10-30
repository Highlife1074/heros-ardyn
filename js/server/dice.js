import { HttpsError, logger, platform, randomInt, db, RULES, FieldValue, rollExpr, addLog, loadCampaign, loadCharacter, assertCanControl, str, DEFAULT_SETTINGS } from "./common.js";
import { derive, fmtMod, mod, ABI_FR, statusFromHp } from "../engine.js";
import { applyHpChange } from "./characters.js";

const R = RULES;
const d20 = (adv) => (adv === "adv" ? "2d20kh1" : adv === "dis" ? "2d20kl1" : "1d20");
const SKILL_FR = (k) => R.skills[k]?.nameFr || k;

/** Double les dés d'une expression (coup critique). */
function critExpr(expr) {
  return expr.replace(/(\d*)d(\d+)/g, (_, n, s) => `${(parseInt(n || "1", 10)) * 2}d${s}`);
}

/**
 * Jet de dés autoritaire côté serveur.
 * kind : skill | check | save | attack | spellAttack | damage | initiative | death | hitdie | free
 */
export async function roll(uid, p) {
  const { ref: cref, data: c } = await loadCampaign(p.campaignId, uid);
  const settings = { ...DEFAULT_SETTINGS, ...(c.settings || {}) };
  const secretRef = db.doc(`campaigns/${p.campaignId}/secret/gm`);
  let request = null;
  if (p.requestId) {
    const s = (await secretRef.get()).data() || {};
    request = s.pending?.[p.requestId];
    if (!request) throw new HttpsError("not-found", "Ce jet a déjà été fait ou a expiré.");
    if (request.characterId !== p.characterId) throw new HttpsError("permission-denied", "Ce jet est demandé à un autre personnage.");
  }
  const kind = request?.kind || p.kind || "free";
  let ch = null; let chRef = null; let d = null;
  if (p.characterId) {
    const loaded = await loadCharacter(p.campaignId, p.characterId);
    ch = loaded.data; chRef = loaded.ref; assertCanControl(c, uid, ch);
    d = derive(R, ch);
  }
  const needCh = !["free"].includes(kind);
  if (needCh && !ch) throw new HttpsError("invalid-argument", "Personnage requis pour ce jet.");
  // L'avantage imposé par le MJ prime ; sinon choix du joueur
  // Sur un jet demandé, seul le MJ décide de l'avantage ; sur un jet libre, le joueur choisit (et c'est visible de tous).
  let adv = request ? (request.advantage || "normal") : (["adv", "dis"].includes(p.advantage) ? p.advantage : "normal");

  let expr; let label; let bonus = 0; const extra = {};
  const exhaust = ch ? -2 * (ch.exhaustion || 0) : 0;
  switch (kind) {
    case "skill": {
      const sk = request?.skill || p.skill;
      if (!R.skills[sk]) throw new HttpsError("invalid-argument", "Compétence inconnue.");
      bonus = d.skills[sk].value + exhaust; label = `Test de ${SKILL_FR(sk)}`; expr = d20(adv) + fmtMod(bonus); break;
    }
    case "check": {
      const ab = request?.ability || p.ability;
      if (!d.mods[ab] && d.mods[ab] !== 0) throw new HttpsError("invalid-argument", "Caractéristique inconnue.");
      bonus = d.mods[ab] + exhaust; label = `Test de ${ABI_FR[ab]}`; expr = d20(adv) + fmtMod(bonus); break;
    }
    case "save": {
      const ab = request?.ability || p.ability;
      if (d.saves[ab] == null) throw new HttpsError("invalid-argument", "Caractéristique inconnue.");
      bonus = d.saves[ab] + exhaust; label = `Jet de sauvegarde de ${ABI_FR[ab]}`; expr = d20(adv) + fmtMod(bonus); break;
    }
    case "initiative": {
      bonus = d.initiative + exhaust; label = "Initiative"; expr = d20(adv) + fmtMod(bonus); break;
    }
    case "attack": {
      const atk = d.attacks.find((a) => a.id === (p.weaponId || "unarmed"));
      if (!atk) throw new HttpsError("invalid-argument", "Arme non équipée.");
      bonus = atk.toHit + exhaust; label = `Attaque — ${atk.name}`; expr = d20(adv) + fmtMod(bonus);
      extra.weapon = { id: atk.id, damage: atk.damage, versatile: atk.versatile, type: atk.type }; break;
    }
    case "spellAttack": {
      if (!d.spell) throw new HttpsError("failed-precondition", "Ce personnage ne lance pas de sorts.");
      bonus = d.spell.attack + exhaust; label = `Attaque de sort${p.spell && R.spells[p.spell] ? " — " + R.spells[p.spell].name : ""}`; expr = d20(adv) + fmtMod(bonus); break;
    }
    case "damage": {
      let base = null;
      if (p.weaponId) { const atk = d.attacks.find((a) => a.id === p.weaponId); if (!atk) throw new HttpsError("invalid-argument", "Arme non équipée."); base = p.twoHanded && atk.versatile ? atk.versatile : atk.damage; label = `Dégâts — ${atk.name}`; extra.damageType = atk.type; }
      else if (p.expr) { base = String(p.expr); label = `Dégâts${p.label ? " — " + str(p.label, 60) : ""}`; extra.damageType = p.damageType; }
      else if (request?.expr) { base = request.expr; label = request.label; }
      if (!base) throw new HttpsError("invalid-argument", "Dégâts inconnus.");
      expr = p.crit ? critExpr(base) : base; if (p.crit) label += " (critique !)"; break;
    }
    case "heal": {
      if (!p.expr) throw new HttpsError("invalid-argument", "Soins inconnus.");
      expr = String(p.expr); label = `Soins${p.label ? " — " + str(p.label, 60) : ""}`; break;
    }
    case "death": {
      if (ch.hp.current > 0) throw new HttpsError("failed-precondition", "Ce personnage n'est pas à 0 PV.");
      expr = "1d20"; label = "Jet de sauvegarde contre la mort"; break;
    }
    case "hitdie": {
      if (!ch.hitDice?.remaining) throw new HttpsError("failed-precondition", "Plus de dés de vie.");
      const grant = c.state?.restGrant;
      if (c.ownerUid !== uid && !(grant && Date.now() - grant.at < 3 * 3600e3)) throw new HttpsError("failed-precondition", "Les dés de vie se dépensent pendant un repos accordé par le MJ.");
      bonus = mod(ch.abilities.con); expr = `1d${ch.hitDice.die}${fmtMod(bonus)}`; label = "Dé de vie (repos court)"; break;
    }
    case "custom": case "free": default: {
      expr = request?.expr || str(p.expr, 60) || "1d20"; label = request?.label || str(p.label, 80) || "Jet libre"; break;
    }
  }
  const r = rollExpr(expr);
  const first = r.groups[0];
  const natural = first && first.sides === 20 ? first.values[first.kept[0]] : null;
  const isD20 = ["skill", "check", "save", "initiative", "attack", "spellAttack", "death"].includes(kind);
  const out = { expr: r.expr, total: r.total, groups: r.groups, bonus: r.bonus, natural: isD20 ? natural : null,
    crit: isD20 && natural === 20, fumble: isD20 && natural === 1, adv, kind };

  // Effets de règles directs
  const sysNotes = [];
  if (kind === "death" && ch) {
    const ds = { ...(ch.deathSaves || { success: 0, fail: 0 }) }; const upd = {};
    if (natural === 20) { upd.hp = { ...ch.hp, current: 1 }; upd.conditions = (ch.conditions || []).filter((x) => x !== "unconscious"); upd.deathSaves = { success: 0, fail: 0 }; sysNotes.push(`${ch.name} se relève avec 1 PV !`); }
    else {
      if (natural === 1) ds.fail += 2; else if (r.total >= 10) ds.success += 1; else ds.fail += 1;
      if (ds.success >= 3) { sysNotes.push(`${ch.name} est stabilisé(e).`); ds.success = 0; ds.fail = 0; upd.stable = true; }
      if (ds.fail >= 3) { upd.alive = false; sysNotes.push(`${ch.name} succombe à ses blessures…`); }
      upd.deathSaves = ds;
    }
    await chRef.update(upd); out.deathSaves = upd.deathSaves;
  }
  if (kind === "hitdie" && ch) {
    const healed = Math.max(0, r.total);
    const { upd } = applyHpChange(ch, healed);
    upd.hitDice = { ...ch.hitDice, remaining: ch.hitDice.remaining - 1 };
    await chRef.update(upd); sysNotes.push(`${ch.name} récupère ${healed} PV.`);
  }
  if (kind === "heal" && ch && p.targetCharacterId) {
    const t = await loadCharacter(p.campaignId, p.targetCharacterId);
    const { upd, notes } = applyHpChange(t.data, Math.max(0, r.total));
    await t.ref.update(upd); sysNotes.push(`${t.data.name} récupère ${r.total} PV${notes.length ? " (" + notes.join(", ") + ")" : ""}.`);
  }
  if (kind === "initiative" && c.state?.combat?.active && ch) {
    await db.runTransaction(async (tx) => {
      const cur = (await tx.get(cref)).data()?.state?.combat;
      if (!cur?.active) return;
      const order = (cur.order || []).map((o) => (o.characterId === ch.id ? { ...o, init: r.total, initDex: d.mods.dex } : o));
      order.sort((a, b) => (b.init ?? -99) - (a.init ?? -99) || (b.initDex || 0) - (a.initDex || 0));
      tx.update(cref, { "state.combat.order": order, "state.combat.turn": 0 });
    });
  }

  const authorName = ch?.name || c.memberNames?.[uid] || "Joueur";
  await addLog(p.campaignId, { type: "roll", uid, characterId: ch?.id || null, authorName, portrait: ch?.portrait || "🎲",
    label: request?.label ? `${request.label}` : label, rollLabel: label, roll: out, requestId: p.requestId || null,
    reason: str(p.reason, 200), damageType: extra.damageType || null });
  for (const n of sysNotes) await addLog(p.campaignId, { type: "system", text: n });

  // Résolution d'une demande du MJ
  if (request) {
    let wakeGm = false;
    await db.runTransaction(async (tx) => {
      const sref = await tx.get(secretRef); const cs = await tx.get(cref);
      const pending = { ...(sref.data()?.pending || {}) };
      const result = { ...pending[p.requestId], result: out.total, natural: out.natural, at: Date.now() };
      delete pending[p.requestId];
      const resolved = [...(sref.data()?.resolved || []), result].slice(-30);
      tx.update(secretRef, { pending, resolved });
      const pub = (cs.data().state?.pendingRolls || []).filter((x) => x.id !== p.requestId);
      tx.update(cref, { "state.pendingRolls": pub });
      if (!pub.length && settings.autoGmAfterRolls) wakeGm = true;
    });
    // Tous les jets demandés sont faits : le MJ reprend (dans ce navigateur).
    if (wakeGm) platform.requestGm?.(p.campaignId, "rolls");
  }
  return { ...out, label, weapon: extra.weapon || null };
}

export { statusFromHp };
