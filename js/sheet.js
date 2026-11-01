import { S, fn, go, isHost, myChar, updateMyCharacter, activeChars } from "./core.js";
import { h, md, rich, toast, busy, errMsg, modal, confirmBox, topbar, toggleTheme } from "./ui.js";
import { doRoll, rollWithAdv, attackWith, castSpellFlow, translateInto } from "./actions.js";
import { derive, ABILITIES, ABI_FR, ABI_FR_LONG, fmtMod, mod, XP_TABLE, levelUpChoices, spellLimits, classSpellList, DAMAGE_FR } from "./engine.js";
const MASTERY_FR = { cleave: "Enchaînement", graze: "Écorchure", nick: "Coup double", push: "Poussée", sap: "Sape", slow: "Ralentissement", topple: "Renversement", vex: "Harcèlement" };

const R = () => S.rules;

export function renderSheetPage(ctx) {
  const box = h("main", { class: "wrap" });
  ctx.mount(topbar(h("button", { class: "icon-btn", "aria-label": "Retour à la table", onclick: () => go(`#/c/${S.cid}`) }, "‹"), h("span", { class: "title grow" }, "Fiche de personnage"),
    h("button", { class: "icon-btn", "aria-label": "Thème", onclick: toggleTheme }, "🌓")), box);
  const draw = () => {
    const ch = S.chars[ctx.arg] || myChar();
    if (!ch) { box.replaceChildren(h("p", { class: "muted" }, "Chargement…")); return; }
    renderSheet(box, ch, {});
  };
  ctx.addCleanup(ctx.onChange((w) => { if (w !== "log" && w?.type !== "log") draw(); }));
  draw();
}

