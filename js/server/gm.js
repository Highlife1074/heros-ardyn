import { HttpsError, logger, platform, randomInt, db, RULES, MONSTERS, BIBLE_ARDYN, FieldValue, DEFAULT_SETTINGS, rollExpr, newId, addLog, str, clamp, loadCampaign } from "./common.js";
import { derive, mod, fmtMod, ABI_FR, XP_TABLE, statusFromHp, DAMAGE_FR } from "../engine.js";
import { applyHpChange } from "./characters.js";
import { GM_CORE, TONE, DIFFICULTY, NARRATION, GENERIC_WORLD, SUMMARY_PROMPT } from "./prompts.js";
import { newRound, TURN_GM_RULES } from "./turns.js";
import { loadWorld, setupText, additionsText, gmAddEntry, revealEntry, CATEGORIES, CONSOLIDATE_PROMPT } from "./worlds.js";

const R = RULES;
// Client Claude fourni par la plateforme : appel direct depuis le navigateur avec la clé enregistrée dans la campagne.
const anthropic = () => platform.anthropic;
/** Appel avec le petit modèle ; en cas d'échec d'accès, on retombe sur le modèle principal. */
async function helperCall(settings, params) {
  try { return await anthropic().messages.create({ ...params, model: settings.helperModel }); }
  catch (e) {
    if (![400, 403, 404].includes(e.status) || settings.helperModel === settings.model) throw e;
    logger.warn(`Modèle ${settings.helperModel} indisponible, repli sur ${settings.model}`);
    return anthropic().messages.create({ ...params, model: settings.model });
  }
}

// ---------------------------------------------------------------- Outils du MJ
const S = (props, required = []) => ({ type: "object", properties: props, required });
const TOOLS = [
  { name: "request_roll", description: "Demande à un joueur de lancer les dés pour son personnage (test de compétence, de caractéristique, sauvegarde, attaque, initiative, jet contre la mort, dégâts ou jet libre). Le DD reste secret. Après cet appel, termine ta narration en invitant le joueur à lancer.",
    input_schema: S({ character_id: { type: "string" }, kind: { type: "string", enum: ["skill", "check", "save", "attack", "initiative", "death", "damage", "custom"] },
      skill: { type: "string", description: "Clé de compétence : acrobatics, animal-handling, arcana, athletics, deception, history, insight, intimidation, investigation, medicine, nature, perception, performance, persuasion, religion, sleight-of-hand, stealth, survival" },
      ability: { type: "string", enum: ["str", "dex", "con", "int", "wis", "cha"] }, dc: { type: "integer", description: "DD secret (pas pour attaque/initiative/dégâts)" },
      advantage: { type: "string", enum: ["normal", "adv", "dis"] }, expr: { type: "string", description: "Pour damage/custom : dés à lancer, ex. 1d8+3" },
      label: { type: "string", description: "Libellé court affiché au joueur, ex. « Grimper la falaise »" } }, ["character_id", "kind", "label"]) },
  { name: "npc_roll", description: "Lance des dés pour un PNJ, un monstre ou le hasard du monde (ex. table de rencontre, jet de sauvegarde d'un monstre). Renvoie le résultat.",
    input_schema: S({ expr: { type: "string" }, label: { type: "string" }, visible: { type: "boolean", description: "true = affiché aux joueurs" } }, ["expr", "label"]) },
  { name: "npc_attack", description: "Un monstre ou PNJ attaque un héros : le serveur lance l'attaque contre la CA du héros, gère le critique et applique les dégâts automatiquement.",
    input_schema: S({ attacker_id: { type: "string", description: "id du combattant (ou nom)" }, target_character_id: { type: "string" }, attack_name: { type: "string" },
      attack_bonus: { type: "integer" }, damage_expr: { type: "string" }, damage_type: { type: "string" }, advantage: { type: "string", enum: ["normal", "adv", "dis"] } },
      ["attacker_id", "target_character_id", "attack_bonus", "damage_expr"]) },
  { name: "modify_hp", description: "Modifie les points de vie d'un héros (id de personnage) ou d'un combattant (id de combat). amount négatif = dégâts, positif = soins.",
    input_schema: S({ target_id: { type: "string" }, amount: { type: "integer" }, temp_hp: { type: "integer", description: "Donne des PV temporaires (remplace si supérieur)" }, reason: { type: "string" } }, ["target_id", "amount"]) },
  { name: "set_condition", description: "Ajoute ou retire un état (blinded, charmed, deafened, frightened, grappled, incapacitated, invisible, paralyzed, petrified, poisoned, prone, restrained, stunned, unconscious) ou exhaustion (niveau +1/-1).",
    input_schema: S({ target_id: { type: "string" }, condition: { type: "string" }, active: { type: "boolean" } }, ["target_id", "condition", "active"]) },
  { name: "start_combat", description: "Démarre un combat. Le serveur tire l'initiative des ennemis et demande celle des héros.",
    input_schema: S({ enemies: { type: "array", items: S({ monster_key: { type: "string", description: "Clé SRD (anglais)" }, name: { type: "string", description: "Nom affiché en français" },
      count: { type: "integer" }, hp: { type: "integer" }, ac: { type: "integer" }, init_bonus: { type: "integer" }, xp: { type: "integer" } }, ["name"]) },
      allies: { type: "array", items: S({ name: { type: "string" }, monster_key: { type: "string" }, hp: { type: "integer" }, ac: { type: "integer" } }, ["name"]) } }, ["enemies"]) },
  { name: "add_combatant", description: "Ajoute un ennemi ou allié en cours de combat (renforts).",
    input_schema: S({ name: { type: "string" }, monster_key: { type: "string" }, hp: { type: "integer" }, ac: { type: "integer" }, ally: { type: "boolean" } }, ["name"]) },
  { name: "next_turn", description: "Passe au combattant suivant dans l'ordre d'initiative. Renvoie à qui c'est le tour.", input_schema: S({}) },
  { name: "end_combat", description: "Termine le combat. Renvoie l'XP totale des ennemis vaincus.", input_schema: S({ outcome: { type: "string" } }) },
  { name: "award_xp", description: "Donne des points d'expérience à chaque héros listé (ou à tout le groupe).",
    input_schema: S({ amount_each: { type: "integer" }, character_ids: { type: "array", items: { type: "string" } }, reason: { type: "string" } }, ["amount_each", "reason"]) },
  { name: "level_up_ready", description: "Mode jalons : autorise les héros listés (ou tout le groupe) à monter d'un niveau.",
    input_schema: S({ character_ids: { type: "array", items: { type: "string" } }, reason: { type: "string" } }, ["reason"]) },
  { name: "give_item", description: "Donne un objet à un héros. srd_index pour un équipement ou objet magique du SRD (ex. potion-of-healing, longsword, bag-of-holding).",
    input_schema: S({ character_id: { type: "string" }, name: { type: "string" }, srd_index: { type: "string" }, qty: { type: "integer" }, description: { type: "string" }, bonus: { type: "integer" } }, ["character_id", "name"]) },
  { name: "take_item", description: "Retire un objet de l'inventaire d'un héros (consommé, perdu, volé, donné à un PNJ).",
    input_schema: S({ character_id: { type: "string" }, item_name: { type: "string" }, qty: { type: "integer" } }, ["character_id", "item_name"]) },
  { name: "change_gold", description: "Ajoute (positif) ou retire (négatif) des pièces d'or à un héros.",
    input_schema: S({ character_id: { type: "string" }, delta: { type: "integer" }, reason: { type: "string" } }, ["character_id", "delta"]) },
  { name: "grant_rest", description: "Autorise les héros à prendre un repos court ou long (ils le valident dans l'appli).",
    input_schema: S({ type: { type: "string", enum: ["short", "long"] } }, ["type"]) },
  { name: "set_inspiration", description: "Donne l'Inspiration héroïque à un héros pour un beau moment de jeu.",
    input_schema: S({ character_id: { type: "string" }, reason: { type: "string" } }, ["character_id"]) },
  { name: "lookup", description: "Consulte le SRD : monstre, sort, état, équipement ou objet magique. Recherche par clé, nom français ou nom anglais.",
    input_schema: S({ kind: { type: "string", enum: ["monster", "spell", "condition", "item", "magic_item", "feature"] }, query: { type: "string" } }, ["kind", "query"]) },
  { name: "update_scene", description: "Nouvelle scène (changement de lieu, de moment ou d'atmosphère) : met à jour le bandeau, l'ambiance sonore jouée chez les joueurs et, si activée, une illustration de la scène.",
    input_schema: S({ title: { type: "string" }, location: { type: "string" }, mood: { type: "string", enum: ["calme", "mystère", "tension", "combat", "fête", "repos", "danger"] },
      ambiance: { type: "string", enum: ["foret", "pluie", "vent", "taverne", "ville", "feu", "grotte", "donjon", "mer", "nuit", "combat", "tension", "mystere", "calme", "silence"], description: "Fond sonore joué en boucle chez les joueurs" },
      illustration: { type: "string", description: "Description visuelle EN ANGLAIS de la scène pour l'illustration (lieu, lumière, personnages vus de loin, ambiance), 1 à 3 phrases, sans texte ni nom propre inconnu" } }, ["title", "ambiance"]) },
  { name: "update_quest", description: "Crée ou met à jour une quête dans le carnet des joueurs.",
    input_schema: S({ title: { type: "string" }, status: { type: "string", enum: ["active", "done", "failed"] }, notes: { type: "string" } }, ["title", "status"]) },
  { name: "world_add", description: "Ajoute au monde un élément NOUVEAU et durable que tu viens d'inventer (lieu, PNJ important, faction, légende, créature, objet notable, coutume, culte), ou complète un élément déjà ajouté (même nom). Il devient canon pour toute la suite et pour les futures campagnes dans ce monde. N'ajoute pas les figurants sans importance.",
    input_schema: S({ category: { type: "string", enum: Object.keys(CATEGORIES) }, name: { type: "string" }, summary: { type: "string", description: "Une ou deux phrases" },
      details: { type: "string", description: "Détails utiles pour rester cohérent (lieu, liens, motivations, secrets)" }, revealed: { type: "boolean", description: "true si les joueurs le découvrent maintenant (il entre dans leur codex)" } }, ["category", "name", "summary"]) },
  { name: "world_reveal", description: "Carnet des héros : les héros rencontrent un personnage notable, visitent un lieu important ou apprennent quelque chose sur un élément du monde (de la bible ou déjà ajouté). L'élément apparaît (ou se complète) dans leur carnet. Pour un élément de la bible, donne category et known.",
    input_schema: S({ name: { type: "string" }, category: { type: "string", enum: Object.keys(CATEGORIES) }, known: { type: "string", description: "Ce que les héros en savent maintenant, en une à trois phrases, sans aucun secret" } }, ["name"]) },
  { name: "remember", description: "Note un fait important à retenir pour la suite (PNJ, secret, promesse, lieu inventé). Mémoire longue du MJ, invisible aux joueurs.",
    input_schema: S({ fact: { type: "string" } }, ["fact"]) },
];
TOOLS[TOOLS.length - 1].cache_control = { type: "ephemeral" };

