import { S, fn, go, myChar, isHost, activeChars, postMessage, KIND_FR, MOOD_ICON, PLATFORM } from "./core.js";
import { h, md, toast, busy, errMsg, modal, topbar, toggleTheme } from "./ui.js";
import { doRoll } from "./actions.js";
import { renderSheet } from "./sheet.js";
import { derive, statusFromHp, fmtMod } from "./engine.js";
import { codexList } from "./world.js";
import { micButton } from "./voice.js";
import { whoseTurn } from "./turnlogic.js";
import { setAmbiance, guessAmbiance, setAmbienceEnabled, ambienceEnabled, setAmbienceVolume, AMBIANCES, wakeAmbience } from "./ambience.js";
import { doc, getDoc } from "../vendor/firebase/firebase-firestore.js";
import { fs } from "./core.js";

const R = () => S.rules;
export { speak, setSpeak, speakEnabled } from "./speech.js";
import { speak, setSpeak, speakEnabled, unlockSpeech, speechSupported } from "./speech.js";

// ---------------------------------------------------------------- Journal
const imgCache = new Map();
function sceneImage(e) {
  const img = h("img", { alt: e.text ? `Illustration : ${e.text}` : "Illustration de la scène", loading: "lazy" });
  const fig = h("figure", { class: "entry scene-img" }, img, e.text ? h("figcaption", {}, e.text) : null);
  const put = (url) => { img.src = url; img.onclick = () => window.open(url, "_blank"); };
  if (imgCache.has(e.imageId)) put(imgCache.get(e.imageId));
  else getDoc(doc(fs, "campaigns", S.cid, "images", e.imageId)).then((d) => { if (d.exists()) { imgCache.set(e.imageId, d.data().data); put(d.data().data); } }).catch(() => fig.remove());
  return fig;
}
export function renderEntry(e) {
  if (e.type === "image") return sceneImage(e);
  if (e.type === "gm") return h("article", { class: "entry gm" }, h("div", { html: md(e.text) }));
  if (e.type === "player") return h("div", { class: "entry player" }, h("div", { class: "who" }, e.portrait || "", h("b", {}, e.authorName), e.playerName && e.playerName !== e.authorName ? `(${e.playerName})` : ""), h("div", { class: "text" }, e.text));
  if (e.type === "ooc") return h("div", { class: "entry ooc" }, `💬 ${e.playerName || e.authorName} : ${e.text}`);
  if (e.type === "roll") {
    const r = e.roll || {};
    const detail = (r.groups || []).map((g) => `${g.values.length}d${g.sides} [${g.values.map((v, i) => (g.kept.includes(i) ? v : `~${v}~`)).join(", ")}]`).join(" + ") + (r.bonus ? ` ${fmtMod(r.bonus)}` : "");
    return h("div", { class: "entry roll" + (e.npc ? " npc" : "") },
      h("div", { class: "die-face" + (r.crit ? " crit" : r.fumble ? " fumble" : "") }, r.list ? "🎲" : r.total),
      h("div", { class: "grow" },
        h("div", { class: "roll-title" }, `${e.portrait || ""} ${e.authorName}`, " — ", e.label),
        h("div", { class: "roll-detail" }, r.list ? `Résultats : ${r.list.join(", ")}` : detail.replace(/~(\d+)~/g, "($1)"),
          r.adv === "adv" ? " · avantage" : r.adv === "dis" ? " · désavantage" : "", e.outcome ? ` · ${e.outcome}` : "", e.damage != null ? ` · ${e.damage} dégâts` : ""),
        e.reason ? h("div", { class: "small muted" }, `« ${e.reason} »`) : null));
  }
  return h("div", { class: "entry system" }, e.text);
}

