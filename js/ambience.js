// Ambiance sonore de la scène, synthétisée en direct (Web Audio) : vent, pluie, feu, oiseaux, foule, musique selon l'ambiance.
// Aucun fichier son : tout est généré, donc léger et sans droits d'auteur.
import { sceneParams } from "./scenery.js";

let ctx = null, master = null, verb = null, noiseBuf = null;
let current = null; // { key, nodes: [...], stop() }
let level = 0;      // 0 = coupé, 1 = doux, 2 = fort
let wanted = null;  // dernière scène demandée
try { level = Number(localStorage.getItem("ambience") || 0) || 0; } catch {}

const LEVELS = [0, 0.35, 0.75];
export const ambienceLevel = () => level;
export const AMB_ICON = ["🔇", "🎵", "🎶"];
export const AMB_LABEL = ["Ambiance coupée", "Ambiance douce", "Ambiance forte"];

function ensure() {
  if (ctx) return true;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
  ctx = new AC();
  const comp = ctx.createDynamicsCompressor(); comp.connect(ctx.destination);
  master = ctx.createGain(); master.gain.value = 0; master.connect(comp);
  // Réverbération : réponse impulsionnelle fabriquée (bruit qui décroît)
  verb = ctx.createConvolver();
  const len = ctx.sampleRate * 2.6, ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
  verb.buffer = ir; const vg = ctx.createGain(); vg.gain.value = 0.5; verb.connect(vg); vg.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  // Les navigateurs n'autorisent le son qu'après un geste de l'utilisateur
  const unlock = () => { ctx.resume(); if (ctx.state === "running") { removeEventListener("pointerdown", unlock, true); removeEventListener("keydown", unlock, true); } };
  addEventListener("pointerdown", unlock, true); addEventListener("keydown", unlock, true);
  // La voix du MJ passe devant l'ambiance
  setInterval(() => { if (!master) return; const talk = window.speechSynthesis?.speaking; master.gain.setTargetAtTime(LEVELS[level] * (talk ? 0.35 : 1), ctx.currentTime, 0.4); }, 500);
  return true;
}

// ---------------------------------------------------------------- Briques sonores
const rnd = (a, b) => a + Math.random() * (b - a);
function noise(out, { type = "lowpass", freq = 800, q = 0.7, gain = 0.2 } = {}) {
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true; src.loopStart = Math.random();
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); g.gain.value = gain;
  src.connect(f); f.connect(g); g.connect(out); src.start();
  return { src, f, g, stop: () => { try { src.stop(); } catch {} } };
}
function lfo(param, rate, depth, base) {
  const o = ctx.createOscillator(); o.frequency.value = rate; const g = ctx.createGain(); g.gain.value = depth;
  param.value = base; o.connect(g); g.connect(param); o.start();
  return { stop: () => { try { o.stop(); } catch {} } };
}
/** Répète fn à intervalles irréguliers. */
function every(min, max, fn) {
  let t, on = true;
  const loop = () => { if (!on) return; try { fn(); } catch {} t = setTimeout(loop, rnd(min, max) * 1000); };
  t = setTimeout(loop, rnd(0, max) * 1000);
  return { stop: () => { on = false; clearTimeout(t); } };
}
function env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
function tone(out, { type = "sine", f0, f1 = f0, a = 0.01, d = 0.3, peak = 0.2, at = 0 }) {
  const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + a + d);
  env(g, t, a, peak, d); o.connect(g); g.connect(out); o.start(t); o.stop(t + a + d + 0.05);
}
function burst(out, { freq = 2000, q = 1, type = "bandpass", d = 0.05, peak = 0.3, at = 0 }) {
  const t = ctx.currentTime + at, s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = ctx.createGain();
  env(g, t, 0.003, peak, d); s.connect(f); f.connect(g); g.connect(out); s.start(t, Math.random() * 2); s.stop(t + d + 0.1);
}

