// Mondes vivants : une base (ex. la bible d'Ardyn), un cadre fixé par l'hôte, des ajouts du MJ, des versions consolidées.
import { HttpsError, logger, platform, randomInt, db, FieldValue, BIBLE_ARDYN, RULES, str, newId } from "./common.js";
import { GENERIC_WORLD } from "./prompts.js";

export const CATEGORIES = { lieu: "Lieu", pnj: "Personnage", faction: "Faction", histoire: "Histoire et légendes", creature: "Créature", objet: "Objet notable", culture: "Culture et coutumes", religion: "Religion et magie" };

export const MAGIC_LEVELS = {
  rare: "MAGIE RARE ET REDOUTÉE (style Le Seigneur des Anneaux / Game of Thrones). La magie est ancienne, rare, coûteuse et souvent crainte. Les PNJ capables de lancer des sorts sont exceptionnels : quelques mages connus, des prêtres, des sorciers isolés ; un garde, un soldat ou un bandit ordinaire se bat avec ses armes et ne lance pas de sorts. Il n'existe ni boutique de magie ni marchand de sorts ; un objet magique est une relique avec un nom, une histoire et un prix. Les effets spectaculaires (boule de feu, téléportation, résurrection) sont rarissimes, marquent les esprits et ont des conséquences (peur, rumeurs, inquisition, épuisement). Quand un héros lance un sort, décris-le de façon sobre et montre la réaction du monde. La plupart des adversaires sont des humains, des bêtes, des orques, des brigands, des soldats, et parfois des morts-vivants ou des créatures liées à l'Ombre. Trésors : surtout de l'or, des armes de qualité, des cartes, des secrets ; au plus une relique magique tous les deux ou trois niveaux.",
  moderate: "MAGIE PRÉSENTE MAIS PRÉCIEUSE (style Lancedragon). Mages, prêtres et créatures magiques existent et sont reconnus, mais restent minoritaires, encadrés par des ordres et des tours. Les objets magiques sont rares et précieux, jamais vendus à l'étal. Les grandes créatures (dragons, géants) sont des événements majeurs, pas des rencontres ordinaires.",
  high: "MAGIE COURANTE (fantasy héroïque classique). La magie fait partie du quotidien des puissants, les créatures fantastiques sont nombreuses, les objets magiques se trouvent régulièrement.",
};

export const DEFAULT_SETUP = {
  inspirations: ["Lancedragon", "Le Seigneur des Anneaux", "Game of Thrones"],
  magic: "rare",
  themes: ["Intrigues politiques et trahisons", "Une ombre ancienne qui revient", "Héroïsme, loyauté et sacrifice", "Morale nuancée : peu de méchants purs", "Dragons rares, vieux et majestueux"],
  forbidden: "Pas de technologie anachronique (poudre, machines, horloges complexes). Pas d'humour absurde ni de clins d'œil modernes. Pas de magie à tous les coins de rue. Pas de portails vers d'autres mondes, pas de voyage dans le temps. Pas de peuples ni de dieux exotiques sans lien avec le monde.",
  goldenRules: "Le monde ne tourne pas autour des héros : les grandes puissances poursuivent leurs plans. Les dieux ne se montrent pas en personne. La magie se paie toujours. Les actes des héros ont des conséquences durables et les PNJ s'en souviennent.",
  allowedClasses: Object.keys(RULES.classes),
  allowedSpecies: Object.keys(RULES.species),
  additionMode: "auto", // auto | review
};

const cleanList = (a, allowed, max = 20) => (Array.isArray(a) ? [...new Set(a.map((x) => str(String(x), 80)).filter(Boolean))].filter((x) => !allowed || allowed.includes(x)).slice(0, max) : undefined);
export function cleanSetup(s = {}) {
  const out = {};
  if (s.inspirations) out.inspirations = cleanList(s.inspirations, null, 8);
  if (MAGIC_LEVELS[s.magic]) out.magic = s.magic;
  if (s.themes) out.themes = cleanList(s.themes, null, 12);
  if (s.forbidden != null) out.forbidden = str(s.forbidden, 2000);
  if (s.goldenRules != null) out.goldenRules = str(s.goldenRules, 3000);
  if (s.allowedClasses) { out.allowedClasses = cleanList(s.allowedClasses, Object.keys(RULES.classes)); if (!out.allowedClasses.length) throw new HttpsError("invalid-argument", "Garde au moins une classe."); }
  if (s.allowedSpecies) { out.allowedSpecies = cleanList(s.allowedSpecies, Object.keys(RULES.species)); if (!out.allowedSpecies.length) throw new HttpsError("invalid-argument", "Garde au moins un peuple."); }
  if (["auto", "review"].includes(s.additionMode)) out.additionMode = s.additionMode;
  if (s.publicIntro != null) out.publicIntro = str(s.publicIntro, 12000);
  return out;
}

