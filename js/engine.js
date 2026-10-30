// Moteur de règles partagé (SRD 5.2) — utilisé par l'interface ET par les Cloud Functions.
// Le serveur garde une copie identique dans functions/engine.js : modifier les deux.
// Aucune dépendance, aucun hasard ici (les dés sont lancés uniquement côté serveur).

export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];
export const ABI_FR = { str: "FOR", dex: "DEX", con: "CON", int: "INT", wis: "SAG", cha: "CHA" };
export const ABI_FR_LONG = { str: "Force", dex: "Dextérité", con: "Constitution", int: "Intelligence", wis: "Sagesse", cha: "Charisme" };
export const XP_TABLE = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000,
  120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
export const POINT_BUY_COST = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
export const POINT_BUY_TOTAL = 27;
export const DAMAGE_FR = { acid: "acide", bludgeoning: "contondant", cold: "froid", fire: "feu", force: "force",
  lightning: "foudre", necrotic: "nécrotique", piercing: "perforant", poison: "poison", psychic: "psychique",
  radiant: "radiant", slashing: "tranchant", thunder: "tonnerre" };

export const mod = (score) => Math.floor(((score || 10) - 10) / 2);
export const fmtMod = (n) => (n >= 0 ? `+${n}` : `${n}`);
export const profBonus = (level) => 2 + Math.floor((Math.max(1, level) - 1) / 4);
export const levelForXp = (xp) => { let l = 1; for (let i = 0; i < XP_TABLE.length; i++) if (xp >= XP_TABLE[i]) l = i + 1; return Math.min(20, l); };
export const xpForNext = (level) => (level >= 20 ? null : XP_TABLE[level]);

export function pointBuySpent(scores) {
  let s = 0;
  for (const a of ABILITIES) { const v = scores[a]; if (!(v in POINT_BUY_COST)) return Infinity; s += POINT_BUY_COST[v]; }
  return s;
}

/** Parse "2d6+3", "1d20kh1+5", "4d6kh3", "d8-1". Renvoie {terms:[{n,sides,keep?,sign}], bonus} ou null. */
export function parseDice(expr) {
  if (typeof expr !== "string") return null;
  const s = expr.replace(/\s+/g, "").toLowerCase().replace(/^\+/, "");
  if (!s || s.length > 60) return null;
  const re = /([+-])?(?:(\d*)d(\d+)(?:(kh|kl)(\d+))?|(\d+))/gy;
  const terms = []; let bonus = 0; let m; let pos = 0; let dice = 0;
  while (pos < s.length) {
    re.lastIndex = pos; m = re.exec(s);
    if (!m || m.index !== pos || m[0] === "") return null;
    const sign = m[1] === "-" ? -1 : 1;
    if (m[3]) {
      const n = m[2] ? parseInt(m[2], 10) : 1; const sides = parseInt(m[3], 10);
      if (n < 1 || n > 40 || ![2, 3, 4, 6, 8, 10, 12, 20, 100].includes(sides)) return null;
      dice += n; if (dice > 60) return null;
      const t = { n, sides, sign };
      if (m[4]) t.keep = { mode: m[4], count: Math.min(n, parseInt(m[5], 10)) };
      terms.push(t);
    } else bonus += sign * parseInt(m[6], 10);
    pos = re.lastIndex;
  }
  return terms.length || bonus ? { terms, bonus } : null;
}

/** Évalue une expression parsée avec un générateur rng(sides)->entier 1..sides. */
export function evalDice(parsed, rng) {
  const groups = []; let total = parsed.bonus;
  for (const t of parsed.terms) {
    const values = Array.from({ length: t.n }, () => rng(t.sides));
    let kept = values.map((_, i) => i);
    if (t.keep) {
      const order = values.map((v, i) => [v, i]).sort((a, b) => (t.keep.mode === "kh" ? b[0] - a[0] : a[0] - b[0]));
      kept = order.slice(0, t.keep.count).map((x) => x[1]);
    }
    const sum = kept.reduce((a, i) => a + values[i], 0);
    total += t.sign * sum;
    groups.push({ sides: t.sides, values, kept, sign: t.sign });
  }
  return { total, groups, bonus: parsed.bonus };
}

export const findTrait = (ch, idx) => (ch.traits || []).includes(idx);

export function classLevelData(rules, ch, level = ch.level) {
  return rules.classes[ch.class]?.levels?.[String(level)] || null;
}

export function finalAbilities(ch) { return { ...ch.abilities }; }

function weaponProficient(rules, ch, idx, item) {
  const profs = new Set([...(rules.classes[ch.class]?.proficiencies || []), ...(ch.extraProfs || [])]);
  if (item.cats.includes("simple-weapons") && profs.has("simple-weapons")) return true;
  if (item.cats.includes("martial-weapons") && profs.has("martial-weapons")) return true;
  return profs.has(idx + "s") || profs.has(idx) || profs.has(idx + "es");
}

export function armorProficient(rules, ch, item) {
  const profs = new Set(rules.classes[ch.class]?.proficiencies || []);
  if (profs.has("all-armor") && !item.cats.includes("shields")) return true;
  for (const c of ["light-armor", "medium-armor", "heavy-armor", "shields"]) if (item.cats.includes(c) && profs.has(c)) return true;
  return false;
}