/** Dessine la fiche complète dans `box`. Re-dessinée à chaque changement Firestore. */
export function renderSheet(box, ch, { compact } = {}) {
  const rules = R(); const d = derive(rules, ch);
  const mine = ch.ownerUid === S.user.uid; const can = mine || isHost();
  const cls = rules.classes[ch.class]; const sp = rules.species[ch.species]; const bg = rules.backgrounds[ch.background];
  const ardyn = S.campaign?.setting === "ardyn";
  const nextXp = XP_TABLE[ch.level];
  const canLevel = can && ch.level < 20 && (ch.levelUpReady || (S.campaign?.settings?.xpMode !== "milestone" && ch.xp >= nextXp));
  const pct = Math.max(0, Math.min(100, (ch.hp.current / ch.hp.max) * 100));
  const grant = S.campaign?.state?.restGrant; const restOpen = grant && Date.now() - grant.at < 3 * 3600e3;

  const sec = (title, ...kids) => h("section", { class: "section" }, h("h3", {}, ...[].concat(title)), ...kids);
  const rollBtn = (label, params) => () => can && rollWithAdv({ characterId: ch.id, ...params }, label);

  const out = [];
  out.push(h("div", { class: "sheet-head" },
    h("button", { class: "portrait", "aria-label": "Changer l'icône", onclick: mine ? () => editPortrait(ch) : null, style: { cursor: mine ? "pointer" : "default", color: "inherit" } }, ch.portrait || "🛡️"),
    h("div", { class: "grow" }, h("h2", { style: { margin: 0 } }, ch.name),
      h("div", { class: "small muted" }, `${ardyn && sp?.nameArdyn ? sp.nameArdyn : sp?.nameFr}${ch.subspecies ? " (" + rules.subspecies[ch.subspecies].name.replace(/^.*?: /, "") + ")" : ""} · ${cls.nameFr} niveau ${ch.level}${ch.subclass ? " · " + rules.subclasses[ch.subclass].name : ""}`),
      h("div", { class: "small muted" }, `${ch.people ? ch.people + " · " : ""}${bg?.nameFr || ""}${ch.origin ? " · " + ch.origin : ""} · joué par ${ch.ownerName}`))));
  if (ch.alive === false) out.push(h("p", { class: "panel", style: { borderColor: "var(--blood)" } }, "☠️ Ce héros est tombé. L'hôte peut le ramener à la vie (résurrection, miracle…) depuis ses outils."));
  if (canLevel) out.push(h("div", { class: "levelup", style: { marginTop: "12px" } }, h("span", { style: { fontSize: "1.6rem" } }, "⭐"), h("div", { class: "grow" }, h("b", {}, "Montée de niveau disponible !"), h("div", { class: "small" }, `Passer au niveau ${ch.level + 1}`)), h("button", { class: "btn primary", onclick: () => levelUpWizard(ch) }, "Monter")));

  // PV & vitaux
  out.push(h("div", { class: "vitals" },
    h("div", { class: "vital" }, h("b", {}, `${ch.hp.current}${ch.hp.temp ? "+" + ch.hp.temp : ""}`), h("span", {}, `PV / ${ch.hp.max}`)),
    h("div", { class: "vital", title: d.acNote }, h("b", {}, d.ac), h("span", {}, "Classe d'armure")),
    h("button", { class: "vital", style: { cursor: "pointer", color: "inherit" }, onclick: rollBtn("Initiative", { kind: "initiative" }) }, h("b", {}, fmtMod(d.initiative)), h("span", {}, "Initiative")),
    h("div", { class: "vital" }, h("b", {}, `${Math.round(d.speed * 0.3 * 2) / 2} m`), h("span", {}, `Vitesse (${d.speed} pi)`))));
  out.push(h("div", { class: "hpbar" }, h("i", { class: pct < 35 ? "low" : "", style: { width: pct + "%" } })));
  const xpPct = nextXp ? Math.min(100, ((ch.xp - XP_TABLE[ch.level - 1]) / (nextXp - XP_TABLE[ch.level - 1])) * 100) : 100;
  out.push(h("div", { class: "row small muted", style: { marginTop: "6px" } }, h("span", {}, `XP ${ch.xp}${nextXp ? " / " + nextXp : ""}`), h("span", { class: "grow" }),
    h("span", {}, `Maîtrise ${fmtMod(d.pb)}`), ch.inspiration ? h("span", { class: "badge magic" }, "🌟 Inspiration") : null, h("span", {}, `Perception passive ${d.passive}`)));
  if (S.campaign?.settings?.xpMode !== "milestone" && nextXp) out.push(h("div", { class: "hpbar", style: { height: "5px", marginTop: "4px" } }, h("i", { style: { width: xpPct + "%", background: "var(--bronze)" } })));
  if ((ch.conditions || []).length || ch.exhaustion) out.push(h("p", { class: "small", style: { color: "var(--blood)" } }, "États : ", (ch.conditions || []).map((c) => rules.conditions[c]?.nameFr || c).join(", "), ch.exhaustion ? ` · Épuisement ${ch.exhaustion}` : ""));
  if (ch.hp.current === 0 && ch.alive !== false) {
    const ds = ch.deathSaves || { success: 0, fail: 0 };
    out.push(h("div", { class: "panel", style: { borderColor: "var(--blood)", marginTop: "10px" } }, h("b", {}, "À 0 PV — inconscient"),
      h("p", { class: "small" }, `Réussites ${"●".repeat(ds.success)}${"○".repeat(3 - ds.success)} · Échecs ${"●".repeat(ds.fail)}${"○".repeat(3 - ds.fail)}`),
      can ? h("button", { class: "btn primary", onclick: () => doRoll({ characterId: ch.id, kind: "death" }, "Jet contre la mort") }, "Jet contre la mort") : null));
  }

  // Caractéristiques
  out.push(sec("Caractéristiques", h("div", { class: "abilities" }, ...ABILITIES.map((a) =>
    h("button", { class: "abi", style: { color: "inherit" }, title: `Test de ${ABI_FR_LONG[a]}`, onclick: rollBtn(`Test de ${ABI_FR[a]}`, { kind: "check", ability: a }) },
      h("span", { class: "k" }, ABI_FR[a]), h("span", { class: "m" }, fmtMod(d.mods[a])), h("span", { class: "s" }, d.abilities[a])))),
    h("div", { class: "chips", style: { marginTop: "10px" } }, h("span", { class: "small muted", style: { alignSelf: "center" } }, "Sauvegardes :"),
      ...ABILITIES.map((a) => h("button", { class: "chip" + (cls.saves.includes(a) ? " prof" : ""), title: cls.saves.includes(a) ? "Sauvegarde maîtrisée" : "", onclick: rollBtn(`Sauvegarde de ${ABI_FR[a]}`, { kind: "save", ability: a }) }, `${ABI_FR[a]} ${fmtMod(d.saves[a])}`)))));

  // Attaques
  out.push(sec("Attaques", ...d.attacks.map((a) => h("div", { class: "item-row" },
    h("button", { class: "lnk", onclick: () => can && attackWith(a, ch) }, h("b", {}, a.name), h("div", { class: "small muted" }, `${fmtMod(a.toHit)} pour toucher · ${a.damage} ${DAMAGE_FR[a.type] || ""}${a.versatile ? ` (${a.versatile} à deux mains)` : ""}${a.mastery ? " · botte : " + (MASTERY_FR[a.mastery] || a.mastery) : ""}${a.prof ? "" : " · non maîtrisée"}`)),
    can ? h("button", { class: "btn small", onclick: () => attackWith(a, ch) }, "🎲") : null)),
    can ? h("p", { class: "small muted" }, "Équipe ou déséquipe tes armes dans l'inventaire.") : null));

  // Ressources de classe
  const res = Object.entries(ch.resources || {}).filter(([, r]) => r.max || r.info);
  if (res.length) out.push(sec("Capacités à usage limité", ...res.map(([k, r]) => r.info ? h("div", { class: "item-row" }, h("span", { class: "grow" }, r.label)) : h("div", { class: "item-row" },
    h("span", { class: "grow" }, h("b", {}, r.label), h("div", { class: "small muted" }, `${r.max - (r.used || 0)} / ${r.max} · récupéré au repos ${r.rest === "short" ? "court" : "long"}`)),
    can ? h("button", { class: "btn small", "aria-label": "Rendre une utilisation", onclick: () => fn("useResource", { campaignId: S.cid, characterId: ch.id, key: k, delta: -1 }).catch((e) => toast(errMsg(e), "error")) }, "+") : null,
    can ? h("button", { class: "btn small primary", onclick: () => fn("useResource", { campaignId: S.cid, characterId: ch.id, key: k, delta: k === "layOnHands" ? 5 : 1 }).catch((e) => toast(errMsg(e), "error")) }, "Utiliser") : null))));

  // Sorts
  if (cls.castAbility && d.spell) {
    const slots = Object.entries(ch.slots || {});
    const spellRow = (idx) => { const s = rules.spells[idx]; if (!s) return null;
      return h("div", { class: "spell-row" }, h("button", { class: "lnk", onclick: () => spellInfo(idx, ch) }, h("b", {}, s.name), h("div", { class: "small muted" }, `${s.level ? "Niveau " + s.level : "Tour de magie"} · ${s.school} · ${s.time}${s.concentration ? " · concentration" : ""}${s.ritual ? " · rituel" : ""}`)),
        can ? h("button", { class: "btn small", onclick: () => castSpellFlow(idx, ch) }, "✨") : null); };
    out.push(sec(["Sorts", h("span", { class: "small muted" }, `DD ${d.spell.dc} · attaque ${fmtMod(d.spell.attack)}`)],
      slots.length ? h("div", { class: "row", style: { margin: "6px 0" } }, ...slots.map(([l, s]) => h("span", { class: "small" }, `Niv. ${l} `, h("span", { class: "pips" }, ...Array.from({ length: s.max }, (_, i) => h("i", { class: "pip " + (i < s.max - s.used ? "free" : "used") })))))) : null,
      ...(ch.spells?.cantrips || []).map(spellRow), ...(ch.spells?.prepared || []).map(spellRow), ...(ch.extraSpells || []).map(spellRow),
      can ? h("button", { class: "btn small", style: { marginTop: "8px" }, onclick: () => prepareSpells(ch) }, ch.class === "wizard" ? "Préparer depuis le grimoire" : "Changer mes sorts préparés") : null));
  }

  // Compétences
  out.push(sec("Compétences", ...Object.entries(d.skills).sort((a, b) => rules.skills[a[0]].nameFr.localeCompare(rules.skills[b[0]].nameFr)).map(([k, v]) =>
    h("div", { class: "skill-row" }, h("i", { class: "dot" + (v.exp ? " exp" : v.prof ? " on" : "") }),
      h("button", { class: "lnk", onclick: rollBtn(`Test de ${rules.skills[k].nameFr}`, { kind: "skill", skill: k }) }, rules.skills[k].nameFr, h("span", { class: "small muted" }, ` (${ABI_FR[v.ability]})`)),
      h("span", { class: "val" }, fmtMod(v.value))))));

  // Repos
  if (can && (restOpen || isHost())) {
    out.push(sec("Repos", h("div", { class: "row" },
      h("button", { class: "btn", disabled: !ch.hitDice?.remaining || ch.hp.current >= ch.hp.max, onclick: () => doRoll({ characterId: ch.id, kind: "hitdie" }, "Dé de vie") }, `Dé de vie (${ch.hitDice?.remaining || 0}/${ch.hitDice?.total} d${ch.hitDice?.die})`),
      h("button", { class: "btn", onclick: () => doRest(ch, "short") }, "☕ Valider le repos court"),
      h("button", { class: "btn", onclick: () => doRest(ch, "long") }, "🌙 Repos long")),
      h("p", { class: "small muted" }, restOpen ? "Le MJ a accordé un repos." : "Hôte : tu peux valider un repos à tout moment.")));
  }

  // Inventaire
  out.push(sec(["Inventaire", h("span", { class: "small muted" }, `💰 ${ch.gold || 0} po`)],
    ...(ch.inventory || []).map((it) => { const eq = rules.equipment[it.index]; const mi = rules.magicItems[it.index];
      const equippable = eq && (eq.damage || eq.ac);
      return h("div", { class: "item-row" },
        h("button", { class: "lnk", onclick: () => itemInfo(it, ch) }, h("span", {}, it.name, it.qty > 1 ? ` ×${it.qty}` : "", it.bonus ? ` +${it.bonus}` : ""), " ",
          it.equipped ? h("span", { class: "badge eq" }, "équipé") : null, mi || it.magic ? h("span", { class: "badge magic" }, "magique") : null,
          it.notes ? h("div", { class: "small muted" }, it.notes.slice(0, 90)) : null),
        can && equippable ? h("button", { class: "btn small", onclick: () => invAction(ch, it.equipped ? "unequip" : "equip", it) }, it.equipped ? "Ôter" : "Équiper") : null);
    }),
    can ? h("div", { class: "row", style: { marginTop: "8px" } }, h("button", { class: "btn small", onclick: () => giveGoldDialog(ch) }, "Donner de l'or")) : null));

  // Capacités & traits
  const feats = [];
  for (const f of ch.featureList || []) { const x = rules.features[f]; if (x) feats.push({ name: x.name, desc: x.description, src: cls.nameFr, fr: !!x.descriptionEn }); }
  if (ch.subclass) for (const f of rules.subclasses[ch.subclass].features.filter((x) => x.level <= ch.level)) feats.push({ name: f.name, desc: f.description, src: rules.subclasses[ch.subclass].name });
  for (const t of ch.traits || []) { const x = rules.traits[t]; if (x) feats.push({ name: x.name, desc: x.description, src: sp.nameFr, fr: !!x.descriptionEn }); }
  for (const f of ch.feats || []) { const x = rules.feats[f]; if (x) feats.push({ name: x.name, desc: x.description, src: "Don", fr: !!x.descriptionEn }); }
  out.push(sec("Capacités, traits et dons", ...feats.map((f) => { const p = h("div", { class: "desc" }, rich(f.desc));
    return h("details", { class: "feature" }, h("summary", {}, f.name, h("span", { class: "small muted" }, ` · ${f.src}`)), p,
      f.fr ? null : h("button", { class: "btn small ghost", onclick: (e) => { e.preventDefault(); translateInto(p, f.desc); } }, "Traduire en français")); })));

  // Histoire & notes
  const field = (key, label, rows = 4) => {
    const ta = h("textarea", { rows, readonly: !mine }, ch[key] || "");
    if (mine) ta.addEventListener("change", () => updateMyCharacter(ch.id, { [key]: ta.value.slice(0, 7900) }).then(() => toast("Enregistré.")).catch((e) => toast(errMsg(e), "error")));
    return [h("label", {}, label), ta];
  };
  out.push(sec("Histoire et notes", ...field("appearance", "Apparence", 2), ...field("backstory", "Histoire", 4), ...field("notes", "Notes de joueur", 5)));

  if (isHost()) out.push(hostTools(ch));
  if (compact) out.push(h("p", {}, h("a", { href: `#/c/${S.cid}/sheet/${ch.id}` }, "Ouvrir la fiche en plein écran")));
  const y = box.parentElement?.scrollTop;
  box.replaceChildren(...out.filter(Boolean));
  if (y && box.parentElement) box.parentElement.scrollTop = y;
}

