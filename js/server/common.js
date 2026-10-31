// Logique de jeu (règles, dés, MJ, monde). Elle tourne dans le navigateur, sur Firestore.
// La « plateforme » (base de données, données de règles, client Claude) est fournie par core.js,
// ou par les tests via globalThis.__TEST__.
import { parseDice, evalDice } from "../engine.js";

const P = globalThis.__TEST__ || globalThis.__PLATFORM__;
if (!P) throw new Error("Plateforme non initialisée");
export const db = P.db;
const FV = P.FieldValue;
export { FV as FieldValue };
export const RULES = P.RULES;
export const MONSTERS = P.MONSTERS;
export const BIBLE_ARDYN = P.BIBLE;
export const platform = P;

/** Erreur lisible par l'interface (même forme que les erreurs Firebase). */
export class HttpsError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
export const logger = { warn: (...a) => console.warn(...a), error: (...a) => console.error(...a) };

/** Entier aléatoire uniforme 1..sides, à partir du générateur cryptographique du navigateur. */
function randomInt(min, max) {
  const range = max - min; const lim = Math.floor(0xffffffff / range) * range; const buf = new Uint32Array(1);
  do { globalThis.crypto.getRandomValues(buf); } while (buf[0] >= lim);
  return min + (buf[0] % range);
}
const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
export { randomInt };

export const DEFAULT_SETTINGS = {
  tone: "famille",          // famille (dès 10 ans) | ado | adulte
  difficulty: "normal",     // facile | normal | difficile
  narration: "moyenne",     // courte | moyenne | longue
  model: "claude-sonnet-5-5",
  helperModel: "claude-haiku-5-5",
  hpMethod: "average",      // average | roll
  xpMode: "xp",             // xp | milestone
  autoGmAfterRolls: true,
  dice3d: true,
  tts: false,
  houseRules: "",
  economy: true,           // mode économique : modèle léger, historique court, récits courts
  turnMode: "round",
  images: true,             // illustrations des scènes (Gemini via Firebase AI Logic)
  imageModel: "gemini-nano-banana-2.1",        // round (tour de table) | free (libre)
};

/** Dé tiré par le générateur cryptographique ; le résultat est enregistré aussitôt et définitivement dans Firestore. */
export const rng = (sides) => randomInt(1, sides + 1);
export const newId = (n = 10) => Array.from({ length: n }, () => ALPHA[randomInt(0, 64)]).join("");

export function rollExpr(expr) {
  const p = parseDice(String(expr || ""));
  if (!p) throw new HttpsError("invalid-argument", `Expression de dés invalide : ${expr}`);
  return { expr: String(expr).replace(/\s+/g, ""), ...evalDice(p, rng) };
}

export function requireAuth(req) {
  if (!req.auth?.uid) throw new HttpsError("unauthenticated", "Connecte-toi d'abord.");
  return req.auth.uid;
}

export async function loadCampaign(cid, uid, { ownerOnly = false } = {}) {
  if (!cid || typeof cid !== "string") throw new HttpsError("invalid-argument", "Campagne manquante.");
  const ref = db.doc(`campaigns/${cid}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Campagne introuvable.");
  const c = snap.data();
  if (uid && !(c.members || []).includes(uid)) throw new HttpsError("permission-denied", "Tu ne fais pas partie de cette campagne.");
  if (ownerOnly && c.ownerUid !== uid) throw new HttpsError("permission-denied", "Réservé à l'hôte de la campagne.");
  return { ref, data: c };
}

export async function loadCharacter(cid, chid) {
  const ref = db.doc(`campaigns/${cid}/characters/${chid}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Personnage introuvable.");
  return { ref, data: { id: snap.id, ...snap.data() } };
}

/** Le joueur peut agir sur son perso ; l'hôte peut agir sur tous. */
export function assertCanControl(campaign, uid, ch) {
  if (ch.ownerUid !== uid && campaign.ownerUid !== uid) throw new HttpsError("permission-denied", "Ce n'est pas ton personnage.");
}

export async function addLog(cid, entry) {
  const ref = db.collection(`campaigns/${cid}/log`).doc();
  await ref.set({ ts: FV.serverTimestamp(), tms: Date.now(), ...entry });
  return ref.id;
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const str = (v, max = 2000) => (typeof v === "string" ? v.slice(0, max) : "");
