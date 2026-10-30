// Bandeau de scène illustré : décor animé, mini-carte de la zone, carte du monde et ambiance sonore.
import { S, MOOD_ICON } from "./core.js";
import { h, modal } from "./ui.js";
import { renderScenery, sceneParams, SETTINGS, TIMES, WEATHERS } from "./scenery.js";
import { mapFor, renderMap } from "./atlas.js";
import { setAmbience, cycleAmbience, ambienceLevel, AMB_ICON, AMB_LABEL, stopAll } from "./ambience.js";

let uid = 0;
/** La carte de la campagne (null tant que le monde lié n'est pas chargé). */
export function campaignMap() {
  const c = S.campaign; if (!c) return null;
  if (c.worldId && !S.world) return null;
  return mapFor(S.world, S.cid);
}

export function sceneCard({ big = false } = {}) {
  const n = ++uid;
  let compact = false;
  try { compact = !big && localStorage.getItem("sceneCompact") === "1"; } catch {}
  const art = h("div", { class: "art", "aria-hidden": "true" });
  const name = h("div", { class: "name" }); const sub = h("div", { class: "sub" });
  const mini = h("button", { class: "minimap", title: "Ouvrir la carte du monde", "aria-label": "Carte du monde" });
  const ambBtn = h("button", { class: "scene-tool", title: AMB_LABEL[ambienceLevel()], "aria-label": AMB_LABEL[ambienceLevel()] }, AMB_ICON[ambienceLevel()]);
  const mapBtn = h("button", { class: "scene-tool", title: "Carte du monde", "aria-label": "Carte du monde" }, "🧭");
  const sizeBtn = big ? null : h("button", { class: "scene-tool", title: "Agrandir ou réduire l'illustration", "aria-label": "Taille de l'illustration" }, compact ? "▾" : "▴");
  const el = h("section", { class: "scene-card" + (big ? " big" : "") + (compact ? " compact" : ""), "aria-label": "Scène" },
    art, h("div", { class: "cap" }, name, sub), mini, h("div", { class: "scene-tools" }, ambBtn, mapBtn, sizeBtn));
  ambBtn.onclick = () => { const l = cycleAmbience(); ambBtn.textContent = AMB_ICON[l]; ambBtn.title = AMB_LABEL[l]; ambBtn.setAttribute("aria-label", AMB_LABEL[l]); setAmbience(S.campaign?.state?.scene); };
  mapBtn.onclick = mini.onclick = () => openMap();
  if (sizeBtn) sizeBtn.onclick = () => { compact = !compact; el.classList.toggle("compact", compact); sizeBtn.textContent = compact ? "▾" : "▴"; try { localStorage.setItem("sceneCompact", compact ? "1" : "0"); } catch {} };

  let artKey = "", mapKey = "";
  function update() {
    const c = S.campaign; if (!c) return;
    const sc = c.state?.scene || {};
    const p = sceneParams(sc);
    name.textContent = sc.title || "Avant l'aventure";
    sub.textContent = [MOOD_ICON[sc.mood] || "", sc.location || sc.place || "", sc.title ? `· ${SETTINGS[p.setting]}, ${TIMES[p.time].toLowerCase()}${p.weather !== "clair" ? ", " + WEATHERS[p.weather].toLowerCase() : ""}` : ""].filter(Boolean).join(" ");
    // On ne redessine que si la scène change, pour ne pas relancer les animations
    const k = JSON.stringify([sc.title, sc.location, p.setting, p.time, p.weather, p.mood]);
    if (k !== artKey) { artKey = k; art.innerHTML = renderScenery(sc, `sc${n}`); }
    const map = campaignMap();
    const places = c.state?.places || [];
    const mk = JSON.stringify([map?.id, S.world?.id, sc.place, places.length]);
    if (mk !== mapKey) { mapKey = mk; mini.innerHTML = map && sc.place ? renderMap(map, { places, current: sc.place, zoom: true, span: 240, idp: `mm${n}` }) : ""; mini.classList.toggle("hidden", !(map && sc.place)); }
    setAmbience(sc);
  }
  return { el, update, stop: stopAll };
}

/** Carte du monde en grand : la zone autour des héros, ou tout le monde avec leur parcours. */
export function openMap() {
  const map = campaignMap();
  if (!map) { modal("Carte du monde", h("p", { class: "muted" }, "Le monde est en cours de chargement…")); return; }
  const st = S.campaign?.state || {};
  const places = st.places || [];
  const current = st.scene?.place || null;
  let zoom = !!current;
  const view = h("div", { class: "map-view" });
  const tabs = h("div", { class: "chips" });
  const draw = () => {
    view.innerHTML = renderMap(map, { places, current, zoom, idp: "big" });
    tabs.replaceChildren(...[[true, "🔎 La zone"], [false, "🌍 Le monde"]].map(([z, l]) => h("button", { class: "chip", "aria-pressed": String(zoom === z), disabled: z && !current, onclick: () => { zoom = z; draw(); } }, l)));
  };
  draw();
  const body = h("div", { class: "stack" }, tabs, view,
    current ? h("p", { class: "small" }, "📍 Vous êtes ici : ", h("b", {}, current)) : h("p", { class: "small muted" }, "Le MJ n'a pas encore situé la scène sur la carte : elle apparaîtra au prochain changement de lieu."),
    places.length > 1 ? h("p", { class: "small muted" }, "Parcours : ", places.map((p) => p.name).join(" → ")) : null,
    map.id === "ardyn" ? h("p", { class: "small muted" }, "Carte d'Ardyn tracée d'après la bible du monde.") : h("p", { class: "small muted" }, "Carte générée pour ce monde ; les lieux visités s'y ajoutent au fil de l'aventure."));
  modal(map.name ? `Carte d'${map.name}` : "Carte du monde", body);
  document.querySelector(".modal-wrap:last-of-type .modal")?.classList.add("wide");
}