// ---------------------------------------------------------------- Dialogues
async function editPortrait(ch) {
  const choices = ["🛡️", "⚔️", "🏹", "🪓", "🗡️", "🔮", "📜", "🌿", "🔥", "❄️", "⚡", "🌙", "☀️", "🐉", "🦉", "🐺", "🦊", "🐻", "🦅", "🍀", "💀", "👑", "🎻", "⚒️", "🧭", "🕯️"];
  const r = await modal("Icône du héros", h("div", { class: "emoji-pick" }, ...choices.map((c) => h("button", { onclick: (e) => { e.currentTarget.closest(".modal-wrap").querySelector("footer .primary").dataset.v = c; e.currentTarget.parentElement.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === e.currentTarget))); } }, c))),
    [{ label: "Annuler", value: null }, { label: "Choisir", class: "btn primary", value: () => document.querySelector(".modal footer .primary").dataset.v || null }]);
  if (r) await updateMyCharacter(ch.id, { portrait: r });
}

/** Fiche d'un sort : caractéristiques et description (en français pour les tours de magie et sorts de niveau 1). */
export function spellDetails(s) {
  const p = h("div", { class: "desc", style: { color: "var(--vellum)" } }, rich(s.description), s.higher ? h("div", { style: { marginTop: "8px" } }, h("b", {}, "Aux niveaux supérieurs. "), s.higher) : null);
  const node = h("div", {}, h("p", { class: "small muted" }, `${s.level ? "Niveau " + s.level : "Tour de magie"} · ${s.school} · Incantation : ${s.time} · Portée : ${s.range} · Composantes : ${s.components.join(", ")}${s.material ? " (" + s.material + ")" : ""} · Durée : ${s.duration}${s.concentration ? " · concentration" : ""}${s.ritual ? " · rituel" : ""}`), p);
  return { node, p, english: !s.descriptionEn };
}

