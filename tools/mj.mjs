#!/usr/bin/env node
// MJ externe : permet à Claude (ton abonnement) de jouer le MJ de ta campagne, sans appel à l'API payante.
// Utilise ton compte Firebase de l'app (mêmes règles de sécurité que sur ton téléphone).
//   export MJ_EMAIL="ton@email"  MJ_PASSWORD="ton mot de passe"      (ou fichier ~/.ardyn-mj.json)
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import {
  initializeFirestore, doc, collection, query, orderBy, limit, addDoc, serverTimestamp, updateDoc, where,
  getDoc, getDocs, setDoc, deleteDoc, runTransaction, increment, arrayUnion, arrayRemove, deleteField,
} from "firebase/firestore";

const here = dirname(fileURLToPath(import.meta.url));
const { firebaseConfig } = await import("../js/firebase-config.js");

let cred = { email: process.env.MJ_EMAIL, password: process.env.MJ_PASSWORD };
const f = join(homedir(), ".ardyn-mj.json");
if ((!cred.email || !cred.password) && existsSync(f)) cred = JSON.parse(readFileSync(f, "utf8"));
if (!cred.email || !cred.password) {
  console.error("Identifiants manquants. Définis MJ_EMAIL et MJ_PASSWORD, ou crée ~/.ardyn-mj.json : {\"email\":\"…\",\"password\":\"…\"}");
  process.exit(2);
}
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const fs = initializeFirestore(app, { ignoreUndefinedProperties: true, experimentalAutoDetectLongPolling: true });
let user;
try { user = (await signInWithEmailAndPassword(auth, cred.email, cred.password)).user; }
catch (e) { console.error("Connexion impossible :", e.code || e.message, "— vérifie l'e-mail et le mot de passe de l'app, et ta connexion internet."); process.exit(1); }

// Même adaptateur que js/core.js (navigateur), avec le SDK npm.
function wrapSnap(s) { return { id: s.id, exists: s.exists(), ref: wrapRef(s.ref.path), data: () => s.data() }; }
function wrapRef(path) {
  const r = doc(fs, path);
  return { id: r.id, path, _r: r, get: async () => wrapSnap(await getDoc(r)), set: (d, o) => setDoc(r, d, o || {}), update: (d) => updateDoc(r, d), delete: () => deleteDoc(r), collection: (p) => wrapQuery(`${path}/${p}`) };
}
function wrapQuery(path, cons = []) {
  return {
    path, doc: (id) => wrapRef(id ? `${path}/${id}` : doc(collection(fs, path)).path),
    add: async (d) => wrapRef((await addDoc(collection(fs, path), d)).path),
    where: (a, op, v) => wrapQuery(path, [...cons, where(a, op, v)]), orderBy: (a, dir) => wrapQuery(path, [...cons, orderBy(a, dir)]), limit: (n) => wrapQuery(path, [...cons, limit(n)]),
    get: async () => { const s = await getDocs(query(collection(fs, path), ...cons)); const docs = s.docs.map(wrapSnap); return { docs, size: docs.length, empty: !docs.length }; },
  };
}
const db = { doc: wrapRef, collection: (p) => wrapQuery(p),
  runTransaction: (fn) => runTransaction(fs, (tx) => fn({ get: async (ref) => wrapSnap(await tx.get(ref._r)), set: (ref, d, o) => { tx.set(ref._r, d, o || {}); }, update: (ref, d) => { tx.update(ref._r, d); } })) };
const rd = (p, t) => readFileSync(join(here, "..", "data", p), "utf8");
globalThis.__PLATFORM__ = {
  db, FieldValue: { serverTimestamp, increment, arrayUnion, arrayRemove, delete: deleteField },
  RULES: JSON.parse(rd("rules.json")), MONSTERS: JSON.parse(rd("monsters.json")), BIBLE: rd("bible-ardyn.md"),
  hash: async (t) => (await import("node:crypto")).createHash("sha1").update(t).digest("hex"),
  anthropic: null, illustrate: () => {}, requestGm: () => {}, apiKey: "",
};

const argv = process.argv.slice(2);
const readStdin = async () => { const chunks = []; for await (const c of process.stdin) chunks.push(c); return Buffer.concat(chunks).toString("utf8"); };
try {
  if (argv[0] === "campaigns") {
    const s = await getDocs(query(collection(fs, "campaigns"), where("members", "array-contains", user.uid)));
    for (const d of s.docs) { const c = d.data(); console.log(`${d.id}  ${c.name}${c.settings?.externalGm ? "  [MJ externe]" : ""}${c.state?.gmWaiting ? "  ⏳ attend le MJ" : ""}`); }
    if (s.empty) console.log("Aucune campagne trouvée pour ce compte.");
  } else {
    const { run } = await import("./mj-lib.mjs");
    await run(argv, { readStdin });
  }
} catch (e) {
  console.error("Erreur :", e.message || e);
  process.exitCode = 1;
}
process.exit(process.exitCode || 0);