/** Calcule toutes les valeurs dérivées d'une fiche. */
export function derive(rules, ch) {
  const ab = finalAbilities(ch);
  const m = Object.fromEntries(ABILITIES.map((a) => [a, mod(ab[a])]));
  const pb = profBonus(ch.level);
  const cls = rules.classes[ch.class] || {};
  const feats = new Set(ch.feats || []);
  const saves = {};
  for (const a of ABILITIES) saves[a] = m[a] + ((cls.saves || []).includes(a) ? pb : 0);
  const skills = {};
  for (const [k, s] of Object.entries(rules.skills)) {
    const prof = (ch.skills || []).includes(k); const exp = (ch.expertise || []).includes(k);
    let v = m[s.ability] + (exp ? pb * 2 : prof ? pb : 0);
    if (!prof && ch.class === "bard" && ch.level >= 2) v += Math.floor(pb / 2); // Jack of All Trades
    skills[k] = { value: v, prof, exp, ability: s.ability };
  }
  // Classe d'armure
  const inv = ch.inventory || [];
  const armor = inv.find((i) => i.equipped && rules.equipment[i.index]?.ac && !rules.equipment[i.index].cats.includes("shields"));
  const shield = inv.find((i) => i.equipped && rules.equipment[i.index]?.cats?.includes("shields"));
  let ac = 10 + m.dex; let acNote = "Sans armure";
  if (armor) {
    const a = rules.equipment[armor.index].ac;
    let dex = a.dex_bonus ? m.dex : 0;
    if (a.dex_bonus && a.max_bonus != null) dex = Math.min(dex, a.max_bonus);
    ac = a.base + dex + (armor.bonus || 0); acNote = armor.name;
  } else if (ch.class === "barbarian") { ac = 10 + m.dex + m.con; acNote = "Défense sans armure"; }
  else if (ch.class === "monk" && !shield) { ac = 10 + m.dex + m.wis; acNote = "Défense sans armure"; }
  if (shield) ac += 2 + (shield.bonus || 0);
  if (armor && feats.has("defense")) ac += 1;
  ac += ch.acBonus || 0;
  // Initiative
  const initiative = m.dex + (feats.has("alert") ? pb : 0);
  // Vitesse
  const sp = rules.species[ch.species] || {};
  let speed = (sp.speed || 30) + (ch.subspecies === "elven-lineage-wood-elf" ? 5 : 0);
  if (ch.class === "monk" && ch.level >= 2 && !armor && !shield) speed += cls.levels?.[String(ch.level)]?.specific?.unarmored_movement_bonus || 0;
  if (ch.class === "barbarian" && ch.level >= 5 && !(armor && rules.equipment[armor.index].cats.includes("heavy-armor"))) speed += 10;
  // Lancement de sorts
  let spell = null;
  if (cls.castAbility) {
    const ca = cls.castAbility;
    spell = { ability: ca, dc: 8 + pb + m[ca], attack: pb + m[ca] };
  }
  // Attaques
  const attacks = [];
  for (const it of inv) {
    const w = rules.equipment[it.index];
    if (!it.equipped || !w?.damage) continue;
    const props = w.props || [];
    const ranged = w.cats.includes("ranged-weapons");
    let abi = ranged ? "dex" : "str";
    if (props.includes("finesse")) abi = m.dex > m.str ? "dex" : "str";
    if (ch.class === "monk" && !ranged && (w.cats.includes("simple-weapons") || props.includes("light")) && m.dex > m.str) abi = "dex";
    const prof = weaponProficient(rules, ch, it.index, w);
    let toHit = m[abi] + (prof ? pb : 0) + (it.bonus || 0) + (ranged && feats.has("archery") ? 2 : 0);
    const dmgMod = m[abi] + (it.bonus || 0);
    attacks.push({ id: it.id, name: it.name, ability: abi, toHit, prof,
      damage: `${w.damage}${dmgMod ? fmtMod(dmgMod) : ""}`, versatile: w.twoHanded ? `${w.twoHanded}${dmgMod ? fmtMod(dmgMod) : ""}` : null,
      type: w.damageType, props, mastery: w.mastery, range: w.range });
  }
  // Attaque à mains nues
  const unarmedDie = ch.class === "monk" ? (cls.levels?.[String(ch.level)]?.specific?.martial_arts_die || 6) : null;
  const ua = ch.class === "monk" ? Math.max(m.str, m.dex) : m.str;
  attacks.push({ id: "unarmed", name: "Mains nues", ability: "str", toHit: ua + pb, prof: true,
    damage: unarmedDie ? `1d${unarmedDie}${fmtMod(ua)}` : `${Math.max(1, 1 + m.str)}`, type: "bludgeoning", props: [] });
  const passive = 10 + skills.perception.value;
  return { abilities: ab, mods: m, pb, saves, skills, ac, acNote, initiative, speed, spell, attacks, passive };
}