// ---------------------------------------------------------------- Écran principal
export function renderTable(ctx) {
  let tab = "story";
  const logEl = h("div", { class: "log", role: "log", "aria-live": "polite" });
  const sceneEl = h("div", { class: "scene" });
  const initEl = h("div", { class: "initiative hidden" });
  const reqEl = h("div", { class: "requests" });
  const sideBody = h("div", { class: "side-body" });
  const sideTabs = h("div", { class: "tabs", role: "tablist" });
  let sideTab = "sheet"; let thinkTimer;
  const mainPanel = h("div", { class: "side-body hidden", style: { overflowY: "auto", padding: "14px", flex: 1 } });
  const thinking = h("div", { class: "gm-thinking hidden" }, "Le Maître du Jeu réfléchit");
  const keyWarn = h("div", { class: "request other hidden" });
  const errBox = h("div", { class: "request other hidden", style: { borderColor: "var(--blood)" } });
  const turnBar = h("div", { class: "turnbar hidden", "aria-live": "polite" });

  // Composer
  const input = h("textarea", { rows: 1, maxlength: 2000, placeholder: "Que fait ton héros ?", "aria-label": "Ton action. Décrivez vos actions chacun votre tour, puis « Au MJ »." });
  let ooc = false;
  const oocBtn = h("button", { class: "btn small ghost mode", title: "Basculer entre parler en jeu et hors-jeu", "aria-pressed": "false" }, "🎭 En jeu");
  oocBtn.onclick = () => { ooc = !ooc; oocBtn.textContent = ooc ? "💬 Hors-jeu" : "🎭 En jeu"; oocBtn.setAttribute("aria-pressed", String(ooc)); renderTurn(); };
  const sendBtn = h("button", { class: "btn", title: "Envoyer sans réveiller le MJ (pour laisser les autres joueurs agir d'abord)" }, "Envoyer sans le MJ");
  const gmBtn = h("button", { class: "btn primary gm-btn", title: "Envoyer et demander au MJ de répondre" }, "🐉 Au MJ");
  const diceBtn = h("button", { class: "icon-btn", title: "Lancer des dés libres", "aria-label": "Dés libres" }, "🎲");
  input.addEventListener("input", () => { input.style.height = "auto"; input.style.height = Math.min(140, input.scrollHeight) + "px"; });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && window.innerWidth > 700) { e.preventDefault(); gmBtn.click(); } });
  const callGm = async () => {
    if (!PLATFORM.apiKey && !S.campaign?.settings?.externalGm) { toast(isHost() ? "Saisis d'abord la clé Claude dans ⚙️." : "L'hôte doit d'abord saisir la clé Claude.", "error"); return; }
    const r = await fn("askGm", { campaignId: S.cid }); if (r.queued) toast("Le MJ termine une réponse, il enchaîne juste après."); if (r.external) toast("C'est noté : le MJ (Claude) va répondre dès que l'hôte le lance.");
  };
  const clearInput = () => { input.value = ""; input.style.height = "auto"; };
  const send = async (askGm) => {
    const text = input.value.trim();
    const t = turnNow();
    // Hors-jeu : toujours permis, ne réveille jamais le MJ
    if (ooc) { if (!text) return toast("Écris ton message."); await postMessage(text, true); clearInput(); return; }
    // Tour de table / combat : seul le héros dont c'est le tour joue, puis la main passe
    if (t.mode === "round" || t.mode === "combat") {
      const me = myChar();
      if (!me || me.id !== t.charId) return toast(`Ce n'est pas ton tour : c'est à ${S.chars[t.charId]?.name || "un autre héros"}.`, "error");
      if (!text) return toast("Décris ce que fait ton héros, ou passe ton tour.");
      const r = await fn("submitTurn", { campaignId: S.cid, text }); clearInput();
      if (r.callGm) await callGm();
      return;
    }
    if (t.mode === "gm" && !isHost()) return toast("Les adversaires agissent : attends que le MJ te rende la main.");
    if (text) { await postMessage(text, false); clearInput(); }
    if (askGm) await callGm();
    else if (!text) toast("Écris d'abord ce que fait ton héros.");
  };
  sendBtn.onclick = busy(sendBtn, () => send(false));
  gmBtn.onclick = busy(gmBtn, () => { unlockSpeech(); return send(true); });
  diceBtn.onclick = freeDice;
  sendBtn.className = "btn small ghost";
  const composer = h("div", { class: "composer" }, h("div", { class: "inner" }, diceBtn, micButton(input), input, gmBtn),
    h("div", { class: "sub" }, oocBtn, h("span", { class: "grow" }), sendBtn));

  const bottom = h("nav", { class: "bottomnav", "aria-label": "Sections" });
  const tabsDef = [["story", "📜", "Récit"], ["sheet", "🛡️", "Fiche"], ["party", "👥", "Groupe"], ["journal", "📖", "Carnet"]];

  const titleEl = h("span", { class: "title grow" });
  const hostBtn = h("button", { class: "icon-btn hidden", title: "Réglages de l'hôte", "aria-label": "Réglages", onclick: () => go(`#/c/${S.cid}/host`) }, "⚙️");
  const ttsBtn = h("button", { class: "icon-btn", title: "Voix du MJ : lire ses réponses à voix haute", "aria-label": "Voix du MJ", "aria-pressed": String(speakEnabled()) }, speakEnabled() ? "🔊" : "🔈");
  ttsBtn.onclick = () => {
    if (!speechSupported()) return toast("Ce navigateur ne sait pas lire à voix haute.", "error");
    setSpeak(!speakEnabled()); ttsBtn.textContent = speakEnabled() ? "🔊" : "🔈"; ttsBtn.setAttribute("aria-pressed", String(speakEnabled()));
    toast(speakEnabled() ? "Voix du MJ activée sur cet appareil." : "Voix du MJ coupée.");
  };

  const ambBtn = h("button", { class: "icon-btn", title: "Ambiance sonore", "aria-label": "Ambiance sonore", "aria-pressed": String(ambienceEnabled()) }, ambienceEnabled() ? "🎵" : "🔇");
  ambBtn.onclick = () => ambienceMenu(ambBtn);
  const main = h("div", { class: "game-main" }, sceneEl, initEl, logEl, mainPanel, reqEl, keyWarn, errBox, thinking, turnBar, composer, bottom);
  ctx.mount(
    topbar(h("button", { class: "icon-btn", "aria-label": "Retour aux campagnes", onclick: () => go("#/") }, "‹"), titleEl,
      ttsBtn, ambBtn, h("button", { class: "icon-btn", title: "Le monde : codex, cadre et bible", "aria-label": "Le monde", onclick: () => go(`#/c/${S.cid}/world`) }, "🗺️"),
      h("button", { class: "icon-btn", title: "Écran de table (tablette ou TV au centre)", "aria-label": "Écran de table", onclick: () => go(`#/c/${S.cid}/screen`) }, "📺"),
      hostBtn, h("button", { class: "icon-btn", "aria-label": "Thème", onclick: toggleTheme }, "🌓")),
    h("div", { class: "game" }, main, h("aside", { class: "side" }, sideTabs, sideBody)));

  function renderTabs() {
    bottom.replaceChildren(...tabsDef.map(([k, ic, l]) => h("button", { "aria-current": tab === k ? "page" : null, onclick: () => { tab = k; renderAll(); } }, h("span", { class: "ic" }, ic), l)));
    sideTabs.replaceChildren(...tabsDef.slice(1).map(([k, , l]) => h("button", { role: "tab", "aria-selected": String(sideTab === k), onclick: () => { sideTab = k; renderSide(); renderTabs(); } }, l)));
  }

  function renderScene() {
    const c = S.campaign; const sc = c.state?.scene || {};
    titleEl.textContent = c.name;
    setAmbiance(guessAmbiance(sc));
    hostBtn.classList.toggle("hidden", !isHost());
    sceneEl.replaceChildren(h("span", {}, MOOD_ICON[sc.mood] || "🗺️"), h("span", { class: "name" }, sc.title || "Avant l'aventure"), sc.location ? h("span", { class: "mood" }, sc.location) : null);
    const imgWarn = isHost() && c.state?.imageWarning;
    errBox.classList.toggle("hidden", !S.lastError && !imgWarn);
    if (!S.lastError && imgWarn) errBox.replaceChildren(h("div", { class: "what small" }, "🖼️ " + imgWarn));
    if (S.lastError) errBox.replaceChildren(h("div", { class: "what small" }, "⚠️ " + S.lastError + (/permission|insufficient/i.test(S.lastError) ? " — vérifie que les règles Firestore sont publiées." : "")));
    keyWarn.classList.toggle("hidden", !!PLATFORM.apiKey || !!c.settings?.externalGm);
    keyWarn.replaceChildren(h("div", { class: "what" }, isHost() ? "Le MJ n'a pas encore de clé Claude." : "Le MJ attend que l'hôte saisisse la clé Claude."),
      isHost() ? h("button", { class: "btn small primary", onclick: () => go(`#/c/${S.cid}/host`) }, "Saisir la clé") : null);
    const gmWorking = c.state?.gmBusy && Date.now() - (c.state.gmBusySince || 0) < 120e3;
    const gmWaiting = !!c.settings?.externalGm && !!c.state?.gmWaiting;
    thinking.textContent = gmWaiting ? "Le Maître du Jeu arrive… (en attente de Claude)" : "Le Maître du Jeu réfléchit";
    thinking.classList.toggle("hidden", !gmWorking && !gmWaiting);
    clearTimeout(thinkTimer);
    if (gmWorking) thinkTimer = setTimeout(renderScene, 125e3 - (Date.now() - (c.state.gmBusySince || 0))); // se masque tout seul si le MJ a été interrompu
    const cb = c.state?.combat;
    initEl.classList.toggle("hidden", !cb?.active);
    if (cb?.active) {
      initEl.replaceChildren(h("span", { class: "small muted", style: { alignSelf: "center", whiteSpace: "nowrap" } }, `Round ${cb.round}`),
        ...(cb.order || []).map((o, i) => {
          const ch = o.characterId ? S.chars[o.characterId] : null;
          const st = ch ? (ch.hp.current <= 0 ? "À terre" : `${ch.hp.current}/${ch.hp.max} PV`) : o.status;
          const down = ch ? ch.alive === false : /Vaincu/.test(o.status || "");
          return h("div", { class: `init-tok ${o.kind}${i === cb.turn ? " current" : ""}${down ? " down" : ""}` }, h("span", { class: "n" }, o.name), h("span", {}, o.init ?? "…"), h("div", { class: "small muted" }, st, (o.conditions || []).length ? " · " + o.conditions.join(", ") : ""));
        }));
    }
    // Demandes de jets
    const me = myChar();
    reqEl.replaceChildren(...(c.state?.pendingRolls || []).map((p) => {
      const mine = me && p.characterId === me.id; const canHost = isHost() && !mine;
      const label = `${KIND_FR[p.kind] || "Jet"}${p.skill ? " de " + (R().skills[p.skill]?.nameFr || p.skill) : p.ability ? " (" + p.ability.toUpperCase() + ")" : ""}${p.advantage === "adv" ? " avec avantage" : p.advantage === "dis" ? " avec désavantage" : ""}`;
      const btn = h("button", { class: mine ? "btn primary" : "btn small" }, mine ? "🎲 Lancer" : "Lancer pour lui");
      btn.onclick = busy(btn, async () => {
        let weaponId;
        if (p.kind === "attack") { weaponId = await pickWeapon(S.chars[p.characterId]); if (!weaponId) return; }
        await doRoll({ characterId: p.characterId, requestId: p.id, kind: p.kind, weaponId }, p.label);
      });
      return h("div", { class: "request" + (mine ? "" : " other") }, h("div", { class: "what" }, h("b", {}, mine ? p.label : `${p.characterName} : ${p.label}`), h("div", { class: "small muted" }, label)), mine || canHost ? btn : h("span", { class: "small muted" }, "en attente…"));
    }));
  }

  function turnNow() { return S.campaign ? whoseTurn(S.campaign, Object.values(S.chars)) : { mode: "free" }; }

  /** Bandeau « à qui le tour » + verrouillage de la zone de texte pour les autres. */
  function renderTurn() {
    const t = turnNow(); const me = myChar(); const host = isHost();
    const cur = S.chars[t.charId];
    const myTurn = !!(me && cur && me.id === cur.id);
    const turnBased = t.mode === "round" || t.mode === "combat";
    turnBar.classList.toggle("hidden", !(turnBased || t.mode === "gm" || (t.waitingRolls && S.campaign.settings?.turnMode !== "free")));
    const chips = [];
    if (t.mode === "round") {
      const r = t.round;
      chips.push(h("div", { class: "turn-chips" }, ...r.order.map((id, i) => {
        const c = S.chars[id]; if (!c) return null;
        const st = i < r.idx ? "done" : i === r.idx ? "now" : "next";
        return h("span", { class: `turn-chip ${st}` }, st === "done" ? "✓ " : st === "now" ? "▶ " : "", c.portrait || "", " ", c.name);
      })));
    }
    let label;
    if (t.mode === "round") label = myTurn ? h("b", {}, `🎯 À toi de jouer, ${cur.name} !`) : h("span", {}, `⏳ Tour de table : au tour de `, h("b", {}, cur?.name || "?"), cur ? ` (${cur.ownerName})` : "");
    else if (t.mode === "combat") label = myTurn ? h("b", {}, `⚔️ À toi d'agir, ${cur.name} !`) : h("span", {}, `⚔️ Combat : au tour de `, h("b", {}, cur?.name || "?"));
    else if (t.mode === "gm") label = h("span", {}, "⚔️ Les adversaires agissent : le MJ a la main.");
    else if (t.waitingRolls) label = h("span", {}, "🎲 Lancez d'abord les dés demandés : le MJ reprendra ensuite.");
    const actions = [];
    if (turnBased && myTurn) actions.push(btnPass("Passer mon tour"));
    if (turnBased && host && !myTurn && cur) actions.push(btnPass(`Passer ${cur.name}`, true));
    if (t.mode === "round" && host) actions.push(h("button", { class: "btn small", onclick: busyFn(async () => { const r = await fn("closeRound", { campaignId: S.cid }); if (r.callGm) await callGm(); }) }, "Clore le tour"));
    if (t.mode === "gm" && host) actions.push(h("button", { class: "btn small", onclick: busyFn(callGm) }, "Relancer le MJ"));
    turnBar.replaceChildren(h("div", { class: "turn-line" }, h("div", { class: "grow" }, label), ...actions), ...chips);
    // Zone de texte : ouverte au joueur dont c'est le tour (le hors-jeu reste toujours possible)
    const locked = !ooc && ((turnBased && !myTurn) || (t.mode === "gm" && !host));
    input.disabled = locked;
    input.placeholder = locked ? (t.mode === "gm" ? "Le MJ joue les adversaires…" : `Au tour de ${cur?.name || "?"} — passe en 💬 hors-jeu pour parler`) : turnBased ? "Décris l'action de ton héros pour ce tour" : "Que fait ton héros ?";
    gmBtn.textContent = turnBased ? "✅ Jouer mon tour" : "🐉 Au MJ";
    gmBtn.disabled = locked;
    sendBtn.classList.toggle("hidden", turnBased || t.mode === "gm");
  }
  function busyFn(f) { return async (e) => { const b = e.currentTarget; b.disabled = true; try { await f(); } catch (err) { toast(errMsg(err), "error"); } finally { b.disabled = false; } }; }
  function btnPass(label, hostSkip = false) {
    return h("button", { class: "btn small", onclick: busyFn(async () => { const r = await fn("submitTurn", { campaignId: S.cid, pass: true, hostSkip }); if (r.callGm) await callGm(); }) }, label);
  }

  let lastCount = 0;
  function renderLog(fresh = []) {
    const nearBottom = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 160;
    const me = myChar();
    const nodes = S.log.map(renderEntry);
    if (!S.log.length) nodes.push(h("div", { class: "entry system" }, h("p", {}, "La table est prête."),
      me ? h("p", {}, "Quand tout le monde a créé son personnage, appuyez sur « 🐉 Au MJ » pour commencer l'aventure.") : null));
    if (!me && S.charsLoaded) nodes.push(h("div", { class: "entry", style: { textAlign: "center" } }, h("button", { class: "btn primary", onclick: () => go(`#/c/${S.cid}/create`) }, "Créer mon personnage")));
    logEl.replaceChildren(...nodes);
    if (nearBottom || S.log.length !== lastCount) logEl.scrollTop = logEl.scrollHeight;
    lastCount = S.log.length;
    for (const e of fresh) if (e.type === "gm") speak(e.text);
  }

  function renderSide() {
    const target = window.innerWidth >= 980 ? sideBody : mainPanel;
    const which = window.innerWidth >= 980 ? sideTab : tab;
    target.replaceChildren(sidePanel(which));
  }

  function renderAll() {
    if (!S.campaign) {
      if (!S.campaignError) return; // pas encore arrivée
      ctx.mount(h("main", { class: "wrap stack" }, h("h2", {}, "Campagne inaccessible"), h("p", { class: "panel small" }, S.lastError || "Campagne introuvable."),
        h("p", {}, "Si le message parle de permission : vérifie que les règles Firestore sont publiées, et que tu as bien rejoint la campagne avec son code."),
        h("button", { class: "btn", onclick: () => go("#/") }, "Retour"))); return;
    }
    renderScene(); renderTabs(); renderTurn();
    const story = tab === "story" || window.innerWidth >= 980;
    for (const el of [sceneEl, logEl, reqEl, composer]) el.classList.toggle("hidden", !story);
    initEl.classList.toggle("hidden", !story || !S.campaign.state?.combat?.active);
    mainPanel.classList.toggle("hidden", story);
    renderSide();
  }

  let prevReq = new Set();
  const off = ctx.onChange((what) => {
    if (!S.campaign) return renderAll();
    if (what?.type === "log") { renderLog(what.fresh); return; }
    renderAll();
    if (what === "chars" || what === "campaign") renderLog();
    // Vibre quand un jet m'est demandé
    const me = myChar(); const now = new Set((S.campaign.state?.pendingRolls || []).filter((p) => p.characterId === me?.id).map((p) => p.id));
    if ([...now].some((id) => !prevReq.has(id))) { navigator.vibrate?.([60, 40, 60]); }
    prevReq = now;
  });
  ctx.addCleanup(off); ctx.addCleanup(() => clearTimeout(thinkTimer));
  const onVis = () => { if (!document.hidden) wakeAmbience(); };
  document.addEventListener("visibilitychange", onVis); ctx.addCleanup(() => document.removeEventListener("visibilitychange", onVis));
  const onResize = () => S.campaign && renderAll();
  window.addEventListener("resize", onResize); ctx.addCleanup(() => window.removeEventListener("resize", onResize));
  if (S.campaign) { renderAll(); renderLog(); }
}

