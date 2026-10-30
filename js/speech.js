// Voix du Maître du Jeu (synthèse vocale du navigateur), réglage propre à chaque appareil.
let on = false;
try { on = localStorage.getItem("tts") === "on"; } catch {}
const synth = () => ("speechSynthesis" in window ? window.speechSynthesis : null);
let voice = null;
function pickVoice() {
  const vs = synth()?.getVoices() || [];
  const fr = vs.filter((v) => /^fr/i.test(v.lang));
  // Voix de meilleure qualité en priorité (Google, Microsoft « Natural », Apple « Amélie/Thomas »)
  voice = fr.find((v) => /natural|neural|google/i.test(v.name)) || fr.find((v) => /thomas|amélie|amelie|audrey/i.test(v.name)) || fr[0] || null;
}
if (synth()) { pickVoice(); synth().addEventListener?.("voiceschanged", pickVoice); }

export const speechSupported = () => !!synth();
export const speakEnabled = () => on;

/** Les navigateurs mobiles n'autorisent la voix qu'après un geste : à appeler dans un clic. */
export function unlockSpeech() {
  const s = synth(); if (!s || !on) return;
  try { if (s.paused) s.resume(); } catch {}
}

export function setSpeak(v) {
  on = v; try { localStorage.setItem("tts", v ? "on" : "off"); } catch {}
  const s = synth(); if (!s) return;
  s.cancel(); // vide une file éventuellement bloquée (bug connu de Chrome)
  if (!v) return;
  speak("La voix du Maître du Jeu est activée.", true); // dit dans le geste de l'utilisateur : débloque le son
}

/** Lit le texte du MJ, découpé en phrases (certains navigateurs coupent les textes longs). */
export function speak(text, force = false) {
  const s = synth(); if (!s || (!on && !force)) return;
  const clean = String(text).replace(/\*\*|__|[#*_>`]/g, "").replace(/\s+/g, " ").trim();
  if (!clean) return;
  const parts = clean.match(/[^.!?…]+[.!?…]*["»”]?\s*/g) || [clean];
  const chunks = []; let cur = "";
  for (const p of parts) { if ((cur + p).length > 220 && cur) { chunks.push(cur); cur = ""; } cur += p; }
  if (cur.trim()) chunks.push(cur);
  if (s.paused) s.resume();
  for (const c of chunks) {
    const u = new SpeechSynthesisUtterance(c.trim());
    u.lang = "fr-FR"; u.rate = 1; u.pitch = 1;
    if (voice) u.voice = voice;
    s.speak(u);
  }
}
export const stopSpeech = () => synth()?.cancel();
