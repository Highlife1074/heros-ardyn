// Atlas : carte du monde (Ardyn dessinée à la main, ou continent généré pour les autres mondes),
// lieux connus, placement des lieux visités et dessin en SVG. Aucune dépendance : utilisé par le MJ et par l'interface.

export const W = 1000, H = 700;

// ---------------------------------------------------------------- Hasard reproductible
export function hashStr(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
export function rng(seed) {
  let a = typeof seed === "number" ? seed >>> 0 : hashStr(seed);
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

// ---------------------------------------------------------------- Ardyn
// Géographie déduite de la bible : à corriger librement (coordonnées sur 1000 × 700, nord en haut).
const ARDYN = {
  id: "ardyn", name: "Ardyn",
  land: [[[170, -10], [1010, -10], [1010, 710], [720, 710], [690, 672], [600, 688], [520, 662], [440, 680], [370, 650], [300, 668], [230, 640], [175, 600], [150, 560], [178, 520], [142, 480], [160, 440], [205, 418], [232, 396], [192, 362], [132, 330], [110, 280], [142, 232], [120, 180], [152, 122], [130, 60]]],
  islands: [[[48, 452], [80, 446], [92, 476], [70, 498], [40, 486]], [[60, 520], [96, 512], [110, 540], [86, 566], [56, 556]], [[20, 590], [44, 584], [52, 604], [30, 616]]],
  fog: [[70, 530, 95]], // les Îles Aodh restent dans la brume
  mountains: [
    [[220, 40], [330, 30], [450, 45], [560, 60], [640, 50]],          // Grand Nord (Jorgland)
    [[860, 110], [900, 150], [940, 200], [975, 240]],                  // monts d'Hardyll
    [[700, 160], [712, 230], [705, 300], [716, 370], [706, 440]],      // chaîne de l'Est (Moncalm)
    [[245, 585], [285, 612], [330, 600]],                              // montagnes d'Istar
  ],
  hills: [[600, 215, 55], [565, 150, 45], [770, 470, 40], [835, 285, 30]],
  forests: [[360, 250, 55], [470, 170, 45], [650, 325, 45], [170, 285, 70], [180, 200, 50], [300, 560, 30]],
  marsh: [[770, 570, 60]],
  desert: [[640, 640, 90], [555, 605, 45]],
  steppe: [[830, 330, 90]],
  rivers: [
    [[395, 70], [420, 150], [445, 220], [470, 280]],
    [[640, 175], [590, 215], [520, 255], [470, 280]],
    [[470, 280], [430, 320], [360, 360], [300, 385], [232, 396]],
    [[700, 470], [610, 500], [540, 545], [470, 600], [420, 666]],
  ],
  walls: [[[728, 150], [736, 260], [728, 360], [740, 470], [735, 540]]],
  labels: [
    { t: "JORGLAND", x: 380, y: 95, s: 20 }, { t: "EMPIRE DE WERMAR", x: 470, y: 330, s: 22 }, { t: "TERRES DE L'EST", x: 860, y: 360, s: 20 },
    { t: "ISTAR", x: 245, y: 485, s: 22 }, { t: "IDARIS", x: 470, y: 470, s: 22 }, { t: "SAABED", x: 680, y: 665, s: 18 },
    { t: "QAALISH", x: 175, y: 360, s: 15, it: true }, { t: "Mer des Brumes", x: 70, y: 380, s: 15, it: true, sea: true },
    { t: "Grand Mur d'Ost", x: 762, y: 512, s: 12, it: true, rot: -80 },
  ],
  places: [
    { name: "Handorf", kind: "capitale", x: 470, y: 280, aka: ["capitale de l'Empire"] },
    { name: "Valerm", kind: "région", x: 480, y: 370 },
    { name: "Belion", kind: "cité", x: 250, y: 398 },
    { name: "Val d'Eren", kind: "région", x: 385, y: 320, aka: ["Eren"] },
    { name: "Moncalm", kind: "région", x: 650, y: 330 },
    { name: "Bois de Belm", kind: "forêt", x: 360, y: 250, aka: ["Belm"] },
    { name: "Collines Bleues", kind: "région", x: 600, y: 215 },
    { name: "Edibor", kind: "ville", x: 625, y: 195 },
    { name: "Kalebor", kind: "ville", x: 650, y: 245 },
    { name: "Forêt Maudite", kind: "forêt", x: 470, y: 170 },
    { name: "Collines Brumeuses", kind: "région", x: 565, y: 140 },
    { name: "Jorgland", kind: "région", x: 380, y: 120, aka: ["Grand Nord"] },
    { name: "Hardyll", kind: "cité", x: 890, y: 175, aka: ["cité naine"] },
    { name: "Helgen", kind: "capitale", x: 830, y: 285, aka: ["butte de Helgen"] },
    { name: "Bethel", kind: "cité", x: 870, y: 410 },
    { name: "Terres orques", kind: "région", x: 950, y: 80, aka: ["orques du Nord-Est"] },
    { name: "Idaris", kind: "capitale", x: 470, y: 500, aka: ["La Blanche"] },
    { name: "Bezhou", kind: "ruine", x: 560, y: 555, aka: ["fouilles de Bezhou"] },
    { name: "Benemor", kind: "région", x: 600, y: 440 },
    { name: "Bastille de Kerveld", kind: "fort", x: 540, y: 410, aka: ["Kerveld"] },
    { name: "Istar", kind: "capitale", x: 230, y: 520 },
    { name: "Tour de Moujat", kind: "fort", x: 200, y: 552, aka: ["Moujat"] },
    { name: "Enclave des Elenesti", kind: "forêt", x: 300, y: 565, aka: ["Elenesti", "Source Argentée"] },
    { name: "Qaalish", kind: "forêt", x: 175, y: 290, aka: ["forêt primordiale"] },
    { name: "Royaume Selvanari", kind: "forêt", x: 180, y: 200, aka: ["Selvanari"] },
    { name: "Dungold", kind: "région", x: 775, y: 470, aka: ["Pierre Noire"] },
    { name: "Marais de la Mort", kind: "région", x: 770, y: 575 },
    { name: "Citadelle Maudite", kind: "ruine", x: 800, y: 610 },
    { name: "Terres Arides", kind: "région", x: 555, y: 610 },
    { name: "Saabed", kind: "région", x: 660, y: 640, aka: ["désert du Saabed"] },
    { name: "Abbaye de Cendrelire", kind: "temple", x: 420, y: 620, aka: ["Cendrelire"] },
    { name: "Îles Aodh", kind: "région", x: 75, y: 515, aka: ["Îles des Brumes"] },
    { name: "Voghard", kind: "fort", x: 690, y: 110 },
    { name: "Grand Mur d'Ost", kind: "fort", x: 732, y: 300, aka: ["Mur d'Ost"] },
    { name: "Enduine", kind: "région", x: 540, y: 545, aka: ["rivière Enduine"] },
  ],
};

// ---------------------------------------------------------------- Monde généré (autres bibles)
function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function genericMap(seed) {
  const r = rng("carte:" + seed);
  const n = 18, cx = W / 2, cy = H / 2;
  const land = [Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2, k = 0.62 + r() * 0.3;
    return [Math.round(cx + Math.cos(a) * 430 * k), Math.round(cy + Math.sin(a) * 300 * k)];
  })];
  const islands = Array.from({ length: 3 + Math.floor(r() * 3) }, () => {
    const a = r() * Math.PI * 2, ix = cx + Math.cos(a) * 455, iy = cy + Math.sin(a) * 320, s = 14 + r() * 22;
    return Array.from({ length: 6 }, (_, i) => { const b = (i / 6) * Math.PI * 2; return [Math.round(ix + Math.cos(b) * s * (0.7 + r() * 0.5)), Math.round(iy + Math.sin(b) * s * (0.7 + r() * 0.5))]; });
  });
  const inside = (x, y) => inPoly(x, y, land[0]);
  const pick = (m = 0) => { for (let i = 0; i < 60; i++) { const x = 120 + r() * 760, y = 100 + r() * 500; if (inside(x, y) && inside(x + m, y) && inside(x - m, y) && inside(x, y + m) && inside(x, y - m)) return [x, y]; } return [cx, cy]; };
  const mountains = Array.from({ length: 2 + Math.floor(r() * 2) }, () => {
    let [x, y] = pick(60); const a = r() * Math.PI; const pts = [];
    for (let i = 0; i < 5; i++) { pts.push([Math.round(x), Math.round(y)]); x += Math.cos(a) * 45 + (r() - 0.5) * 20; y += Math.sin(a) * 45 + (r() - 0.5) * 20; if (!inside(x, y)) break; }
    return pts;
  });
  const blobs = (k, rad) => Array.from({ length: k }, () => { const [x, y] = pick(rad); return [Math.round(x), Math.round(y), Math.round(rad * (0.7 + r() * 0.6))]; });
  const rivers = mountains.map((m) => {
    let [x, y] = m[Math.floor(m.length / 2)]; const [tx, ty] = land[0][Math.floor(r() * n)]; const pts = [[x, y]];
    for (let i = 1; i <= 5; i++) pts.push([Math.round(x + ((tx - x) * i) / 5 + (r() - 0.5) * 30), Math.round(y + ((ty - y) * i) / 5 + (r() - 0.5) * 30)]);
    return pts;
  });
  return { id: "generic", name: "", land, islands, fog: [], mountains, hills: blobs(2, 40), forests: blobs(4, 50), marsh: blobs(1, 40), desert: r() < 0.5 ? blobs(1, 60) : [], steppe: [], rivers, walls: [], labels: [], places: [] };
}

