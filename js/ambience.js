// Ambiance sonore générée par le navigateur (Web Audio) : aucun fichier, aucun service.
// Elle suit automatiquement la scène fixée par le MJ (state.scene.ambiance).
export const AMBIANCES = {
  foret: "Forêt", pluie: "Pluie", vent: "Vent / montagne", taverne: "Taverne", ville: "Ville", feu: "Feu de camp",
  grotte: "Grotte / souterrain", donjon: "Donjon / ruines", mer: "Bord de mer", nuit: "Nuit", combat: "Combat",
  tension: "Tension", mystere: "Mystère", calme: "Calme", silence: "Silence",
};

let ctx = null; let master = null; let current = null; let currentKind = "silence";
let enabled = false; let volume = 0.6;
try { enabled = localStorage.getItem("ambience") === "on"; volume = parseFloat(localStorage.getItem("ambienceVol") || "0.6"); } catch {}

export const ambienceEnabled = () => enabled;
export const ambienceKind = () => currentKind;

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = volume; master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function noiseBuffer(type = "white", seconds = 4) {
  const len = ctx.sampleRate * seconds; const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch); let b0 = 0, b1 = 0, b2 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (type === "pink") { b0 = 0.997 * b0 + w * 0.029; b1 = 0.985 * b1 + w * 0.032; b2 = 0.95 * b2 + w * 0.048; d[i] = (b0 + b1 + b2 + w * 0.02) * 0.9; }
      else if (type === "brown") { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
      else d[i] = w * 0.5;
    }
  }
  return buf;
}

/** Une couche = source + filtres + gain, avec une fonction stop. */
function layerNoise(out, { type = "pink", filter = "lowpass", freq = 800, q = 0.7, gain = 0.3, lfo = 0, lfoDepth = 0 }) {
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer(type); src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = filter; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); g.gain.value = gain;
  src.connect(f).connect(g).connect(out); src.start();
  const extra = [];
  if (lfo) { // respiration lente (vent, vagues)
    const o = ctx.createOscillator(); o.frequency.value = lfo; const og = ctx.createGain(); og.gain.value = lfoDepth;
    o.connect(og).connect(g.gain); o.start(); extra.push(o);
  }
  return () => { try { src.stop(); extra.forEach((x) => x.stop()); } catch {} };
}
function layerDrone(out, { freqs = [55, 82.4], gain = 0.05, type = "sine", detune = 4 }) {
  const oscs = freqs.map((fr, i) => {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = fr; o.detune.value = (i % 2 ? 1 : -1) * detune;
    const g = ctx.createGain(); g.gain.value = gain; o.connect(g).connect(out); o.start(); return o;
  });
  return () => oscs.forEach((o) => { try { o.stop(); } catch {} });
}
/** Événements ponctuels aléatoires (gouttes, oiseaux, crépitements, tambours…). */
function layerEvents(out, every, fn) {
  let alive = true; let t;
  const tick = () => { if (!alive) return; try { fn(out); } catch {} t = setTimeout(tick, every[0] + Math.random() * (every[1] - every[0])); };
  t = setTimeout(tick, 400 + Math.random() * 800);
  return () => { alive = false; clearTimeout(t); };
}
function env(out, { freq, endFreq, dur, gain, type = "sine", filterFreq }) {
  const o = ctx.createOscillator(); o.type = type; const g = ctx.createGain(); const now = ctx.currentTime;
  o.frequency.setValueAtTime(freq, now); if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, now + dur);
  g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(gain, now + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  let node = o.connect(g);
  if (filterFreq) { const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = filterFreq; g.connect(f); node = f; }
  node.connect(out); o.start(now); o.stop(now + dur + 0.05);
}
function burst(out, { dur = 0.05, gain = 0.2, freq = 2000, q = 1 }) {
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer("white", 0.3);
  const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); const now = ctx.currentTime;
  g.gain.setValueAtTime(gain, now); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  src.connect(f).connect(g).connect(out); src.start(now); src.stop(now + dur + 0.05);
}