function spellInfo(idx, ch) {
  const s = R().spells[idx]; const { node, p, english } = spellDetails(s);
  modal(s.name, node,
    [...(english ? [{ label: "Traduire", value: () => { translateInto(p, s.description + (s.higher ? "\n\nAt Higher Levels: " + s.higher : "")); return undefined; } }] : []),
      ...(ch.ownerUid === S.user.uid || isHost() ? [{ label: "Lancer ce sort", class: "btn primary", value: () => { castSpellFlow(idx, ch); return true; } }] : [])]);
}

function itemInfo(it, ch) {
  const rules = R(); const eq = rules.equipment[it.index]; const mi = rules.magicItems[it.index];
  const text = mi?.description || eq?.description || it.notes || "";
  const p = h("div", { class: "desc", style: { color: "var(--vellum)" } }, text || "Aucune description.");
  const others = activeChars().filter((c) => c.id !== ch.id);
  const can = ch.ownerUid === S.user.uid || isHost();
  const actions = [];
  if (text) actions.push({ label: "Traduire", value: () => { translateInto(p, text); return undefined; } });
  if (can) {
    actions.push({ label: "Utiliser / consommer", value: async () => { await invAction(ch, "use", it); return true; } });
    if (others.length) actions.push({ label: "Donner…", value: async () => {
      const t = await modal(`Donner ${it.name}`, h("p", {}, "À qui ?"), others.map((o) => ({ label: o.name, class: "btn", value: o.id })));
      if (t) await invAction(ch, "give", it, { targetCharacterId: t }); return true; } });
    actions.push({ label: "Jeter", class: "btn danger", value: async () => { if (await confirmBox("Jeter l'objet", `Abandonner ${it.name} ?`, "Jeter")) await invAction(ch, "drop", it); return true; } });
  }
  modal(it.name, h("div", {}, eq?.damage ? h("p", { class: "small muted" }, `Dégâts ${eq.damage} ${DAMAGE_FR[eq.damageType] || ""} · ${(eq.props || []).join(", ")}`) : null,
    eq?.ac ? h("p", { class: "small muted" }, `CA ${eq.ac.base}${eq.ac.dex_bonus ? " + Dex" + (eq.ac.max_bonus != null ? " (max " + eq.ac.max_bonus + ")" : "") : ""}${eq.strMin ? " · For " + eq.strMin + " requise" : ""}${eq.stealthDis ? " · désavantage en Discrétion" : ""}`) : null,
    mi ? h("p", { class: "small muted" }, `${mi.rarity || ""}${mi.attunement ? " · harmonisation requise" : ""}`) : null, p), actions);
}