export function mapFor(world, seed) {
  if (!world || world.base === "ardyn" || world.id === "ardyn") return ARDYN;
  return genericMap(world.id || seed || "monde");
}
export const isLand = (map, x, y) => map.land.some((p) => inPoly(x, y, p));

// ---------------------------------------------------------------- Lieux
const DIRS = { nord: [0, -1], sud: [0, 1], est: [1, 0], ouest: [-1, 0], "nord-est": [0.71, -0.71], "nord-ouest": [-0.71, -0.71], "sud-est": [0.71, 0.71], "sud-ouest": [-0.71, 0.71] };
export const DIRECTIONS = Object.keys(DIRS);
const DIST = { proche: 22, moyen: 55, loin: 110 };

/** Retrouve un lieu (carte de base ou lieux déjà visités) à partir d'un nom approximatif. */
export function findPlace(map, places, name) {
  const q = norm(name); if (!q) return null;
  const all = [...(places || []), ...map.places];
  const keys = (p) => [p.name, ...(p.aka || [])].map(norm);
  return all.find((p) => keys(p).includes(q)) || all.find((p) => keys(p).some((k) => k.length > 3 && (q.includes(k) || k.includes(q)))) || null;
}

/**
 * Situe la scène sur la carte. Renvoie { place, added } : le lieu connu, ou un nouveau lieu placé
 * près d'un repère (near + direction + distance), sinon près du lieu précédent.
 */
