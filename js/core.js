import { initializeApp } from "../vendor/firebase/firebase-app.js";
import { getAuth } from "../vendor/firebase/firebase-auth.js";
import {
  initializeFirestore, doc, collection, onSnapshot, query, orderBy, limit, addDoc, serverTimestamp, updateDoc, where,
  getDoc, getDocs, setDoc, deleteDoc, runTransaction, increment, arrayUnion, arrayRemove, deleteField,
} from "../vendor/firebase/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const url = (p) => new URL(p, import.meta.url).href;

if (!firebaseConfig.apiKey) {
  document.getElementById("app").innerHTML = '<main class="wrap"><h2>Configuration Firebase manquante</h2><p>Colle la configuration de ton projet Firebase dans le fichier <b>js/firebase-config.js</b> du dépôt GitHub (Console Firebase → ⚙️ Paramètres du projet → Vos applications → Configuration).</p></main>';
  throw new Error("Configuration Firebase absente");
}
export const fbApp = initializeApp(firebaseConfig);
export const auth = getAuth(fbApp);
// ignoreUndefinedProperties : un champ vide ne fait plus échouer une écriture.
export const fs = initializeFirestore(fbApp, { ignoreUndefinedProperties: true });
export const APP_VERSION = "2026-10-30 c";

// ---------------------------------------------------------------- Plateforme pour la logique de jeu (js/server)
// Même interface que l'ancienne version serveur : la logique n'a pas eu besoin d'être réécrite.
function wrapSnap(s) { return { id: s.id, exists: s.exists(), ref: wrapRef(s.ref.path), data: () => s.data() }; }
function wrapRef(path) {
  const r = doc(fs, path);
  return { id: r.id, path, _r: r,
    get: async () => wrapSnap(await getDoc(r)),
    set: (d, o) => setDoc(r, d, o || {}),
    update: (d) => updateDoc(r, d),
    delete: () => deleteDoc(r),
    collection: (p) => wrapQuery(`${path}/${p}`) };
}
function wrapQuery(path, cons = []) {
  return {
    path,
    doc: (id) => wrapRef(id ? `${path}/${id}` : doc(collection(fs, path)).path),
    add: async (d) => wrapRef((await addDoc(collection(fs, path), d)).path),
    where: (f, op, v) => wrapQuery(path, [...cons, where(f, op, v)]),
    orderBy: (f, dir) => wrapQuery(path, [...cons, orderBy(f, dir)]),
    limit: (n) => wrapQuery(path, [...cons, limit(n)]),
    get: async () => { const s = await getDocs(query(collection(fs, path), ...cons)); const docs = s.docs.map(wrapSnap); return { docs, size: docs.length, empty: !docs.length }; },
  };
}
const db = {
  doc: wrapRef,
  collection: (p) => wrapQuery(p),
  runTransaction: (fn) => runTransaction(fs, (tx) => fn({
    get: async (ref) => wrapSnap(await tx.get(ref._r)),
    set: (ref, d, o) => { tx.set(ref._r, d, o || {}); },
    update: (ref, d) => { tx.update(ref._r, d); },
  })),
};

/** Appel direct à Claude depuis le navigateur, avec la clé de la campagne (comme EduSmart). */
async function claude(body, stream = false) {
  const key = PLATFORM.apiKey;
  if (!key) { const e = new Error("Clé Claude manquante"); e.status = 401; throw e; }
  let res;
  for (let attempt = 0; attempt < 4; attempt++) {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
      body: JSON.stringify({ ...body, stream }),
    });
    if (![429, 500, 502, 503, 529].includes(res.status)) break;
    await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt)); // surcharge : on réessaie
  }
  if (!res.ok) {
    let msg = res.statusText; try { msg = (await res.json()).error?.message || msg; } catch {}
    const e = new Error(msg); e.status = res.status; throw e;
  }
  if (!stream) return res.json();
  // Réponse longue (bible v2) : lecture du flux
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = ""; const texts = []; let stop = null;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      let ev; try { ev = JSON.parse(line.slice(5)); } catch { continue; }
      if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") texts.push(ev.delta.text);
      if (ev.type === "message_delta") stop = ev.delta?.stop_reason;
      if (ev.type === "error") { const e = new Error(ev.error?.message || "Erreur"); e.status = 500; throw e; }
    }
  }
  return { content: [{ type: "text", text: texts.join("") }], stop_reason: stop, usage: {} };
}

