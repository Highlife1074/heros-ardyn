import { HttpsError, logger, platform, randomInt, db, FieldValue, DEFAULT_SETTINGS, addLog, loadCampaign, str } from "./common.js";
import { createWorldDoc, loadWorld } from "./worlds.js";

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const code = () => Array.from({ length: 6 }, () => ALPHA[randomInt(0, ALPHA.length)]).join("");
const SETTINGS_KEYS = Object.keys(DEFAULT_SETTINGS);

function cleanSettings(s = {}) {
  const out = {};
  for (const k of SETTINGS_KEYS) if (s[k] !== undefined) out[k] = typeof DEFAULT_SETTINGS[k] === "boolean" ? !!s[k] : str(String(s[k]), k === "houseRules" ? 2000 : 60);
  return out;
}

export async function createCampaign(uid, { name, setting = "ardyn", premise = "", settings = {}, displayName, worldId, worldName, setup, bible }) {
  const n = str(name, 80).trim();
  if (!n) throw new HttpsError("invalid-argument", "Donne un nom à la campagne.");
  if (!["ardyn", "generic", "custom"].includes(setting)) throw new HttpsError("invalid-argument", "Univers inconnu.");
  // Monde : réutiliser un monde existant (ex. « Ardyn » enrichi par une campagne précédente) ou en créer un.
  if (worldId) {
    const w = await loadWorld(worldId);
    if (!w || w.ownerUid !== uid) throw new HttpsError("permission-denied", "Ce monde ne t'appartient pas.");
    setting = w.base;
  } else {
    worldId = await createWorldDoc(uid, { name: str(worldName, 80) || (setting === "ardyn" ? "Ardyn" : n), base: setting, baseText: bible, setup });
  }
  let inviteCode;
  for (let i = 0; i < 5; i++) { inviteCode = code(); if (!(await db.doc(`invites/${inviteCode}`).get()).exists) break; }
  // (32^6 ≈ 1 milliard de codes : collision quasi impossible)
  const ref = db.collection("campaigns").doc();
  await ref.set({
    name: n, ownerUid: uid, inviteCode, members: [uid], memberNames: { [uid]: str(displayName, 40) || "Hôte" },
    setting, worldId, premise: str(premise, 2000), bible: "", settings: { ...DEFAULT_SETTINGS, ...cleanSettings(settings) },
    activeCharacters: {}, state: { pendingRolls: [], quests: [], combat: { active: false }, scene: {} },
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0 }, createdAt: Date.now(),
  });
  await db.doc(`invites/${inviteCode}`).set({ campaignId: ref.id, worldId });
  await db.doc(`campaigns/${ref.id}/secret/gm`).set({ pending: {}, resolved: [], memory: [], combatants: {} });
  // Reprend la clé Claude déjà utilisée par l'hôte (comme EduSmart : saisie une fois).
  const prof = await db.doc(`users/${uid}`).get();
  await db.doc(`campaigns/${ref.id}/secret/config`).set({ apiKey: prof.exists ? prof.data().claudeKey || "" : "", at: Date.now() });
  return { id: ref.id, inviteCode };
}

export async function joinCampaign(uid, { code: c, displayName }) {
  const k = String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const inv = await db.doc(`invites/${k}`).get();
  if (!inv.exists) throw new HttpsError("not-found", "Code d'invitation inconnu.");
  const { campaignId: cid, worldId } = inv.data();
  const ref = db.doc(`campaigns/${cid}`);
  const name = str(displayName, 40) || "Joueur";
  // On s'ajoute d'abord à la table (seule modification permise à un non-membre), puis on peut lire la campagne.
  await ref.update({ members: FieldValue.arrayUnion(uid), [`memberNames.${uid}`]: name });
  if (worldId) await db.doc(`worlds/${worldId}`).update({ readers: FieldValue.arrayUnion(uid) }).catch(() => {});
  const seen = await db.doc(`campaigns/${cid}/secret/seen_${uid}`).get();
  if (!seen.exists) {
    await db.doc(`campaigns/${cid}/secret/seen_${uid}`).set({ at: Date.now() });
    await addLog(cid, { type: "system", text: `👋 ${name} s'installe à la table.` });
  }
  return { id: cid };
}

/** Clé Claude de la campagne : saisie par l'hôte, mémorisée aussi sur son profil pour ses prochaines campagnes. */
export async function setApiKey(uid, { campaignId, key }) {
  await loadCampaign(campaignId, uid, { ownerOnly: true });
  const k = str(key, 300).trim();
  if (k && !/^sk-ant-/.test(k)) throw new HttpsError("invalid-argument", "Une clé Claude commence par « sk-ant- ».");
  await db.doc(`campaigns/${campaignId}/secret/config`).set({ apiKey: k, at: Date.now() }, { merge: true });
  await db.doc(`users/${uid}`).set({ claudeKey: k }, { merge: true });
  return { ok: true };
}

export async function updateCampaign(uid, { campaignId, name, settings, bible, premise, setting }) {
  const { ref } = await loadCampaign(campaignId, uid, { ownerOnly: true });
  const upd = {};
  if (name) upd.name = str(name, 80);
  if (settings) for (const [k, v] of Object.entries(cleanSettings(settings))) upd[`settings.${k}`] = v;
  if (bible != null) upd.bible = str(bible, 60000);
  if (premise != null) upd.premise = str(premise, 2000);
  if (setting && ["ardyn", "generic", "custom"].includes(setting)) upd.setting = setting;
  await ref.update(upd);
  return { ok: true };
}

export async function removeMember(uid, { campaignId, memberUid }) {
  const { ref, data } = await loadCampaign(campaignId, uid);
  const target = memberUid || uid;
  if (target !== uid && data.ownerUid !== uid) throw new HttpsError("permission-denied", "Réservé à l'hôte.");
  if (target === data.ownerUid) throw new HttpsError("failed-precondition", "L'hôte ne peut pas quitter sa campagne.");
  await ref.update({ members: FieldValue.arrayRemove(target), [`activeCharacters.${target}`]: FieldValue.delete() });
  return { ok: true };
}

export async function setActiveCharacter(uid, { campaignId, characterId, forUid }) {
  const { ref, data } = await loadCampaign(campaignId, uid);
  const who = forUid && data.ownerUid === uid ? forUid : uid;
  const ch = await db.doc(`campaigns/${campaignId}/characters/${characterId}`).get();
  if (!ch.exists || ch.data().ownerUid !== who) throw new HttpsError("permission-denied", "Personnage invalide.");
  await ref.update({ [`activeCharacters.${who}`]: characterId });
  return { ok: true };
}
