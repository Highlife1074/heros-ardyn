// Écran de table : une tablette ou une TV posée au milieu. Gros texte, lecture à voix haute, dés de tout le monde.
import { S, go, activeChars, MOOD_ICON } from "./core.js";
import { h } from "./ui.js";
import { renderEntry, speak, setSpeak, speakEnabled } from "./table.js";
import { animateRoll } from "./dice3d.js";
import { derive } from "./engine.js";

export function renderScreen(ctx) {
  document.body.classList.add("screen-mode");
  ctx.addCleanup(() => document.body.classList.remove("screen-mode"));
  const title = h("h1"); const mood = h("span", { class: "muted" });
  const narr = h("div", { class: "narration", role: "log", "aria-live": "polite" });
  const strip = h("div", { class: "party-strip" });
  const combat = h("div", { class: "initiative hidden", style: { padding: "10px 6vw" } });
  const wake = h("button", { class: "btn small", title: "Garder l'écran allumé" }, "☀️ Écran allumé");
  const voice = h("button", { class: "btn small", "aria-pressed": String(speakEnabled()) }, speakEnabled() ? "🔊 Voix du MJ" : "🔈 Voix du MJ");
  voice.onclick = () => { setSpeak(!speakEnabled()); voice.textContent = speakEnabled() ? "🔊 Voix du MJ" : "🔈 Voix du MJ"; if (speakEnabled()) speak("La voix du Maître du Jeu est activée."); };
  let lock = null;
  wake.onclick = async () => { try { lock = await navigator.wakeLock?.request("screen"); wake.textContent = "☀️ Activé"; } catch { wake.textContent = "Non disponible"; } };
  ctx.addCleanup(() => lock?.release?.());
  ctx.mount(h("div", { class: "screen" },
    h("div", { class: "screen-title" }, h("div", {}, title, mood), h("div", { class: "row" }, voice, wake, h("button", { class: "btn small", onclick: () => document.documentElement.requestFullscreen?.() }, "Plein écran"),
      h("button", { class: "btn small", onclick: () => go(`#/c/${S.cid}`) }, "Quitter"))),
    h("div", { style: { display: "flex", flexDirection: "column", minHeight: 0 } }, combat, narr), strip));

  const draw = (fresh = []) => {
    const c = S.campaign; if (!c) return;
    const sc = c.state?.scene || {};
    title.textContent = sc.title || c.name; mood.textContent = `${MOOD_ICON[sc.mood] || ""} ${sc.location || ""}`;
    const shown = S.log.filter((e) => e.type !== "ooc").slice(-30);
    narr.replaceChildren(...shown.map(renderEntry), c.state?.gmBusy ? h("div", { class: "gm-thinking" }, "Le Maître du Jeu réfléchit") : null);
    narr.scrollTop = narr.scrollHeight;
    strip.replaceChildren(...activeChars().map((ch) => { const d = derive(S.rules, ch); const pct = Math.max(0, (ch.hp.current / ch.hp.max) * 100);
      return h("div", { class: "pc-card" }, h("b", {}, `${ch.portrait || ""} ${ch.name}`), h("div", { class: "small muted" }, `CA ${d.ac} · ${ch.hp.current}/${ch.hp.max} PV`),
        h("div", { class: "hpbar", style: { marginTop: "6px" } }, h("i", { class: pct < 35 ? "low" : "", style: { width: pct + "%" } }))); }));
    const cb = c.state?.combat;
    combat.classList.toggle("hidden", !cb?.active);
    if (cb?.active) combat.replaceChildren(...(cb.order || []).map((o, i) => h("div", { class: `init-tok ${o.kind}${i === cb.turn ? " current" : ""}` }, h("span", { class: "n" }, o.name), h("span", {}, o.init ?? "…"), o.kind === "npc" ? h("div", { class: "small muted" }, o.status) : null)));
    for (const e of fresh) {
      if (e.type === "gm") speak(e.text);
      if (e.type === "roll" && e.roll?.groups) animateRoll(e.roll, `${e.authorName} — ${e.label}`);
    }
  };
  ctx.addCleanup(ctx.onChange((w) => draw(w?.type === "log" ? w.fresh : [])));
  draw();
}