async function pickWeapon(ch) {
  if (!ch) return undefined;
  const atk = derive(S.rules, ch).attacks;
  if (atk.length === 1) return atk[0].id;
  return modal("Avec quelle arme ?", h("p", { class: "small muted" }, "Choisis l'arme de cette attaque."), [{ label: "Annuler", value: null }, ...atk.map((a) => ({ label: `${a.name} (${fmtMod(a.toHit)})`, class: "btn", value: a.id }))]);
}

function sidePanel(which) {
  if (which === "sheet") {
    const me = myChar();
    if (!me && !S.charsLoaded) return h("p", { class: "muted" }, "Chargement des héros…");
    if (!me) return h("div", { class: "stack" }, h("p", {}, "Tu n'as pas encore de personnage dans cette campagne."), h("button", { class: "btn primary", onclick: () => go(`#/c/${S.cid}/create`) }, "Créer mon personnage"));
    const box = h("div"); renderSheet(box, me, { compact: true }); return box;
  }
  if (which === "party") return partyPanel();
  return journalPanel();
}

function partyPanel() {
  const list = activeChars();
  return h("div", { class: "stack" },
    ...list.map((ch) => {
      const d = derive(S.rules, ch); const pct = Math.max(0, Math.min(100, (ch.hp.current / ch.hp.max) * 100));
      return h("div", { class: "panel", style: { cursor: "pointer" }, onclick: () => go(`#/c/${S.cid}/sheet/${ch.id}`) },
        h("div", { class: "sheet-head" }, h("div", { class: "portrait", style: { width: "48px", height: "48px", fontSize: "1.5rem" } }, ch.portrait || "🛡️"),
          h("div", { class: "grow" }, h("b", {}, ch.name), h("div", { class: "small muted" }, `${S.rules.species[ch.species]?.nameFr} ${S.rules.classes[ch.class]?.nameFr} niv. ${ch.level} · ${ch.ownerName}`)),
          h("div", { style: { textAlign: "right" } }, h("b", {}, `CA ${d.ac}`), h("div", { class: "small muted" }, `${ch.hp.current}/${ch.hp.max} PV`))),
        h("div", { class: "hpbar", style: { marginTop: "8px" } }, h("i", { class: pct < 35 ? "low" : "", style: { width: pct + "%" } })),
        (ch.conditions || []).length || ch.alive === false ? h("div", { class: "small", style: { marginTop: "6px", color: "var(--blood)" } }, ch.alive === false ? "Mort" : ch.conditions.map((c) => S.rules.conditions[c]?.nameFr || c).join(", ")) : null);
    }),
    list.length ? null : h("p", { class: "muted" }, "Aucun héros pour l'instant."),
    h("div", { class: "panel" }, h("h4", {}, "À la table"), h("p", { class: "small" }, Object.values(S.campaign.memberNames || {}).join(", ")),
      h("p", { class: "small muted" }, "Code d'invitation : ", h("b", { style: { letterSpacing: ".15em", color: "var(--bronze)" } }, S.campaign.inviteCode))));
}