// ---------------------------------------------------------------- Contexte
function charSummary(ch) {
  const d = derive(R, ch);
  const cls = R.classes[ch.class]; const sp = R.species[ch.species];
  const skills = Object.entries(d.skills).filter(([, v]) => v.prof).map(([k, v]) => `${R.skills[k].nameFr} ${fmtMod(v.value)}${v.exp ? "*" : ""}`).join(", ");
  const atk = d.attacks.map((a) => `${a.name} ${fmtMod(a.toHit)} (${a.damage} ${DAMAGE_FR[a.type] || a.type || ""})`).join(" ; ");
  const slots = Object.entries(ch.slots || {}).map(([l, s]) => `niv${l}:${s.max - s.used}/${s.max}`).join(" ");
  const spells = [...(ch.spells?.cantrips || []), ...(ch.spells?.prepared || [])].map((s) => R.spells[s]?.name || s).join(", ");
  const res = Object.values(ch.resources || {}).filter((r) => r.max).map((r) => `${r.label} ${r.max - (r.used || 0)}/${r.max}`).join(", ");
  const inv = (ch.inventory || []).slice(0, 25).map((i) => `${i.name}${i.qty > 1 ? " ×" + i.qty : ""}${i.equipped ? " (équipé)" : ""}`).join(", ");
  return [
    `### ${ch.name} — id: ${ch.id} — joué par ${ch.ownerName}`,
    `${sp?.nameFr || ch.species}${ch.people ? " — peuple : " + ch.people : ""}${ch.subspecies ? " (" + (R.subspecies[ch.subspecies]?.name || "") + ")" : ""} ${cls?.nameFr} niv. ${ch.level}${ch.subclass ? " — " + R.subclasses[ch.subclass]?.name : ""} · ${ch.origin || ""}`,
    `PV ${ch.hp.current}/${ch.hp.max}${ch.hp.temp ? " (+" + ch.hp.temp + " temp)" : ""} · CA ${d.ac} · Init ${fmtMod(d.initiative)} · Vitesse ${d.speed} pieds · Perception passive ${d.passive}${ch.alive === false ? " · MORT" : ""}${ch.hp.current === 0 && ch.alive !== false ? ` · À 0 PV (sauvegardes contre la mort : ${ch.deathSaves?.success || 0} réussites / ${ch.deathSaves?.fail || 0} échecs)` : ""}`,
    `Carac : ${Object.entries(d.abilities).map(([k, v]) => `${ABI_FR[k]} ${v} (${fmtMod(mod(v))})`).join(", ")} · Sauvegardes maîtrisées : ${(cls?.saves || []).map((s) => ABI_FR[s]).join(", ")}`,
    `Compétences : ${skills}`,
    `Attaques : ${atk}`,
    d.spell ? `Sorts (DD ${d.spell.dc}, attaque ${fmtMod(d.spell.attack)}) : ${spells || "—"} · Emplacements ${slots || "—"}` : null,
    res ? `Ressources : ${res}` : null,
    (ch.conditions || []).length || ch.exhaustion ? `États : ${(ch.conditions || []).map((c) => R.conditions[c]?.nameFr || c).join(", ")}${ch.exhaustion ? " · Épuisement " + ch.exhaustion : ""}` : null,
    `Or : ${ch.gold || 0} po · XP ${ch.xp || 0}${ch.inspiration ? " · Inspiration héroïque" : ""} · Inventaire : ${inv}`,
    ch.backstory ? `Histoire : ${ch.backstory.slice(0, 400)}` : null,
  ].filter(Boolean).join("\n");
}

function fmtLog(e) {
  const t = e.type;
  if (t === "gm") return `[MJ] ${e.text}`;
  if (t === "player") return `[${e.authorName}${e.playerName && e.playerName !== e.authorName ? " (" + e.playerName + ")" : ""}] ${e.text}`;
  if (t === "ooc") return `[hors-jeu — ${e.playerName || e.authorName}] ${e.text}`;
  if (t === "roll") {
    const r = e.roll || {};
    return `[Dés — ${e.authorName}] ${e.label}${e.rollLabel && e.rollLabel !== e.label ? " (" + e.rollLabel + ")" : ""} : ${r.expr} = ${r.total}${r.natural ? ` (d20 naturel ${r.natural})` : ""}${r.crit ? " CRITIQUE" : ""}${e.reason ? " — « " + e.reason + " »" : ""}`;
  }
  if (t === "system") return `[Système] ${e.text}`;
  return `[${t}] ${e.text || ""}`;
}

