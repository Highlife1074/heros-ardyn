// Écran « Monde » : cadre fixé par l'hôte, ajouts du MJ à relire, versions de la bible, codex des joueurs.
import { S, fn, go, isWorldOwner, fs } from "./core.js";
import { collection, getDocs } from "../vendor/firebase/firebase-firestore.js";
import { h, toast, busy, errMsg, modal, confirmBox, topbar, timeAgo } from "./ui.js";

export const CATEGORIES = { lieu: "Lieu", pnj: "Personnage", faction: "Faction", histoire: "Histoire et légendes", creature: "Créature", objet: "Objet notable", culture: "Culture et coutumes", religion: "Religion et magie" };
const CAT_ICON = { lieu: "🏰", pnj: "👤", faction: "⚜️", histoire: "📜", creature: "🐺", objet: "🗝️", culture: "🍷", religion: "🕯️" };
const INSPIRATIONS = ["Lancedragon", "Le Seigneur des Anneaux", "Game of Thrones", "La Roue du Temps", "The Witcher", "La Belgariade", "Le Hobbit", "Les Rois maudits"];
const THEMES = ["Intrigues politiques et trahisons", "Une ombre ancienne qui revient", "Héroïsme, loyauté et sacrifice", "Morale nuancée : peu de méchants purs", "Dragons rares, vieux et majestueux",
  "Guerre entre royaumes", "Survie et voyages au long cours", "Mystères et prophéties", "Foi, fanatisme et inquisition", "Amitié et passage à l'âge adulte"];
const MAGIC = [
  ["rare", "Rare et redoutée", "Le Seigneur des Anneaux, Game of Thrones : quelques mages légendaires, pas de boutique de magie, chaque sort marque les esprits."],
  ["moderate", "Présente mais précieuse", "Lancedragon : mages et prêtres existent en ordres, objets magiques rares, dragons exceptionnels."],
  ["high", "Courante", "Fantasy héroïque classique : la magie est partout. Déconseillé pour le ton recherché."],
];