function journalPanel() {
  const st = S.campaign.state || {};
  const quests = st.quests || [];
  const icon = { active: "🔸", done: "✅", failed: "✖️" };
  return h("div", { class: "stack" },
    h("section", {}, h("h3", {}, "Quêtes"), quests.length ? h("ul", { class: "list" }, ...quests.map((q) => h("li", {}, `${icon[q.status] || "🔸"} `, h("b", {}, q.title), q.notes ? h("div", { class: "small muted" }, q.notes) : null))) : h("p", { class: "muted" }, "Pas encore de quête.")),
    h("section", {}, h("h3", {}, "Codex du monde"), codexList(S.entries || []), h("button", { class: "btn small", style: { marginTop: "8px" }, onclick: () => go(`#/c/${S.cid}/world`) }, "Ouvrir le monde")),
    h("section", {}, h("h3", {}, "Ce qui s'est passé"), st.summary ? h("div", { class: "desc", style: { color: "var(--vellum)" } }, st.summary) : h("p", { class: "muted" }, "Le résumé s'écrit au fil de la partie.")),
    st.restGrant && Date.now() - st.restGrant.at < 3 * 3600e3 ? h("p", { class: "panel small" }, st.restGrant.type === "long" ? "🌙 Un repos long est en cours : validez-le depuis votre fiche." : "☕ Un repos court est en cours : dépensez vos dés de vie depuis votre fiche.") : null);
}