const L = {
  wind: (o, k = 1) => { const n = noise(o, { type: "bandpass", freq: 500, q: 0.8, gain: 0.12 * k }); return [n, lfo(n.f.frequency, 0.07, 300, 500), lfo(n.g.gain, 0.11, 0.07 * k, 0.12 * k)]; },
  howl: (o) => { const n = noise(o, { type: "bandpass", freq: 700, q: 6, gain: 0.14 }); return [n, lfo(n.f.frequency, 0.05, 350, 700), ...L.wind(o, 1.3)]; },
  rain: (o, k = 1) => [noise(o, { type: "highpass", freq: 1200, gain: 0.09 * k }), noise(o, { type: "lowpass", freq: 400, gain: 0.08 * k }),
    every(0.02, 0.15, () => burst(o, { freq: rnd(2500, 6000), q: 2, d: 0.02, peak: 0.05 * k }))],
  thunder: (o) => [every(9, 25, () => { burst(o, { type: "lowpass", freq: 300, q: 0.5, d: rnd(2.5, 4), peak: 0.9 }); burst(o, { type: "lowpass", freq: 900, q: 0.5, d: 0.6, peak: 0.3, at: 0.05 }); })],
  fire: (o) => [noise(o, { type: "lowpass", freq: 300, gain: 0.08 }), every(0.04, 0.35, () => burst(o, { freq: rnd(1500, 4500), q: 3, d: rnd(0.01, 0.04), peak: rnd(0.05, 0.25) }))],
  birds: (o) => [every(1.5, 6, () => { const f = rnd(2200, 4200), n = Math.floor(rnd(2, 6)); for (let i = 0; i < n; i++) tone(o, { f0: f * rnd(0.9, 1.1), f1: f * rnd(1.2, 1.6), a: 0.01, d: rnd(0.05, 0.12), peak: 0.05, at: i * rnd(0.09, 0.16) }); })],
  crickets: (o) => [every(0.6, 1.6, () => { const f = rnd(4200, 4800); for (let i = 0; i < 3; i++) tone(o, { f0: f, a: 0.005, d: 0.03, peak: 0.025, at: i * 0.06 }); })],
  owl: (o) => [every(12, 30, () => { tone(verb, { f0: 420, f1: 380, a: 0.05, d: 0.35, peak: 0.12 }); tone(verb, { f0: 400, f1: 360, a: 0.05, d: 0.6, peak: 0.12, at: 0.6 }); })],
  frogs: (o) => [every(0.5, 2.5, () => { const f = rnd(120, 260); for (let i = 0; i < 3; i++) tone(o, { type: "square", f0: f, f1: f * 0.8, a: 0.01, d: 0.06, peak: 0.03, at: i * 0.12 }); })],
  waves: (o) => { const n = noise(o, { type: "lowpass", freq: 600, gain: 0.15 }); return [n, lfo(n.g.gain, 0.12, 0.13, 0.15), lfo(n.f.frequency, 0.12, 300, 700)]; },
  stream: (o) => [noise(o, { type: "bandpass", freq: 1500, q: 0.6, gain: 0.07 }), every(0.05, 0.3, () => tone(o, { f0: rnd(500, 1300), f1: rnd(1400, 2400), a: 0.005, d: 0.04, peak: 0.03 }))],
  gulls: (o) => [every(6, 16, () => { for (let i = 0; i < 3; i++) tone(verb, { type: "triangle", f0: 1600, f1: 900, a: 0.03, d: 0.25, peak: 0.06, at: i * 0.35 }); })],
  creak: (o) => [every(4, 10, () => tone(o, { type: "sawtooth", f0: rnd(90, 140), f1: rnd(60, 90), a: 0.2, d: 0.6, peak: 0.02 }))],
  crowd: (o, k = 1) => { const a = noise(o, { type: "bandpass", freq: 500, q: 1.2, gain: 0.07 * k }), b = noise(o, { type: "bandpass", freq: 900, q: 2, gain: 0.04 * k });
    return [a, b, lfo(a.g.gain, 0.3, 0.03 * k, 0.07 * k), lfo(b.f.frequency, 0.2, 200, 900), every(1.5, 5, () => burst(o, { freq: rnd(300, 700), q: 4, d: rnd(0.2, 0.5), peak: 0.04 * k }))]; },
  clinks: (o) => [every(2, 7, () => { const f = rnd(2500, 3500); tone(o, { type: "triangle", f0: f, a: 0.002, d: 0.25, peak: 0.05 }); tone(o, { type: "triangle", f0: f * 1.5, a: 0.002, d: 0.15, peak: 0.03, at: 0.08 }); })],
  hammer: (o) => [every(5, 12, () => { for (let i = 0; i < 3; i++) tone(verb, { type: "triangle", f0: 1800, f1: 1700, a: 0.002, d: 0.15, peak: 0.04, at: i * 0.55 }); })],
  bell: (o) => [every(18, 40, () => { for (const [m, p] of [[1, 0.1], [2.4, 0.05], [3.1, 0.04]]) tone(verb, { f0: 220 * m, a: 0.005, d: 4, peak: p }); })],
  drips: (o) => [every(0.8, 3, () => tone(verb, { f0: rnd(900, 1800), f1: rnd(400, 700), a: 0.002, d: 0.08, peak: 0.1 }))],
  rumble: (o) => { const n = noise(o, { type: "lowpass", freq: 90, gain: 0.25 }); return [n, lfo(n.g.gain, 0.05, 0.1, 0.22)]; },
  room: (o) => [noise(o, { type: "lowpass", freq: 250, gain: 0.04 }), every(3, 8, () => { for (let i = 0; i < 2; i++) burst(verb, { type: "lowpass", freq: 300, d: 0.08, peak: 0.12, at: i * 0.5 }); })],
  sand: (o) => { const n = noise(o, { type: "highpass", freq: 3000, gain: 0.03 }); return [n, lfo(n.g.gain, 0.08, 0.025, 0.03), ...L.wind(o, 0.7)]; },
  // Fonds musicaux selon l'ambiance
  pad: (o, notes, { type = "sine", gain = 0.035, detune = 6, cutoff = 900 } = {}) => {
    const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = cutoff; const g = ctx.createGain(); g.gain.value = gain; f.connect(g); g.connect(o); g.connect(verb);
    const oscs = notes.flatMap((n) => [-detune, detune].map((dt) => { const x = ctx.createOscillator(); x.type = type; x.frequency.value = n; x.detune.value = dt; x.connect(f); x.start(); return { stop: () => { try { x.stop(); } catch {} } }; }));
    return [...oscs, lfo(f.frequency, 0.04, cutoff * 0.4, cutoff), lfo(g.gain, 0.09, gain * 0.4, gain)];
  },
  drums: (o, bpm = 96) => { const beat = 60 / bpm; let n = 0; const seq = [1, 0, 0.5, 0, 1, 0.5, 0.7, 0];
    const t = setInterval(() => { const v = seq[n++ % seq.length]; if (v) { tone(o, { f0: 110, f1: 45, a: 0.005, d: 0.35, peak: 0.45 * v }); burst(o, { type: "lowpass", freq: 600, d: 0.08, peak: 0.1 * v }); } }, (beat / 2) * 1000);
    return [{ stop: () => clearInterval(t) }]; },
  heart: (o) => { const t = setInterval(() => { tone(o, { f0: 70, f1: 40, a: 0.01, d: 0.18, peak: 0.35 }); tone(o, { f0: 65, f1: 38, a: 0.01, d: 0.2, peak: 0.25, at: 0.25 }); }, 1100); return [{ stop: () => clearInterval(t) }]; },
  melody: (o, scale, { gain = 0.06, every: ev = [0.25, 0.6], type = "triangle", decay = 0.6 } = {}) => {
    let i = 2; return [every(ev[0], ev[1], () => { i = Math.max(0, Math.min(scale.length - 1, i + Math.round(rnd(-2, 2)))); tone(Math.random() < 0.5 ? o : verb, { type, f0: scale[i], a: 0.008, d: decay, peak: gain }); if (Math.random() < 0.2) tone(o, { type, f0: scale[Math.max(0, i - 2)] / 2, a: 0.01, d: decay * 1.5, peak: gain * 0.7 }); })];
  },
};
const DORIAN = [293.7, 329.6, 349.2, 392, 440, 493.9, 523.3, 587.3, 659.3];
const PENTA = [392, 440, 523.3, 587.3, 659.3, 784, 880];

