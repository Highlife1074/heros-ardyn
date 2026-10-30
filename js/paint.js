// Peinture numérique : transforme le décor vectoriel en tableau peint (aplats à l'huile, coups de pinceau orientés,
// toile, halo lumineux, étalonnage chaud/froid, vignette). Calculé une fois par scène, dans le navigateur.
import { rng } from "./atlas.js";

const SW = 640, SH = 240;   // résolution de travail
const OUT = 2;              // facteur de sortie (1280 × 480)
const cache = new Map();

function loadSvg(svg, w, h) {
  return new Promise((ok, ko) => {
    const img = new Image();
    img.onload = () => ok(img); img.onerror = () => ko(new Error("Décor illisible"));
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.replace("<svg ", `<svg width="${w}" height="${h}" `));
  });
}
const canvas = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
const idle = () => new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(() => r(), { timeout: 400 }) : setTimeout(r, 30)));

/** Filtre de Kuwahara (rendu « huile ») avec tables de sommes : rapide quelle que soit la taille du pinceau. */
function kuwahara(src, w, h, rad) {
  const W1 = w + 1, n = W1 * (h + 1);
  const SR = new Float64Array(n), SG = new Float64Array(n), SB = new Float64Array(n), SL = new Float64Array(n), SL2 = new Float64Array(n);
  for (let y = 0; y < h; y++) {
    let r = 0, g = 0, b = 0, l = 0, l2 = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, R = src[i], G = src[i + 1], B = src[i + 2], Lu = 0.299 * R + 0.587 * G + 0.114 * B;
      r += R; g += G; b += B; l += Lu; l2 += Lu * Lu;
      const j = (y + 1) * W1 + x + 1, k = y * W1 + x + 1;
      SR[j] = SR[k] + r; SG[j] = SG[k] + g; SB[j] = SB[k] + b; SL[j] = SL[k] + l; SL2[j] = SL2[k] + l2;
    }
  }
  const sum = (A, x0, y0, x1, y1) => A[(y1 + 1) * W1 + x1 + 1] - A[y0 * W1 + x1 + 1] - A[(y1 + 1) * W1 + x0] + A[y0 * W1 + x0];
  const out = new Uint8ClampedArray(src.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let best = Infinity, br = 0, bg = 0, bb = 0;
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x0 = Math.max(0, Math.min(x, x + dx * rad)), x1 = Math.min(w - 1, Math.max(x, x + dx * rad));
      const y0 = Math.max(0, Math.min(y, y + dy * rad)), y1 = Math.min(h - 1, Math.max(y, y + dy * rad));
      const c = (x1 - x0 + 1) * (y1 - y0 + 1), m = sum(SL, x0, y0, x1, y1) / c, v = sum(SL2, x0, y0, x1, y1) / c - m * m;
      if (v < best) { best = v; br = sum(SR, x0, y0, x1, y1) / c; bg = sum(SG, x0, y0, x1, y1) / c; bb = sum(SB, x0, y0, x1, y1) / c; }
    }
    const i = (y * w + x) * 4; out[i] = br; out[i + 1] = bg; out[i + 2] = bb; out[i + 3] = 255;
  }
  return out;
}

/** Étalonnage : contraste doux, saturation, ombres bleutées et lumières dorées. */
function grade(d) {
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    const s = 1.22; r = l + (r - l) * s; g = l + (g - l) * s; b = l + (b - l) * s;
    const c = (v) => { v = Math.min(1, Math.max(0, v)); return v * v * (3 - 2 * v) * 0.35 + v * 0.65; };
    const t = l - 0.5;
    d[i] = c(r + t * 0.06) * 255; d[i + 1] = c(g + t * 0.015) * 255; d[i + 2] = c(b - t * 0.07 + (l < 0.35 ? 0.025 : 0)) * 255;
  }
}

let canvasTex = null;
function texture() {
  if (canvasTex) return canvasTex;
  const c = canvas(256, 256), x = c.getContext("2d"), r = rng("toile"), im = x.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let X = 0; X < 256; X++) {
    const weave = (Math.sin(X * 1.9) + Math.sin(y * 1.9)) * 10, v = 128 + weave + (r() - 0.5) * 70, i = (y * 256 + X) * 4;
    im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255;
  }
  x.putImageData(im, 0, 0);
  return (canvasTex = c);
}

/**
 * Peint le décor : renvoie un canvas 1280 × 480 (même cadrage que le SVG 800 × 300).
 * Le résultat est mis en cache par clé de scène.
 */