/** Marque la fin de la conversation comme « à mettre en cache » : à chaque aller-retour d'outils, tout ce qui précède est relu à ~10 % du prix. */
function cacheTail(messages) {
  const out = messages.map((m) => ({ ...m }));
  const last = out[out.length - 1];
  const blocks = typeof last.content === "string" ? [{ type: "text", text: last.content }] : last.content.map((b) => ({ ...b }));
  blocks[blocks.length - 1] = { ...blocks[blocks.length - 1], cache_control: { type: "ephemeral" } };
  last.content = blocks;
  return out;
}

// Tarifs approximatifs en $ par million de jetons (estimation affichée à l'hôte ; le coût réel est sur console.anthropic.com)
function rateFor(model) {
  const m = String(model || "").toLowerCase();
  if (m.includes("haiku")) return { in: 1, out: 5 };
  if (m.includes("opus")) return { in: 5, out: 25 };
  return { in: 3, out: 15 };
}

async function buildContext(cid, c, chars, secret, reason) {
  const s = { ...DEFAULT_SETTINGS, ...(c.settings || {}) };
  const st = c.state || {};
  const logSnap = await db.collection(`campaigns/${cid}/log`).where("tms", ">", st.summaryUpTo || 0).orderBy("tms", "desc").limit(s.economy ? 14 : 28).get();
  const log = logSnap.docs.map((d) => d.data()).reverse().filter((e) => !e.hiddenFromGm);
  const partyLevel = chars.length ? Math.round(chars.reduce((a, x) => a + x.level, 0) / chars.length) : 1;
  const parts = [];
  parts.push(`## Déroulement\n${s.turnMode === "round" && !c.state?.combat?.active ? TURN_GM_RULES.round + "\n" : ""}${TURN_GM_RULES.combat}`);
  parts.push(`## Paramètres de la table\n${TONE[s.tone] || TONE.famille}\n${DIFFICULTY[s.difficulty] || DIFFICULTY.normal}\n${NARRATION[s.economy ? "courte" : s.narration] || NARRATION.moyenne}\nProgression : ${s.xpMode === "milestone" ? "jalons (level_up_ready)" : "points d'expérience (award_xp)"}.${s.houseRules ? "\nRègles maison : " + s.houseRules : ""}${c.premise ? "\nPrémisse de campagne voulue par l'hôte : " + c.premise : ""}`);
  parts.push(`## Groupe (${chars.length} héros, niveau moyen ${partyLevel})\n${chars.map(charSummary).join("\n\n") || "Aucun héros créé pour l'instant."}`);
  if (st.scene?.title) parts.push(`## Scène actuelle\n${st.scene.title}${st.scene.location ? " — " + st.scene.location : ""}${st.scene.mood ? " (" + st.scene.mood + ")" : ""}`);
  if ((st.quests || []).length) parts.push(`## Quêtes\n${st.quests.map((q) => `- [${q.status}] ${q.title}${q.notes ? " : " + q.notes : ""}`).join("\n")}`);
  if ((secret.memory || []).length) parts.push(`## Mémoire du MJ (faits établis)\n${secret.memory.slice(-60).map((m) => "- " + m).join("\n")}`);
  if (st.summary) parts.push(`## Résumé de la campagne jusqu'ici\n${st.summary}`);
  const cb = st.combat;
  if (cb?.active) {
    const lines = (cb.order || []).map((o, i) => {
      const sec = secret.combatants?.[o.id];
      const cur = i === cb.turn ? "➡️ " : "";
      if (o.kind === "pc") { const ch = chars.find((x) => x.id === o.characterId); return `${cur}${o.init ?? "?"} · ${o.name} (héros, id ${o.characterId}) PV ${ch?.hp.current}/${ch?.hp.max} CA ${ch ? derive(R, ch).ac : "?"}`; }
      return `${cur}${o.init ?? "?"} · ${o.name} (id ${o.id}${sec?.monsterKey ? ", " + sec.monsterKey : ""}${o.ally ? ", allié" : ""}) PV ${sec?.hp}/${sec?.maxHp} CA ${sec?.ac}${(o.conditions || []).length ? " · " + o.conditions.join(", ") : ""}${sec?.hp <= 0 ? " · VAINCU" : ""}`;
    });
    parts.push(`## Combat en cours — round ${cb.round}\n${lines.join("\n")}`);
  }
  const pending = Object.values(secret.pending || {});
  if (pending.length) parts.push(`## Jets demandés en attente\n${pending.map((p) => `- ${p.characterName} : ${p.label} (DD ${p.dc ?? "—"})`).join("\n")}`);
  const resolved = (secret.resolved || []).filter((r) => r.at > (st.lastGmAt || 0));
  if (resolved.length) parts.push(`## Résultats des jets demandés (depuis ta dernière réponse)\n${resolved.map((r) => `- ${r.characterName} — ${r.label} : ${r.result}${r.natural ? " (d20 naturel " + r.natural + ")" : ""}${r.dc != null ? ` contre DD ${r.dc} → ${r.result >= r.dc ? "RÉUSSITE" : "ÉCHEC"}` : ""}`).join("\n")}`);
  parts.push(`## Journal récent\n${log.map(fmtLog).join("\n") || "(vide)"}`);
  const gmSpoke = log.some((e) => e.type === "gm") || !!st.summary;
  let ask;
  if (!gmSpoke) ask = "La partie commence. Ouvre l'aventure : plante le décor de façon captivante, présente brièvement la situation de départ qui réunit les héros (en t'appuyant sur leurs histoires), utilise update_scene et update_quest, puis demande ce qu'ils font.";
  else if (reason === "rolls") ask = "Tous les jets demandés ont été faits. Narre leurs conséquences et poursuis.";
  else ask = "Les joueurs attendent ta réponse. Réagis à leurs dernières actions et fais avancer l'histoire.";
  parts.push(`## À toi, MJ\n${ask}`);
  return parts.join("\n\n");
}

// ---------------------------------------------------------------- Exécution des outils
function findChar(ctx, id) {
  if (!id) return null;
  return ctx.chars.find((c) => c.id === id) || ctx.chars.find((c) => c.name.toLowerCase() === String(id).toLowerCase());
}
function findCombatant(ctx, id) {
  const order = ctx.combat?.order || [];
  return order.find((o) => o.id === id) || order.find((o) => o.name.toLowerCase() === String(id).toLowerCase());
}
function monsterFor(key) { return key ? MONSTERS[key] || MONSTERS[String(key).toLowerCase().replace(/[^a-z0-9]+/g, "-")] : null; }
function search(obj, q) {
  const k = String(q || "").toLowerCase().trim(); const slug = k.replace(/[^a-z0-9]+/g, "-");
  if (obj[slug]) return [slug, obj[slug]];
  const hit = Object.entries(obj).find(([key, v]) => key.includes(slug) || (v.name || "").toLowerCase().includes(k) || (v.nameFr || "").toLowerCase().includes(k) || (v.nameEn || "").toLowerCase().includes(k));
  return hit || null;
}
const statusOf = (sec) => statusFromHp(sec.hp, sec.maxHp);

async function saveChar(ctx, ch, upd) {
  Object.assign(ch, upd);
  await db.doc(`campaigns/${ctx.cid}/characters/${ch.id}`).update(upd);
}
async function saveCombat(ctx) {
  await db.doc(`campaigns/${ctx.cid}`).update({ "state.combat": ctx.combat || { active: false } });
  await db.doc(`campaigns/${ctx.cid}/secret/gm`).update({ combatants: ctx.secret.combatants || {} });
}

function newCombatant(ctx, e, n, ally = false) {
  const mon = monsterFor(e.monster_key);
  const id = "c" + newId(5);
  const maxHp = clamp(e.hp || mon?.hp || 10, 1, 2000);
  const ac = e.ac || mon?.ac || 12;
  const initBonus = e.init_bonus ?? (mon ? mod(mon.abilities.dex) : 0);
  const r = rollExpr(`1d20${fmtMod(initBonus)}`);
  const name = (e.name || mon?.name || "Ennemi") + (n ? ` ${n}` : "");
  ctx.secret.combatants ||= {};
  ctx.secret.combatants[id] = { name, monsterKey: e.monster_key || null, hp: maxHp, maxHp, ac, xp: e.xp ?? mon?.xp ?? 0, ally };
  return { id, name, kind: "npc", init: r.total, initDex: initBonus, status: "Indemne", conditions: [], ally };
}