async function invAction(ch, action, it, extra = {}) {
  try { await fn("inventory", { campaignId: S.cid, characterId: ch.id, action, itemId: it.id, qty: 1, ...extra }); }
  catch (e) { toast(errMsg(e), "error"); }
}

async function giveGoldDialog(ch) {
  const others = activeChars().filter((c) => c.id !== ch.id);
  if (!others.length) return toast("Personne d'autre dans le groupe.");
  const amount = h("input", { type: "number", min: 1, max: ch.gold || 0, value: 1 });
  const to = h("select", {}, ...others.map((o) => h("option", { value: o.id }, o.name)));
  const r = await modal("Donner de l'or", h("div", {}, h("label", {}, "Montant (po)"), amount, h("label", {}, "À"), to), [{ label: "Annuler", value: null }, { label: "Donner", class: "btn primary", value: () => ({ amount: amount.value, to: to.value }) }]);
  if (r) await fn("giveGold", { campaignId: S.cid, characterId: ch.id, targetCharacterId: r.to, amount: r.amount }).catch((e) => toast(errMsg(e), "error"));
}

async function doRest(ch, type) {
  try { await fn("rest", { campaignId: S.cid, characterId: ch.id, type }); toast(type === "long" ? "Repos long terminé : PV, sorts et capacités restaurés." : "Repos court terminé."); }
  catch (e) { toast(errMsg(e), "error"); }
}

