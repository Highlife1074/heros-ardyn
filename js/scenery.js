// Illustration de la scène : un paysage en SVG animé, composé d'après le décor, l'heure, la météo et l'ambiance.
// Tout est généré : aucune image à télécharger, et la même scène donne toujours le même dessin.
import { rng, norm } from "./atlas.js";

export const SETTINGS = {
  foret: "Forêt", plaine: "Plaine", route: "Route", colline: "Collines", montagne: "Montagne", neige: "Neige", marais: "Marais", desert: "Désert",
  riviere: "Rivière", mer: "Mer", port: "Port", ville: "Ville", village: "Village", chateau: "Château", temple: "Temple", ruines: "Ruines",
  camp: "Campement", grotte: "Grotte", souterrain: "Souterrain", taverne: "Taverne", salle: "Grande salle",
};
export const TIMES = { aube: "Aube", jour: "Jour", crepuscule: "Crépuscule", nuit: "Nuit" };
export const WEATHERS = { clair: "Clair", nuages: "Nuageux", pluie: "Pluie", orage: "Orage", brume: "Brume", neige: "Neige", vent: "Vent" };
const INTERIOR = new Set(["taverne", "salle", "souterrain"]);

// Devine le décor d'une ancienne scène (avant ces champs) d'après son titre et son lieu.
const GUESS = [
  [/tavern|auberge|estaminet|relais|cabaret/, "taverne"], [/grotte|caverne|antre|mine/, "grotte"], [/crypte|donjon|souterrain|cachot|egout|tombeau|catacomb|tunnel/, "souterrain"],
  [/salle|palais|trone|cour du roi|bibliotheque|manoir|hall/, "salle"], [/chateau|forteresse|citadelle|bastille|tour|fort\b|rempart/, "chateau"],
  [/temple|abbaye|monastere|sanctuaire|chapelle|cathedrale/, "temple"], [/ruine|vestige|fouille/, "ruines"], [/port|quai|dock|havre/, "port"],
  [/mer|ocean|navire|bateau|ile|cote|plage|rivage/, "mer"], [/riviere|fleuve|gue|pont|rive|lac|ruisseau|enduine/, "riviere"], [/marais|marecage|tourbiere/, "marais"],
  [/desert|saabed|dune|aride/, "desert"], [/neige|glace|glacier|jorgland|grand nord/, "neige"], [/montagne|col\b|pic|sommet|falaise|mont\b|monts/, "montagne"],
  [/colline/, "colline"], [/foret|bois|sylve|qaalish|clairiere|belm/, "foret"], [/camp|bivouac|feu de camp/, "camp"], [/village|hameau|ferme/, "village"],
  [/ville|cite|marche|rue|ruelle|quartier|handorf|belion|idaris|istar|hardyll|bethel/, "ville"], [/route|chemin|sentier|piste|voyage/, "route"], [/plaine|champ|steppe|prairie|valerm/, "plaine"],
];
export function guessSetting(text) { const t = norm(text); for (const [re, s] of GUESS) if (re.test(t)) return s; return "plaine"; }

export function sceneParams(sc = {}) {
  const setting = SETTINGS[sc.setting] ? sc.setting : guessSetting(`${sc.title || ""} ${sc.location || ""} ${sc.place || ""}`);
  const time = TIMES[sc.time] ? sc.time : "jour";
  const weather = WEATHERS[sc.weather] ? sc.weather : setting === "neige" ? "neige" : "clair";
  return { setting, time, weather, mood: sc.mood || "calme", seed: `${sc.title || ""}|${sc.location || ""}|${setting}` };
}