async function sha1(t) {
  const d = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(t));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const PLATFORM = {
  db, FieldValue: { serverTimestamp, increment, arrayUnion, arrayRemove, delete: deleteField },
  RULES: null, MONSTERS: null, BIBLE: null, apiKey: "",
  anthropic: { messages: { create: (b) => claude(b), stream: (b) => ({ finalMessage: () => claude(b, true) }) } },
  hash: sha1,
  requestGm: (cid, reason) => server.gm.runGm(cid, reason).catch((e) => console.error(e)),
};
const server = {};
let ready = null;
/** Charge les données de règles puis la logique de jeu (une fois). */
export function loadServer() {
  if (!ready) ready = (async () => {
    const get = async (f, kind) => { const r = await fetch(url(f), { cache: "no-cache" }); if (!r.ok) throw new Error(`Fichier ${f} introuvable (${r.status})`); return kind === "text" ? r.text() : r.json(); };
    const [rules, monsters, bible] = await Promise.all([
      get("../data/rules.json"), get("../data/monsters.json"), get("../data/bible-ardyn.md", "text"),
    ]);
    Object.assign(PLATFORM, { RULES: rules, MONSTERS: monsters, BIBLE: bible });
    S.rules = rules;
    globalThis.__PLATFORM__ = PLATFORM;
    const [campaigns, characters, dice, gm, worlds] = await Promise.all([
      import("./server/campaigns.js"), import("./server/characters.js"), import("./server/dice.js"), import("./server/gm.js"), import("./server/worlds.js")]);
    Object.assign(server, { campaigns, characters, dice, gm, worlds });
  })().catch((e) => { ready = null; throw e; }); // on pourra réessayer
  return ready;
}

const ACTIONS = {
  createCampaign: () => server.campaigns.createCampaign, joinCampaign: () => server.campaigns.joinCampaign,
  updateCampaign: () => server.campaigns.updateCampaign, removeMember: () => server.campaigns.removeMember,
  setActiveCharacter: () => server.campaigns.setActiveCharacter, setApiKey: () => server.campaigns.setApiKey,
  rollAbilityScores: () => server.characters.rollAbilityScores, createCharacter: () => server.characters.createCharacter,
  levelUp: () => server.characters.levelUp, rest: () => server.characters.rest, inventory: () => server.characters.inventory,
  giveGold: () => server.characters.giveGold, setPrepared: () => server.characters.setPrepared, castSpell: () => server.characters.castSpell,
  useResource: () => server.characters.useResource, hostAdjust: () => server.characters.hostAdjust,
  roll: () => server.dice.roll,
  askGm: () => server.gm.askGm, hostGmControl: () => server.gm.hostGmControl, translate: () => server.gm.translate, pingGm: () => server.gm.pingGm,
  consolidateWorld: () => server.gm.consolidateWorld, getWorldVersion: () => server.gm.getWorldVersion,
  createWorld: () => server.worlds.createWorld, updateWorld: () => server.worlds.updateWorld, editWorldEntry: () => server.worlds.editEntry,
};

/** Exécute une action de jeu (règles, dés, MJ). Même interface qu'avant : fn("roll", {...}). */
export async function fn(name, data = {}) {
  await loadServer();
  if (!S.user) throw new Error("Connecte-toi d'abord.");
  const f = ACTIONS[name]?.();
  if (!f) throw new Error(`Action inconnue : ${name}`);
  return f(S.user.uid, data);
}

// État global de l'appli
export const S = {
  user: null, displayName: "", rules: null,
  cid: null, campaign: null, chars: {}, log: [], subs: [], world: null, entries: [], worldSubs: [], worldId: null,
  view: null, listeners: new Set(),
};
export const myChar = () => S.chars[S.campaign?.activeCharacters?.[S.user?.uid]] || null;
export const isHost = () => S.campaign?.ownerUid === S.user?.uid;
export const activeChars = () => Object.values(S.campaign?.activeCharacters || {}).map((id) => S.chars[id]).filter(Boolean);

/** Les vues s'abonnent aux changements et se redessinent. */
export function onChange(cb) { S.listeners.add(cb); return () => S.listeners.delete(cb); }
/** Erreur de lecture Firestore : on la garde pour l'afficher au lieu de rester bloqué en chargement. */
function listenError(what) { return (e) => { console.error(what, e); S.lastError = `${what} : ${e.code || ""} ${e.message || e}`; emit("error"); }; }
function emit(what) { for (const cb of [...S.listeners]) { try { cb(what); } catch (e) { console.error(e); } } }

export async function loadRules() { await loadServer(); return S.rules; }