async function prepareSpells(ch) {
  const rules = R(); const lim = spellLimits(rules, ch);
  const pool = ch.class === "wizard" ? (ch.spells.book || []).map((i) => ({ index: i, ...rules.spells[i] })) : classSpellList(rules, ch.class, lim.maxLevel).filter((s) => s.level > 0);
  const sel = new Set(ch.spells.prepared || []);
  const count = h("p", { class: "small muted" });
  const upd = () => (count.textContent = `${sel.size} / ${lim.prepared} sorts préparés`);
  const list = h("div", {}, ...pool.map((s) => {
    const b = h("button", { class: "chip", "aria-pressed": String(sel.has(s.index)), style: { margin: "3px" } }, `${s.name} (${s.level})`);
    b.onclick = () => { if (sel.has(s.index)) sel.delete(s.index); else if (sel.size < lim.prepared) sel.add(s.index); else return toast("Maximum atteint."); b.setAttribute("aria-pressed", String(sel.has(s.index))); upd(); };
    return b;
  }));
  upd();
  const r = await modal("Sorts préparés", h("div", {}, h("p", { class: "small" }, "Tu peux changer tes sorts préparés après un repos long."), count, list), [{ label: "Annuler", value: null }, { label: "Enregistrer", class: "btn primary", value: true }]);
  if (r) await fn("setPrepared", { campaignId: S.cid, characterId: ch.id, cantrips: ch.spells.cantrips, prepared: [...sel] }).then(() => toast("Sorts enregistrés.")).catch((e) => toast(errMsg(e), "error"));
}