async function execTool(ctx, name, input) {
  const cid = ctx.cid;
  switch (name) {
    case "request_roll": {
      const ch = findChar(ctx, input.character_id);
      if (!ch) return `Erreur : personnage ${input.character_id} introuvable. Ids valides : ${ctx.chars.map((c) => c.id + " (" + c.name + ")").join(", ")}`;
      if (input.kind === "skill" && !R.skills[input.skill]) return `Erreur : compétence inconnue « ${input.skill} ».`;
      if (["check", "save"].includes(input.kind) && !ABI_FR[input.ability]) return "Erreur : caractéristique manquante (str, dex, con, int, wis, cha).";
      const id = "r" + newId(6);
      const req = { id, characterId: ch.id, characterName: ch.name, uid: ch.ownerUid, kind: input.kind, skill: input.skill || null, ability: input.ability || null,
        advantage: input.advantage || "normal", label: str(input.label, 80), expr: input.expr || null, dc: Number.isFinite(input.dc) ? input.dc : null, at: Date.now() };
      ctx.secret.pending ||= {}; ctx.secret.pending[id] = req;
      const pub = { ...req }; delete pub.dc;
      ctx.pendingPublic.push(pub);
      await db.doc(`campaigns/${cid}/secret/gm`).update({ pending: ctx.secret.pending });
      await db.doc(`campaigns/${cid}`).update({ "state.pendingRolls": FieldValue.arrayUnion(pub) });
      return `Jet demandé à ${ch.name} (${req.label}). Termine ta réponse en l'invitant à lancer ; n'invente pas le résultat.`;
    }
    case "npc_roll": {
      const r = rollExpr(input.expr);
      if (input.visible) await addLog(cid, { type: "roll", authorName: "MJ", portrait: "🐉", label: str(input.label, 80), roll: { expr: r.expr, total: r.total, groups: r.groups, natural: r.groups[0]?.sides === 20 ? r.groups[0].values[r.groups[0].kept[0]] : null }, npc: true });
      return `${input.label} : ${r.expr} = ${r.total} (dés : ${r.groups.map((g) => g.values.join(",")).join(" | ")})`;
    }
    case "npc_attack": {
      const ch = findChar(ctx, input.target_character_id);
      if (!ch) return "Erreur : héros cible introuvable.";
      const att = findCombatant(ctx, input.attacker_id);
      const attName = att?.name || input.attacker_id;
      const adv = input.advantage === "adv" ? "2d20kh1" : input.advantage === "dis" ? "2d20kl1" : "1d20";
      const a = rollExpr(adv + fmtMod(input.attack_bonus || 0));
      const nat = a.groups[0].values[a.groups[0].kept[0]];
      const ac = derive(R, ch).ac;
      const hit = nat === 20 || (nat !== 1 && a.total >= ac);
      // Un héros à 0 PV touché au corps à corps subit un critique : le MJ le gère via le texte
      let dmgTxt = ""; let dmgTotal = 0;
      if (hit) {
        const expr = nat === 20 ? String(input.damage_expr).replace(/(\d*)d(\d+)/g, (_, n, s) => `${(parseInt(n || "1", 10)) * 2}d${s}`) : input.damage_expr;
        const dmg = rollExpr(expr); dmgTotal = Math.max(0, dmg.total);
        const { upd, notes } = applyHpChange(ch, -dmgTotal);
        await saveChar(ctx, ch, upd);
        dmgTxt = ` → ${dmgTotal} dégâts${input.damage_type ? " " + (DAMAGE_FR[input.damage_type] || input.damage_type) : ""}${notes.length ? " (" + notes.join(", ") + ")" : ""}. ${ch.name} : ${ch.hp.current}/${ch.hp.max} PV.`;
      }
      await addLog(cid, { type: "roll", authorName: attName, portrait: "👹", npc: true, label: `${input.attack_name || "Attaque"} contre ${ch.name}`,
        roll: { expr: a.expr, total: a.total, groups: a.groups, natural: nat, crit: nat === 20, fumble: nat === 1 }, outcome: hit ? (nat === 20 ? "Coup critique !" : "Touché") : "Raté", damage: hit ? dmgTotal : null });
      return `${attName} attaque ${ch.name} (CA ${ac}) : ${a.total} (d20 ${nat}) → ${hit ? (nat === 20 ? "CRITIQUE" : "TOUCHÉ") : "RATÉ"}${dmgTxt}`;
    }
    case "modify_hp": {
      const ch = findChar(ctx, input.target_id);
      if (ch) {
        const { upd, notes } = applyHpChange(ch, input.amount || 0);
        if (input.temp_hp) upd.hp = { ...upd.hp, temp: Math.max(upd.hp.temp || 0, input.temp_hp) };
        await saveChar(ctx, ch, upd);
        if (input.amount) await addLog(cid, { type: "system", text: `${ch.name} ${input.amount < 0 ? `subit ${-input.amount} dégâts` : `récupère ${input.amount} PV`}${input.reason ? " (" + str(input.reason, 80) + ")" : ""}.` });
        return `${ch.name} : ${ch.hp.current}/${ch.hp.max} PV${ch.hp.temp ? " +" + ch.hp.temp + " temp" : ""}${notes.length ? " — " + notes.join(", ") : ""}.`;
      }
      const o = findCombatant(ctx, input.target_id);
      if (!o) return "Erreur : cible introuvable.";
      const sec = ctx.secret.combatants[o.id];
      sec.hp = clamp(sec.hp + (input.amount || 0), 0, sec.maxHp);
      o.status = sec.hp <= 0 ? (o.ally ? "À terre" : "Vaincu") : statusOf(sec);
      await saveCombat(ctx);
      return `${o.name} : ${sec.hp}/${sec.maxHp} PV${sec.hp <= 0 ? " — VAINCU" : ""}.`;
    }
    case "set_condition": {
      const cond = input.condition;
      const ch = findChar(ctx, input.target_id);
      if (ch) {
        if (cond === "exhaustion") { await saveChar(ctx, ch, { exhaustion: clamp((ch.exhaustion || 0) + (input.active ? 1 : -1), 0, 6) }); return `${ch.name} : épuisement ${ch.exhaustion}.`; }
        if (!R.conditions[cond]) return "Erreur : état inconnu.";
        const set = new Set(ch.conditions || []); input.active ? set.add(cond) : set.delete(cond);
        await saveChar(ctx, ch, { conditions: [...set] });
        await addLog(cid, { type: "system", text: `${ch.name} ${input.active ? "est désormais" : "n'est plus"} ${R.conditions[cond].nameFr.toLowerCase()}.` });
        return `OK : ${ch.name} — ${[...set].join(", ") || "aucun état"}.`;
      }
      const o = findCombatant(ctx, input.target_id);
      if (!o) return "Erreur : cible introuvable.";
      const set = new Set(o.conditions || []); const label = R.conditions[cond]?.nameFr || cond;
      input.active ? set.add(label) : set.delete(label); o.conditions = [...set];
      await saveCombat(ctx); return `OK : ${o.name} — ${o.conditions.join(", ") || "aucun état"}.`;
    }
    case "start_combat": {
      ctx.secret.combatants = {};
      const order = [];
      for (const e of input.enemies || []) { const n = clamp(e.count || 1, 1, 20); for (let i = 1; i <= n; i++) order.push(newCombatant(ctx, e, n > 1 ? i : 0)); }
      for (const a of input.allies || []) order.push(newCombatant(ctx, a, 0, true));
      for (const ch of ctx.chars.filter((c) => c.alive !== false)) {
        order.push({ id: "pc-" + ch.id, name: ch.name, kind: "pc", characterId: ch.id, init: null, status: "", conditions: [] });
        await execTool(ctx, "request_roll", { character_id: ch.id, kind: "initiative", label: "Initiative !" });
      }
      ctx.combat = { active: true, round: 1, turn: 0, order, startedAt: Date.now() };
      await saveCombat(ctx);
      await addLog(cid, { type: "system", text: "⚔️ Le combat commence ! Lancez l'initiative." });
      return `Combat lancé. Ennemis : ${order.filter((o) => o.kind === "npc").map((o) => `${o.name} [id ${o.id}] init ${o.init}, PV ${ctx.secret.combatants[o.id].hp}, CA ${ctx.secret.combatants[o.id].ac}, XP ${ctx.secret.combatants[o.id].xp}`).join(" ; ")}. Les initiatives des héros ont été demandées : termine ta réponse et attends-les.`;
    }
    case "add_combatant": {
      if (!ctx.combat?.active) return "Erreur : aucun combat en cours.";
      const o = newCombatant(ctx, input, 0, !!input.ally);
      ctx.combat.order.push(o);
      const cur = ctx.combat.order[ctx.combat.turn];
      ctx.combat.order.sort((a, b) => (b.init ?? -99) - (a.init ?? -99) || (b.initDex || 0) - (a.initDex || 0));
      ctx.combat.turn = Math.max(0, ctx.combat.order.indexOf(cur));
      await saveCombat(ctx);
      return `${o.name} rejoint le combat [id ${o.id}] init ${o.init}, PV ${ctx.secret.combatants[o.id].hp}, CA ${ctx.secret.combatants[o.id].ac}.`;
    }
    case "next_turn": {
      const cb = ctx.combat;
      if (!cb?.active) return "Erreur : aucun combat en cours.";
      const alive = (o) => (o.kind === "pc" ? findChar(ctx, o.characterId)?.alive !== false : (ctx.secret.combatants[o.id]?.hp || 0) > 0);
      let guard = 0;
      do { cb.turn += 1; if (cb.turn >= cb.order.length) { cb.turn = 0; cb.round += 1; } guard++; } while (!alive(cb.order[cb.turn]) && guard < cb.order.length + 1);
      const o = cb.order[cb.turn];
      await saveCombat(ctx);
      const ch = o.kind === "pc" ? findChar(ctx, o.characterId) : null;
      await addLog(cid, { type: "system", text: `Round ${cb.round} — au tour de ${o.name}.` });
      return `Round ${cb.round}. C'est au tour de ${o.name}${ch ? ` (héros, id ${ch.id}${ch.hp.current === 0 ? ", à 0 PV : demande un jet contre la mort" : ""}) : décris la situation et demande-lui ce qu'il fait, puis arrête-toi.` : ` (id ${o.id}) : fais-le agir.`}`;
    }
    case "end_combat": {
      const cs = ctx.secret.combatants || {};
      const xp = Object.values(cs).filter((x) => !x.ally && x.hp <= 0).reduce((a, x) => a + (x.xp || 0), 0);
      ctx.combat = { active: false };
      ctx.secret.combatants = {};
      await saveCombat(ctx);
      // Les jets d'initiative non faits sont annulés
      const pend = Object.fromEntries(Object.entries(ctx.secret.pending || {}).filter(([, p]) => p.kind !== "initiative"));
      ctx.secret.pending = pend; ctx.pendingPublic = ctx.pendingPublic.filter((p) => p.kind !== "initiative");
      await db.doc(`campaigns/${cid}/secret/gm`).update({ pending: pend });
      await db.doc(`campaigns/${cid}`).update({ "state.pendingRolls": Object.values(pend).map(({ dc, ...p }) => p) });
      await addLog(cid, { type: "system", text: `🏁 Fin du combat${input.outcome ? " : " + str(input.outcome, 120) : ""}.` });
      const n = ctx.chars.filter((c) => c.alive !== false).length || 1;
      return `Combat terminé. XP des ennemis vaincus : ${xp} au total, soit ${Math.floor(xp / n)} par héros (utilise award_xp).`;
    }
    case "award_xp": {
      if (ctx.settings.xpMode === "milestone") return "La campagne est en mode jalons : utilise plutôt level_up_ready.";
      const amt = clamp(input.amount_each | 0, 0, 100000);
      const targets = (input.character_ids?.length ? input.character_ids.map((i) => findChar(ctx, i)) : ctx.chars).filter(Boolean);
      const ready = [];
      for (const ch of targets) {
        const xp = (ch.xp || 0) + amt; await saveChar(ctx, ch, { xp });
        if (ch.level < 20 && xp >= XP_TABLE[ch.level]) ready.push(ch.name);
      }
      await addLog(cid, { type: "system", text: `✨ +${amt} XP pour ${targets.map((c) => c.name).join(", ")} (${str(input.reason, 100)}).${ready.length ? " " + ready.join(", ") + " peut monter de niveau !" : ""}` });
      return `XP donnée.${ready.length ? " Peuvent monter de niveau : " + ready.join(", ") + " (ils le font depuis leur fiche)." : ""}`;
    }
    case "level_up_ready": {
      const targets = (input.character_ids?.length ? input.character_ids.map((i) => findChar(ctx, i)) : ctx.chars).filter(Boolean);
      for (const ch of targets) await saveChar(ctx, ch, { levelUpReady: true });
      await addLog(cid, { type: "system", text: `⭐ ${targets.map((c) => c.name).join(", ")} peu${targets.length > 1 ? "vent" : "t"} monter de niveau ! (${str(input.reason, 100)})` });
      return "OK.";
    }
    case "give_item": {
      const ch = findChar(ctx, input.character_id); if (!ch) return "Erreur : héros introuvable.";
      const idx = input.srd_index && (R.equipment[input.srd_index] || R.magicItems[input.srd_index]) ? input.srd_index : null;
      const qty = clamp(input.qty || 1, 1, 999);
      const inv = [...(ch.inventory || [])];
      const same = inv.find((i) => idx && i.index === idx && !R.magicItems[idx]);
      if (same) same.qty += qty;
      else inv.push({ id: newId(8), index: idx, name: str(input.name, 80), qty, equipped: false, notes: str(input.description, 400), magic: !!(idx && R.magicItems[idx]), bonus: clamp(input.bonus | 0, 0, 3) });
      await saveChar(ctx, ch, { inventory: inv });
      await addLog(cid, { type: "system", text: `🎁 ${ch.name} reçoit ${qty > 1 ? qty + "× " : ""}${input.name}.` });
      return `OK : ${input.name} ajouté à l'inventaire de ${ch.name}${idx ? "" : " (objet libre, hors SRD)"}.`;
    }
    case "take_item": {
      const ch = findChar(ctx, input.character_id); if (!ch) return "Erreur : héros introuvable.";
      const q = String(input.item_name).toLowerCase();
      const inv = [...(ch.inventory || [])];
      const i = inv.findIndex((x) => x.name.toLowerCase().includes(q) || (x.index || "") === q);
      if (i < 0) return `Erreur : ${ch.name} ne possède pas « ${input.item_name} ». Inventaire : ${inv.map((x) => x.name).join(", ")}`;
      const n = clamp(input.qty || 1, 1, inv[i].qty || 1);
      const name0 = inv[i].name;
      if ((inv[i].qty || 1) - n <= 0) inv.splice(i, 1); else inv[i] = { ...inv[i], qty: inv[i].qty - n };
      await saveChar(ctx, ch, { inventory: inv });
      await addLog(cid, { type: "system", text: `${ch.name} perd ${n > 1 ? n + "× " : ""}${name0}.` });
      return "OK.";
    }
    case "change_gold": {
      const ch = findChar(ctx, input.character_id); if (!ch) return "Erreur : héros introuvable.";
      const g = Math.max(0, (ch.gold || 0) + (input.delta | 0));
      await saveChar(ctx, ch, { gold: g });
      await addLog(cid, { type: "system", text: `💰 ${ch.name} ${input.delta >= 0 ? "gagne" : "dépense"} ${Math.abs(input.delta | 0)} po${input.reason ? " (" + str(input.reason, 80) + ")" : ""}.` });
      return `${ch.name} a maintenant ${g} po.`;
    }
    case "grant_rest": {
      await db.doc(`campaigns/${cid}`).update({ "state.restGrant": { type: input.type, at: Date.now(), usedBy: {} } });
      await addLog(cid, { type: "system", text: input.type === "long" ? "🌙 Repos long autorisé : chacun peut le valider depuis sa fiche." : "☕ Repos court autorisé : chacun peut dépenser ses dés de vie depuis sa fiche." });
      return "Repos accordé.";
    }
    case "set_inspiration": {
      const ch = findChar(ctx, input.character_id); if (!ch) return "Erreur : héros introuvable.";
      await saveChar(ctx, ch, { inspiration: true });
      await addLog(cid, { type: "system", text: `🌟 ${ch.name} gagne l'Inspiration héroïque${input.reason ? " : " + str(input.reason, 100) : ""} !` });
      return "OK.";
    }
    case "lookup": {
      const map = { monster: MONSTERS, spell: R.spells, condition: R.conditions, item: R.equipment, magic_item: R.magicItems, feature: R.features }[input.kind];
      const hit = map && search(map, input.query);
      if (!hit) return `Aucun résultat pour « ${input.query} ».${input.kind === "monster" ? " Exemples de clés : " + Object.keys(MONSTERS).filter((k) => k.includes(String(input.query).toLowerCase().slice(0, 3))).slice(0, 15).join(", ") : ""}`;
      return `${hit[0]} : ${JSON.stringify(hit[1]).slice(0, ctx.settings?.economy ? 1500 : 3500)}`;
    }
    case "update_scene": {
      const prev = ctx.c.state?.scene || {};
      const scene = { title: str(input.title, 80), location: str(input.location, 80), mood: str(input.mood, 20), ambiance: str(input.ambiance, 20), at: Date.now() };
      await db.doc(`campaigns/${cid}`).update({ "state.scene": scene });
      ctx.c.state = { ...(ctx.c.state || {}), scene };
      // Illustration : une par nouvelle scène, générée en arrière-plan (n'attend pas)
      const newPlace = scene.title !== prev.title || scene.location !== prev.location;
      if (ctx.settings.images !== false && newPlace && !ctx.illustrated && platform.illustrate) {
        ctx.illustrated = true;
        platform.illustrate(cid, { scene, prompt: str(input.illustration, 600), model: ctx.settings.imageModel, worldSetup: ctx.world?.setup, tone: ctx.settings.tone });
      }
      return "Scène mise à jour (ambiance sonore en place).";
    }
    case "update_quest": {
      const quests = [...(ctx.c.state?.quests || [])];
      const i = quests.findIndex((q) => q.title.toLowerCase() === String(input.title).toLowerCase());
      const q = { title: str(input.title, 100), status: input.status, notes: str(input.notes, 400), at: Date.now() };
      if (i >= 0) quests[i] = { ...quests[i], ...q, notes: q.notes || quests[i].notes }; else quests.push(q);
      ctx.c.state = { ...(ctx.c.state || {}), quests };
      await db.doc(`campaigns/${cid}`).update({ "state.quests": quests });
      if (i < 0) await addLog(cid, { type: "system", text: `📜 Nouvelle quête : ${q.title}` });
      else if (input.status !== "active") await addLog(cid, { type: "system", text: `📜 Quête ${input.status === "done" ? "accomplie" : "échouée"} : ${q.title}` });
      return "Quête enregistrée.";
    }
    case "world_add": {
      if (!ctx.world) return "Erreur : pas de monde lié à cette campagne ; utilise remember.";
      return gmAddEntry(ctx.world, cid, input);
    }
    case "world_reveal": {
      if (!ctx.world) return "Erreur : pas de monde lié.";
      return revealEntry(ctx.world, cid, input);
    }
    case "remember": {
      ctx.secret.memory = [...(ctx.secret.memory || []), str(input.fact, 300)].slice(-120);
      await db.doc(`campaigns/${cid}/secret/gm`).update({ memory: ctx.secret.memory });
      return "Noté.";
    }
    default: return `Outil inconnu : ${name}`;
  }
}