export function openCampaign(cid) {
  if (S.cid === cid) return;
  closeCampaign();
  S.cid = cid; S.campaignError = false; S.lastError = null;
  S.subs.push(onSnapshot(doc(fs, "campaigns", cid), (snap) => { S.campaign = snap.exists() ? { id: snap.id, ...snap.data() } : null; watchWorld(S.campaign?.worldId); emit("campaign"); },
    (e) => { listenError("Lecture de la campagne")(e); S.campaign = null; S.campaignError = true; emit("campaign"); }));
  S.subs.push(onSnapshot(doc(fs, "campaigns", cid, "secret", "config"), (snap) => { PLATFORM.apiKey = snap.exists() ? snap.data().apiKey || "" : ""; emit("key"); }, () => {}));
  S.subs.push(onSnapshot(collection(fs, "campaigns", cid, "characters"), (snap) => {
    S.chars = Object.fromEntries(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }])); emit("chars");
  }, listenError("Lecture des personnages")));
  let firstLog = true;
  S.subs.push(onSnapshot(query(collection(fs, "campaigns", cid, "log"), orderBy("tms", "desc"), limit(160)), (snap) => {
    const fresh = firstLog ? [] : snap.docChanges().filter((c) => c.type === "added" && !snap.metadata.hasPendingWrites).map((c) => ({ id: c.doc.id, ...c.doc.data() }));
    firstLog = false;
    S.log = snap.docs.map((d) => ({ id: d.id, ...d.data() })).reverse();
    emit({ type: "log", fresh });
  }, listenError("Lecture du journal")));
}
export function closeCampaign() {
  S.subs.forEach((u) => u()); S.subs = []; S.cid = null; S.campaign = null; S.chars = {}; S.log = [];
  PLATFORM.apiKey = "";
  watchWorld(null);
}

/** Le monde de la campagne : cadre, version, et entrées (toutes pour son créateur, seulement le codex pour les joueurs). */
function watchWorld(wid) {
  if (wid === S.worldId) return;
  S.worldSubs.forEach((u) => u()); S.worldSubs = []; S.world = null; S.entries = []; S.worldId = wid || null;
  if (!wid) return;
  S.worldSubs.push(onSnapshot(doc(fs, "worlds", wid), (snap) => {
    const first = !S.world; S.world = snap.exists() ? { id: snap.id, ...snap.data() } : null; emit("world");
    if (first && S.world) {
      const owner = S.world.ownerUid === S.user.uid;
      const q = owner ? collection(fs, "worlds", wid, "entries") : query(collection(fs, "worlds", wid, "entries"), where("revealed", "==", true));
      S.worldSubs.push(onSnapshot(q, (s2) => { S.entries = s2.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.at || 0) - (a.at || 0)); emit("world"); }, (e) => console.warn(e)));
    }
  }, (e) => { listenError("Lecture du monde")(e); S.worldError = true; emit("world"); }));
}
export const isWorldOwner = () => S.world?.ownerUid === S.user?.uid;
export function watchMyWorlds(cb) {
  return onSnapshot(query(collection(fs, "worlds"), where("ownerUid", "==", S.user.uid)), (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => cb([]));
}

export async function postMessage(text, ooc = false) {
  const ch = myChar();
  await addDoc(collection(fs, "campaigns", S.cid, "log"), {
    type: ooc ? "ooc" : "player", uid: S.user.uid, authorName: ooc ? S.displayName : ch?.name || S.displayName,
    playerName: S.displayName, characterId: ch?.id || null, portrait: ch?.portrait || "🙂",
    text: text.slice(0, 2000), ts: serverTimestamp(), tms: Date.now(),
  });
}
export async function updateMyCharacter(id, patch) { await updateDoc(doc(fs, "campaigns", S.cid, "characters", id), patch); }

export function watchMyCampaigns(cb) {
  return onSnapshot(query(collection(fs, "campaigns"), where("members", "array-contains", S.user.uid)), (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))),
    (e) => { listenError("Liste des campagnes")(e); cb(null, e); });
}

export function go(hash) { if (location.hash !== hash) location.hash = hash; else window.dispatchEvent(new HashChangeEvent("hashchange")); }

// Libellés français
export const KIND_FR = { skill: "Test", check: "Test", save: "Sauvegarde", attack: "Attaque", initiative: "Initiative", death: "Jet contre la mort", damage: "Dégâts", custom: "Jet" };
export const MOOD_ICON = { calme: "🌿", mystère: "🌫️", tension: "⚡", combat: "⚔️", fête: "🎉", repos: "🔥", danger: "☠️" };