/** PV max théoriques (méthode moyenne) — utilisé à la création et en vérification. */
export function hpAtLevel1(rules, ch) {
  const hd = rules.classes[ch.class].hitDie;
  return hd + mod(ch.abilities.con) + (findTrait(ch, "dwarven-toughness") ? 1 : 0);
}
export const hpAverageGain = (hitDie) => Math.floor(hitDie / 2) + 1;

/** Emplacements de sorts au niveau donné. */
export function spellSlotsFor(rules, ch, level = ch.level) {
  const sc = classLevelData(rules, ch, level)?.spellcasting;
  const slots = {};
  if (!sc) return slots;
  for (let i = 1; i <= 9; i++) { const n = sc[`spell_slots_level_${i}`] || 0; if (n) slots[i] = n; }
  return slots;
}
export function spellLimits(rules, ch, level = ch.level) {
  const sc = classLevelData(rules, ch, level)?.spellcasting;
  if (!sc) return { cantrips: 0, prepared: 0, maxLevel: 0 };
  const slots = spellSlotsFor(rules, ch, level);
  const maxLevel = Math.max(0, ...Object.keys(slots).map(Number));
  return { cantrips: sc.cantrips_known || 0, prepared: sc.prepared_spells || 0, maxLevel };
}
export function classSpellList(rules, cls, maxLevel) {
  return Object.entries(rules.spells).filter(([, s]) => s.classes.includes(cls) && s.level <= maxLevel)
    .map(([k, s]) => ({ index: k, ...s })).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}

/** Ressources de classe (rages, inspiration, conduits divins...). */
export function classResources(rules, ch, level = ch.level) {
  const lv = classLevelData(rules, ch, level) || {}; const sp = lv.specific || {};
  const m = Object.fromEntries(ABILITIES.map((a) => [a, mod(ch.abilities[a])]));
  const pb = profBonus(level); const r = {};
  if (sp.rage_count) r.rage = { label: "Rages", max: sp.rage_count, rest: "long" };
  if (ch.class === "bard") r.inspiration = { label: "Inspiration bardique", max: Math.max(1, m.cha), rest: level >= 5 ? "short" : "long" };
  if (sp.channel_divinity_charges) r.channel = { label: "Conduit divin", max: sp.channel_divinity_charges, rest: "short" };
  if (sp.second_wind_uses) r.secondWind = { label: "Second souffle", max: sp.second_wind_uses, rest: "short" };
  if (ch.class === "fighter" && level >= 2) r.actionSurge = { label: "Fougue", max: level >= 17 ? 2 : 1, rest: "short" };
  if (sp.focus_points) r.focus = { label: "Points de focalisation", max: sp.focus_points, rest: "short" };
  if (sp.sorcery_points) r.sorcery = { label: "Points de sorcellerie", max: sp.sorcery_points, rest: "long" };
  if (sp.wild_shape_uses) r.wildShape = { label: "Forme sauvage", max: sp.wild_shape_uses, rest: "short" };
  if (ch.class === "paladin") r.layOnHands = { label: "Imposition des mains (PV)", max: 5 * level, rest: "long" };
  if (ch.class === "wizard") r.arcaneRecovery = { label: "Restauration arcanique", max: 1, rest: "long" };
  if ((ch.traits || []).includes("relentless-endurance")) r.relentless = { label: "Endurance implacable", max: 1, rest: "long" };
  if ((ch.traits || []).includes("adrenaline-rush")) r.adrenaline = { label: "Poussée d'adrénaline", max: pb, rest: "short" };
  if (ch.species === "dragonborn") r.breath = { label: "Souffle draconique", max: pb, rest: "long" };
  if (ch.class === "rogue") { const sa = lv.specific?.sneak_attack; if (sa) r.sneakInfo = { label: `Attaque sournoise ${sa.dice_count}d${sa.dice_value}`, max: 0, info: true }; }
  return r;
}

/** Ce que demande la montée vers newLevel (choix à faire). */
export function levelUpChoices(rules, ch, newLevel) {
  const lv = rules.classes[ch.class]?.levels?.[String(newLevel)];
  if (!lv) return null;
  const f = lv.features || [];
  const has = (s) => f.some((x) => x.endsWith(s));
  const oldLim = spellLimits(rules, ch, newLevel - 1); const newLim = spellLimits(rules, ch, newLevel);
  return {
    features: f,
    subclass: has("-subclass") && !ch.subclass,
    asi: has("-ability-score-improvement"),
    epicBoon: has("-epic-boon"),
    fightingStyle: has("-fighting-style"),
    expertise: has("-expertise") ? 2 : 0,
    newCantrips: Math.max(0, newLim.cantrips - oldLim.cantrips),
    newPrepared: Math.max(0, newLim.prepared - oldLim.prepared),
    maxSpellLevel: newLim.maxLevel,
    hitDie: rules.classes[ch.class].hitDie,
  };
}

export const statusFromHp = (hp, max) => {
  if (hp <= 0) return "À terre";
  const r = hp / Math.max(1, max);
  return r >= 1 ? "Indemne" : r > 0.5 ? "Touché" : r > 0.25 ? "En sang" : "Agonisant";
};