// ---------------------------------------------------------------- Couleurs
const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const toHex = (a) => "#" + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
const mix = (a, b, t) => { const x = hex(a), y = hex(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
const SKY = {
  aube: { top: "#34406e", bot: "#f2a679", light: 0.72, sun: "#ffd9a3" },
  jour: { top: "#4a83c4", bot: "#c4def0", light: 1, sun: "#fff4d1" },
  crepuscule: { top: "#2a2152", bot: "#ec7a48", light: 0.6, sun: "#ffb36b" },
  nuit: { top: "#04060e", bot: "#1c2a4a", light: 0.26, sun: "#e8ecf5" },
};
const GROUND = {
  foret: "#3f5e34", plaine: "#6f8a45", route: "#6f8a45", colline: "#5f7d40", montagne: "#6c6a62", neige: "#e9eef3", marais: "#4b5638", desert: "#d7b072",
  riviere: "#5f8a45", mer: "#6c6a62", port: "#6b5a44", ville: "#6a6458", village: "#6f8a45", chateau: "#5e7a40", temple: "#7d8a55", ruines: "#7a7458", camp: "#4f6a38",
  grotte: "#3d3a36",
};

const W = 800, H = 300;
const f1 = (n) => Math.round(n * 10) / 10;

/** Ligne de crête : renvoie un chemin fermé vers le bas. */
function ridge(r, y0, amp, { step = 12, freq = 1, sharp = false } = {}) {
  const ph = [r() * 6.28, r() * 6.28, r() * 6.28];
  const pts = [];
  for (let x = -20; x <= W + 20; x += step) {
    let y = y0 - amp * (0.5 * Math.sin((x / W) * 6.28 * freq + ph[0]) + 0.3 * Math.sin((x / W) * 6.28 * freq * 2.3 + ph[1]) + 0.2 * Math.sin((x / W) * 6.28 * freq * 5.1 + ph[2]));
    if (sharp) y -= (r() - 0.3) * amp * 0.35;
    pts.push([x, y]);
  }
  return { pts, d: "M" + pts.map((p) => `${f1(p[0])},${f1(p[1])}`).join("L") + `L${W + 20},${H + 10}L-20,${H + 10}Z` };
}
const yAt = (pts, x) => { for (let i = 1; i < pts.length; i++) if (pts[i][0] >= x) { const [ax, ay] = pts[i - 1], [bx, by] = pts[i]; return ay + ((by - ay) * (x - ax)) / (bx - ax); } return pts.at(-1)[1]; };

// ---------------------------------------------------------------- Motifs
const pine = (x, y, h, c) => `<path d="M${f1(x)},${f1(y - h)} L${f1(x + h * 0.22)},${f1(y - h * 0.62)} L${f1(x + h * 0.12)},${f1(y - h * 0.62)} L${f1(x + h * 0.32)},${f1(y - h * 0.25)} L${f1(x + h * 0.14)},${f1(y - h * 0.25)} L${f1(x + h * 0.36)},${f1(y)} L${f1(x - h * 0.36)},${f1(y)} L${f1(x - h * 0.14)},${f1(y - h * 0.25)} L${f1(x - h * 0.32)},${f1(y - h * 0.25)} L${f1(x - h * 0.12)},${f1(y - h * 0.62)} L${f1(x - h * 0.22)},${f1(y - h * 0.62)}Z" fill="${c}"/>`;
const oak = (x, y, s, c) => `<path d="M${f1(x - s * 0.08)},${f1(y)} L${f1(x - s * 0.05)},${f1(y - s * 0.6)} L${f1(x + s * 0.05)},${f1(y - s * 0.6)} L${f1(x + s * 0.08)},${f1(y)}Z" fill="${c}"/><circle cx="${f1(x)}" cy="${f1(y - s * 0.8)}" r="${f1(s * 0.38)}" fill="${c}"/><circle cx="${f1(x - s * 0.3)}" cy="${f1(y - s * 0.62)}" r="${f1(s * 0.26)}" fill="${c}"/><circle cx="${f1(x + s * 0.3)}" cy="${f1(y - s * 0.64)}" r="${f1(s * 0.28)}" fill="${c}"/>`;
const deadTree = (x, y, s, c) => `<path d="M${x},${y} l${f1(s * 0.03)},${f1(-s * 0.6)} l${f1(-s * 0.2)},${f1(-s * 0.25)} M${f1(x + s * 0.03)},${f1(y - s * 0.45)} l${f1(s * 0.22)},${f1(-s * 0.3)} l${f1(s * 0.1)},${f1(-s * 0.06)} M${f1(x + s * 0.02)},${f1(y - s * 0.6)} l${f1(s * 0.02)},${f1(-s * 0.3)}" stroke="${c}" stroke-width="${f1(s * 0.05)}" fill="none" stroke-linecap="round"/>`;
function house(x, y, w, h, c, roof, lit, r) {
  const win = lit ? "#ffcf6b" : mix(c, "#000000", 0.35);
  const glow = lit ? `<circle cx="${f1(x + w / 2)}" cy="${f1(y - h * 0.45)}" r="${f1(w * 0.5)}" fill="#ffcf6b" opacity=".12"/>` : "";
  const ww = Math.max(3, w * 0.16);
  const wins = r() < 0.85 ? `<rect x="${f1(x + w * 0.22)}" y="${f1(y - h * 0.62)}" width="${f1(ww)}" height="${f1(ww * 1.3)}" fill="${win}"/>${w > 26 ? `<rect x="${f1(x + w * 0.62)}" y="${f1(y - h * 0.62)}" width="${f1(ww)}" height="${f1(ww * 1.3)}" fill="${r() < 0.6 ? win : mix(c, "#000000", 0.35)}"/>` : ""}` : "";
  return `${glow}<rect x="${f1(x)}" y="${f1(y - h)}" width="${f1(w)}" height="${f1(h + 2)}" fill="${c}"/><path d="M${f1(x - 3)},${f1(y - h)} L${f1(x + w / 2)},${f1(y - h - w * 0.55)} L${f1(x + w + 3)},${f1(y - h)}Z" fill="${roof}"/>${wins}`;
}
function tower(x, y, w, h, c, { flag = null, roof = null, lit = false } = {}) {
  let s = `<rect x="${f1(x)}" y="${f1(y - h)}" width="${f1(w)}" height="${f1(h + 2)}" fill="${c}"/>`;
  if (roof) s += `<path d="M${f1(x - 3)},${f1(y - h)} L${f1(x + w / 2)},${f1(y - h - w * 1.1)} L${f1(x + w + 3)},${f1(y - h)}Z" fill="${roof}"/>`;
  else for (let i = 0; i < w; i += w / 4) s += `<rect x="${f1(x + i)}" y="${f1(y - h - 5)}" width="${f1(w / 8)}" height="6" fill="${c}"/>`;
  s += `<rect x="${f1(x + w * 0.4)}" y="${f1(y - h * 0.7)}" width="${f1(w * 0.2)}" height="${f1(w * 0.35)}" rx="${f1(w * 0.1)}" fill="${lit ? "#ffcf6b" : mix(c, "#000000", 0.4)}"/>`;
  if (flag) { const top = y - h - (roof ? w * 1.1 : 5); s += `<path d="M${f1(x + w / 2)},${f1(top)} v-18" stroke="${c}" stroke-width="1.5"/><path d="M${f1(x + w / 2)},${f1(top - 18)} q8,-3 16,1 q-8,3 -16,7z" fill="${flag}"><animateTransform attributeName="transform" type="skewY" values="0;6;-4;0" dur="2.4s" repeatCount="indefinite"/></path>`; }
  return s;
}
function fire(x, y, s) {
  return `<g transform="translate(${f1(x)} ${f1(y)})"><circle r="${f1(s * 3)}" fill="#ff9a3c" opacity=".18"><animate attributeName="opacity" values=".14;.24;.16;.22;.14" dur="1.7s" repeatCount="indefinite"/></circle>
    <g><animateTransform attributeName="transform" type="scale" values="1 1;1.06 1.18;.95 .92;1.03 1.1;1 1" dur=".7s" repeatCount="indefinite"/>
    <path d="M0,0 C${f1(-s * 0.7)},0 ${f1(-s * 0.8)},${f1(-s * 0.7)} 0,${f1(-s * 1.7)} C${f1(s * 0.8)},${f1(-s * 0.7)} ${f1(s * 0.7)},0 0,0Z" fill="#f2672a"/>
    <path d="M0,0 C${f1(-s * 0.4)},0 ${f1(-s * 0.45)},${f1(-s * 0.5)} 0,${f1(-s * 1.1)} C${f1(s * 0.45)},${f1(-s * 0.5)} ${f1(s * 0.4)},0 0,0Z" fill="#ffd166"/></g></g>`;
}
function smoke(x, y, s = 1) {
  return [0, 1.3, 2.6].map((d) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(3 * s)}" fill="#cfd3d6" opacity="0"><animate attributeName="cy" values="${y};${y - 45 * s}" dur="3.9s" begin="${d}s" repeatCount="indefinite"/><animate attributeName="cx" values="${x};${x + 14 * s}" dur="3.9s" begin="${d}s" repeatCount="indefinite"/><animate attributeName="r" values="${3 * s};${9 * s}" dur="3.9s" begin="${d}s" repeatCount="indefinite"/><animate attributeName="opacity" values=".45;0" dur="3.9s" begin="${d}s" repeatCount="indefinite"/></circle>`).join("");
}
const torch = (x, y) => `<rect x="${x - 2}" y="${y}" width="4" height="16" fill="#3b2a1a"/>${fire(x, y, 7)}`;

// ---------------------------------------------------------------- Composition
export function renderScenery(sc, idp = "s") {
  const p = sceneParams(sc);
  const r = rng(p.seed);
  const id = (n) => `${idp}-${n}`;
  const sky = { ...SKY[p.time] };
  const wet = p.weather === "pluie" || p.weather === "orage";
  if (wet) { sky.top = mix(sky.top, "#3d4450", 0.6); sky.bot = mix(sky.bot, "#6b7380", 0.6); sky.light *= 0.75; }
  if (p.weather === "brume") { sky.top = mix(sky.top, "#9aa3ab", 0.4); sky.bot = mix(sky.bot, "#c9cfd3", 0.55); }
  if (p.weather === "neige" || p.weather === "nuages") { sky.top = mix(sky.top, "#7d8794", 0.4); sky.bot = mix(sky.bot, "#c3c9cf", 0.4); }
  const night = p.time === "nuit", lit = night || p.time === "crepuscule";
  const L = sky.light;
  const haze = p.weather === "brume" ? 0.75 : 0.5;
  /** Teinte d'un plan : couleur de base assombrie selon l'heure, fondue dans le ciel selon la profondeur (0 = proche). */
  const tone = (base, depth) => mix(mix(base, "#0b1020", 1 - L), sky.bot, depth * haze);
  const ground = GROUND[p.setting] || GROUND.plaine;
  const g = [];
  g.push(`<defs><linearGradient id="${id("sky")}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky.top}"/><stop offset="1" stop-color="${sky.bot}"/></linearGradient>
    <linearGradient id="${id("water")}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(sky.bot, "#2d5d74", 0.35)}"/><stop offset="1" stop-color="${mix(sky.top, "#0e2a3a", 0.5)}"/></linearGradient>
    <linearGradient id="${id("shade")}" x1="0" y1="0" x2="0" y2="1"><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".62"/></linearGradient>
    <radialGradient id="${id("vig")}" cx="50%" cy="45%" r="70%"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".7"/></radialGradient>
    <radialGradient id="${id("red")}" cx="50%" cy="50%" r="70%"><stop offset=".4" stop-color="#8b0000" stop-opacity="0"/><stop offset="1" stop-color="#8b0000" stop-opacity=".55"/></radialGradient>
    <radialGradient id="${id("warm")}" cx="50%" cy="70%" r="60%"><stop offset="0" stop-color="#ffb35c" stop-opacity=".28"/><stop offset="1" stop-color="#ffb35c" stop-opacity="0"/></radialGradient>
    <filter id="${id("blur")}" x="-30%" y="-80%" width="160%" height="260%"><feGaussianBlur stdDeviation="9"/></filter>
    <filter id="${id("soft")}"><feGaussianBlur stdDeviation="2"/></filter></defs>`);

  const outdoorSky = () => {
    g.push(`<rect width="${W}" height="${H}" fill="url(#${id("sky")})"/>`);
    if (night && !wet) for (let i = 0; i < 70; i++) { const x = r() * W, y = r() * H * 0.55, s = r() * 1.2 + 0.3; g.push(`<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(s)}" fill="#fff" opacity="${f1(0.4 + r() * 0.6)}">${r() < 0.25 ? `<animate attributeName="opacity" values="1;.2;1" dur="${f1(2 + r() * 3)}s" repeatCount="indefinite"/>` : ""}</circle>`); }
    if (!wet && p.weather !== "brume") {
      const sx = p.time === "aube" ? 140 : p.time === "crepuscule" ? 650 : 560 + r() * 120, sy = p.time === "jour" ? 55 : night ? 60 : 150;
      g.push(`<circle cx="${f1(sx)}" cy="${sy}" r="${night ? 60 : 90}" fill="${sky.sun}" opacity=".18" filter="url(#${id("blur")})"/><circle cx="${f1(sx)}" cy="${sy}" r="${night ? 16 : 24}" fill="${sky.sun}"/>`);
      if (night) g.push(`<circle cx="${f1(sx + 7)}" cy="${sy - 4}" r="14" fill="${sky.top}" opacity=".9"/>`);
    }
    const nc = wet ? 9 : p.weather === "nuages" || p.weather === "neige" ? 7 : p.weather === "clair" ? 3 : 4;
    const cc = wet ? mix("#4a505a", "#000000", 1 - L) : mix("#ffffff", sky.bot, night ? 0.85 : 0.25);
    for (let i = 0; i < nc; i++) {
      const x = r() * W, y = 20 + r() * 80, s = 30 + r() * 50, dur = 80 + r() * 60;
      g.push(`<g opacity="${wet ? 0.9 : 0.55}"><animateTransform attributeName="transform" type="translate" values="0 0;${W * 0.25} 0;0 0" dur="${f1(dur)}s" repeatCount="indefinite"/><ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(s * 1.6)}" ry="${f1(s * 0.4)}" fill="${cc}" filter="url(#${id("soft")})"/><ellipse cx="${f1(x + s * 0.4)}" cy="${f1(y - s * 0.18)}" rx="${f1(s * 0.8)}" ry="${f1(s * 0.35)}" fill="${cc}" filter="url(#${id("soft")})"/></g>`);
    }
  };
  const farHills = (y = 190, amp = 40, base = ground) => { const rd = ridge(r, y, amp, { freq: 1.2 }); g.push(`<path d="${rd.d}" fill="${tone(mix(base, "#6d7f99", 0.5), 0.85)}"/>`); return rd; };
  const peaks = (y = 175, amp = 90, snow = true) => {
    const rd = ridge(r, y, amp, { step: 26, freq: 1.6, sharp: true });
    g.push(`<path d="${rd.d}" fill="${tone("#7b7f8c", 0.75)}"/>`);
    if (snow) { const cid = id("snow" + g.length); g.push(`<clipPath id="${cid}"><rect y="0" width="${W}" height="${f1(y - amp * 0.28)}"/></clipPath><path d="${rd.d}" clip-path="url(#${cid})" fill="${mix("#ffffff", sky.bot, night ? 0.55 : 0.2)}"/>`); }
    return rd;
  };
  const groundLayer = (y = 240, amp = 14, base = ground) => { const rd = ridge(r, y, amp, { freq: 0.8 }); g.push(`<path d="${rd.d}" fill="${tone(base, 0)}"/>`); return rd; };
  const grass = (rd, n = 40, base = ground) => { const c = tone(mix(base, "#1d2b12", 0.4), 0); for (let i = 0; i < n; i++) { const x = r() * W, y = yAt(rd.pts, x) + 6 + r() * 50; g.push(`<path d="M${f1(x)},${f1(y)} l-3,-8 M${f1(x)},${f1(y)} l1,-10 M${f1(x)},${f1(y)} l4,-7" stroke="${c}" stroke-width="1.2"/>`); } };
  const forestRow = (y, h, depth, n = 34, kind = "pine") => { const c = tone(ground, depth); for (let i = 0; i < n; i++) { const x = (i / n) * W + (r() - 0.5) * 20, hh = h * (0.7 + r() * 0.5); g.push(kind === "pine" ? pine(x, y + r() * 8, hh, c) : oak(x, y + r() * 8, hh, c)); } };

  const S = p.setting;
  if (S === "taverne") {
    g.push(`<rect width="${W}" height="${H}" fill="#3a2516"/>`);
    for (let x = 0; x < W; x += 34) g.push(`<rect x="${x}" y="0" width="33" height="${H}" fill="${mix("#5a3a22", "#2a1a0e", r() * 0.5)}"/>`);
    g.push(`<rect x="560" y="50" width="110" height="90" fill="url(#${id("sky")})"/><path d="M560,95 h110 M615,50 v90" stroke="#2a1a0e" stroke-width="5"/><rect x="556" y="46" width="118" height="98" fill="none" stroke="#2a1a0e" stroke-width="8"/>`);
    g.push(`<rect x="0" y="22" width="${W}" height="16" fill="#24160b"/><rect x="0" y="0" width="${W}" height="10" fill="#24160b"/>`);
    g.push(`<path d="M90,${H} V120 Q90,96 160,96 Q230,96 230,120 V${H}Z" fill="#4b4540"/><path d="M110,${H} V140 Q110,122 160,122 Q210,122 210,140 V${H}Z" fill="#160d07"/>${fire(160, 268, 26)}`);
    g.push(`<g><animateTransform attributeName="transform" type="rotate" values="-2 400 30;2 400 30;-2 400 30" dur="5s" repeatCount="indefinite"/><path d="M400,30 v40" stroke="#1a1008" stroke-width="2"/><rect x="390" y="70" width="20" height="26" rx="3" fill="#ffcf6b"/><circle cx="400" cy="83" r="50" fill="#ffcf6b" opacity=".15"/></g>`);
    g.push(`<rect y="238" width="${W}" height="62" fill="#2a1a0e"/>`);
    for (const [x, w] of [[290, 180], [520, 200]]) g.push(`<rect x="${x}" y="226" width="${w}" height="12" fill="#6b4426"/><rect x="${x + 10}" y="238" width="10" height="62" fill="#4a2e18"/><rect x="${x + w - 20}" y="238" width="10" height="62" fill="#4a2e18"/>
      <rect x="${x + 40}" y="208" width="14" height="18" rx="2" fill="#b98a4a"/><rect x="${x + 70}" y="212" width="12" height="14" rx="2" fill="#a07438"/><circle cx="${x + w - 50}" cy="216" r="7" fill="#ffcf6b"/><circle cx="${x + w - 50}" cy="216" r="22" fill="#ffcf6b" opacity=".12"/>`);
    g.push(`<rect width="${W}" height="${H}" fill="url(#${id("warm")})"/>`);
  } else if (S === "salle") {
    g.push(`<rect width="${W}" height="${H}" fill="#4a4741"/>`);
    for (let y = 0; y < H; y += 22) for (let x = (y / 22) % 2 ? -25 : 0; x < W; x += 50) g.push(`<rect x="${x + 1}" y="${y + 1}" width="48" height="20" fill="${mix("#5d5950", "#3a3833", r() * 0.6)}"/>`);
    for (const x of [130, 370, 610]) g.push(`<path d="M${x},200 V70 Q${x + 30},30 ${x + 60},70 V200Z" fill="url(#${id("sky")})"/><path d="M${x + 30},40 V200 M${x},120 h60" stroke="#2b2925" stroke-width="4"/><path d="M${x},200 L${x - 50},${H} L${x + 110},${H} L${x + 60},200Z" fill="${sky.sun}" opacity="${night ? 0.04 : 0.1}"/>`);
    for (const x of [60, 290, 520, 740]) g.push(`<rect x="${x - 14}" y="0" width="28" height="${H}" fill="#38362f"/><rect x="${x - 18}" y="250" width="36" height="50" fill="#2e2c27"/>`);
    for (const [x, c] of [[250, "#7a1f1f"], [470, "#1f3f7a"], [690, "#7a1f1f"]]) g.push(`<path d="M${x - 12},20 h24 v80 l-12,-10 l-12,10z" fill="${c}"><animateTransform attributeName="transform" type="skewX" values="0;1.5;0" dur="6s" repeatCount="indefinite"/></path>`);
    g.push(`<path d="M330,${H} L380,220 L420,220 L470,${H}Z" fill="#6e1a1a"/>${torch(220, 150)}${torch(580, 150)}`);
  } else if (S === "souterrain") {
    g.push(`<rect width="${W}" height="${H}" fill="#24221f"/>`);
    for (let y = 0; y < H; y += 20) for (let x = (y / 20) % 2 ? -22 : 0; x < W; x += 44) g.push(`<rect x="${x + 1}" y="${y + 1}" width="42" height="18" fill="${mix("#3c3934", "#25231f", r())}"/>`);
    g.push(`<path d="M300,${H} V150 Q400,60 500,150 V${H}Z" fill="#0c0b0a"/><path d="M340,${H} V180 Q400,120 460,180 V${H}Z" fill="#050504"/>`);
    g.push(`<path d="M120,0 v70 m0,0 a6,8 0 1 0 0.1,0 m-0.1,16 v20" stroke="#5a564e" stroke-width="3" fill="none"/>`);
    g.push(`<path d="M0,${H} L300,250 L500,250 L${W},${H}Z" fill="#1a1816"/>${torch(230, 130)}${torch(570, 130)}`);
    g.push(`<rect width="${W}" height="${H}" fill="url(#${id("warm")})"/>`);
  } else if (S === "grotte") {
    outdoorSky(); peaks(200, 70); farHills(235, 20);
    g.push(`<path d="M0,0 H${W} V${H} H0Z M200,${H} C190,200 240,110 330,95 C420,80 520,90 580,150 C640,210 620,270 610,${H}Z" fill="#1e1b18" fill-rule="evenodd"/>`);
    for (let i = 0; i < 14; i++) { const x = 220 + r() * 380, l = 15 + r() * 40, y = 70 + Math.abs(x - 400) * 0.25; g.push(`<path d="M${f1(x - 7)},${f1(y)} L${f1(x)},${f1(y + l)} L${f1(x + 7)},${f1(y)}Z" fill="#1e1b18"/>`); }
    g.push(`<path d="M150,${H} C220,250 300,240 400,250 C500,240 600,255 660,${H}Z" fill="#2b2723"/>`);
    for (const [x, d] of [[310, 0], [470, 1.6]]) g.push(`<circle cx="${x}" cy="105" r="2" fill="#9ec3d6"><animate attributeName="cy" values="105;260" dur="1.4s" begin="${d}s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;1;0" dur="1.4s" begin="${d}s" repeatCount="indefinite"/></circle>`);
  } else {
    outdoorSky();
    if (["montagne", "neige"].includes(S)) {
      peaks(170, 110); const mid = peaks(220, 60, S === "neige");
      const gr = groundLayer(255, 10, ground);
      if (S === "neige") for (let i = 0; i < 14; i++) { const x = r() * W; const c = tone("#2f4a3a", 0.1); g.push(pine(x, yAt(gr.pts, x) + 8, 40 + r() * 40, c)); g.push(`<path d="M${f1(x - 8)},${f1(yAt(gr.pts, x) - 30)} l8,-12 l8,12z" fill="#eef3f7" opacity=".8"/>`); }
      else for (let i = 0; i < 6; i++) { const x = r() * W, y = yAt(gr.pts, x) + 20 + r() * 20, s = 20 + r() * 30; g.push(`<path d="M${f1(x - s)},${f1(y)} L${f1(x - s * 0.3)},${f1(y - s * 0.7)} L${f1(x + s * 0.5)},${f1(y - s * 0.5)} L${f1(x + s)},${f1(y)}Z" fill="${tone("#4b4842", 0)}"/>`); }
      void mid;
    } else if (S === "desert") {
      for (const [y, a, d, c] of [[200, 25, 0.7, "#e6c38a"], [235, 30, 0.35, "#d8ad6a"], [270, 20, 0, "#c99a55"]]) { const rd = ridge(r, y, a, { freq: 0.7, step: 20 }); g.push(`<path d="${rd.d}" fill="${tone(c, d)}"/>`); }
      if (!night) g.push(`<rect y="150" width="${W}" height="40" fill="${sky.sun}" opacity=".08" filter="url(#${id("blur")})"><animate attributeName="opacity" values=".04;.12;.04" dur="4s" repeatCount="indefinite"/></rect>`);
      g.push(`<path d="M610,205 l12,-40 l6,0 l4,-14 l6,14 l4,0 l10,40z" fill="${tone("#a4875a", 0.6)}"/>`);
    } else if (["mer", "port"].includes(S)) {
      const hz = S === "port" ? 190 : 170;
      g.push(`<rect y="${hz}" width="${W}" height="${H - hz}" fill="url(#${id("water")})"/>`);
      if (S === "mer") g.push(`<path d="M-10,${hz} L0,120 L60,105 L110,140 L150,${hz}Z" fill="${tone("#6c6a62", 0.3)}"/>`);
      for (let i = 0; i < 26; i++) { const x = r() * W, y = hz + 8 + r() * (H - hz - 10), l = 8 + (y - hz) * 0.25; g.push(`<path d="M${f1(x)},${f1(y)} q${f1(l / 2)},-4 ${f1(l)},0" stroke="${mix(sky.bot, "#ffffff", 0.4)}" stroke-width="1.3" fill="none" opacity=".6"><animateTransform attributeName="transform" type="translate" values="0 0;${f1(6 + r() * 6)} 0;0 0" dur="${f1(3 + r() * 3)}s" repeatCount="indefinite"/></path>`); }
      const ship = (x, y, s) => `<g><animateTransform attributeName="transform" type="translate" values="0 0;0 ${f1(s * 0.06)};0 0" dur="3.2s" repeatCount="indefinite"/><path d="M${f1(x - s)},${f1(y)} L${f1(x + s)},${f1(y)} L${f1(x + s * 0.8)},${f1(y + s * 0.25)} L${f1(x - s * 0.8)},${f1(y + s * 0.25)}Z" fill="${tone("#3b2a1c", 0.2)}"/><path d="M${f1(x)},${f1(y)} v${f1(-s * 1.3)}" stroke="${tone("#3b2a1c", 0.2)}" stroke-width="${f1(s * 0.05)}"/><path d="M${f1(x + 2)},${f1(y - s * 1.2)} q${f1(s * 0.6)},${f1(s * 0.5)} 0,${f1(s * 1.05)}z" fill="${tone("#e8e0cc", 0.25)}"/>${lit ? `<circle cx="${f1(x - s * 0.5)}" cy="${f1(y - 3)}" r="2" fill="#ffcf6b"/>` : ""}</g>`;
      g.push(ship(520, hz + 4, 22));
      if (S === "port") {
        g.push(`<path d="M520,${H} V215 H${W} V${H}Z" fill="${tone("#6a5a46", 0.1)}"/>`);
        for (let i = 0; i < 6; i++) g.push(house(540 + i * 44, 215, 36, 40 + r() * 30, tone("#8a7860", 0.15), tone("#6b3a2a", 0.15), lit && r() < 0.7, r));
        g.push(`<rect x="0" y="252" width="420" height="10" fill="${tone("#4a3524", 0)}"/>`); for (let x = 10; x < 420; x += 40) g.push(`<rect x="${x}" y="262" width="7" height="40" fill="${tone("#3a281a", 0)}"/>`);
        g.push(ship(200, 245, 50));
      }
    } else if (S === "marais") {
      farHills(185, 15); forestRow(205, 30, 0.6, 30, "oak");
      g.push(`<rect y="215" width="${W}" height="${H - 215}" fill="url(#${id("water")})" opacity=".9"/><rect y="215" width="${W}" height="${H - 215}" fill="${tone("#3c4a2c", 0.2)}" opacity=".55"/>`);
      for (let i = 0; i < 7; i++) { const x = r() * W, y = 220 + r() * 70; g.push(`<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(30 + r() * 50)}" ry="6" fill="${tone(ground, 0.05)}"/>`); }
      for (let i = 0; i < 5; i++) g.push(deadTree(r() * W, 235 + r() * 50, 70 + r() * 60, tone("#2b261d", 0)));
      for (let i = 0; i < 30; i++) { const x = r() * W, y = 240 + r() * 60; g.push(`<path d="M${f1(x)},${f1(y)} l-2,-16 M${f1(x + 3)},${f1(y)} l1,-20 M${f1(x + 6)},${f1(y)} l3,-14" stroke="${tone("#3d4a28", 0)}" stroke-width="1.5"/>`); }
      for (let i = 0; i < 5; i++) { const x = r() * W, y = 180 + r() * 80; g.push(`<circle cx="${f1(x)}" cy="${f1(y)}" r="3" fill="#b6f0c8"><animate attributeName="opacity" values="0;.9;0" dur="${f1(3 + r() * 3)}s" begin="${f1(r() * 3)}s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="translate" values="0 0;${f1((r() - 0.5) * 40)} ${f1((r() - 0.5) * 20)};0 0" dur="7s" repeatCount="indefinite"/></circle>`); }
    } else {
      const far = ["colline", "plaine", "route", "riviere", "village", "chateau", "temple", "camp", "ruines", "foret", "ville"].includes(S);
      if (far && r() < 0.6 && S !== "ville") peaks(185, 55, true); else if (far) farHills(185, 35);
      if (S === "colline") { farHills(215, 35); farHills(240, 30); }
      if (S === "foret") forestRow(215, 70, 0.55, 40);
      if (S === "camp") forestRow(220, 60, 0.45, 30);
      if (["ville"].includes(S)) {
        const wallY = 225; let x = -10;
        while (x < W) { const w = 22 + r() * 30, h = 25 + r() * 45; g.push(house(x, wallY - 18, w, h, tone("#8a8270", 0.4), tone("#7a3b2a", 0.4), lit && r() < 0.7, r)); x += w + 2; }
        g.push(tower(360, wallY - 18, 30, 110, tone("#9a9280", 0.35), { roof: tone("#3d4a6a", 0.35), flag: "#b52b2b", lit }));
        g.push(`<rect x="0" y="${wallY - 20}" width="${W}" height="30" fill="${tone("#7d7564", 0.2)}"/>`); for (let i = 0; i < W; i += 16) g.push(`<rect x="${i}" y="${wallY - 26}" width="9" height="7" fill="${tone("#7d7564", 0.2)}"/>`);
        for (const tx of [120, 600]) g.push(tower(tx, wallY + 8, 36, 70, tone("#857d6b", 0.15), { lit }));
      }
      const gr = groundLayer(S === "ville" ? 250 : 240, 12, ground);
      if (S === "riviere" || S === "route") {
        const c = S === "riviere" ? `url(#${id("water")})` : tone("#a08a64", 0);
        g.push(`<path d="M380,${yAt(gr.pts, 400) + 1} C420,${f1(yAt(gr.pts, 400) + 15)} 330,262 360,${H + 5} L${S === "riviere" ? 520 : 470},${H + 5} C440,262 450,${f1(yAt(gr.pts, 400) + 15)} 400,${yAt(gr.pts, 400) + 1}Z" fill="${c}"/>`);
        if (S === "route") g.push(`<path d="M600,${f1(yAt(gr.pts, 600) + 30)} v-34 h28 l6,5 l-6,5 h-28" stroke="${tone("#4a3524", 0)}" stroke-width="3" fill="${tone("#7a5a36", 0)}"/>`);
      }
      if (S === "village") for (let i = 0; i < 5; i++) { const x = 80 + i * 140 + r() * 40, y = yAt(gr.pts, x) + 8, w = 40 + r() * 16; g.push(house(x, y, w, 26 + r() * 10, tone("#b9a37a", 0.1), tone("#6b4a2a", 0.1), lit, r)); g.push(`<rect x="${f1(x + w * 0.7)}" y="${f1(y - 50)}" width="6" height="14" fill="${tone("#5b4a3a", 0.1)}"/>${smoke(x + w * 0.7 + 3, y - 52)}`); }
      if (S === "chateau") {
        g.push(`<path d="M280,${H} C300,190 360,150 420,150 C480,150 540,190 560,${H}Z" fill="${tone(ground, 0.15)}"/>`);
        const c = tone("#8a8577", 0.2);
        g.push(`<rect x="340" y="110" width="160" height="45" fill="${c}"/>`); for (let x = 340; x < 500; x += 14) g.push(`<rect x="${x}" y="104" width="8" height="7" fill="${c}"/>`);
        g.push(tower(320, 155, 34, 85, c, { roof: tone("#3d4a6a", 0.2), flag: "#b52b2b", lit }), tower(400, 155, 42, 120, c, { roof: tone("#3d4a6a", 0.2), flag: "#c79342", lit }), tower(490, 155, 34, 80, c, { roof: tone("#3d4a6a", 0.2), lit }));
        g.push(`<path d="M405,155 v-22 q15,-14 30,0 v22z" fill="${tone("#1a1510", 0.1)}"/>`);
      }
      if (S === "temple") {
        const c = tone("#e9e2cf", 0.2), dk = tone("#b9b09a", 0.2), y = yAt(gr.pts, 400) + 6;
        g.push(`<path d="M250,${f1(y)} h300 v-12 h-20 v-8 h-260 v8 h-20z" fill="${dk}"/>`);
        for (let i = 0; i < 7; i++) g.push(`<rect x="${282 + i * 38}" y="${f1(y - 110)}" width="16" height="90" fill="${c}"/>`);
        g.push(`<path d="M262,${f1(y - 110)} h276 l-138,-55z" fill="${c}"/><path d="M290,${f1(y - 116)} h220 l-110,-42z" fill="${dk}"/><circle cx="400" cy="${f1(y - 132)}" r="8" fill="#c79342"/>`);
        if (lit) g.push(`<rect x="378" y="${f1(y - 80)}" width="44" height="60" fill="#ffcf6b" opacity=".55"/>`);
      }
      if (S === "ruines") {
        const c = tone("#b5ad96", 0.15);
        for (const [x, h] of [[180, 120], [250, 70], [520, 140], [600, 50], [660, 95]]) { const y = yAt(gr.pts, x) + 6; g.push(`<rect x="${x}" y="${f1(y - h)}" width="22" height="${h}" fill="${c}"/><path d="M${x - 4},${f1(y - h)} h30 l-6,${f1(-6 - r() * 8)} l-8,4 l-6,-6z" fill="${c}"/>`); }
        g.push(`<path d="M300,${f1(yAt(gr.pts, 300) + 4)} v-90 a70,70 0 0 1 140,0 v40 l-8,-6 l-12,8 v-42 a50,50 0 0 0 -100,0 v90z" fill="${c}"/>`);
        for (let i = 0; i < 10; i++) { const x = r() * W, y = yAt(gr.pts, x) + 14 + r() * 30; g.push(`<rect x="${f1(x)}" y="${f1(y)}" width="${f1(10 + r() * 20)}" height="${f1(6 + r() * 8)}" transform="rotate(${f1((r() - 0.5) * 40)} ${f1(x)} ${f1(y)})" fill="${tone("#958d78", 0)}"/>`); }
        for (let i = 0; i < 8; i++) { const x = 180 + r() * 500; g.push(`<path d="M${f1(x)},${f1(140 + r() * 60)} q-6,20 2,40" stroke="${tone("#3d5a2a", 0.1)}" stroke-width="3" fill="none"/>`); }
      }
      if (S === "camp") {
        for (const [x, s] of [[170, 70], [560, 80], [660, 55]]) { const y = yAt(gr.pts, x) + 12; g.push(`<path d="M${x - s * 0.6},${f1(y)} L${x},${f1(y - s * 0.8)} L${x + s * 0.6},${f1(y)}Z" fill="${tone("#b49a6a", 0.05)}"/><path d="M${x - s * 0.12},${f1(y)} L${x},${f1(y - s * 0.5)} L${x + s * 0.12},${f1(y)}Z" fill="${tone("#2a1e12", 0)}"/>`); }
        const y = yAt(gr.pts, 380) + 40;
        g.push(`<path d="M352,${f1(y + 4)} l56,-8 M354,${f1(y - 4)} l52,8" stroke="#3b2a1a" stroke-width="5"/>${fire(380, y, 20)}`);
        for (let i = 0; i < 4; i++) g.push(`<circle cx="380" cy="${f1(y - 20)}" r="1.5" fill="#ffd166"><animate attributeName="cy" values="${f1(y - 20)};${f1(y - 90)}" dur="${f1(1.5 + r())}s" begin="${f1(r() * 2)}s" repeatCount="indefinite"/><animate attributeName="cx" values="380;${f1(370 + r() * 30)}" dur="2s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0" dur="1.8s" repeatCount="indefinite"/></circle>`);
      }
      if (S === "foret") { for (const x of [-10, 40, 720, 790]) g.push(pine(x, H + 10, 230 + r() * 60, tone(ground, 0) )); if (p.time === "jour" && !wet) g.push(`<path d="M470,0 L560,0 L420,${H} L300,${H}Z" fill="#fff6d5" opacity=".07"/><path d="M600,0 L640,0 L560,${H} L500,${H}Z" fill="#fff6d5" opacity=".06"/>`); }
      if (["plaine", "colline", "riviere", "route", "village", "camp"].includes(S)) for (let i = 0; i < 3; i++) { const x = r() * W; g.push(oak(x, yAt(gr.pts, x) + 10 + r() * 20, 40 + r() * 30, tone(mix(ground, "#1e3014", 0.5), 0))); }
      if (S !== "ville") grass(gr, 30);
    }
  }

  // Météo
  const inside = INTERIOR.has(S);
  if (!inside && (wet || p.weather === "neige")) {
    const snow = p.weather === "neige";
    const drops = Array.from({ length: snow ? 70 : wet && p.weather === "orage" ? 140 : 90 }, () => [r() * (W + 100), r() * H]);
    const shape = (x, y) => (snow ? `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(1 + r() * 1.8)}"/>` : `<path d="M${f1(x)},${f1(y)} l-4,14"/>`);
    const layer = drops.map(([x, y]) => shape(x, y)).join("") + drops.map(([x, y]) => shape(x, y - H)).join("");
    g.push(`<g fill="#ffffff" stroke="${snow ? "none" : "#c9d6e3"}" stroke-width="1" opacity="${snow ? 0.85 : 0.5}"><animateTransform attributeName="transform" type="translate" values="0 0;${snow ? 40 : -60} ${H}" dur="${snow ? 9 : 0.7}s" repeatCount="indefinite"/>${layer}</g>`);
  }
  if (p.weather === "orage" && !inside) g.push(`<rect width="${W}" height="${H}" fill="#eef3ff" opacity="0"><animate attributeName="opacity" values="0;0;.75;0;.5;0;0" keyTimes="0;.8;.81;.83;.85;.88;1" dur="9s" repeatCount="indefinite"/></rect>`);
  if ((p.weather === "brume" && !inside) || p.mood === "mystère") {
    const fc = p.mood === "mystère" && p.weather !== "brume" ? "#8f7fb3" : "#dfe4e7";
    for (let i = 0; i < 4; i++) g.push(`<ellipse cx="${f1(r() * W)}" cy="${f1(200 + r() * 80)}" rx="${f1(220 + r() * 120)}" ry="28" fill="${fc}" opacity="${p.weather === "brume" ? 0.4 : 0.22}" filter="url(#${id("blur")})"><animateTransform attributeName="transform" type="translate" values="-60 0;60 0;-60 0" dur="${f1(25 + r() * 20)}s" repeatCount="indefinite"/></ellipse>`);
  }
  if (p.weather === "vent" && !inside) for (let i = 0; i < 8; i++) { const y = 60 + r() * 200; g.push(`<path d="M0,${f1(y)} q60,-10 120,0 t120,0" stroke="#ffffff" stroke-width="1.2" fill="none" opacity="0"><animateTransform attributeName="transform" type="translate" values="-150 0;${W} 0" dur="${f1(2 + r() * 2)}s" begin="${f1(r() * 3)}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;.35;0" dur="${f1(2 + r() * 2)}s" begin="${f1(r() * 3)}s" repeatCount="indefinite"/></path>`); }

  // Ambiance
  if (p.mood === "combat") g.push(`<rect width="${W}" height="${H}" fill="url(#${id("red")})"><animate attributeName="opacity" values=".7;1;.7" dur="1.6s" repeatCount="indefinite"/></rect>`);
  if (p.mood === "danger") g.push(`<rect width="${W}" height="${H}" fill="url(#${id("vig")})"/><rect width="${W}" height="${H}" fill="url(#${id("red")})" opacity=".5"/>`);
  if (p.mood === "tension") g.push(`<rect width="${W}" height="${H}" fill="url(#${id("vig")})" opacity=".8"/>`);
  if (p.mood === "repos") g.push(`<rect width="${W}" height="${H}" fill="url(#${id("warm")})"/>`);
  if (p.mood === "fête") {
    g.push(`<path d="M-10,30 Q200,90 400,40 T810,40" stroke="#2a1a0e" stroke-width="1.5" fill="none"/>`);
    const cols = ["#ffcf6b", "#e8594a", "#6fc3a8", "#c79342", "#8fb0ff"];
    for (let i = 0; i < 16; i++) { const t = i / 15, x = -10 + t * 820, y = t < 0.5 ? 30 + Math.sin(t * 2 * Math.PI) * 40 + 8 : 40 + Math.sin((t - 0.5) * 2 * Math.PI) * 40 * -0.3 + 8; g.push(`<circle cx="${f1(x)}" cy="${f1(y + 6)}" r="5" fill="${cols[i % 5]}"><animate attributeName="opacity" values=".7;1;.7" dur="${f1(1 + r())}s" repeatCount="indefinite"/></circle><circle cx="${f1(x)}" cy="${f1(y + 6)}" r="14" fill="${cols[i % 5]}" opacity=".15"/>`); }
    g.push(`<rect width="${W}" height="${H}" fill="url(#${id("warm")})"/>`);
  }
  g.push(`<rect width="${W}" height="${H}" fill="url(#${id("shade")})"/>`);
  const label = `${SETTINGS[p.setting]}, ${TIMES[p.time].toLowerCase()}${p.weather !== "clair" ? ", " + WEATHERS[p.weather].toLowerCase() : ""}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${label}">${g.join("")}</svg>`;
}