export async function paintScene(svg, key) {
  if (cache.has(key)) return cache.get(key);
  const img = await loadSvg(svg, SW, SH);
  const work = canvas(SW, SH), wx = work.getContext("2d", { willReadFrequently: true });
  wx.drawImage(img, 0, 0, SW, SH);
  const raw = wx.getImageData(0, 0, SW, SH);
  await idle();
  const oil = kuwahara(raw.data, SW, SH, 3);
  grade(oil);
  wx.putImageData(new ImageData(oil, SW, SH), 0, 0);
  await idle();

  const OW = SW * OUT, OH = SH * OUT;
  const out = canvas(OW, OH), o = out.getContext("2d");
  o.imageSmoothingQuality = "high"; o.drawImage(work, 0, 0, OW, OH);

  // Coups de pinceau : couleur prise sur le tableau, orientés le long des contours (Sobel)
  const lum = new Float32Array(SW * SH);
  for (let i = 0; i < SW * SH; i++) lum[i] = 0.299 * oil[i * 4] + 0.587 * oil[i * 4 + 1] + 0.114 * oil[i * 4 + 2];
  const L = (x, y) => lum[Math.min(SH - 1, Math.max(0, y)) * SW + Math.min(SW - 1, Math.max(0, x))];
  const r = rng(key);
  o.lineCap = "round";
  for (const [step, size, minEdge, alpha] of [[5, 5.5, 0, 0.55], [3, 3, 18, 0.7], [2, 1.6, 45, 0.8]]) {
    for (let y = 0; y < SH; y += step) for (let x = 0; x < SW; x += step) {
      const px = Math.min(SW - 1, Math.round(x + (r() - 0.5) * step)), py = Math.min(SH - 1, Math.round(y + (r() - 0.5) * step));
      const gx = L(px + 1, py - 1) + 2 * L(px + 1, py) + L(px + 1, py + 1) - L(px - 1, py - 1) - 2 * L(px - 1, py) - L(px - 1, py + 1);
      const gy = L(px - 1, py + 1) + 2 * L(px, py + 1) + L(px + 1, py + 1) - L(px - 1, py - 1) - 2 * L(px, py - 1) - L(px + 1, py - 1);
      const edge = Math.hypot(gx, gy);
      if (edge < minEdge) continue;
      const a = edge > 8 ? Math.atan2(gy, gx) + Math.PI / 2 : (r() - 0.5) * 0.7;
      const i = (py * SW + px) * 4, k = 1 + (r() - 0.5) * 0.12;
      o.strokeStyle = `rgba(${oil[i] * k | 0},${oil[i + 1] * k | 0},${oil[i + 2] * k | 0},${alpha})`;
      o.lineWidth = size * OUT * (0.7 + r() * 0.5);
      const len = size * OUT * (1.2 + r() * 1.4), cx = px * OUT, cy = py * OUT, dx = Math.cos(a) * len / 2, dy = Math.sin(a) * len / 2;
      o.beginPath(); o.moveTo(cx - dx, cy - dy); o.quadraticCurveTo(cx + dy * 0.2, cy - dx * 0.2, cx + dx, cy + dy); o.stroke();
    }
    await idle();
  }

  // Halo : les zones claires débordent doucement (flou obtenu par réduction puis agrandissement)
  const tiny = canvas(80, 30), tx = tiny.getContext("2d", { willReadFrequently: true });
  tx.drawImage(out, 0, 0, 80, 30);
  const td = tx.getImageData(0, 0, 80, 30);
  for (let i = 0; i < td.data.length; i += 4) { const l = (td.data[i] + td.data[i + 1] + td.data[i + 2]) / 3, k = Math.max(0, (l - 150) / 105); td.data[i] *= k; td.data[i + 1] *= k; td.data[i + 2] *= k; }
  tx.putImageData(td, 0, 0);
  o.save(); o.globalCompositeOperation = "screen"; o.globalAlpha = 0.55; o.imageSmoothingQuality = "high"; o.drawImage(tiny, 0, 0, OW, OH); o.restore();

  // Toile
  o.save(); o.globalCompositeOperation = "overlay"; o.globalAlpha = 0.16; o.fillStyle = o.createPattern(texture(), "repeat"); o.fillRect(0, 0, OW, OH); o.restore();
  // Vignette
  const v = o.createRadialGradient(OW / 2, OH * 0.45, OH * 0.35, OW / 2, OH * 0.45, OW * 0.62);
  v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(8,5,2,.55)");
  o.fillStyle = v; o.fillRect(0, 0, OW, OH);

  cache.set(key, out);
  if (cache.size > 8) cache.delete(cache.keys().next().value);
  return out;
}

/** Copie d'un tableau déjà peint (un même canvas ne peut pas être affiché à deux endroits). */
export function cloneCanvas(src) { const c = canvas(src.width, src.height); c.getContext("2d").drawImage(src, 0, 0); return c; }
