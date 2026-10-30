// Illustrations peintes par Gemini (« Nano Banana ») : une image par lieu, heure et météo, partagée par toute la table.
// L'image est commandée en arrière-plan quand le MJ change de scène ; en attendant, le décor dessiné s'affiche.
import { PLATFORM, fs } from "./core.js";
import { doc, getDoc, setDoc, updateDoc } from "../vendor/firebase/firebase-firestore.js";
import { sceneParams } from "./scenery.js";
import { norm } from "./atlas.js";

export const IMAGE_MODELS = [
  ["gemini-2.5-flash-image", "Nano Banana (rapide, ~4 centimes l'image)"],
  ["gemini-3.1-flash-image", "Nano Banana 2"],
  ["gemini-3-pro-image", "Nano Banana Pro (plus beau, plus cher)"],
];
const FALLBACK = ["gemini-2.5-flash-image", "gemini-2.5-flash-image-preview", "gemini-3.1-flash-image", "gemini-3-pro-image-preview"];

const EN = {
  setting: { foret: "a deep forest", plaine: "open grassland plains", route: "a road through the countryside", colline: "rolling hills", montagne: "high mountains", neige: "a snowy northern landscape",
    marais: "a misty swamp", desert: "a desert", riviere: "a river valley", mer: "the open sea seen from a cliff", port: "a medieval harbour", ville: "a walled medieval city",
    village: "a small rural village", chateau: "a fortified castle", temple: "a stone temple", ruines: "ancient ruins", camp: "a campsite in the wilderness", grotte: "a cave interior",
    souterrain: "an underground crypt or dungeon", taverne: "the interior of a tavern", salle: "the great hall of a palace" },
  time: { aube: "dawn, pink and golden light", jour: "daytime", crepuscule: "dusk, orange sunset light", nuit: "night, moonlight and torchlight" },
  weather: { clair: "clear weather", nuages: "overcast sky", pluie: "rain", orage: "thunderstorm with lightning", brume: "thick fog", neige: "falling snow", vent: "strong wind" },
  mood: { calme: "peaceful", mystère: "mysterious", tension: "tense", combat: "dramatic and violent", fête: "festive", repos: "cozy and restful", danger: "ominous and threatening" },
};

/** Même lieu, même heure, même météo → même image (pas de dépense inutile). */
export async function imageKey(sc) {
  const p = sceneParams(sc);
  return (await PLATFORM.hash([norm(sc.place || sc.location || sc.title), p.setting, p.time, p.weather].join("|"))).slice(0, 20);
}

export function imagePrompt(sc, world) {
  const p = sceneParams(sc);
  const what = sc.visual || [sc.title, sc.location].filter(Boolean).join(", ");
  return [
    "Wide cinematic establishing shot for a classic fantasy computer role-playing game: a richly detailed hand-painted environment backdrop,",
    "in the tradition of pre-rendered isometric CRPG backgrounds and oil-painted fantasy concept art. Painterly textures, dramatic volumetric lighting,",
    "deep shadows, warm firelight against cool ambient light, atmospheric perspective, high detail in architecture and nature.",
    `Place: ${what}. Environment: ${EN.setting[p.setting]}. Time: ${EN.time[p.time]}. Weather: ${EN.weather[p.weather]}. Atmosphere: ${EN.mood[p.mood] || "evocative"}.`,
    `World: ${world?.base === "ardyn" || !world ? "Ardyn, a grounded low-magic medieval fantasy world (limestone cities, old dragons, ancient elven forests)" : "a grounded medieval fantasy world"}.`,
    "No text, no letters, no captions, no user interface, no border or frame, no modern objects. No people in the foreground; at most tiny distant figures.",
  ].join(" ");
}