// ---------------------------------------------------------------- Boucle MJ
async function acquireLock(cid) {
  const ref = db.doc(`campaigns/${cid}`);
  return db.runTransaction(async (tx) => {
    const s = await tx.get(ref); const st = s.data()?.state || {};
    if (st.gmBusy && Date.now() - (st.gmBusySince || 0) < 120e3) { tx.update(ref, { "state.gmRequested": true }); return false; }
    tx.update(ref, { "state.gmBusy": true, "state.gmBusySince": Date.now(), "state.gmRequested": false });
    return true;
  });
}

/** Rassemble tout ce qu'il faut pour faire jouer le MJ : campagne, héros, secrets, monde, contexte. */
async function prepare(cid, reason = "players", withText = true) {
  const cref = db.doc(`campaigns/${cid}`);
  const c = (await cref.get()).data();
  const settings = { ...DEFAULT_SETTINGS, ...(c.settings || {}) };
  const charSnap = await db.collection(`campaigns/${cid}/characters`).get();
  const active = new Set(Object.values(c.activeCharacters || {}));
  const chars = charSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => active.has(x.id));
  const secret = (await db.doc(`campaigns/${cid}/secret/gm`).get()).data() || {};
  const worldDoc = await loadWorld(c.worldId);
  const ctx = { cid, c, chars, secret, settings, world: worldDoc, combat: c.state?.combat || { active: false }, pendingPublic: [] };
  const userText = withText ? await buildContext(cid, c, chars, secret, reason) : "";
  const system = [{ type: "text", text: GM_CORE }];
  if (worldDoc) {
    system.push({ type: "text", text: `${setupText(worldDoc.setup)}\n\n# BIBLE DU MONDE « ${worldDoc.name} » — version ${worldDoc.version}\n${worldDoc.baseText}`, cache_control: { type: "ephemeral" } });
    const adds = await additionsText(worldDoc);
    if (adds) system.push({ type: "text", text: adds, cache_control: { type: "ephemeral" } });
  } else {
    const world = c.setting === "ardyn" ? BIBLE_ARDYN : c.setting === "custom" && c.bible ? `# MONDE DE LA CAMPAGNE\n${c.bible}` : GENERIC_WORLD;
    system.push({ type: "text", text: setupText() + "\n\n" + world, cache_control: { type: "ephemeral" } });
  }
  return { c, settings, chars, secret, worldDoc, ctx, userText, system };
}

