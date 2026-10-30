import { S, fn, go, isHost, activeChars, PLATFORM } from "./core.js";
import { IMAGE_MODELS } from "./illustrate.js";
import { h, toast, busy, errMsg, confirmBox, topbar, modal } from "./ui.js";

const MODELS = [
  ["claude-sonnet-5-5", "Claude Sonnet 5.5 — recommandé (bon équilibre qualité / coût)"],
  ["claude-opus-5-5", "Claude Opus 5.5 — récits les plus riches, plus cher"],
  ["claude-haiku-5-5", "Claude Haiku 5.5 — rapide et économique"],
];

export function renderHost(ctx) {
  const box = h("main", { class: "wrap stack" });
  ctx.mount(topbar(h("button", { class: "icon-btn", "aria-label": "Retour", onclick: () => go(`#/c/${S.cid}`) }, "‹"), h("span", { class: "title" }, "Réglages de la campagne")), box);
  let drawn = false;
  const draw = () => {
    if (!S.campaign) return;
    if (!isHost()) { box.replaceChildren(h("p", {}, "Réservé à l'hôte de la campagne.")); return; }
    if (drawn) { refreshLive(); return; }
    drawn = true;
    const c = S.campaign; const s = c.settings || {};
    const sel = (key, opts) => { const el = h("select", { name: key }, ...opts.map(([v, l]) => h("option", { value: v, selected: String(s[key]) === String(v) }, l))); return el; };
    const f = {
      name: h("input", { type: "text", value: c.name, maxlength: 80 }),
      setting: h("select", {}, ...[["ardyn", "Le monde d'Ardyn"], ["generic", "Fantasy classique"], ["custom", "Mon propre univers"]].map(([v, l]) => h("option", { value: v, selected: c.setting === v }, l))),
      premise: h("textarea", { rows: 3, maxlength: 2000 }, c.premise || ""),
      bible: h("textarea", { rows: 8, maxlength: 60000, placeholder: "Lieux, factions, PNJ, ambiance, choses à éviter…" }, c.bible || ""),
      tone: sel("tone", [["famille", "Famille (dès 10 ans)"], ["ado", "Ados"], ["adulte", "Adultes"]]),
      difficulty: sel("difficulty", [["facile", "Facile"], ["normal", "Normale"], ["difficile", "Difficile"]]),
      narration: sel("narration", [["courte", "Courte"], ["moyenne", "Moyenne"], ["longue", "Longue"]]),
      model: sel("model", MODELS),
      xpMode: sel("xpMode", [["xp", "Points d'expérience"], ["milestone", "Jalons (le MJ décide)"]]),
      hpMethod: sel("hpMethod", [["average", "Valeur moyenne (recommandé)"], ["roll", "Lancer le dé de vie"]]),
      autoGmAfterRolls: sel("autoGmAfterRolls", [["true", "Oui, dès que tous les jets demandés sont faits"], ["false", "Non, attendre qu'on appuie sur « Au MJ »"]]),
      houseRules: h("textarea", { rows: 3, maxlength: 2000, placeholder: "Ex. Les potions se boivent en action bonus. Pas de mort définitive avant le niveau 3." }, s.houseRules || ""),
    };
    const save = h("button", { class: "btn primary" }, "Enregistrer");
    save.onclick = busy(save, async () => {
      await fn("updateCampaign", { campaignId: S.cid, name: f.name.value, premise: f.premise.value,
        settings: { tone: f.tone.value, difficulty: f.difficulty.value, narration: f.narration.value, model: f.model.value, xpMode: f.xpMode.value,
          hpMethod: f.hpMethod.value, autoGmAfterRolls: f.autoGmAfterRolls.value === "true", houseRules: f.houseRules.value } });
      toast("Réglages enregistrés.");
    });
    const keyInput = h("input", { type: "password", autocomplete: "off", placeholder: "sk-ant-…", value: PLATFORM.apiKey || "" });
    const keyState = h("p", { class: "small", style: { marginTop: "6px" } }, PLATFORM.apiKey ? "✅ Clé enregistrée." : "⚠️ Aucune clé : le MJ ne peut pas parler tant qu'elle n'est pas saisie.");
    const saveKey = h("button", { class: "btn primary" }, "Enregistrer");
    saveKey.onclick = busy(saveKey, async () => { await fn("setApiKey", { campaignId: S.cid, key: keyInput.value }); keyState.textContent = "✅ Clé enregistrée."; toast("Clé enregistrée."); });
    // Illustrations peintes (Gemini)
    const gKey = h("input", { type: "password", autocomplete: "off", placeholder: "AIza…", value: PLATFORM.geminiKey || "" });
    const gModel = h("select", {}, ...IMAGE_MODELS.map(([v, l]) => h("option", { value: v, selected: (PLATFORM.geminiModel || IMAGE_MODELS[0][0]) === v }, l)));
    const ist = c.state?.imageStatus;
    const gState = h("p", { class: "small", style: { marginTop: "6px" } }, !PLATFORM.geminiKey ? "Facultatif : sans clé, les scènes gardent le décor dessiné." : ist && !ist.ok ? `⚠️ Dernière illustration en échec : ${ist.msg}` : "✅ Clé enregistrée : chaque nouvelle scène sera peinte.");
    const gSave = h("button", { class: "btn primary" }, "Enregistrer");
    gSave.onclick = busy(gSave, async () => { await fn("setImageKey", { campaignId: S.cid, key: gKey.value, model: gModel.value }); gState.textContent = gKey.value ? "✅ Clé enregistrée : chaque nouvelle scène sera peinte." : "Clé retirée."; toast("Enregistré."); });
    const repaint = h("button", { class: "btn" }, "🎨 Repeindre la scène actuelle");
    repaint.onclick = busy(repaint, async () => {
      if (!PLATFORM.geminiKey) return toast("Enregistre d'abord une clé Gemini.", "error");
      if (!c.state?.scene?.title) return toast("Aucune scène pour l'instant : lance l'aventure.", "error");
      const { illustrate } = await import("./illustrate.js");
      await illustrate(S.cid, S.campaign.state.scene, S.world, { force: true });
      toast("Nouvelle illustration prête.");
    });
    const test = h("button", { class: "btn" }, "Tester le Maître du Jeu");
    test.onclick = busy(test, async () => { const r = await fn("pingGm", { campaignId: S.cid }); modal("Test du Maître du Jeu", h("div", {}, ...r.text.split(" | ").map((l) => h("p", { class: "small" }, l))), [{ label: "OK", class: "btn primary", value: true }]); });
    const ctl = (label, action, conf) => { const b = h("button", { class: "btn small" }, label);
      b.onclick = busy(b, async () => { if (conf && !(await confirmBox(label, conf))) return; await fn("hostGmControl", { campaignId: S.cid, action }); toast("Fait."); }); return b; };

    box.replaceChildren(
      h("section", { class: "panel" }, h("h3", {}, "Clé Claude"),
        h("p", { class: "small muted" }, "La même clé que pour EduSmart convient (console.anthropic.com → API Keys). Elle est mémorisée pour tes prochaines campagnes."),
        h("div", { class: "row" }, h("div", { class: "grow" }, keyInput), saveKey), keyState),
      h("section", { class: "panel" }, h("h3", {}, "Illustrations peintes (Gemini)"),
        h("p", { class: "small muted" }, "Une clé Google AI Studio (aistudio.google.com → Get API key) permet de peindre chaque lieu comme un décor de jeu de rôle. Une image par lieu, heure et météo, réutilisée ensuite : quelques centimes par nouveau lieu, facturés par Google."),
        h("div", { class: "row" }, h("div", { class: "grow" }, gKey), gSave), h("label", {}, "Modèle"), gModel, gState, h("div", { class: "row", style: { marginTop: "8px" } }, repaint)),
      h("section", { class: "panel" }, h("h3", {}, "Inviter les joueurs"),
        h("p", {}, "Chaque joueur crée son compte, puis « Rejoindre avec un code » :"),
        h("p", { style: { fontSize: "2rem", letterSpacing: ".25em", fontFamily: "var(--serif)", color: "var(--bronze)", margin: ".2em 0" } }, c.inviteCode),
        live.members),
      h("section", { class: "panel" }, h("h3", {}, "Campagne"), h("label", {}, "Nom"), f.name,
        h("label", {}, "Point de départ souhaité (le MJ s'en inspire)"), f.premise,
        h("p", { class: "small", style: { marginTop: "12px" } }, "Le monde, son cadre (ton, magie, interdits, classes) et sa bible se règlent dans l'écran Monde."),
        h("button", { class: "btn", onclick: () => go(`#/c/${S.cid}/world`) }, "🗺️ Ouvrir le monde")),
      h("section", { class: "panel" }, h("h3", {}, "Le Maître du Jeu"), h("label", {}, "Public"), f.tone, h("label", {}, "Difficulté"), f.difficulty,
        h("label", {}, "Longueur des récits"), f.narration, h("label", {}, "Modèle d'IA"), f.model,
        h("label", {}, "Relancer le MJ automatiquement"), f.autoGmAfterRolls, h("label", {}, "Règles maison"), f.houseRules),
      h("section", { class: "panel" }, h("h3", {}, "Progression"), h("label", {}, "Montée de niveau"), f.xpMode, h("label", {}, "Points de vie à chaque niveau"), f.hpMethod),
      h("div", { class: "row" }, save, test),
      h("section", { class: "panel" }, h("h3", {}, "Dépannage"), h("p", { class: "small muted" }, "Si le MJ semble bloqué ou si un jet demandé n'a plus de sens."),
        h("div", { class: "row" }, ctl("Débloquer le MJ", "unlock"), ctl("Terminer le combat", "endCombat", "Retirer l'ordre d'initiative et les ennemis ?"),
          ctl("Effacer la mémoire du MJ", "clearMemory", "Le MJ oubliera les faits notés (le journal reste).")), live.pending),
      live.usage);
    refreshLive();
  };
  const live = { members: h("div"), pending: h("div"), usage: h("section", { class: "panel" }) };
  function refreshLive() {
    const c = S.campaign; const u = c.usage || {};
    live.members.replaceChildren(h("h4", {}, "À la table"), h("ul", { class: "list" }, ...(c.members || []).map((uid) => {
      const ch = S.chars[c.activeCharacters?.[uid]];
      return h("li", { class: "row" }, h("span", { class: "grow" }, c.memberNames?.[uid] || "Joueur", ch ? ` — ${ch.name}` : " — pas encore de héros", uid === c.ownerUid ? " (hôte)" : ""),
        uid !== c.ownerUid ? h("button", { class: "btn small danger", onclick: async () => { if (await confirmBox("Retirer le joueur", `Retirer ${c.memberNames?.[uid]} de la campagne ?`, "Retirer")) fn("removeMember", { campaignId: S.cid, memberUid: uid }).catch((e) => toast(errMsg(e), "error")); } }, "Retirer") : null);
    })));
    const pend = c.state?.pendingRolls || [];
    live.pending.replaceChildren(...(pend.length ? [h("h4", { style: { marginTop: "12px" } }, "Jets en attente")] : []), ...pend.map((p) =>
      h("div", { class: "row small" }, h("span", { class: "grow" }, `${p.characterName} : ${p.label}`), h("button", { class: "btn small", onclick: () => fn("hostGmControl", { campaignId: S.cid, action: "cancelRoll", requestId: p.id }) }, "Annuler"))));
    const fmt = (n) => (n || 0).toLocaleString("fr-FR");
    live.usage.replaceChildren(h("h3", {}, "Consommation de l'IA"),
      c.state?.modelWarning ? h("p", { class: "small", style: { color: "var(--blood)" } }, "⚠️ " + c.state.modelWarning) : null,
      h("p", { class: "small" }, `${fmt(u.calls)} appels · ${fmt(u.input)} jetons lus · ${fmt(u.cacheRead)} jetons relus depuis le cache (facturés environ 10 %) · ${fmt(u.output)} jetons écrits.`),
      h("p", { class: "small muted" }, "Le coût réel apparaît sur console.anthropic.com (Usage). Pour dépenser moins : récits courts ou modèle Haiku."));
  }
  ctx.addCleanup(ctx.onChange((w) => { if (w?.type !== "log") draw(); }));
  draw();
}