// ---------------------------------------------------------------- Montée de niveau
async function levelUpWizard(ch) {
  const rules = R(); const nl = ch.level + 1; const need = levelUpChoices(rules, ch, nl);
  const choices = {}; const body = h("div", { class: "stack" });
  body.append(h("p", {}, `Niveau ${nl} : `, h("b", {}, need.features.map((f) => rules.features[f]?.name || f).join(", ") || "améliorations de classe"), "."));
  body.append(h("p", { class: "small muted" }, S.campaign?.settings?.hpMethod === "roll" ? `Points de vie : le serveur lancera 1d${need.hitDie} + Constitution.` : `Points de vie : +${Math.floor(need.hitDie / 2) + 1} + Constitution (valeur moyenne).`));

  if (need.subclass) {
    const opts = Object.entries(rules.subclasses).filter(([, s]) => s.class === ch.class);
    choices.subclass = opts[0]?.[0];
    body.append(h("div", {}, h("h4", {}, "Sous-classe"), ...opts.map(([k, s]) => h("div", { class: "panel", style: { padding: "10px" } }, h("b", {}, s.name), h("div", { class: "small muted" }, s.summary)))));
  }
  if (need.fightingStyle) body.append(pickOne("Style de combat", Object.entries(rules.feats).filter(([k, f]) => f.type === "fighting-style" && !(ch.feats || []).includes(k)), (v) => (choices.fightingStyle = v)));
  if (need.asi || need.epicBoon) {
    choices.asi = { mode: "asi", inc: {} };
    const asiBox = h("div");
    const drawAsi = () => {
      const total = Object.values(choices.asi.inc).reduce((a, b) => a + b, 0);
      asiBox.replaceChildren(h("p", { class: "small muted" }, "Répartis 2 points : +2 à une caractéristique ou +1 à deux (maximum 20)."), h("div", { class: "score-grid" }, ...ABILITIES.map((a) => {
        const v = choices.asi.inc[a] || 0;
        return h("div", { class: "score" }, h("div", { class: "small muted" }, ABI_FR[a]), h("div", { class: "final" }, ch.abilities[a] + v),
          h("div", { class: "stepper" }, h("button", { "aria-label": "moins", onclick: () => { if (v > 0) { choices.asi.inc[a] = v - 1; if (!choices.asi.inc[a]) delete choices.asi.inc[a]; drawAsi(); } } }, "−"),
            h("button", { "aria-label": "plus", onclick: () => { if (total < 2 && ch.abilities[a] + v < (need.epicBoon ? 30 : 20)) { choices.asi.inc[a] = v + 1; drawAsi(); } } }, "+")));
      })));
    };
    const featOpts = Object.entries(rules.feats).filter(([k, f]) => (need.epicBoon ? ["epic-boon"] : ["general", "origin"]).includes(f.type) && k !== "ability-score-improvement" && (!(ch.feats || []).includes(k) || f.repeatable));
    const modeSel = h("select", {}, h("option", { value: "asi" }, "Améliorer mes caractéristiques"), ...featOpts.map(([k, f]) => h("option", { value: k }, `Don : ${f.name}`)));
    modeSel.onchange = () => { choices.asi = modeSel.value === "asi" ? { mode: "asi", inc: {} } : { mode: "feat", feat: modeSel.value }; modeSel.value === "asi" ? drawAsi() : asiBox.replaceChildren(h("p", { class: "desc" }, rich(rules.feats[modeSel.value].description))); };
    drawAsi();
    body.append(h("div", {}, h("h4", {}, need.epicBoon ? "Faveur épique" : "Amélioration"), modeSel, asiBox));
  }
  if (need.expertise) {
    choices.expertise = [];
    body.append(h("div", {}, h("h4", {}, "Expertise (2 compétences)"), h("div", { class: "chips" }, ...ch.skills.filter((s) => !(ch.expertise || []).includes(s)).map((s) => {
      const b = h("button", { class: "chip", "aria-pressed": "false" }, rules.skills[s].nameFr);
      b.onclick = () => { const i = choices.expertise.indexOf(s); if (i >= 0) choices.expertise.splice(i, 1); else if (choices.expertise.length < 2) choices.expertise.push(s); b.setAttribute("aria-pressed", String(choices.expertise.includes(s))); };
      return b;
    }))));
  }
  if (need.newCantrips) { choices.cantrips = []; body.append(spellPicker("Nouveau tour de magie", classSpellList(rules, ch.class, 0).filter((s) => s.level === 0 && !ch.spells.cantrips.includes(s.index)), need.newCantrips, choices.cantrips)); }
  if (need.newPrepared) { choices.spells = []; body.append(spellPicker(`Nouveau${need.newPrepared > 1 ? "x" : ""} sort${need.newPrepared > 1 ? "s" : ""} préparé${need.newPrepared > 1 ? "s" : ""}`, classSpellList(rules, ch.class, need.maxSpellLevel).filter((s) => s.level > 0 && !ch.spells.prepared.includes(s.index)), need.newPrepared, choices.spells)); }
  if (ch.class === "wizard") { choices.bookSpells = []; body.append(spellPicker("Grimoire : 2 sorts à recopier", classSpellList(rules, "wizard", need.maxSpellLevel).filter((s) => s.level > 0 && !(ch.spells.book || []).includes(s.index)), 2, choices.bookSpells)); }

  const r = await modal(`Niveau ${nl} !`, body, [{ label: "Plus tard", value: null }, { label: "Valider", class: "btn primary", value: async () => {
    try { return await fn("levelUp", { campaignId: S.cid, characterId: ch.id, choices }); } catch (e) { toast(errMsg(e), "error"); return undefined; }
  } }]);
  if (r?.ok) toast(`Bravo ! ${ch.name} atteint le niveau ${nl} (+${r.gain} PV).`);
}

function pickOne(title, entries, set) {
  const desc = h("p", { class: "desc" });
  const sel = h("select", {}, h("option", { value: "" }, "Choisir…"), ...entries.map(([k, f]) => h("option", { value: k }, f.name)));
  sel.onchange = () => { set(sel.value); desc.replaceChildren(...rich(entries.find(([k]) => k === sel.value)?.[1].description)); };
  return h("div", {}, h("h4", {}, title), sel, desc);
}
export function spellPicker(title, list, max, arr) {
  const count = h("span", { class: "small muted" }, ` 0 / ${max}`);
  count.textContent = ` ${arr.length} / ${max}`;
  return h("div", {}, h("h4", {}, title, count), h("p", { class: "small muted", style: { margin: "0 0 4px" } }, "Touche un sort pour le choisir, ⓘ pour voir ce qu'il fait."),
    h("div", { style: { maxHeight: "320px", overflowY: "auto" } }, ...list.map((s) => {
    const b = h("button", { class: "chip", "aria-pressed": String(arr.includes(s.index)), style: { margin: "3px 0 3px 3px" } }, `${s.name}${s.level ? " (" + s.level + ")" : ""}`);
    b.onclick = () => { const i = arr.indexOf(s.index); if (i >= 0) arr.splice(i, 1); else if (arr.length < max) arr.push(s.index); else return toast("Maximum atteint."); b.setAttribute("aria-pressed", String(arr.includes(s.index))); count.textContent = ` ${arr.length} / ${max}`; };
    const info = h("button", { class: "chip", "aria-label": `Description de ${s.name}`, style: { margin: "3px 6px 3px 2px", padding: "4px 9px" } }, "ⓘ");
    info.onclick = () => { const { node, p, english } = spellDetails(s); modal(s.name, node, [...(english ? [{ label: "Traduire", value: () => { translateInto(p, s.description); return undefined; } }] : []), { label: "Fermer", value: null }]); };
    return h("span", { style: { display: "inline-flex", alignItems: "center" } }, b, info);
  })));
}