/** Tour de table : après chaque réponse du MJ, un nouveau tour s'ouvre (sauf combat ou jets de dés en attente). */
async function openNextRound(cid, settings) {
  const cref = db.doc(`campaigns/${cid}`);
  if (settings.turnMode !== "round") return;
  const now = (await cref.get()).data();
  const freshChars = (await db.collection(`campaigns/${cid}/characters`).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const round = now.state?.combat?.active || (now.state?.pendingRolls || []).length ? null : newRound(now, freshChars);
  await cref.update({ "state.round": round ? { ...round, n: (now.state?.round?.n || 0) + 1 } : { ...(now.state?.round || {}), idx: 999 } });
}

// ---------------------------------------------------------------- MJ externe (outil en ligne de commande tools/mj.mjs)
/** Tout ce que Claude doit lire pour jouer le MJ maintenant. */
export async function externalContext(cid, reason = "players") {
  const p = await prepare(cid, reason, true);
  await db.doc(`campaigns/${cid}`).update({ "state.externalCtxAt": Date.now() });
  return { system: p.system.map((b) => b.text).join("\n\n"), context: p.userText, model: p.settings.model };
}
export function externalToolList() { return TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema })); }
/** Exécute un outil du MJ (jets, PV, scène, etc.) exactement comme si le modèle l'avait appelé. */
export async function externalTool(cid, name, input) {
  const p = await prepare(cid, "players", false);
  return execTool(p.ctx, name, input || {});
}
/** Publie le récit du MJ, ouvre le tour suivant et lève l'attente. */
export async function externalSay(cid, text) {
  const cref = db.doc(`campaigns/${cid}`);
  const c = (await cref.get()).data();
  const settings = { ...DEFAULT_SETTINGS, ...(c.settings || {}) };
  const narration = str(text, 6000).trim();
  if (!narration) throw new HttpsError("invalid-argument", "Récit vide.");
  await addLog(cid, { type: "gm", authorName: "Maître du Jeu", portrait: "🐉", text: narration, model: "claude (abonnement)" });
  await openNextRound(cid, settings);
  await cref.update({ "state.lastGmAt": c.state?.externalCtxAt || Date.now(), "state.gmWaiting": FieldValue.delete() });
  return { ok: true };
}
/** Etat résumé : qui attend le MJ, jets en attente, tour en cours. */
export async function externalStatus(cid) {
  const c = (await db.doc(`campaigns/${cid}`).get()).data();
  if (!c) throw new HttpsError("not-found", "Campagne introuvable.");
  const st = c.state || {};
  return { name: c.name, external: !!c.settings?.externalGm, waiting: st.gmWaiting || null, pendingRolls: (st.pendingRolls || []).map((p) => `${p.characterName} : ${p.label}`),
    scene: st.scene?.title || null, combat: !!st.combat?.active, round: st.round ? { n: st.round.n, idx: st.round.idx, of: (st.round.order || []).length } : null };
}