async function freeDice() {
  const me = myChar();
  const expr = h("input", { type: "text", value: "1d20", "aria-label": "Expression de dés" });
  const reason = h("input", { type: "text", placeholder: "Pourquoi ? (facultatif)", maxlength: 120 });
  const quick = h("div", { class: "chips" }, ...["1d4", "1d6", "1d8", "1d10", "1d12", "1d20", "2d6", "1d100"].map((x) => h("button", { class: "chip", onclick: () => (expr.value = x) }, x)));
  const r = await modal("Jet libre", h("div", {}, h("p", { class: "small muted" }, "Visible par toute la table. Pour un test demandé par le MJ, utilise le bouton « Lancer » qui apparaît au-dessus de la zone de texte."), quick, h("label", {}, "Dés"), expr, h("label", {}, "Raison"), reason),
    [{ label: "Annuler", value: null }, { label: "Lancer", class: "btn primary", value: () => ({ expr: expr.value, reason: reason.value }) }]);
  if (r) await doRoll({ kind: "free", expr: r.expr, label: "Jet libre", reason: r.reason, characterId: me?.id }, r.expr);
}

export { statusFromHp };


/** Menu de l'ambiance : marche/arrêt et volume (réglage propre à chaque appareil). */
export async function ambienceMenu(btn) {
  const vol = h("input", { type: "range", min: 0, max: 100, value: Math.round((parseFloat(localStorage.getItem("ambienceVol") || "0.6")) * 100), "aria-label": "Volume de l'ambiance" });
  vol.oninput = () => setAmbienceVolume(vol.value / 100);
  const sc = S.campaign?.state?.scene || {};
  const r = await modal("Ambiance sonore", h("div", {},
    h("p", {}, "Le fond sonore suit automatiquement les scènes du MJ (forêt, taverne, grotte, combat…)."),
    h("p", { class: "small muted" }, `Scène actuelle : ${AMBIANCES[guessAmbiance(sc)] || "calme"}.`),
    h("label", {}, "Volume"), vol), [{ label: ambienceEnabled() ? "Couper" : "Fermer", value: ambienceEnabled() ? "off" : null }, ...(ambienceEnabled() ? [{ label: "OK", class: "btn primary", value: "ok" }] : [{ label: "Activer", class: "btn primary", value: "on" }])]);
  if (r === "on") { setAmbienceEnabled(true); setAmbiance(guessAmbiance(sc)); }
  if (r === "off") setAmbienceEnabled(false);
  if (btn) { btn.textContent = ambienceEnabled() ? "🎵" : "🔇"; btn.setAttribute("aria-pressed", String(ambienceEnabled())); }
}