export function renderWorld(ctx) {
  const box = h("main", { class: "wrap stack" });
  let tab = "entries"; let filter = "new";
  ctx.mount(topbar(h("button", { class: "icon-btn", "aria-label": "Retour", onclick: () => go(`#/c/${S.cid}`) }, "‹"), h("span", { class: "title" }, "Le monde")), box);

  const draw = () => {
    const w = S.world;
    if (!w) { box.replaceChildren(h("p", { class: S.worldError ? "" : "muted" }, S.worldError ? `Le monde est inaccessible : ${S.lastError || ""}` : S.campaign && !S.campaign.worldId ? "Cette campagne n'a pas de monde lié." : "Chargement du monde…")); return; }
    const owner = isWorldOwner();
    const proposed = S.entries.filter((e) => e.status === "proposed").length;
    const tabs = owner ? [["entries", `Ajouts${proposed ? ` (${proposed} à valider)` : ""}`], ["setup", "Cadre"], ["versions", "Versions"]] : [["entries", "Codex"]];
    const head = h("div", {}, h("h2", { style: { marginBottom: "2px" } }, w.name), h("p", { class: "small muted" }, `Bible version ${w.version} · ${S.entries.length} élément${S.entries.length > 1 ? "s" : ""} ${owner ? "ajoutés" : "découverts"}`),
      h("div", { class: "tabs", role: "tablist" }, ...tabs.map(([k, l]) => h("button", { role: "tab", "aria-selected": String(tab === k), onclick: () => { tab = k; draw(); } }, l))));
    const content = tab === "setup" && owner ? setupPanel(w) : tab === "versions" && owner ? versionsPanel(w) : entriesPanel(w, owner);
    box.replaceChildren(head, content);
  };

  function entriesPanel(w, owner) {
    if (!owner) return codexList(S.entries);
    const groups = { pending: S.entries.filter((e) => e.status === "proposed"), new: S.entries.filter((e) => !e.merged && e.status !== "proposed"), merged: S.entries.filter((e) => e.merged) };
    const filters = [["pending", "À valider"], ["new", `Depuis la v${w.version}`], ["merged", "Déjà dans la bible"]];
    const list = groups[filter];
    const add = h("button", { class: "btn small" }, "Ajouter un élément moi-même");
    add.onclick = () => entryDialog(w, null);
    return h("div", { class: "stack" },
      h("p", { class: "small muted" }, w.setup?.additionMode === "review" ? "Le MJ propose ; tu valides ce qui devient canon." : "Le MJ ajoute directement au canon ; tu peux corriger ou supprimer à tout moment."),
      h("div", { class: "chips" }, ...filters.map(([k, l]) => h("button", { class: "chip", "aria-pressed": String(filter === k), onclick: () => { filter = k; draw(); } }, `${l} (${groups[k].length})`)), add),
      list.length ? h("div", {}, ...list.map((e) => entryCard(w, e, true))) : h("p", { class: "muted" }, filter === "pending" ? "Rien à valider." : filter === "new" ? "Pas encore d'ajout : le MJ enrichira le monde au fil des parties." : "Aucun élément fusionné pour l'instant."));
  }

  function entryCard(w, e, owner) {
    const actions = owner ? h("div", { class: "row", style: { marginTop: "6px" } },
      e.status === "proposed" ? h("button", { class: "btn small primary", onclick: () => fn("editWorldEntry", { worldId: w.id, entryId: e.id, patch: { status: "canon" } }).then(() => toast("Validé : c'est désormais canon.")).catch((x) => toast(errMsg(x), "error")) }, "Valider") : null,
      h("button", { class: "btn small", onclick: () => entryDialog(w, e) }, "Modifier"),
      h("button", { class: "btn small", onclick: () => fn("editWorldEntry", { worldId: w.id, entryId: e.id, patch: { revealed: !e.revealed } }).catch((x) => toast(errMsg(x), "error")) }, e.revealed ? "Cacher du codex" : "Révéler aux joueurs"),
      h("button", { class: "btn small danger", onclick: async () => { if (await confirmBox("Supprimer", `Retirer « ${e.name} » du monde ?`, "Supprimer")) fn("editWorldEntry", { worldId: w.id, entryId: e.id, action: "delete" }).catch((x) => toast(errMsg(x), "error")); } }, "Supprimer")) : null;
    return h("div", { class: "feature" },
      h("div", { class: "row" }, h("span", {}, CAT_ICON[e.category] || "•"), h("b", { class: "grow" }, e.name),
        e.status === "proposed" ? h("span", { class: "badge magic" }, "proposition") : null, owner ? h("span", { class: "badge" + (e.revealed ? " eq" : "") }, e.revealed ? "dans le codex" : "secret du MJ") : null),
      h("div", { class: "small muted" }, `${CATEGORIES[e.category] || ""} · ajouté par ${e.source === "hôte" ? "toi" : "le MJ"} ${e.at ? timeAgo(e.at) : ""}${e.mergedIn ? ` · intégré en v${e.mergedIn}` : ""}`),
      h("p", { style: { margin: "6px 0 0" } }, e.summary), e.details && owner ? h("p", { class: "desc", style: { margin: "4px 0 0" } }, e.details) : null, actions);
  }

  async function entryDialog(w, e) {
    const cat = h("select", {}, ...Object.entries(CATEGORIES).map(([k, l]) => h("option", { value: k, selected: e?.category === k }, l)));
    const name = h("input", { type: "text", maxlength: 100, value: e?.name || "" });
    const sum = h("textarea", { rows: 2, maxlength: 500 }, e?.summary || "");
    const det = h("textarea", { rows: 5, maxlength: 3000, placeholder: "Détails pour le MJ : liens, motivations, secrets…" }, e?.details || "");
    const rev = h("input", { type: "checkbox", checked: !!e?.revealed });
    const r = await modal(e ? "Modifier l'élément" : "Nouvel élément du monde", h("div", {}, h("label", {}, "Catégorie"), cat, h("label", {}, "Nom"), name, h("label", {}, "Résumé"), sum, h("label", {}, "Détails"), det,
      h("label", { class: "row" }, rev, "Visible des joueurs dans le codex")), [{ label: "Annuler", value: null }, { label: "Enregistrer", class: "btn primary", value: true }]);
    if (!r) return;
    await fn("editWorldEntry", { worldId: w.id, entryId: e?.id, patch: { category: cat.value, name: name.value, summary: sum.value, details: det.value, revealed: rev.checked } }).catch((x) => toast(errMsg(x), "error"));
  }

  function setupPanel(w) {
    const st = JSON.parse(JSON.stringify(w.setup || {}));
    const R = S.rules; const ardyn = w.base === "ardyn";
    const chipSet = (key, options, labelOf = (x) => x) => h("div", { class: "chips" }, ...options.map((o) => {
      const b = h("button", { class: "chip", "aria-pressed": String((st[key] || []).includes(o)) }, labelOf(o));
      b.onclick = () => { const set = new Set(st[key] || []); set.has(o) ? set.delete(o) : set.add(o); st[key] = [...set]; b.setAttribute("aria-pressed", String(set.has(o))); };
      return b;
    }));
    const custom = (key, ph) => { const inp = h("input", { type: "text", placeholder: ph, maxlength: 80 });
      const b = h("button", { class: "btn small", onclick: () => { if (!inp.value.trim()) return; st[key] = [...new Set([...(st[key] || []), inp.value.trim()])]; inp.value = ""; drawSetup(); } }, "Ajouter");
      return h("div", { class: "row", style: { marginTop: "6px" } }, h("div", { class: "grow" }, inp), b); };
    const forb = h("textarea", { rows: 4, maxlength: 2000 }, st.forbidden || "");
    const gold = h("textarea", { rows: 4, maxlength: 3000 }, st.goldenRules || "");
    const wrap = h("div", { class: "stack" });
    const drawSetup = () => {
      wrap.replaceChildren(
        h("p", { class: "small muted" }, "Ce cadre est donné au MJ comme une règle absolue, au-dessus de la bible et des demandes des joueurs."),
        h("section", { class: "panel" }, h("h3", {}, "Inspirations"), chipSet("inspirations", [...new Set([...INSPIRATIONS, ...(st.inspirations || [])])]), custom("inspirations", "Autre œuvre…")),
        h("section", { class: "panel" }, h("h3", {}, "Place de la magie"), ...MAGIC.map(([k, t, d]) =>
          h("button", { class: "choice", style: { width: "100%", marginBottom: "8px" }, "aria-pressed": String(st.magic === k), onclick: () => { st.magic = k; drawSetup(); } }, h("b", {}, t), h("span", {}, d)))),
        h("section", { class: "panel" }, h("h3", {}, "Thèmes à faire vivre"), chipSet("themes", [...new Set([...THEMES, ...(st.themes || [])])]), custom("themes", "Autre thème…")),
        h("section", { class: "panel" }, h("h3", {}, "Interdits"), h("p", { class: "small muted" }, "Ce que le MJ ne doit jamais introduire."), forb),
        h("section", { class: "panel" }, h("h3", {}, "Règles d'or du monde"), h("p", { class: "small muted" }, "Les vérités qui ne changent pas."), gold),
        h("section", { class: "panel" }, h("h3", {}, "Peuples jouables"), chipSet("allowedSpecies", Object.keys(R.species), (k) => (ardyn ? R.species[k].nameArdyn : R.species[k].nameFr) || k)),
        h("section", { class: "panel" }, h("h3", {}, "Classes jouables"), h("p", { class: "small muted" }, "Dans un monde à magie rare, tu peux garder les lanceurs de sorts : le MJ les présentera comme des exceptions. Ou ne garder que les classes martiales et semi-magiques."),
          chipSet("allowedClasses", Object.keys(R.classes), (k) => R.classes[k].nameFr),
          h("div", { class: "row", style: { marginTop: "8px" } }, h("button", { class: "btn small", onclick: () => { st.allowedClasses = ["barbarian", "fighter", "monk", "paladin", "ranger", "rogue", "cleric", "druid"]; drawSetup(); } }, "Préréglage : magie très rare"),
            h("button", { class: "btn small", onclick: () => { st.allowedClasses = Object.keys(R.classes); drawSetup(); } }, "Toutes"))),
        h("section", { class: "panel" }, h("h3", {}, "Ajouts du MJ"), ...[["auto", "Automatiques", "Le MJ enrichit le monde librement ; tu relis quand tu veux."], ["review", "À valider", "Le MJ propose ; un élément ne devient canon qu'après ta validation (il reste utilisable dans la campagne en attendant)."]].map(([k, t, d]) =>
          h("button", { class: "choice", style: { width: "100%", marginBottom: "8px" }, "aria-pressed": String(st.additionMode === k), onclick: () => { st.additionMode = k; drawSetup(); } }, h("b", {}, t), h("span", {}, d)))),
        save);
    };
    const save = h("button", { class: "btn primary" }, "Enregistrer le cadre");
    save.onclick = busy(save, async () => {
      await fn("updateWorld", { worldId: w.id, setup: { ...st, forbidden: forb.value, goldenRules: gold.value } }); toast("Cadre enregistré : il s'applique dès la prochaine réponse du MJ.");
    });
    drawSetup();
    return wrap;
  }

  function versionsPanel(w) {
    const list = h("ul", { class: "list" }, h("li", { class: "muted" }, "Chargement…"));
    getDocs(collection(fs, "worlds", w.id, "versions")).then((snap) => {
      const vs = snap.docs.map((d) => d.data()).sort((a, b) => b.version - a.version);
      list.replaceChildren(...vs.map((v) => h("li", { class: "row" }, h("div", { class: "grow" }, h("b", {}, `${w.name} — version ${v.version}`), v.version === w.version ? h("span", { class: "badge eq", style: { marginLeft: "6px" } }, "utilisée par le MJ") : null,
        h("div", { class: "small muted" }, `${new Date(v.at).toLocaleDateString("fr-FR")}${v.note ? " · " + v.note : ""}${v.added?.length ? ` · ${v.added.length} ajout${v.added.length > 1 ? "s" : ""}` : ""}`)),
        h("button", { class: "btn small", onclick: () => download(`${w.name}_v${v.version}.md`, v.text) }, "Télécharger"))));
    }).catch((e) => list.replaceChildren(h("li", {}, errMsg(e))));
    const ready = S.entries.filter((e) => !e.merged && e.status !== "proposed").length;
    const note = h("input", { type: "text", maxlength: 300, placeholder: "Note de version (facultatif), ex. « Après la campagne de Moncalm »" });
    const gen = h("button", { class: "btn primary", disabled: !ready }, `Créer la version ${w.version + 1}`);
    gen.onclick = busy(gen, async () => {
      if (!(await confirmBox(`Bible version ${w.version + 1}`, `Le MJ va réécrire la bible complète en y intégrant ${ready} ajout${ready > 1 ? "s" : ""}. Les versions précédentes restent téléchargeables. Cela prend 2 à 5 minutes.`, "Lancer"))) return;
      toast("Rédaction de la nouvelle bible en cours… garde cette page ouverte.");
      const r = await fn("consolidateWorld", { worldId: w.id, note: note.value, campaignId: S.cid });
      toast(`Version ${r.version} publiée avec ${r.added} ajouts.`); draw();
    });
    const edit = h("button", { class: "btn small" }, "Modifier la bible actuelle à la main");
    edit.onclick = async () => {
      const ta = h("textarea", { rows: 18, style: { fontFamily: "var(--sans)", fontSize: ".9rem" } }, w.baseText);
      const r = await modal(`Bible v${w.version}`, h("div", {}, h("p", { class: "small muted" }, "Modification directe du texte que lit le MJ (sans créer de nouvelle version)."), ta), [{ label: "Annuler", value: null }, { label: "Enregistrer", class: "btn primary", value: true }]);
      if (r) await fn("updateWorld", { worldId: w.id, baseText: ta.value }).then(() => toast("Bible modifiée.")).catch((e) => toast(errMsg(e), "error"));
    };
    return h("div", { class: "stack" },
      h("section", { class: "panel" }, h("h3", {}, "Nouvelle version de la bible"),
        h("p", {}, ready ? `${ready} ajout${ready > 1 ? "s" : ""} validé${ready > 1 ? "s" : ""} en attente d'intégration.` : "Aucun nouvel ajout validé pour l'instant."),
        h("p", { class: "small muted" }, "Le MJ fusionne la bible actuelle et les ajouts en un document complet et cohérent, qui devient la base de toutes les campagnes de ce monde. Les secrets de l'auteur sont conservés."),
        note, h("div", { class: "row", style: { marginTop: "10px" } }, gen, edit)),
      h("section", { class: "panel" }, h("h3", {}, "Historique"), list));
  }

  ctx.addCleanup(ctx.onChange((what) => { if (what === "world" || what === "campaign") draw(); }));
  draw();
}

export function codexList(entries) {
  const shown = entries.filter((e) => e.revealed);
  if (!shown.length) return h("p", { class: "muted" }, "Le codex se remplit à mesure que vous découvrez le monde.");
  const by = {};
  for (const e of shown) (by[e.category] ||= []).push(e);
  return h("div", {}, ...Object.entries(by).map(([k, list]) => h("section", { class: "section" }, h("h3", {}, `${CAT_ICON[k] || ""} ${CATEGORIES[k] || k}`),
    ...list.map((e) => h("div", { class: "feature" }, h("b", {}, e.name), h("p", { style: { margin: "4px 0 0" } }, e.summary))))));
}

function download(name, text) {
  const a = h("a", { href: URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" })), download: name });
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