const RECIPES = {
  foret: (o) => [layerNoise(o, { type: "pink", freq: 700, gain: 0.18, lfo: 0.07, lfoDepth: 0.08 }),
    layerEvents(o, [1800, 6000], (x) => { const f = 2200 + Math.random() * 1800; for (let i = 0; i < 2 + Math.random() * 3; i++) setTimeout(() => env(x, { freq: f, endFreq: f * 1.25, dur: 0.12, gain: 0.04 }), i * 140); })],
  pluie: (o) => [layerNoise(o, { type: "white", filter: "bandpass", freq: 2500, q: 0.4, gain: 0.22 }), layerNoise(o, { type: "brown", freq: 300, gain: 0.25 }),
    layerEvents(o, [60, 220], (x) => burst(x, { dur: 0.03, gain: 0.05, freq: 3000 + Math.random() * 3000, q: 3 }))],
  vent: (o) => [layerNoise(o, { type: "pink", filter: "bandpass", freq: 500, q: 0.9, gain: 0.35, lfo: 0.05, lfoDepth: 0.25 }), layerNoise(o, { type: "brown", freq: 200, gain: 0.2, lfo: 0.03, lfoDepth: 0.12 })],
  taverne: (o) => [layerNoise(o, { type: "brown", filter: "bandpass", freq: 450, q: 0.6, gain: 0.3, lfo: 0.3, lfoDepth: 0.08 }),
    layerEvents(o, [900, 3500], (x) => env(x, { freq: 2600 + Math.random() * 1400, dur: 0.25, gain: 0.03, type: "triangle" })), // verres
    layerEvents(o, [2500, 7000], (x) => env(x, { freq: 140 + Math.random() * 60, endFreq: 90, dur: 0.18, gain: 0.08, filterFreq: 600 }))], // chopes posées
  ville: (o) => [layerNoise(o, { type: "brown", filter: "bandpass", freq: 380, q: 0.5, gain: 0.28, lfo: 0.15, lfoDepth: 0.06 }),
    layerEvents(o, [2500, 6000], (x) => { for (let i = 0; i < 4; i++) setTimeout(() => burst(x, { dur: 0.06, gain: 0.08, freq: 900, q: 2 }), i * 260); })], // pas / sabots
  feu: (o) => [layerNoise(o, { type: "brown", freq: 400, gain: 0.25 }),
    layerEvents(o, [40, 400], (x) => burst(x, { dur: 0.02 + Math.random() * 0.04, gain: 0.05 + Math.random() * 0.12, freq: 1500 + Math.random() * 3500, q: 1.5 }))],
  grotte: (o) => [layerDrone(o, { freqs: [41.2, 61.7], gain: 0.05 }), layerNoise(o, { type: "brown", freq: 150, gain: 0.15 }),
    layerEvents(o, [1200, 4500], (x) => env(x, { freq: 1400 + Math.random() * 900, endFreq: 500, dur: 0.35, gain: 0.06 }))], // gouttes
  donjon: (o) => [layerDrone(o, { freqs: [36.7, 55, 73.4], gain: 0.045, type: "triangle" }), layerNoise(o, { type: "pink", filter: "bandpass", freq: 300, q: 1, gain: 0.08, lfo: 0.04, lfoDepth: 0.05 }),
    layerEvents(o, [5000, 12000], (x) => env(x, { freq: 90, endFreq: 60, dur: 1.2, gain: 0.06, type: "sawtooth", filterFreq: 300 }))], // grondement
  mer: (o) => [layerNoise(o, { type: "pink", freq: 900, gain: 0.3, lfo: 0.09, lfoDepth: 0.28 }), layerNoise(o, { type: "brown", freq: 250, gain: 0.2, lfo: 0.06, lfoDepth: 0.15 }),
    layerEvents(o, [4000, 9000], (x) => env(x, { freq: 1700, endFreq: 1300, dur: 0.4, gain: 0.02, type: "triangle" }))], // mouettes lointaines
  nuit: (o) => [layerNoise(o, { type: "pink", freq: 400, gain: 0.08 }),
    layerEvents(o, [300, 900], (x) => { for (let i = 0; i < 3; i++) setTimeout(() => env(x, { freq: 4300, dur: 0.04, gain: 0.025, type: "square", filterFreq: 6000 }), i * 70); })], // grillons
  combat: (o) => [layerDrone(o, { freqs: [55, 58.3], gain: 0.05, type: "sawtooth", detune: 8 }),
    layerEvents(o, [480, 520], (x) => { env(x, { freq: 120, endFreq: 45, dur: 0.35, gain: 0.35 }); setTimeout(() => env(x, { freq: 110, endFreq: 45, dur: 0.3, gain: 0.25 }), 240); })], // tambours
  tension: (o) => [layerDrone(o, { freqs: [55, 77.8], gain: 0.05, type: "sine", detune: 12 }), layerNoise(o, { type: "pink", filter: "highpass", freq: 3000, gain: 0.03, lfo: 0.1, lfoDepth: 0.02 }),
    layerEvents(o, [1400, 1500], (x) => env(x, { freq: 60, endFreq: 50, dur: 0.25, gain: 0.12 }))], // battement
  mystere: (o) => [layerDrone(o, { freqs: [110, 164.8, 207.7], gain: 0.025, type: "sine", detune: 6 }), layerNoise(o, { type: "pink", filter: "bandpass", freq: 1200, q: 2, gain: 0.04, lfo: 0.05, lfoDepth: 0.03 })],
  calme: (o) => [layerNoise(o, { type: "pink", freq: 500, gain: 0.1, lfo: 0.05, lfoDepth: 0.04 }), layerDrone(o, { freqs: [130.8, 196], gain: 0.012 })],
  silence: () => [],
};