/** Recette sonore d'une scène. */
function recipe(p, o) {
  const night = p.time === "nuit", day = p.time === "jour" || p.time === "aube";
  const s = p.setting, out = [];
  const add = (...xs) => out.push(...xs.flat());
  const nature = () => { if (day) add(L.birds(o)); else if (night) add(L.crickets(o), L.owl(o)); };
  switch (s) {
    case "foret": add(L.wind(o, 0.7)); nature(); break;
    case "plaine": case "route": case "colline": add(L.wind(o, 1)); if (day) add(L.birds(o)); if (night) add(L.crickets(o)); break;
    case "montagne": case "neige": add(L.howl(o)); break;
    case "marais": add(L.frogs(o), L.crickets(o), L.drips(o), L.wind(o, 0.4)); break;
    case "desert": add(L.sand(o)); break;
    case "riviere": add(L.stream(o), L.wind(o, 0.5)); nature(); break;
    case "mer": add(L.waves(o), L.gulls(o), L.wind(o, 0.8)); break;
    case "port": add(L.waves(o), L.gulls(o), L.creak(o), L.crowd(o, 0.6), L.bell(o)); break;
    case "ville": add(L.crowd(o, night ? 0.4 : 1), L.hammer(o), L.bell(o)); break;
    case "village": add(L.wind(o, 0.5), L.crowd(o, 0.3), L.hammer(o)); nature(); break;
    case "chateau": add(L.wind(o, 0.9), L.bell(o)); break;
    case "temple": add(L.pad(o, [146.8, 220, 293.7, 370], { gain: 0.03, cutoff: 1200 }), L.bell(o), L.room(o)); break;
    case "ruines": add(L.wind(o, 1.1)); if (night) add(L.owl(o)); break;
    case "camp": add(L.fire(o), L.wind(o, 0.4)); nature(); break;
    case "grotte": add(L.drips(o), L.rumble(o)); break;
    case "souterrain": add(L.drips(o), L.rumble(o), L.fire(o)); break;
    case "taverne": add(L.crowd(o, 1), L.clinks(o), L.fire(o), L.melody(o, DORIAN, { gain: 0.035, every: [0.3, 0.7] })); break;
    case "salle": add(L.room(o), L.fire(o)); break;
  }
  const inside = ["taverne", "salle", "souterrain", "grotte"].includes(s);
  if (p.weather === "pluie") add(L.rain(o, inside ? 0.3 : 1));
  if (p.weather === "orage") add(L.rain(o, inside ? 0.4 : 1.4), L.thunder(o));
  if (p.weather === "vent" && !inside) add(L.howl(o));
  if (p.weather === "neige" && !inside && s !== "montagne" && s !== "neige") add(L.wind(o, 0.8));
  switch (p.mood) {
    case "mystère": add(L.pad(o, [110, 164.8, 207.7], { type: "triangle", gain: 0.03, detune: 14, cutoff: 700 })); break;
    case "tension": add(L.pad(o, [55, 58.3], { type: "sawtooth", gain: 0.02, cutoff: 300 }), L.heart(o)); break;
    case "combat": add(L.drums(o, 104), L.pad(o, [73.4, 110, 146.8], { type: "sawtooth", gain: 0.022, cutoff: 600 })); break;
    case "danger": add(L.pad(o, [61.7, 65.4, 92.5], { type: "sawtooth", gain: 0.022, detune: 18, cutoff: 400 }), L.heart(o)); break;
    case "fête": if (s !== "taverne") add(L.melody(o, PENTA, { gain: 0.05, every: [0.18, 0.36], decay: 0.35 })); add(L.drums(o, 120)); break;
    case "repos": if (s !== "camp" && s !== "taverne") add(L.fire(o)); add(L.pad(o, [196, 246.9, 293.7], { gain: 0.018, cutoff: 600 })); break;
  }
  return out;
}

