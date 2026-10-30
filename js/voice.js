// Dictée vocale : appuie sur 🎤, parle, le texte s'écrit dans la zone d'action.
// Utilise la reconnaissance vocale du navigateur (Chrome, Edge, Android ; Safari partiellement).
import { h, toast } from "./ui.js";

const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
export const voiceSupported = !!Rec;

export function micButton(input) {
  const btn = h("button", { class: "icon-btn mic", title: "Dicter (appuie, parle, appuie pour arrêter)", "aria-label": "Dicter mon action", "aria-pressed": "false" }, "🎤");
  if (!Rec) {
    btn.onclick = () => toast("Ce navigateur ne propose pas la dictée : utilise le micro du clavier de ton téléphone.");
    btn.style.opacity = ".45";
    return btn;
  }
  let rec = null; let base = "";
  const stop = () => { try { rec?.stop(); } catch {} };
  const setOn = (on) => { btn.setAttribute("aria-pressed", String(on)); btn.classList.toggle("listening", on); btn.textContent = on ? "⏺️" : "🎤"; };
  btn.onclick = () => {
    if (rec) return stop();
    rec = new Rec();
    rec.lang = "fr-FR"; rec.interimResults = true; rec.continuous = true;
    base = input.value ? input.value.replace(/\s*$/, " ") : "";
    rec.onresult = (e) => {
      let finalText = ""; let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t; else interim += t;
      }
      const txt = (finalText + interim).trim();
      input.value = base + (txt ? txt.charAt(0).toUpperCase() + txt.slice(1) : "");
      input.dispatchEvent(new Event("input"));
    };
    rec.onerror = (e) => {
      const why = { "not-allowed": "Autorise le micro pour ce site dans ton navigateur.", "service-not-allowed": "Autorise le micro pour ce site dans ton navigateur.",
        "no-speech": "Je n'ai rien entendu, réessaie.", "audio-capture": "Aucun micro détecté.", network: "La dictée a besoin d'Internet." }[e.error];
      if (why) toast(why, "error");
    };
    rec.onend = () => { rec = null; setOn(false); input.focus(); };
    try { rec.start(); setOn(true); } catch (e) { rec = null; toast("Dictée impossible : " + e.message, "error"); }
  };
  return btn;
}