export async function callGemini(prompt, model) {
  const key = PLATFORM.geminiKey;
  const models = [...new Set([model, ...FALLBACK].filter(Boolean))];
  let last;
  for (const m of models) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
      method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: "21:9" } } }),
    });
    if (res.status === 404 || res.status === 400) { // modèle inconnu ou option refusée : on essaie le suivant
      last = new Error(`${m} : ${(await res.json().catch(() => ({}))).error?.message || res.status}`); continue;
    }
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || `Gemini a répondu ${res.status}`); }
    const j = await res.json();
    const part = j.candidates?.[0]?.content?.parts?.find((x) => x.inlineData?.data || x.inline_data?.data);
    const data = part?.inlineData || part?.inline_data;
    if (!data) throw new Error(`Gemini n'a pas renvoyé d'image (${j.candidates?.[0]?.finishReason || j.promptFeedback?.blockReason || "raison inconnue"}).`);
    return { b64: data.data, mime: data.mimeType || data.mime_type || "image/png", model: m };
  }
  throw last || new Error("Aucun modèle d'image disponible.");
}

/** Recadre en 21:9 et compresse en JPEG pour tenir dans un document Firestore (< 1 Mo). */
export async function compress(b64, mime) {
  const img = new Image(); img.src = `data:${mime};base64,${b64}`; await img.decode();
  const W = 1344, H = 576, c = document.createElement("canvas"); c.width = W; c.height = H;
  const k = Math.max(W / img.naturalWidth, H / img.naturalHeight), w = img.naturalWidth * k, h = img.naturalHeight * k;
  c.getContext("2d").drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
  for (const q of [0.84, 0.74, 0.62, 0.5]) { const url = c.toDataURL("image/jpeg", q); if (url.length < 900000) return url; }
  throw new Error("Image trop lourde.");
}

const inFlight = new Set();
/**
 * Commande l'illustration d'une scène si elle n'existe pas encore, puis l'attache à la scène en cours.
 * force = repeindre même si une image existe déjà.
 */
export async function illustrate(cid, sc, world, { force = false } = {}) {
  if (!PLATFORM.geminiKey || !sc?.title) return null;
  const key = await imageKey(sc);
  const ref = doc(fs, "campaigns", cid, "images", key);
  const attach = async () => {
    const camp = await getDoc(doc(fs, "campaigns", cid));
    const cur = camp.data()?.state?.scene;
    if (cur && (await imageKey(cur)) === key) await updateDoc(doc(fs, "campaigns", cid), { "state.scene.image": key, "state.imageStatus": { ok: true, at: Date.now() } });
  };
  if (inFlight.has(key)) return key;
  const snap = await getDoc(ref);
  const old = snap.exists() ? snap.data() : null;
  if (!force && old?.status === "done") { await attach(); return key; }
  if (!force && old?.status === "pending" && Date.now() - old.at < 3 * 60e3) return key; // un autre joueur la peint déjà
  inFlight.add(key);
  try {
    await setDoc(ref, { status: "pending", at: Date.now() });
    const prompt = imagePrompt(sc, world);
    const { b64, mime, model } = await callGemini(prompt, PLATFORM.geminiModel);
    const data = await compress(b64, mime);
    await setDoc(ref, { status: "done", data, prompt, model, at: Date.now() });
    await attach();
    return key;
  } catch (e) {
    console.warn("Illustration Gemini impossible", e);
    await setDoc(ref, { status: "error", error: String(e.message || e).slice(0, 300), at: Date.now() }).catch(() => {});
    await updateDoc(doc(fs, "campaigns", cid), { "state.imageStatus": { ok: false, msg: String(e.message || e).slice(0, 300), at: Date.now() } }).catch(() => {});
    if (force) throw e;
    return null;
  } finally { inFlight.delete(key); }
}

const loaded = new Map();
/** Lit l'image peinte (data URL), avec cache mémoire. */
export async function loadImage(cid, key) {
  if (loaded.has(key)) return loaded.get(key);
  const snap = await getDoc(doc(fs, "campaigns", cid, "images", key));
  const url = snap.exists() && snap.data().status === "done" ? snap.data().data : null;
  if (url) { loaded.set(key, url); if (loaded.size > 12) loaded.delete(loaded.keys().next().value); }
  return url;
}
