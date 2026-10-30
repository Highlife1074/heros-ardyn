// Illustrations de scène : Gemini via Firebase AI Logic (dans ton projet Firebase), image compressée
// et rangée dans Firestore (campaigns/{cid}/images) — pas de Storage, pas d'autre service.
import { doc, collection, setDoc, addDoc, serverTimestamp, updateDoc } from "../vendor/firebase/firebase-firestore.js";

let aiMod = null;
async function ai(fbApp) {
  if (!aiMod) {
    const m = await import("../vendor/firebase/firebase-ai.js");
    aiMod = { m, ai: m.getAI(fbApp, { backend: new m.GoogleAIBackend() }) };
  }
  return aiMod;
}

function buildPrompt({ scene, prompt, worldSetup, tone }) {
  const insp = (worldSetup?.inspirations || ["Dragonlance", "The Lord of the Rings", "Game of Thrones"]).join(", ");
  const magic = worldSetup?.magic === "rare" ? "Grounded, realistic medieval world where magic is rare and subtle." : "";
  const safe = tone === "adulte" ? "No gore." : "Suitable for a family audience: no blood, no gore, nothing frightening for children.";
  const what = prompt || `${scene.title}${scene.location ? ", " + scene.location : ""}, ${scene.mood || "atmospheric"} mood`;
  return `Painted illustration for a fantasy role-playing game, in the spirit of classic ${insp} book and box art. ` +
    `Muted earthy palette, dramatic natural lighting, rich atmosphere, wide cinematic landscape composition. ${magic} ` +
    `Scene: ${what}. ${safe} No text, no letters, no captions, no logos, no watermark, no modern objects.`;
}

/** Réduit l'image (JPEG ~1000 px) pour qu'elle tienne dans un document Firestore. */
async function compress(mime, b64) {
  const img = new Image(); img.src = `data:${mime};base64,${b64}`;
  await img.decode();
  for (const [w, q] of [[1024, 0.72], [880, 0.65], [720, 0.6]]) {
    const scale = Math.min(1, w / img.width);
    const c = document.createElement("canvas"); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const url = c.toDataURL("image/jpeg", q);
    if (url.length < 850000) return url;
  }
  throw new Error("Image trop lourde");
}

export async function illustrate({ fbApp, fs, cid, scene, prompt, model, worldSetup, tone }) {
  try {
    const { m, ai: a } = await ai(fbApp);
    const gm = m.getGenerativeModel(a, { model: model || "gemini-nano-banana-2.1",
      generationConfig: { responseModalities: [m.ResponseModality.IMAGE], imageConfig: { aspectRatio: "16:9" } } });
    const res = await gm.generateContent(buildPrompt({ scene, prompt, worldSetup, tone }));
    const part = res.response.inlineDataParts?.()?.[0]?.inlineData;
    if (!part?.data) throw new Error("aucune image renvoyée (contenu refusé ?)");
    const data = await compress(part.mimeType || "image/png", part.data);
    const ref = await addDoc(collection(fs, "campaigns", cid, "images"), { data, title: scene.title || "", at: Date.now() });
    await addDoc(collection(fs, "campaigns", cid, "log"), { type: "image", imageId: ref.id, text: scene.title || "", authorName: "Maître du Jeu", ts: serverTimestamp(), tms: Date.now() });
    await updateDoc(doc(fs, "campaigns", cid), { "state.scene.imageId": ref.id, "state.imageWarning": null });
  } catch (e) {
    console.warn("Illustration", e);
    const msg = String(e?.message || e);
    const why = /billing|blaze|plan|quota|429/i.test(msg) ? "les illustrations demandent le forfait Blaze du projet Firebase"
      : /not (been )?(used|enabled)|API has not|ai logic|firebasevertexai|PERMISSION_DENIED|403/i.test(msg) ? "active Firebase AI Logic dans la console Firebase (menu AI Logic → Commencer)"
      : /not found|404|model/i.test(msg) ? "modèle d'image introuvable : vérifie son nom dans ⚙️"
      : msg.slice(0, 140);
    try { await updateDoc(doc(fs, "campaigns", cid), { "state.imageWarning": `Illustration impossible : ${why}.` }); } catch {}
  }
}