// ---------------------------------------------------------------- Outils de l'hôte
function hostTools(ch) {
  const rules = R();
  const num = (ph) => h("input", { type: "number", placeholder: ph, style: { maxWidth: "110px" } });
  const hp = num("± PV"); const xp = num("± XP"); const gold = num("± po");
  const apply = h("button", { class: "btn small primary" }, "Appliquer");
  apply.onclick = busy(apply, async () => {
    await fn("hostAdjust", { campaignId: S.cid, characterId: ch.id, patch: { hpDelta: hp.value || 0, xpDelta: xp.value || 0, goldDelta: gold.value || 0 } });
    toast("Fiche ajustée.");
  });
  const addItem = h("button", { class: "btn small" }, "Ajouter un objet");
  addItem.onclick = async () => {
    const q = h("input", { type: "text", placeholder: "Rechercher (anglais SRD) ou nom libre" }); const res = h("select", { size: 6, style: { minHeight: "140px" } });
    const all = [...Object.entries(rules.equipment), ...Object.entries(rules.magicItems)];
    q.oninput = () => { const v = q.value.toLowerCase(); res.replaceChildren(...all.filter(([k, x]) => x.name.toLowerCase().includes(v)).slice(0, 40).map(([k, x]) => h("option", { value: k }, x.name))); };
    const r = await modal("Ajouter un objet", h("div", {}, q, h("label", {}, "Objet du SRD (ou laisse vide pour un objet libre)"), res),
      [{ label: "Annuler", value: null }, { label: "Ajouter", class: "btn primary", value: () => ({ index: res.value || null, name: res.value ? (rules.equipment[res.value] || rules.magicItems[res.value]).name : q.value }) }]);
    if (r?.name) await fn("hostAdjust", { campaignId: S.cid, characterId: ch.id, patch: { addItem: { ...r, qty: 1 } } }).catch((e) => toast(errMsg(e), "error"));
  };
  const conds = h("div", { class: "chips" }, ...Object.entries(rules.conditions).filter(([k]) => k !== "exhaustion").map(([k, c]) => {
    const on = (ch.conditions || []).includes(k);
    return h("button", { class: "chip", "aria-pressed": String(on), onclick: () => fn("hostAdjust", { campaignId: S.cid, characterId: ch.id, patch: { conditions: on ? ch.conditions.filter((x) => x !== k) : [...(ch.conditions || []), k] } }).catch((e) => toast(errMsg(e), "error")) }, c.nameFr);
  }));
  return h("section", { class: "section panel" }, h("h3", {}, "Outils de l'hôte"), h("p", { class: "small muted" }, "Pour corriger une erreur du MJ ou récompenser hors partie. Tout est noté dans le journal."),
    h("div", { class: "row" }, hp, xp, gold, apply), h("div", { class: "row", style: { marginTop: "8px" } }, addItem,
      h("button", { class: "btn small", onclick: () => fn("hostAdjust", { campaignId: S.cid, characterId: ch.id, patch: { levelUpReady: true } }).then(() => toast("Montée de niveau autorisée.")) }, "Autoriser une montée de niveau"),
      h("button", { class: "btn small", onclick: () => fn("hostAdjust", { campaignId: S.cid, characterId: ch.id, patch: { inspiration: !ch.inspiration } }) }, ch.inspiration ? "Retirer l'inspiration" : "Donner l'inspiration"),
      ch.alive === false ? h("button", { class: "btn small", onclick: () => fn("hostAdjust", { campaignId: S.cid, characterId: ch.id, patch: { alive: true, hpDelta: 1, deathSaves: { success: 0, fail: 0 } } }) }, "Ramener à la vie") : null),
    h("label", {}, "États"), conds,
    ...(ch.inventory || []).length ? [h("label", {}, "Retirer un objet"), h("div", { class: "chips" }, ...(ch.inventory || []).map((it) => h("button", { class: "chip", onclick: async () => { if (await confirmBox("Retirer", `Retirer ${it.name} ?`, "Retirer")) fn("hostAdjust", { campaignId: S.cid, characterId: ch.id, patch: { removeItemId: it.id } }); } }, `✕ ${it.name}`)))] : []);
}