export function locate(map, places = [], { place, near, direction, distance } = {}, prev = null) {
  const name = String(place || "").trim().slice(0, 60);
  if (!name) return { place: null, added: false };
  const hit = findPlace(map, places, name);
  if (hit) return { place: { name: hit.name, x: hit.x, y: hit.y }, added: false };
  const anchor = findPlace(map, places, near) || prev || { x: W / 2, y: H / 2 };
  const r = rng(name);
  const d = DIST[distance] || DIST.moyen;
  let best = null;
  for (let i = 0; i < 24; i++) {
    const [dx, dy] = DIRS[direction] || (() => { const a = r() * Math.PI * 2; return [Math.cos(a), Math.sin(a)]; })();
    const k = d * (0.8 + r() * 0.4), j = (r() - 0.5) * d * 0.5;
    const x = Math.round(Math.min(W - 20, Math.max(20, anchor.x + dx * k - dy * j)));
    const y = Math.round(Math.min(H - 20, Math.max(20, anchor.y + dy * k + dx * j)));
    best = { name, x, y };
    if (isLand(map, x, y)) break;
  }
  return { place: best, added: true };
}

// ---------------------------------------------------------------- Dessin
const f1 = (n) => Math.round(n * 10) / 10;
/** Côte irrégulière : déplacement du point médian, reproductible. */
function roughen(poly, r, depth = 4, closed = true) {
  let pts = poly.map((p) => [...p]);
  for (let d = 0; d < depth; d++) {
    const out = [];
    const m = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < m; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      out.push(a);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const edge = (a[0] <= -5 && b[0] <= -5) || (a[0] >= W + 5 && b[0] >= W + 5) || (a[1] <= -5 && b[1] <= -5) || (a[1] >= H + 5 && b[1] >= H + 5);
      const off = edge ? 0 : (r() - 0.5) * len * 0.32;
      out.push([(a[0] + b[0]) / 2 - ((b[1] - a[1]) / (len || 1)) * off, (a[1] + b[1]) / 2 + ((b[0] - a[0]) / (len || 1)) * off]);
    }
    if (!closed) out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}