export async function runGm(cid, reason = "players", depth = 0) {
  {
    // MJ externe : Claude (abonnement) joue le MJ via l'outil tools/mj.mjs ; l'app n'appelle pas l'API, elle signale qu'on attend le MJ.
    const cur = (await db.doc(`campaigns/${cid}`).get()).data();
    if (cur?.settings?.externalGm) { await db.doc(`campaigns/${cid}`).update({ "state.gmWaiting": { at: Date.now(), reason } }); return { external: true }; }
  }
  if (!(await acquireLock(cid))) return { busy: true };
  const cref = db.doc(`campaigns/${cid}`);
  const started = Date.now();
  try {
    const { c, settings, ctx, userText, system } = await prepare(cid, reason);
    const messages = [{ role: "user", content: userText }];
    const texts = []; const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0 };
    let usedModel = settings.economy ? settings.helperModel : settings.model; let fellBack = false;
    const maxLoops = settings.economy ? 5 : 9, maxTok = settings.economy ? 1100 : 2000;
    for (let i = 0; i < maxLoops; i++) {
      if (i) await cref.update({ "state.gmBusySince": Date.now() }); // le MJ travaille encore : on garde la main
      let resp;
      try { resp = await anthropic().messages.create({ model: usedModel, max_tokens: maxTok, system, tools: TOOLS, messages: cacheTail(messages) }); }
      catch (e) {
        // Modèle principal pas (encore) activé dans Vertex AI : on joue avec le modèle de secours plutôt que de bloquer la partie.
        if (i === 0 && [400, 403, 404].includes(e.status) && usedModel !== settings.helperModel) {
          logger.warn(`Modèle ${usedModel} indisponible (${e.status}), repli sur ${settings.helperModel}`);
          usedModel = settings.helperModel; fellBack = true; i--; continue;
        }
        throw e;
      }
      usage.calls++; usage.input += resp.usage?.input_tokens || 0; usage.output += resp.usage?.output_tokens || 0;
      usage.cacheRead += resp.usage?.cache_read_input_tokens || 0; usage.cacheWrite += resp.usage?.cache_creation_input_tokens || 0;
      { const r = rateFor(usedModel), u = resp.usage || {}; usage.cost = (usage.cost || 0) + ((u.input_tokens || 0) * r.in + (u.output_tokens || 0) * r.out + (u.cache_read_input_tokens || 0) * r.in * 0.1 + (u.cache_creation_input_tokens || 0) * r.in * 1.25) / 1e6; }
      for (const b of resp.content) if (b.type === "text" && b.text.trim()) texts.push(b.text.trim());
      if (resp.stop_reason !== "tool_use") break;
      messages.push({ role: "assistant", content: resp.content });
      const results = [];
      for (const b of resp.content.filter((x) => x.type === "tool_use")) {
        let out;
        try { out = await execTool(ctx, b.name, b.input || {}); } catch (e) { logger.warn("tool error", b.name, e); out = `Erreur : ${e.message}`; }
        results.push({ type: "tool_result", tool_use_id: b.id, content: String(out) });
      }
      messages.push({ role: "user", content: results });
    }
    const narration = texts.join("\n\n").trim();
    if (narration) await addLog(cid, { type: "gm", authorName: "Maître du Jeu", portrait: "🐉", text: narration, model: usedModel });
    await openNextRound(cid, settings);
    if (fellBack) await cref.update({ "state.modelWarning": `${settings.model} n'est pas accessible avec cette clé : le MJ utilise ${usedModel} en attendant.` });
    else if (c.state?.modelWarning) await cref.update({ "state.modelWarning": FieldValue.delete() });
    await cref.update({
      "state.lastGmAt": started,
      "usage.input": FieldValue.increment(usage.input), "usage.output": FieldValue.increment(usage.output),
      "usage.cacheRead": FieldValue.increment(usage.cacheRead), "usage.cacheWrite": FieldValue.increment(usage.cacheWrite),
      "usage.calls": FieldValue.increment(usage.calls), "usage.costUsd": FieldValue.increment(usage.cost || 0), [`usage.byModel.${usedModel.replace(/\./g, "_")}`]: FieldValue.increment(usage.input + usage.output),
    });
    try { await maybeSummarize(cid, settings); } catch (e) { logger.warn("Résumé non mis à jour", e); }
    return { ok: true };
  } catch (e) {
    logger.error("GM error", e);
    const why = e.status === 401 ? "clé Claude absente ou invalide : l'hôte doit la saisir dans ⚙️" : e.status === 403 ? "accès refusé par Anthropic (clé ou crédit)" : e.status === 404 ? "modèle introuvable (change de modèle dans ⚙️)" : e.status === 429 ? "trop de demandes, réessaie dans un instant" : e.status === 529 ? "service surchargé, réessaie" : e.status === 400 && /credit/i.test(e.message || "") ? "crédit Anthropic épuisé" : "erreur technique : " + String(e.message || "").slice(0, 120);
    try { await addLog(cid, { type: "system", text: `⚠️ Le Maître du Jeu a eu un souci (${why}). Appuie à nouveau sur « Au MJ ».` }); } catch {}
    return { error: why };
  } finally {
    let after = {};
    try { after = (await cref.get()).data()?.state || {}; await cref.update({ "state.gmBusy": false }); } catch (e) { logger.warn(e); }
    if (after.gmRequested && depth < 1) await runGm(cid, "players", depth + 1);
  }
}

async function maybeSummarize(cid, settings) {
  const cref = db.doc(`campaigns/${cid}`);
  const st = (await cref.get()).data()?.state || {};
  const since = st.summaryUpTo || 0;
  const snap = await db.collection(`campaigns/${cid}/log`).where("tms", ">", since).orderBy("tms", "asc").get();
  if (snap.size < 50) return;
  const old = snap.docs.slice(0, snap.size - 24).map((d) => d.data());
  const resp = await helperCall(settings, { max_tokens: 1200, system: SUMMARY_PROMPT,
    messages: [{ role: "user", content: `Résumé actuel :\n${st.summary || "(aucun)"}\n\nNouveaux événements :\n${old.filter((e) => e.type !== "roll").map(fmtLog).join("\n")}` }] });
  const summary = resp.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  if (summary) await cref.update({ "state.summary": summary, "state.summaryUpTo": old[old.length - 1].tms });
}