/** Le cadre, rédigé pour le MJ : il prime sur tout le reste, y compris la bible. */
export function setupText(setup = {}) {
  const s = { ...DEFAULT_SETUP, ...setup };
  return [
    "# CADRE DU MONDE — FIXÉ PAR L'HÔTE, PRIORITAIRE SUR TOUT LE RESTE",
    `Inspirations à respecter : ${(s.inspirations || []).join(", ") || "fantasy médiévale classique"}. Ton et atmosphère : réalisme médiéval, poids du passé, politique, héroïsme humain. Pas de fantasy loufoque.`,
    `Niveau de magie : ${MAGIC_LEVELS[s.magic] || MAGIC_LEVELS.rare}`,
    s.themes?.length ? `Thèmes à faire vivre : ${s.themes.join(" ; ")}.` : null,
    s.forbidden ? `Interdits absolus : ${s.forbidden}` : null,
    s.goldenRules ? `Règles d'or du monde : ${s.goldenRules}` : null,
    "Si une action ou une idée de joueur sort de ce cadre, ramène-la avec tact dans le ton du monde (adapte, propose une variante cohérente) au lieu de l'accepter telle quelle.",
  ].filter(Boolean).join("\n");
}

export async function loadWorld(wid) {
  if (!wid) return null;
  const s = await db.doc(`worlds/${wid}`).get();
  return s.exists ? { id: s.id, ...s.data() } : null;
}

export async function createWorldDoc(uid, { name, base = "ardyn", baseText = "", setup = {} }) {
  const ref = db.collection("worlds").doc();
  const text = base === "ardyn" ? BIBLE_ARDYN : base === "custom" ? str(baseText, 60000) : GENERIC_WORLD;
  const defaults = base === "ardyn" ? DEFAULT_SETUP : { ...DEFAULT_SETUP, inspirations: ["fantasy médiévale"], themes: [] };
  await ref.set({ name: str(name, 80) || "Mon monde", ownerUid: uid, readers: [uid], base, baseText: text, version: 1,
    setup: { ...defaults, ...cleanSetup(setup) }, createdAt: Date.now(), entryCount: 0 });
  await db.doc(`worlds/${ref.id}/versions/1`).set({ version: 1, text, at: Date.now(), note: base === "ardyn" ? "Bible d'origine (ARDYN_2026)" : "Version de départ" });
  return ref.id;
}

async function ownWorld(uid, wid) {
  const w = await loadWorld(wid);
  if (!w) throw new HttpsError("not-found", "Monde introuvable.");
  if (w.ownerUid !== uid) throw new HttpsError("permission-denied", "Seul le créateur du monde peut le modifier.");
  return w;
}

export async function createWorld(uid, data) { return { id: await createWorldDoc(uid, data || {}) }; }

export async function updateWorld(uid, { worldId, name, setup, baseText }) {
  await ownWorld(uid, worldId);
  const upd = {};
  if (name) upd.name = str(name, 80);
  if (setup) for (const [k, v] of Object.entries(cleanSetup(setup))) upd[`setup.${k}`] = v;
  if (baseText != null) upd.baseText = str(baseText, 120000);
  await db.doc(`worlds/${worldId}`).update(upd);
  return { ok: true };
}

/** Ajout ou modification d'une entrée par l'hôte (corriger, valider, révéler, supprimer). */
export async function editEntry(uid, { worldId, entryId, action, patch = {} }) {
  await ownWorld(uid, worldId);
  const ref = entryId ? db.doc(`worlds/${worldId}/entries/${entryId}`) : db.collection(`worlds/${worldId}/entries`).doc();
  if (action === "delete") { await ref.delete(); await db.doc(`worlds/${worldId}`).update({ entryCount: FieldValue.increment(-1) }); return { ok: true }; }
  const upd = {};
  if (patch.name != null) upd.name = str(patch.name, 100);
  if (patch.category && CATEGORIES[patch.category]) upd.category = patch.category;
  if (patch.summary != null) upd.summary = str(patch.summary, 500);
  if (patch.details != null) upd.details = str(patch.details, 3000);
  if (patch.status && ["canon", "proposed"].includes(patch.status)) upd.status = patch.status;
  if (patch.revealed != null) upd.revealed = !!patch.revealed;
  if (!entryId) {
    if (!upd.name || !upd.summary) throw new HttpsError("invalid-argument", "Nom et résumé requis.");
    Object.assign(upd, { category: upd.category || "lieu", status: "canon", revealed: !!upd.revealed, source: "hôte", at: Date.now(), merged: false });
    await ref.set(upd); await db.doc(`worlds/${worldId}`).update({ entryCount: FieldValue.increment(1) });
  } else { upd.editedAt = Date.now(); await ref.update(upd); }
  return { ok: true, id: ref.id };
}