const pathOf = (pts, closed = true) => "M" + pts.map((p) => `${f1(p[0])},${f1(p[1])}`).join("L") + (closed ? "Z" : "");
const smooth = (pts) => {
  let d = `M${f1(pts[0][0])},${f1(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; d += ` Q${f1(a[0])},${f1(a[1])} ${f1((a[0] + b[0]) / 2)},${f1((a[1] + b[1]) / 2)}`; }
  return d + ` L${f1(pts.at(-1)[0])},${f1(pts.at(-1)[1])}`;
};
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const cache = new Map();
/** Fond de carte (sans les marqueurs), mis en cache. */
function baseLayer(map) {
  const key = map.id + ":" + hashStr(JSON.stringify(map.land));
  if (cache.has(key)) return cache.get(key);
  const r = rng(key);
  const coasts = [...map.land, ...map.islands].map((p) => pathOf(roughen(p, r, p.length > 10 ? 4 : 3)));
  const coast = coasts.join(" ");
  const g = [];
  g.push(`<defs>
    <radialGradient id="atl-sea" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="#a9c0c2"/><stop offset="1" stop-color="#6f8f97"/></radialGradient>
    <radialGradient id="atl-land" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#efe2bf"/><stop offset="1" stop-color="#d7c08f"/></radialGradient>
    <radialGradient id="atl-vig" cx="50%" cy="50%" r="72%"><stop offset=".6" stop-color="#3b2a12" stop-opacity="0"/><stop offset="1" stop-color="#3b2a12" stop-opacity=".45"/></radialGradient>
    <filter id="atl-fog" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14"/></filter>
    <pattern id="atl-waves" width="46" height="26" patternUnits="userSpaceOnUse"><path d="M3 14 q5 -5 10 0 t10 0" fill="none" stroke="#4d6a72" stroke-width="1" opacity=".45"/><path d="M26 3 q4 -4 8 0" fill="none" stroke="#4d6a72" stroke-width="1" opacity=".35"/></pattern>
    <clipPath id="atl-landclip"><path d="${coast}"/></clipPath>
  </defs>`);
  g.push(`<rect x="-50" y="-50" width="${W + 100}" height="${H + 100}" fill="url(#atl-sea)"/><rect x="-50" y="-50" width="${W + 100}" height="${H + 100}" fill="url(#atl-waves)"/>`);
  // Lignes de rivage gravées
  for (const [w, o] of [[22, 0.1], [12, 0.16], [5, 0.28]]) g.push(`<path d="${coast}" fill="none" stroke="#3f5c63" stroke-width="${w}" stroke-opacity="${o}" stroke-linejoin="round"/>`);
  g.push(`<path d="${coast}" fill="url(#atl-land)" stroke="#5b4421" stroke-width="1.6" stroke-linejoin="round"/>`);
  g.push(`<g clip-path="url(#atl-landclip)">`);
  // Zones : désert, steppe, marais, collines, forêts
  for (const [x, y, s] of map.desert) {
    g.push(`<ellipse cx="${x}" cy="${y}" rx="${s * 1.3}" ry="${s * 0.8}" fill="#e3c37f" opacity=".55"/>`);
    for (let i = 0; i < s / 2; i++) { const a = r() * 6.28, d = r() * s; g.push(`<circle cx="${f1(x + Math.cos(a) * d * 1.2)}" cy="${f1(y + Math.sin(a) * d * 0.7)}" r=".9" fill="#8c6a2e"/>`); }
    for (let i = 0; i < 4; i++) { const dx = x + (r() - 0.5) * s * 1.6, dy = y + (r() - 0.5) * s * 0.8; g.push(`<path d="M${f1(dx - 12)},${f1(dy)} q12,-7 24,0" fill="none" stroke="#8c6a2e" stroke-width="1"/>`); }
  }
  for (const [x, y, s] of map.steppe) for (let i = 0; i < s / 3; i++) { const dx = x + (r() - 0.5) * s * 2, dy = y + (r() - 0.5) * s; g.push(`<path d="M${f1(dx)},${f1(dy)} l2,-5 M${f1(dx + 3)},${f1(dy)} l0,-6 M${f1(dx + 6)},${f1(dy)} l-2,-5" stroke="#8f8a4c" stroke-width=".9"/>`); }
  for (const [x, y, s] of map.marsh) {
    g.push(`<ellipse cx="${x}" cy="${y}" rx="${s * 1.1}" ry="${s * 0.7}" fill="#8c9a72" opacity=".45"/>`);
    for (let i = 0; i < s / 2.5; i++) { const dx = x + (r() - 0.5) * s * 1.8, dy = y + (r() - 0.5) * s * 1.1; g.push(`<path d="M${f1(dx - 5)},${f1(dy)} h10 M${f1(dx - 2)},${f1(dy)} l-1,-5 M${f1(dx)},${f1(dy)} v-6 M${f1(dx + 2)},${f1(dy)} l1,-5" stroke="#4e5b39" stroke-width=".9"/>`); }
  }
  for (const [x, y, s] of map.hills) for (let i = 0; i < s / 5; i++) { const dx = x + (r() - 0.5) * s * 1.6, dy = y + (r() - 0.5) * s; g.push(`<path d="M${f1(dx - 9)},${f1(dy)} q9,-10 18,0" fill="#d8c48f" stroke="#6b5326" stroke-width="1.1"/>`); }
  for (const [x, y, s] of map.forests) {
    const trees = [];
    for (let i = 0; i < s * 0.9; i++) { const a = r() * 6.28, d = Math.sqrt(r()) * s; trees.push([x + Math.cos(a) * d, y + Math.sin(a) * d * 0.75]); }
    trees.sort((a, b) => a[1] - b[1]);
    for (const [tx, ty] of trees) g.push(`<path d="M${f1(tx)},${f1(ty - 9)} q5,1 5,6 q0,4 -5,4 q-5,0 -5,-4 q0,-5 5,-6z" fill="#7d9558" stroke="#3e5226" stroke-width=".8"/><path d="M${f1(tx)},${f1(ty + 1)} v3" stroke="#3e5226" stroke-width=".9"/>`);
  }
  // Fleuves
  for (const rv of map.rivers) { const pts = roughen(rv, r, 3, false); g.push(`<path d="${smooth(pts)}" fill="none" stroke="#4f7884" stroke-width="2.2" stroke-linecap="round" opacity=".85"/>`); }
  // Montagnes : petits sommets ombrés le long des chaînes
  for (const ch of map.mountains) {
    const peaks = [];
    for (let i = 0; i < ch.length - 1; i++) {
      const [ax, ay] = ch[i], [bx, by] = ch[i + 1], n = Math.max(2, Math.round(Math.hypot(bx - ax, by - ay) / 14));
      for (let k = 0; k < n; k++) for (const side of [-1, 1]) { const t = k / n; peaks.push([ax + (bx - ax) * t + (r() - 0.5) * 10 + side * 7 * r(), ay + (by - ay) * t + (r() - 0.5) * 10 + side * 6 * r(), 9 + r() * 9]); }
    }
    peaks.sort((a, b) => a[1] - b[1]);
    for (const [px, py, s] of peaks) g.push(`<path d="M${f1(px - s)},${f1(py)} L${f1(px)},${f1(py - s * 1.25)} L${f1(px + s)},${f1(py)}Z" fill="#e8d7ae" stroke="#5b4421" stroke-width="1.1" stroke-linejoin="round"/><path d="M${f1(px)},${f1(py - s * 1.25)} L${f1(px + s)},${f1(py)} L${f1(px + s * 0.25)},${f1(py)}Z" fill="#a98d5c" opacity=".7"/>`);
  }
  for (const wl of map.walls) g.push(`<path d="${pathOf(wl, false)}" fill="none" stroke="#5b4421" stroke-width="3.2" stroke-dasharray="5 3"/><path d="${pathOf(wl, false)}" fill="none" stroke="#efe2bf" stroke-width="1" stroke-dasharray="5 3"/>`);
  g.push(`</g>`);
  for (const [x, y, s] of map.fog) g.push(`<ellipse cx="${x}" cy="${y}" rx="${s}" ry="${s * 0.8}" fill="#eef1ef" opacity=".55" filter="url(#atl-fog)"/>`);
  // Rose des vents
  const cx = map.id === "ardyn" ? 70 : 80, cy = map.id === "ardyn" ? 640 : 620;
  g.push(`<g transform="translate(${cx} ${cy})" opacity=".85"><circle r="30" fill="none" stroke="#5b4421" stroke-width="1"/><circle r="24" fill="none" stroke="#5b4421" stroke-width=".5"/>
    <path d="M0,-36 L6,-6 L0,0Z M0,36 L-6,6 L0,0Z M36,0 L6,6 L0,0Z M-36,0 L-6,-6 L0,0Z" fill="#5b4421"/><path d="M0,-36 L-6,-6 L0,0Z M0,36 L6,6 L0,0Z M36,0 L6,-6 L0,0Z M-36,0 L-6,6 L0,0Z" fill="#efe2bf" stroke="#5b4421" stroke-width=".6"/>
    <text y="-41" font-size="12" text-anchor="middle" fill="#5b4421" font-family="Alegreya, Georgia, serif" font-weight="700">N</text></g>`);
  const out = g.join("");
  cache.set(key, out);
  return out;
}

const MARK = {
  capitale: (x, y) => `<g transform="translate(${x} ${y})"><path d="M-6,4 v-8 h3 v3 h2 v-5 h2 v5 h2 v-3 h3 v8z" fill="#7a2f22" stroke="#2c1a0b" stroke-width=".9"/></g>`,
  cité: (x, y) => `<circle cx="${x}" cy="${y}" r="4.2" fill="#7a2f22" stroke="#2c1a0b" stroke-width="1"/>`,
  ville: (x, y) => `<circle cx="${x}" cy="${y}" r="3" fill="#2c1a0b"/>`,
  fort: (x, y) => `<rect x="${x - 3.5}" y="${y - 3.5}" width="7" height="7" fill="#5b4421" stroke="#2c1a0b" stroke-width=".8"/>`,
  ruine: (x, y) => `<path d="M${x - 4},${y + 3} v-6 M${x},${y + 3} v-4 M${x + 4},${y + 3} v-7" stroke="#2c1a0b" stroke-width="1.6"/>`,
  temple: (x, y) => `<path d="M${x - 4},${y + 3} h8 v-4 l-4,-4 l-4,4z" fill="#ece3cd" stroke="#2c1a0b" stroke-width="1"/>`,
};

/**
 * Carte en SVG. opts : places (lieux visités, dans l'ordre), current (nom du lieu actuel),
 * zoom (true = la zone autour du lieu actuel), labels (noms des lieux de base).
 */
export function renderMap(map, { places = [], current = null, zoom = false, labels = true, idp = "m", span = 320 } = {}) {
  const cur = current ? findPlace(map, places, current) : null;
  let vb = `0 0 ${W} ${H}`;
  if (zoom && cur) { const zw = span, zh = span * 0.7; const x = Math.min(W - zw, Math.max(0, cur.x - zw / 2)), y = Math.min(H - zh, Math.max(0, cur.y - zh / 2)); vb = `${f1(x)} ${f1(y)} ${zw} ${zh}`; }
  const k = zoom && cur ? 0.45 : 1; // taille des étiquettes en vue rapprochée
  const g = [baseLayer(map)];
  // Noms des régions
  for (const l of map.labels) g.push(`<text x="${l.x}" y="${l.y}" font-size="${f1(l.s * (zoom ? 0.55 : 1))}" text-anchor="middle" ${l.rot ? `transform="rotate(${l.rot} ${l.x} ${l.y})"` : ""} fill="${l.sea ? "#2f4a52" : "#5b4421"}" opacity="${l.sea ? 0.8 : 0.62}" font-family="Alegreya, Georgia, serif" font-style="${l.it ? "italic" : "normal"}" letter-spacing="${l.it ? 1 : zoom ? 2 : 4}">${esc(l.t)}</text>`);
  if (labels) for (const p of map.places) {
    if (["région", "forêt"].includes(p.kind) && !zoom) continue;
    if (cur && norm(p.name) === norm(cur.name)) { if (MARK[p.kind]) g.push(MARK[p.kind](p.x, p.y)); continue; }
    if (MARK[p.kind]) g.push(MARK[p.kind](p.x, p.y));
    g.push(`<text x="${p.x}" y="${p.y + (MARK[p.kind] ? -8 : 0)}" font-size="${(MARK[p.kind] ? 12 : 11) * (zoom ? 0.6 : 1)}" text-anchor="middle" fill="#2c1a0b" font-family="Alegreya Sans, system-ui, sans-serif" font-style="${MARK[p.kind] ? "normal" : "italic"}" paint-order="stroke" stroke="#efe2bf" stroke-width="3" stroke-linejoin="round">${esc(p.name)}</text>`);
  }
  // Parcours des héros
  const trail = places.filter((p) => p.x != null);
  if (trail.length > 1) g.push(`<path d="${pathOf(trail.map((p) => [p.x, p.y]), false)}" fill="none" stroke="#9b2c1f" stroke-width="${2.2 * k + 0.6}" stroke-dasharray="${6 * k + 1} ${4 * k + 1}" stroke-linecap="round" opacity=".85"/>`);
  for (const p of trail) {
    if (cur && norm(p.name) === norm(cur.name)) continue;
    g.push(`<circle cx="${p.x}" cy="${p.y}" r="${3.2 * k + 0.8}" fill="#9b2c1f" stroke="#efe2bf" stroke-width="1"/>`);
    if (!map.places.some((b) => norm(b.name) === norm(p.name)) || !labels) g.push(`<text x="${p.x}" y="${p.y - 6 * k - 3}" font-size="${11 * (zoom ? 0.75 : 1)}" text-anchor="middle" fill="#5d1a12" font-family="Alegreya Sans, system-ui, sans-serif" font-style="italic" paint-order="stroke" stroke="#efe2bf" stroke-width="3">${esc(p.name)}</text>`);
  }
  if (cur) {
    const s = zoom ? 0.6 : 1;
    g.push(`<g transform="translate(${cur.x} ${cur.y}) scale(${s})">
      <circle r="10" fill="none" stroke="#c0392b" stroke-width="2.5"><animate attributeName="r" values="8;26" dur="2s" repeatCount="indefinite"/><animate attributeName="opacity" values=".9;0" dur="2s" repeatCount="indefinite"/></circle>
      <path d="M0,0 C-3,-8 -11,-12 -11,-21 a11,11 0 0 1 22,0 C11,-12 3,-8 0,0Z" fill="#c0392b" stroke="#2c1a0b" stroke-width="1.4"/><circle cy="-21" r="4.2" fill="#efe2bf"/></g>`);
    g.push(`<text x="${cur.x}" y="${cur.y + (zoom ? 13 : 20)}" font-size="${zoom ? 10 : 15}" font-weight="700" text-anchor="middle" fill="#7a1d12" font-family="Alegreya, Georgia, serif" paint-order="stroke" stroke="#efe2bf" stroke-width="3.5" stroke-linejoin="round">${esc(cur.name)}</text>`);
  }
  g.push(`<rect x="-50" y="-50" width="${W + 100}" height="${H + 100}" fill="url(#atl-vig)" pointer-events="none"/>`);
  if (!zoom) g.push(`<rect x="4" y="4" width="${W - 8}" height="${H - 8}" fill="none" stroke="#5b4421" stroke-width="3"/><rect x="10" y="10" width="${W - 20}" height="${H - 20}" fill="none" stroke="#5b4421" stroke-width="1"/>`);
  // Identifiants uniques : plusieurs cartes peuvent coexister dans la page
  const svg = g.join("").replace(/atl-([a-z]+)/g, `atl-$1-${idp}`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Carte${cur ? " — vous êtes à " + esc(cur.name) : ""}">${svg}</svg>`;
}