export async function askGm(uid, { campaignId }) {
  const { data: c } = await loadCampaign(campaignId, uid);
  if (c.state?.gmBusy && Date.now() - (c.state.gmBusySince || 0) < 120e3) {
    await db.doc(`campaigns/${campaignId}`).update({ "state.gmRequested": true });
    return { queued: true };
  }
  // Le MJ tourne dans le navigateur de celui qui l'appelle ; le verrou évite deux MJ en parallèle.
  // On attend sa réponse pour pouvoir afficher clairement tout problème.
  const r = await runGm(campaignId, "players");
  if (r?.error) throw new HttpsError("internal", r.error);
  if (r?.busy) return { queued: true };
  if (r?.external) return { external: true };
  return { ok: true };
}

/** Annule une demande de jet (hôte) ou débloque le MJ. */
export async function hostGmControl(uid, { campaignId, action, requestId }) {
  await loadCampaign(campaignId, uid, { ownerOnly: true });
  const cref = db.doc(`campaigns/${campaignId}`);
  if (action === "unlock") { await cref.update({ "state.gmBusy": false, "state.gmRequested": false }); return { ok: true }; }
  if (action === "cancelRoll") {
    const sref = db.doc(`campaigns/${campaignId}/secret/gm`);
    const s = (await sref.get()).data() || {};
    const pending = { ...(s.pending || {}) }; delete pending[requestId];
    await sref.update({ pending });
    const c = (await cref.get()).data();
    await cref.update({ "state.pendingRolls": (c.state?.pendingRolls || []).filter((p) => p.id !== requestId) });
    return { ok: true };
  }
  if (action === "endCombat") {
    await cref.update({ "state.combat": { active: false } });
    await db.doc(`campaigns/${campaignId}/secret/gm`).update({ combatants: {} });
    return { ok: true };
  }
  if (action === "clearMemory") { await db.doc(`campaigns/${campaignId}/secret/gm`).update({ memory: [] }); return { ok: true }; }
  throw new HttpsError("invalid-argument", "Action inconnue.");
}

export async function translate(uid, { text, campaignId }) {
  await loadCampaign(campaignId, uid);
  const t = str(text, 6000);
  if (!t) return { text: "" };
  const h = await platform.hash(t);
  const ref = db.doc(`translations/${h}`);
  const hit = await ref.get();
  if (hit.exists) return { text: hit.data().text };
  const c = (await db.doc(`campaigns/${campaignId}`).get()).data();
  const resp = await helperCall({ ...DEFAULT_SETTINGS, ...(c.settings || {}) }, { max_tokens: 2500,
    system: "Traduis en français ce texte de règles de jeu de rôle (5e édition). Utilise la terminologie française officielle de D&D 5e / Héros & Dragons (ex. Saving Throw = jet de sauvegarde, Advantage = avantage, Bonus Action = action bonus, Hit Points = points de vie, Short Rest = repos court). Convertis les distances en mètres entre parenthèses (5 ft = 1,5 m). Garde la mise en forme markdown. Réponds uniquement avec la traduction.",
    messages: [{ role: "user", content: t }] });
  const out = resp.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  await ref.set({ text: out, at: Date.now() });
  return { text: out };
}

/** Test de la clé API depuis l'écran de réglages. */
export async function pingGm(uid, { campaignId }) {
  const { data: c } = await loadCampaign(campaignId, uid, { ownerOnly: true });
  const s = { ...DEFAULT_SETTINGS, ...(c.settings || {}) };
  const out = {};
  for (const m of [...new Set([s.model, s.helperModel])]) {
    try { const r = await anthropic().messages.create({ model: m, max_tokens: 40, messages: [{ role: "user", content: "Réponds juste : « Le MJ est prêt ! »" }] }); out[m] = "OK — " + r.content.map((b) => b.text || "").join(""); }
    catch (e) { out[m] = `indisponible (${e.status || ""} ${String(e.message || "").slice(0, 160)})`; }
  }
  return { text: Object.entries(out).map(([m, v]) => `${m} : ${v}`).join(" | "), model: s.model };
}

/** Génère la version suivante de la bible : base + ajouts canon, réécrite proprement. */
export async function consolidateWorld(uid, { worldId, note = "", campaignId, entryIds = null, simple = false }) {
  const w = await loadWorld(worldId);
  if (!w) throw new HttpsError("not-found", "Monde introuvable.");
  if (w.ownerUid !== uid) throw new HttpsError("permission-denied", "Seul le créateur du monde peut publier une nouvelle version.");
  const snap = await db.collection(`worlds/${worldId}/entries`).get();
  const pick = Array.isArray(entryIds) ? new Set(entryIds) : null;
  const entries = snap.docs.filter((d) => !d.data().merged && d.data().status !== "proposed" && (!pick || pick.has(d.id)));
  if (!entries.length) throw new HttpsError("failed-precondition", "Aucun ajout sélectionné à intégrer.");
  const version = (w.version || 1) + 1;
  // Sans clé Claude (MJ externe) ou sur demande : ajout simple en fin de bible, sans réécriture.
  if (simple || !platform.apiKey) {
    const byCat = {};
    for (const d of entries) { const e = d.data(); (byCat[e.revealed ? (CATEGORIES[e.category] || e.category) : "Secrets nés des parties (MJ seulement)"] ||= []).push(e); }
    const block = `\n\n## Ajouts des parties — version ${version}${note ? ` (${str(note, 300)})` : ""}\n` + Object.entries(byCat).map(([cat, list]) =>
      `\n### ${cat}\n` + list.map((e) => `- **${e.name}** : ${e.summary}${e.details ? " — " + e.details : ""}`).join("\n")).join("\n");
    const text = w.baseText + block;
    await db.doc(`worlds/${worldId}/versions/${version}`).set({ version, text, at: Date.now(), note: str(note, 500), added: entries.map((d) => d.data().name), simple: true });
    await db.doc(`worlds/${worldId}`).update({ baseText: text, version });
    for (const d of entries) await d.ref.update({ merged: true, mergedIn: version });
    return { version, added: entries.length, simple: true };
  }
  const list = entries.map((d) => { const e = d.data(); return `- [${CATEGORIES[e.category] || e.category}] ${e.name}${e.revealed ? "" : " (connu du MJ seulement)"} : ${e.summary}${e.details ? " — " + e.details : ""}`; }).join("\n");
  const camp = campaignId ? (await db.doc(`campaigns/${campaignId}`).get()).data() : null;
  const model = camp?.settings?.model || DEFAULT_SETTINGS.model;
  const stream = anthropic().messages.stream({ model, max_tokens: 32000, system: CONSOLIDATE_PROMPT,
    messages: [{ role: "user", content: `# BIBLE ACTUELLE (version ${w.version})\n${w.baseText}\n\n# AJOUTS À INTÉGRER (${entries.length})\n${list}\n\nNote de l'hôte pour cette version : ${str(note, 500) || "—"}` }] });
  const msg = await stream.finalMessage();
  const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  if (text.length < w.baseText.length * 0.8) throw new HttpsError("internal", "La nouvelle version semble incomplète : rien n'a été modifié. Réessaie.");
  await db.doc(`worlds/${worldId}/versions/${version}`).set({ version, text, at: Date.now(), note: str(note, 500), added: entries.map((d) => d.data().name) });
  await db.doc(`worlds/${worldId}`).update({ baseText: text, version });
  for (const d of entries) await d.ref.update({ merged: true, mergedIn: version });
  return { version, added: entries.length };
}

export async function getWorldVersion(uid, { worldId, version }) {
  const w = await loadWorld(worldId);
  if (!w || !(w.readers || []).includes(uid)) throw new HttpsError("permission-denied", "Monde inaccessible.");
  if (w.ownerUid !== uid) throw new HttpsError("permission-denied", "La bible complète (avec les secrets) est réservée au créateur du monde.");
  const v = await db.doc(`worlds/${worldId}/versions/${parseInt(version, 10) || w.version}`).get();
  if (!v.exists) throw new HttpsError("not-found", "Version introuvable.");
  return { name: w.name, ...v.data() };
}