/** Devine l'ambiance d'une scène si le MJ ne l'a pas précisée. */
export function guessAmbiance(scene = {}) {
  if (scene.ambiance && RECIPES[scene.ambiance]) return scene.ambiance;
  const t = `${scene.title || ""} ${scene.location || ""}`.toLowerCase();
  const rules = [[/auberge|taverne|tripot/, "taverne"], [/feu de camp|bivouac|campement/, "feu"], [/grotte|caverne|mine|souterrain|égout/, "grotte"],
    [/donjon|crypte|ruine|tombeau|catacombe|forteresse/, "donjon"], [/port|plage|côte|mer|navire|bateau/, "mer"], [/forêt|bois|sylve|qaalish|belm/, "foret"],
    [/montagne|col|sommet|falaise|lande/, "vent"], [/ville|cité|marché|rue|idaris|belion|handorf|istar/, "ville"], [/pluie|orage|tempête/, "pluie"], [/nuit/, "nuit"]];
  for (const [re, k] of rules) if (re.test(t)) return k;
  return { combat: "combat", tension: "tension", danger: "tension", "mystère": "mystere", repos: "feu", "fête": "taverne", calme: "calme" }[scene.mood] || "calme";
}

/** Change d'ambiance en fondu enchaîné. */
export function setAmbiance(kind) {
  if (!RECIPES[kind]) kind = "calme";
  if (kind === currentKind && current) return;
  currentKind = kind;
  if (!enabled) return;
  const a = audio(); if (!a) return;
  const old = current;
  const bus = a.createGain(); bus.gain.value = 0.0001; bus.connect(master);
  const stops = RECIPES[kind](bus);
  bus.gain.exponentialRampToValueAtTime(1, a.currentTime + 2.5);
  current = { bus, stops };
  if (old) { old.bus.gain.setValueAtTime(old.bus.gain.value, a.currentTime); old.bus.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 2.5); setTimeout(() => { old.stops.forEach((s) => s()); old.bus.disconnect(); }, 2700); }
}

/** À appeler dans un clic (les navigateurs exigent un geste pour démarrer le son). */
export function setAmbienceEnabled(on) {
  enabled = on; try { localStorage.setItem("ambience", on ? "on" : "off"); } catch {}
  if (on) { const k = currentKind; currentKind = null; setAmbiance(k || "calme"); }
  else if (current) { const c = current; current = null; c.bus.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.8); setTimeout(() => { c.stops.forEach((s) => s()); c.bus.disconnect(); }, 900); }
}
export function setAmbienceVolume(v) {
  volume = Math.max(0, Math.min(1, v)); try { localStorage.setItem("ambienceVol", String(volume)); } catch {}
  if (master) master.gain.value = volume;
}
/** Redémarre le son si le navigateur l'a suspendu (onglet en arrière-plan, téléphone). */
export function wakeAmbience() { if (enabled && ctx?.state === "suspended") ctx.resume(); if (enabled && !current && currentKind) { const k = currentKind; currentKind = null; setAmbiance(k); } }
