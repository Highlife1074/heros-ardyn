// Dés 3D : purement visuels. Le serveur a DÉJÀ tiré le résultat ; l'animation atterrit sur ces valeurs.
let box = null; let loading = null; let enabled = localStorage.getItem("dice3d") !== "off";
const stage = () => document.getElementById("dice-stage");
const resultEl = () => document.getElementById("dice-result");

export const dice3dEnabled = () => enabled;
export function setDice3d(on) { enabled = on; try { localStorage.setItem("dice3d", on ? "on" : "off"); } catch {} }

async function ensureBox() {
  if (box) return box;
  if (!loading) loading = (async () => {
    const { default: DiceBox } = await import("../vendor/dice/dice-box-threejs.es.js");
    const b = new DiceBox("#dice-stage", {
      assetPath: new URL("../vendor/dice/", import.meta.url).href, theme_surface: "blue-felt", theme_material: "metal", theme_colorset: "bronze",
      shadows: true, sounds: false, gravity_multiplier: 400, baseScale: 90, strength: 1.4, light_intensity: 0.9,
    });
    await b.initialize();
    box = b; return b;
  })().catch((e) => { console.warn("Dés 3D indisponibles", e); enabled = false; return null; });
  return loading;
}

/** Notation forcée pour la boîte : "2d20@14,7+1d6@3" à partir des groupes renvoyés par le serveur. */
function forcedNotation(groups) {
  return groups.filter((g) => [4, 6, 8, 10, 12, 20, 100].includes(g.sides) && g.values.length <= 12)
    .map((g) => `${g.values.length}d${g.sides}@${g.values.join(",")}`).join("+");
}

function showTotal(roll, label) {
  const el = resultEl();
  el.className = "on" + (roll.crit ? " crit" : roll.fumble ? " fumble" : "");
  el.innerHTML = `<div class="total">${roll.total}</div><div class="lbl">${label ? label.replace(/</g, "&lt;") : ""}${roll.crit ? " · 20 naturel !" : roll.fumble ? " · 1 naturel…" : ""}</div>`;
  if (navigator.vibrate) navigator.vibrate(roll.crit ? [40, 60, 40] : 30);
  setTimeout(() => (el.className = ""), 2200);
}

export async function animateRoll(roll, label) {
  const notation = forcedNotation(roll.groups || []);
  if (enabled && notation && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const b = await ensureBox();
    if (b) {
      stage().classList.add("on");
      try { await Promise.race([b.roll(notation), new Promise((r) => setTimeout(r, 4500))]); } catch (e) { console.warn(e); }
      showTotal(roll, label);
      setTimeout(() => { stage().classList.remove("on"); try { b.clearDice?.(); } catch {} }, 1800);
      return;
    }
  }
  showTotal(roll, label);
}

/** Pré-chargement discret pour que le premier jet soit fluide. */
export function warmDice() { if (enabled) setTimeout(() => ensureBox(), 1500); }