function start(sc) {
  const p = sceneParams(sc);
  const key = [p.setting, p.time, p.weather, p.mood].join("|");
  if (current?.key === key) return;
  // Fondu enchaîné entre l'ancienne et la nouvelle ambiance
  if (current) { const old = current; old.bus.gain.setTargetAtTime(0, ctx.currentTime, 0.8); setTimeout(() => { old.nodes.forEach((n) => n.stop?.()); old.bus.disconnect(); }, 4000); }
  const bus = ctx.createGain(); bus.gain.value = 0; bus.connect(master);
  const nodes = recipe(p, bus);
  bus.gain.setTargetAtTime(1, ctx.currentTime, 1.2);
  current = { key, bus, nodes };
}

/** À appeler à chaque changement de scène. Ne joue rien tant que l'ambiance est coupée. */
export function setAmbience(scene) {
  wanted = scene || {};
  if (!level) return;
  if (!ensure()) return;
  start(wanted);
}

/** Bouton : coupé → doux → fort → coupé. Renvoie le nouveau niveau. */
export function cycleAmbience() {
  level = (level + 1) % 3;
  try { localStorage.setItem("ambience", String(level)); } catch {}
  if (level && ensure()) { ctx.resume(); master.gain.setTargetAtTime(LEVELS[level], ctx.currentTime, 0.3); if (wanted) start(wanted); }
  else if (ctx) { master.gain.setTargetAtTime(0, ctx.currentTime, 0.3); stopAll(); }
  return level;
}

export function stopAll() {
  if (!current) return;
  const old = current; current = null;
  setTimeout(() => { old.nodes.forEach((n) => n.stop?.()); old.bus.disconnect(); }, 1200);
}