/** Utilisé par l'outil du MJ. */
export async function gmAddEntry(world, cid, input) {
  const name = str(input.name, 100).trim();
  if (!name) return "Erreur : nom manquant.";
  const col = db.collection(`worlds/${world.id}/entries`);
  const all = (await col.get()).docs;
  const same = all.find((d) => d.data().name.toLowerCase() === name.toLowerCase());
  if (same) {
    const add = str(input.details || input.summary, 1500);
    await same.ref.update({ details: `${same.data().details || ""}\n${add}`.trim().slice(0, 3000), revealed: same.data().revealed || !!input.revealed, editedAt: Date.now() });
    return `Entrée existante « ${name} » complétée.`;
  }
  if (all.length >= 600) return "Le carnet du monde est plein : demande à l'hôte de générer une nouvelle version de la bible.";
  const status = world.setup?.additionMode === "review" ? "proposed" : "canon";
  await col.doc().set({ name, category: CATEGORIES[input.category] ? input.category : "lieu", summary: str(input.summary, 500), details: str(input.details, 3000),
    revealed: !!input.revealed, secret: !input.revealed, status, source: "MJ", campaignId: cid, at: Date.now(), ...(input.revealed ? { revealedAt: Date.now() } : {}), merged: false });
  await db.doc(`worlds/${world.id}`).update({ entryCount: FieldValue.increment(1) });
  return `Ajouté au monde (${status === "proposed" ? "proposition en attente de validation par l'hôte" : "canon"}) : ${name}.`;
}

/** Carnet des héros : rend visible un élément déjà ajouté, ou y inscrit un élément de la bible que les héros découvrent. */
export async function revealEntry(world, cid, input) {
  const name = str(typeof input === "string" ? input : input?.name, 100).trim();
  const known = str(input?.known || input?.summary, 500).trim();
  if (!name) return "Erreur : nom manquant.";
  const col = db.collection(`worlds/${world.id}/entries`);
  const all = (await col.get()).docs;
  const hit = all.find((d) => d.data().name.toLowerCase() === name.toLowerCase());
  if (hit) {
    await hit.ref.update({ revealed: true, ...(known ? { known } : {}), revealedAt: hit.data().revealedAt || Date.now() });
    return `« ${hit.data().name} » est dans le carnet des héros.`;
  }
  if (!known) return `Aucune entrée « ${name} » : pour un élément de la bible, donne aussi known (ce que les héros en savent) et category.`;
  // Élément déjà décrit dans la bible : il entre au carnet sans être proposé comme ajout à la bible.
  await col.doc().set({ name, category: CATEGORIES[input.category] ? input.category : "lieu", summary: known, known, details: "", revealed: true, secret: false,
    status: "canon", source: "bible", campaignId: cid, at: Date.now(), revealedAt: Date.now(), merged: true });
  await db.doc(`worlds/${world.id}`).update({ entryCount: FieldValue.increment(1) });
  return `« ${name} » inscrit au carnet des héros.`;
}

/** Texte des ajouts non encore fusionnés, pour le prompt du MJ. */
export async function additionsText(world) {
  const all = (await db.collection(`worlds/${world.id}/entries`).get()).docs.map((d) => d.data());
  const docs = all.filter((e) => !e.merged);
  const carnet = all.filter((e) => e.revealed).map((e) => e.name);
  const carnetText = carnet.length ? `\n\n# CARNET DES HÉROS (éléments déjà connus des joueurs)\n${carnet.join(", ")}` : "";
  if (!docs.length) return carnetText.trim();
  docs.sort((a, b) => (a.category > b.category ? 1 : -1) || a.at - b.at);
  return `# AJOUTS AU MONDE DEPUIS LA VERSION ${world.version} (canon établi pendant les parties — à respecter)\n` +
    docs.map((e) => `- [${CATEGORIES[e.category] || e.category}] ${e.name}${e.status === "proposed" ? " (proposition non validée)" : ""}${e.revealed ? "" : " (connu du MJ seulement)"} : ${e.summary}${e.details ? " — " + e.details.slice(0, 600) : ""}`).join("\n") + carnetText;
}

export const CONSOLIDATE_PROMPT = `Tu es l'archiviste d'un univers de fantasy. On te donne la bible actuelle du monde et la liste des ajouts créés pendant les parties de jeu de rôle. Rédige la NOUVELLE VERSION COMPLÈTE de la bible, en français :
- Conserve TOUT le contenu de la bible actuelle (ne supprime rien, ne résume pas les sections existantes, garde la section des secrets de l'auteur telle quelle) ;
- Intègre chaque ajout validé à l'endroit logique (bon royaume, bonne faction, chronologie…), en harmonisant le style, sans contradiction avec l'existant ;
- Ajoute à la fin une section « Journal des versions » avec une ligne pour cette version listant les principaux ajouts ;
- Les ajouts marqués « connu du MJ seulement » restent des informations de MJ (ajoute-les dans une sous-section « Secrets nés des parties ») ;
- N'invente rien de plus que ce qui est fourni.
Réponds uniquement avec la bible complète en markdown.`;
