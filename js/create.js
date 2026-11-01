import { S, fn, go } from "./core.js";
import { h, rich, toast, busy, errMsg, modal, topbar } from "./ui.js";
import { translateInto } from "./actions.js";
import { ABILITIES, ABI_FR, ABI_FR_LONG, STANDARD_ARRAY, POINT_BUY_COST, POINT_BUY_TOTAL, pointBuySpent, mod, fmtMod, spellLimits, classSpellList, derive, hpAtLevel1 } from "./engine.js";
import { spellPicker } from "./sheet.js";
import { showIntro } from "./world.js";

const CLASS_BLURB = {
  barbarian: "Guerrier sauvage porté par sa rage. Très résistant, frappe fort, adore foncer.",
  bard: "Musicien et conteur dont les chansons sont magiques. Aide ses amis, charme ses ennemis.",
  cleric: "Serviteur d'une divinité : soigne, protège et repousse les morts-vivants.",
  druid: "Gardien de la nature, parle aux animaux et peut se transformer en bête.",
  fighter: "Maître d'armes discipliné, solide en armure. Simple à jouer, toujours utile.",
  monk: "Combattant agile à mains nues, rapide comme le vent, grâce à son énergie intérieure.",
  paladin: "Chevalier sacré lié par un serment : armure lourde, frappes divines et soins.",
  ranger: "Pisteur des terres sauvages, archer redoutable, un peu de magie de la nature.",
  rogue: "Discret et astucieux : serrures, pièges, coups sournois et beaux discours.",
  sorcerer: "Né avec la magie dans le sang : peu de sorts, mais il les tord à volonté.",
  warlock: "A passé un pacte avec une puissance mystérieuse qui lui offre des pouvoirs.",
  wizard: "Érudit de la magie : le plus grand nombre de sorts, appris dans son grimoire.",
};
const SPECIES_BLURB = {
  dragonborn: "Sang de dragon : souffle élémentaire et résistance. En Ardyn, les Sangdragons d'Istar parlent aux dragons.",
  dwarf: "Robustes et tenaces, voient dans le noir, sentent la pierre. Hardyll ou les Collines Bleues.",
  elf: "Gracieux, sens aiguisés, ne dorment pas mais méditent. Quatre peuples en Ardyn.",
  gnome: "Petits, malins et curieux, protégés contre la magie qui embrouille l'esprit.",
  goliath: "Géants parmi les humains, d'une force prodigieuse. En Ardyn : les gens du Jorgland.",
  halfling: "Petits, chanceux et discrets ; se faufilent partout.",
  human: "Polyvalents et ambitieux : une compétence et un don de plus.",
  orc: "Endurants et puissants : se relèvent quand d'autres tomberaient.",
  tiefling: "Héritage d'outre-monde, magie innée et résistance. Souvent mal vus.",
};
const ARDYN_ORIGINS = ["Idaris (La Blanche)", "Istar", "Handorf", "Belion", "Moncalm", "Valerm", "Hardyll", "Collines Bleues", "Bois de Belm", "Aelen errant", "Jorgland", "Terres de l'Est (Helgen)", "Le Bethel", "Benemor"];
// Peuples d'Ardyn (bible) : choix d'origine pour les elfes, nains et humains. lineage = lignée SRD conseillée.
const ARDYN_PEOPLES = {
  elf: [
    { name: "Bois de Belm", place: "Bois de Belm", lineage: "elven-lineage-wood-elf", desc: "Les Adaptateurs : alliés de l'Empire, conseillers et diplomates du roi druide Sanchours. La plupart des elfes qu'on croise." },
    { name: "Elenesti", place: "Istar (enclave elenesti)", lineage: "elven-lineage-high-elf", desc: "Les Déchirés : hauts elfes de l'enclave d'Istar, neutres absolus, gardiens des lames de la Source Argentée." },
    { name: "Selvanari", place: "Royaume selvanari", lineage: "elven-lineage-wood-elf", desc: "Le Grand Schisme : royaume sylvain fermé du roi Andhuyll, qui méprise le monde. Un Selvanari dehors est rare… ou exilé." },
    { name: "Aelen", place: "Aelen errant", lineage: "elven-lineage-high-elf", desc: "Les Gardiens de la Mémoire : errants mélancoliques d'une forêt brûlée, qu'on croise près des ruines et des champs de bataille." },
    { name: "Qaalish", place: "Qaalish", lineage: "elven-lineage-wood-elf", desc: "Les derniers elfes de la forêt primordiale en ruines du roi Edelanost, peuplée de créatures féériques." },
  ],
  dwarf: [
    { name: "Hardyll", place: "Hardyll", desc: "La plus vieille cité naine, à demi ruinée par les sièges et la Phtisie Grise. Fiers, éprouvés, en guerre contre les orques." },
    { name: "Collines Bleues", place: "Collines Bleues", desc: "Nains des collines partis d'Hardyll : bâtisseurs prospères des villes de l'Empire, sujets du roi Beombur le Gros." },
  ],
  human: [
    { name: "Empire de Wermar", place: "Handorf", desc: "Fédération libre et savante : Handorf, Valerm, Moncalm, Belion, le Val d'Eren… Bibliothèques, commerce et routes ouvertes." },
    { name: "Idaris", place: "Idaris (La Blanche)", desc: "Théocratie de Juredo aux murs blancs, surveillée par la Main de Juredo. On y craint la magie." },
    { name: "Istar", place: "Istar", desc: "Royaume marchand des dragons fondé sur la liberté, grenier à blé de l'Empire." },
    { name: "Terres de l'Est", place: "Terres de l'Est (Helgen)", desc: "Steppes et collines des treize tribus indomptables, sous la poigne du roi Beorgrim." },
    { name: "Le Bethel", place: "Le Bethel", desc: "Cité libre de la magie, refuge des mages traqués par la Guilde et nid d'espions." },
    { name: "Saabed", place: "Saabed", desc: "Désert du Sud, terre des bédouins d'où vint jadis Albos." },
  ],
};
const PORTRAITS = ["🛡️", "⚔️", "🏹", "🪓", "🗡️", "🔮", "📜", "🌿", "🔥", "❄️", "⚡", "🌙", "☀️", "🐉", "🦉", "🐺", "🦊", "🐻", "🦅", "🍀", "👑", "🎻", "⚒️", "🧭"];

export function renderCreate(ctx) {
  const R = S.rules; const ardyn = (S.world?.base || S.campaign?.setting) === "ardyn";
  const st = { step: 0, species: null, subspecies: null, class: null, background: null, abilityMethod: "standard",
    base: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 }, rolled: null, bgBonus: {}, bonusMode: "2-1",
    classSkills: [], humanSkill: null, humanFeat: null, fightingStyle: null, expertise: [], equipClass: 0, equipBg: 0,
    cantrips: [], spells: [], people: null, name: "", portrait: "🛡️", origin: "", appearance: "", backstory: "" };
  const steps = ["Espèce", "Classe", "Historique", "Caractéristiques", "Compétences", "Équipement", "Sorts", "Identité"];
  const body = h("div"); const bar = h("div", { class: "steps" }); const nav = h("div", { class: "row", style: { marginTop: "22px" } });
  const err = h("p", { class: "panel hidden", role: "alert", style: { borderColor: "var(--blood)", color: "var(--blood)", marginTop: "16px" } });
  ctx.mount(topbar(h("button", { class: "icon-btn", "aria-label": "Retour", onclick: () => go(`#/c/${S.cid}`) }, "‹"), h("span", { class: "title" }, "Nouveau héros")),
    h("main", { class: "wrap" }, bar, body, err, nav));

  const isCaster = () => st.class && R.classes[st.class].levels["1"].spellcasting?.prepared_spells > 0;
  const visibleSteps = () => steps.map((s, i) => i).filter((i) => i !== 6 || isCaster());
  const choiceGrid = (entries, key, onPick) => h("div", { class: "choice-grid" }, ...entries.map(([k, title, sub]) =>
    h("button", { class: "choice", "aria-pressed": String(st[key] === k), onclick: () => { st[key] = k; onPick?.(k); draw(); } }, h("b", {}, title), h("span", {}, sub))));
  const traitList = (ids) => h("div", {}, ...ids.map((t) => R.traits[t]).filter(Boolean).map((t) => { const p = h("div", { class: "desc" }, rich(t.description));
    return h("details", { class: "feature" }, h("summary", {}, t.name), p, t.descriptionEn ? null : h("button", { class: "btn small ghost", onclick: (e) => { e.preventDefault(); translateInto(p, t.description); } }, "Traduire")); }));

  function stepSpecies() {
    const sp = st.species && R.species[st.species];
    const okS = S.world?.setup?.allowedSpecies;
    const peoples = ardyn && sp ? ARDYN_PEOPLES[sp.index] : null;
    return [h("h2", {}, "Choisis ton peuple"), ardyn ? h("p", {}, h("button", { class: "btn small", onclick: () => showIntro() }, "📖 Découvrir Ardyn en quelques minutes")) : null, choiceGrid(Object.values(R.species).filter((s) => !okS?.length || okS.includes(s.index)).map((s) => [s.index, ardyn ? s.nameArdyn || s.nameFr : s.nameFr, SPECIES_BLURB[s.index] || ""]), "species", () => { st.subspecies = null; st.people = null; if (st.species !== "human") { st.humanSkill = null; st.humanFeat = null; } }),
      peoples ? h("div", {}, h("h3", { style: { marginTop: "18px" } }, "Ton peuple en Ardyn"),
        h("div", { class: "choice-grid" }, ...peoples.map((p) => h("button", { class: "choice", "aria-pressed": String(st.people === p.name), onclick: () => {
          const prev = peoples.find((x) => x.name === st.people);
          if (!st.origin || st.origin === prev?.place) st.origin = p.place;
          st.people = p.name; if (p.lineage && sp.subspecies.includes(p.lineage)) st.subspecies = p.lineage; draw();
        } }, h("b", {}, p.name), h("span", {}, p.desc + (p.lineage ? ` (lignée conseillée : ${R.subspecies[p.lineage].name.replace(/^.*?: /, "")})` : "")))))) : null,
      sp?.subspecies.length ? h("div", {}, h("h3", { style: { marginTop: "18px" } }, "Lignée"), choiceGrid(sp.subspecies.map((k) => [k, R.subspecies[k].name.replace(/^.*?: /, ""), R.subspecies[k].damageType ? "Énergie : " + R.subspecies[k].damageType : ""]), "subspecies")) : null,
      sp ? h("div", { class: "section" }, h("h3", {}, "Traits"), traitList([...sp.traits, ...(st.subspecies ? R.subspecies[st.subspecies].traits : [])])) : null];
  }
  function stepClass() {
    const c = st.class && R.classes[st.class];
    const okC = S.world?.setup?.allowedClasses;
    const magic = S.world?.setup?.magic;
    return [h("h2", {}, "Choisis ta classe"), magic === "rare" ? h("p", { class: "small muted" }, "Dans ce monde, la magie est rare et redoutée : un lanceur de sorts y est une exception qu'on remarque.") : null,
      choiceGrid(Object.values(R.classes).filter((c) => !okC?.length || okC.includes(c.index)).map((c) => [c.index, c.nameFr, CLASS_BLURB[c.index]]), "class", () => { st.classSkills = []; st.cantrips = []; st.spells = []; st.fightingStyle = null; st.expertise = []; st.equipClass = 0; }),
      c ? h("div", { class: "section" }, h("p", { class: "small muted" }, `Dé de vie d${c.hitDie} · Sauvegardes : ${c.saves.map((s) => ABI_FR_LONG[s]).join(", ")} · Caractéristique principale : ${c.primary.map((s) => ABI_FR_LONG[s]).join(" ou ")}`),
        h("h3", {}, "Au niveau 1"), h("div", {}, ...c.levels["1"].features.map((f) => R.features[f]).filter(Boolean).map((f) => { const p = h("div", { class: "desc" }, rich(f.description));
          return h("details", { class: "feature" }, h("summary", {}, f.name), p, f.descriptionEn ? null : h("button", { class: "btn small ghost", onclick: (e) => { e.preventDefault(); translateInto(p, f.description); } }, "Traduire")); }))) : null];
  }
  function stepBackground() {
    const b = st.background && R.backgrounds[st.background];
    return [h("h2", {}, "D'où vient ton héros ?"), h("p", { class: "muted" }, "L'historique donne des compétences, un don et +3 points de caractéristiques."),
      choiceGrid(Object.values(R.backgrounds).map((b) => [b.index, b.nameFr, `${b.skills.map((s) => R.skills[s].nameFr).join(", ")} · don ${b.feat.name}`]), "background", () => { st.bgBonus = {}; st.classSkills = []; st.equipBg = 0; }),
      b ? h("div", { class: "section" }, h("h3", {}, `Don : ${b.feat.name}${b.feat.note ? " (" + ({ Cleric: "clerc", Wizard: "magicien", Druid: "druide" }[b.feat.note] || b.feat.note) + ")" : ""}`), (() => { const t = R.feats[b.feat.index]?.description || ""; const p = h("div", { class: "desc" }, rich(t)); return [p, R.feats[b.feat.index]?.descriptionEn ? null : h("button", { class: "btn small ghost", onclick: () => translateInto(p, t) }, "Traduire")]; })()) : null];
  }
  /** Bonus d'historique proposé d'office : +2 sur la meilleure caractéristique utile, +1 sur la suivante (modifiable). */
  function autoBonus() {
    const b = R.backgrounds[st.background]; if (!b) return;
    const prim = R.classes[st.class]?.primary || [];
    const order = [...b.abilities].sort((x, y) => (prim.includes(y) - prim.includes(x)) || (st.base[y] - st.base[x]));
    st.bonusMode = "2-1"; st.bgBonus = { [order[0]]: 2, [order[1]]: 1 };
  }
  function stepAbilities() {
    if (!Object.keys(st.bgBonus).length) autoBonus();
    const b = R.backgrounds[st.background]; const out = [h("h2", {}, "Caractéristiques")];
    out.push(h("div", { class: "chips" }, ...[["standard", "Tableau standard"], ["pointbuy", "Achat de points"], ["roll", "Lancer 4d6"]].map(([k, l]) =>
      h("button", { class: "chip", "aria-pressed": String(st.abilityMethod === k), onclick: () => { st.abilityMethod = k; if (k === "standard") st.base = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 }; if (k === "pointbuy") st.base = Object.fromEntries(ABILITIES.map((a) => [a, 8])); if (k === "roll" && st.rolled) st.base = Object.fromEntries(ABILITIES.map((a, i) => [a, st.rolled[i]])); draw(); } }, l))));
    const pool = st.abilityMethod === "standard" ? STANDARD_ARRAY : st.abilityMethod === "roll" ? st.rolled : null;
    if (st.abilityMethod === "roll" && !st.rolled) {
      const btn = h("button", { class: "btn primary" }, "🎲 Lancer mes caractéristiques");
      btn.onclick = busy(btn, async () => { const r = await fn("rollAbilityScores", { campaignId: S.cid }); st.rolled = r.values; st.base = Object.fromEntries(ABILITIES.map((a, i) => [a, r.values[i]])); draw(); });
      out.push(h("p", { class: "small muted" }, "Le serveur lance 4d6 six fois et garde les 3 meilleurs dés. Un seul tirage par personnage, visible de toute la table."), btn);
      return out;
    }
    if (pool) out.push(h("p", { class: "small muted" }, st.abilityMethod === "standard" ? "Répartis 15, 14, 13, 12, 10 et 8. Mets les meilleures valeurs dans la caractéristique principale de ta classe." : `Tes résultats : ${pool.join(", ")}. Répartis-les comme tu veux.`));
    else out.push(h("p", { class: "small muted" }, `Points dépensés : ${pointBuySpent(st.base)} / ${POINT_BUY_TOTAL} (valeurs de 8 à 15).`));
    out.push(h("div", { class: "score-grid" }, ...ABILITIES.map((a) => {
      const total = st.base[a] + (st.bgBonus[a] || 0);
      let control;
      if (pool) {
        control = h("select", { "aria-label": ABI_FR_LONG[a] }, ...[...new Set(pool)].sort((x, y) => y - x).map((v) => h("option", { value: v, selected: st.base[a] === v }, v)));
        // Échange les deux valeurs : la répartition reste toujours celle du tableau ou des dés.
        control.onchange = () => { const v = Number(control.value); const other = ABILITIES.find((o) => o !== a && st.base[o] === v); if (other) st.base[other] = st.base[a]; st.base[a] = v; draw(); };
      } else control = h("div", { class: "stepper" }, h("button", { "aria-label": "moins", onclick: () => { if (st.base[a] > 8) { st.base[a]--; draw(); } } }, "−"), h("b", {}, st.base[a]),
        h("button", { "aria-label": "plus", onclick: () => { if (st.base[a] < 15) { st.base[a]++; if (pointBuySpent(st.base) > POINT_BUY_TOTAL) st.base[a]--; draw(); } } }, "+"));
      return h("div", { class: "score" }, h("div", { class: "small muted" }, ABI_FR_LONG[a], R.classes[st.class].primary.includes(a) ? " ★" : ""), h("div", { class: "final" }, total, h("span", { class: "small muted" }, ` (${fmtMod(mod(total))})`)), control, st.bgBonus[a] ? h("div", { class: "small", style: { color: "var(--verdigris)" } }, `+${st.bgBonus[a]} historique`) : null);
    })));
    // Bonus d'historique
    out.push(h("h3", { style: { marginTop: "20px" } }, "Bonus de l'historique"), h("p", { class: "small muted" }, `Parmi ${b.abilities.map((x) => ABI_FR_LONG[x]).join(", ")} : +2 à l'une et +1 à une autre, ou +1 aux trois.`),
      h("div", { class: "chips" }, h("button", { class: "chip", "aria-pressed": String(st.bonusMode === "2-1"), onclick: () => { autoBonus(); draw(); } }, "+2 / +1"),
        h("button", { class: "chip", "aria-pressed": String(st.bonusMode === "1-1-1"), onclick: () => { st.bonusMode = "1-1-1"; st.bgBonus = Object.fromEntries(b.abilities.map((x) => [x, 1])); draw(); } }, "+1 / +1 / +1")));
    if (st.bonusMode === "2-1") {
      const two = Object.keys(st.bgBonus).find((k) => st.bgBonus[k] === 2); const one = Object.keys(st.bgBonus).find((k) => st.bgBonus[k] === 1);
      const sel = (val, other, n) => { const s = h("select", {}, h("option", { value: "" }, "—"), ...b.abilities.filter((x) => x !== other).map((x) => h("option", { value: x, selected: x === val }, ABI_FR_LONG[x])));
        s.onchange = () => { const nb = {}; if (n === 2) { if (s.value) nb[s.value] = 2; if (one && one !== s.value) nb[one] = 1; } else { if (two) nb[two] = 2; if (s.value) nb[s.value] = 1; } st.bgBonus = nb; draw(); }; return s; };
      out.push(h("div", { class: "row", style: { alignItems: "flex-end" } }, h("div", { class: "grow" }, h("label", {}, "+2 à"), sel(two, one, 2)), h("div", { class: "grow" }, h("label", {}, "+1 à"), sel(one, two, 1))));
    }
    return out;
  }
  function stepSkills() {
    const c = R.classes[st.class]; const b = R.backgrounds[st.background]; const out = [h("h2", {}, "Compétences")];
    out.push(h("p", { class: "small muted" }, `Ton historique t'apprend déjà : ${b.skills.map((s) => R.skills[s].nameFr).join(", ")}. Choisis ${c.skills.choose} compétences de ${c.nameFr.toLowerCase()} :`));
    out.push(h("div", { class: "chips" }, ...c.skills.from.map((s) => { const taken = b.skills.includes(s); const on = st.classSkills.includes(s);
      return h("button", { class: "chip", disabled: taken, "aria-pressed": String(on), onclick: () => { if (on) st.classSkills = st.classSkills.filter((x) => x !== s); else if (st.classSkills.length < c.skills.choose) st.classSkills.push(s); draw(); } },
        `${R.skills[s].nameFr} (${ABI_FR[R.skills[s].ability]})`); })));
    const known = new Set([...b.skills, ...st.classSkills]);
    if (st.species === "human") {
      out.push(h("h3", { style: { marginTop: "18px" } }, "Humain : compétence bonus"), h("div", { class: "chips" }, ...Object.keys(R.skills).filter((s) => !b.skills.includes(s) && !st.classSkills.includes(s)).map((s) =>
        h("button", { class: "chip", "aria-pressed": String(st.humanSkill === s), onclick: () => { st.humanSkill = s; draw(); } }, R.skills[s].nameFr))));
      if (st.humanSkill) known.add(st.humanSkill);
      out.push(h("h3", { style: { marginTop: "18px" } }, "Humain : don d'origine bonus"), h("div", { class: "chips" }, ...Object.entries(R.feats).filter(([, f]) => f.type === "origin").map(([k, f]) =>
        h("button", { class: "chip", "aria-pressed": String(st.humanFeat === k), title: f.description.slice(0, 300), onclick: () => { st.humanFeat = k; draw(); } }, f.name))));
    }
    const lvl1 = R.classes[st.class].levels["1"].features;
    if (lvl1.some((f) => f.endsWith("fighting-style"))) out.push(h("h3", { style: { marginTop: "18px" } }, "Style de combat"), h("div", { class: "chips" }, ...Object.entries(R.feats).filter(([, f]) => f.type === "fighting-style").map(([k, f]) =>
      h("button", { class: "chip", "aria-pressed": String(st.fightingStyle === k), title: f.description, onclick: () => { st.fightingStyle = k; draw(); } }, { archery: "Archerie (+2 à distance)", defense: "Défense (+1 CA en armure)", "great-weapon-fighting": "Armes à deux mains", "two-weapon-fighting": "Combat à deux armes" }[k] || f.name))));
    if (lvl1.some((f) => f.endsWith("-expertise"))) out.push(h("h3", { style: { marginTop: "18px" } }, "Expertise (2 compétences maîtrisées, bonus doublé)"), h("div", { class: "chips" }, ...[...known].map((s) =>
      h("button", { class: "chip", "aria-pressed": String(st.expertise.includes(s)), onclick: () => { if (st.expertise.includes(s)) st.expertise = st.expertise.filter((x) => x !== s); else if (st.expertise.length < 2) st.expertise.push(s); draw(); } }, R.skills[s].nameFr))));
    return out;
  }
  function stepEquipment() {
    const c = R.classes[st.class]; const b = R.backgrounds[st.background];
    const block = (title, eq, key) => !eq?.length ? null : h("div", { class: "section" }, h("h3", {}, title), ...eq[0].options.map((o, i) =>
      h("button", { class: "choice", style: { width: "100%", marginBottom: "8px" }, "aria-pressed": String(st[key] === i), onclick: () => { st[key] = i; draw(); } },
        h("b", {}, o.items.length ? `Option ${String.fromCharCode(65 + i)}` : `${o.gold} pièces d'or`), h("span", {}, o.items.length ? o.items.map((x) => `${x.count > 1 ? x.count + "× " : ""}${x.name}`).join(", ") + (o.gold ? ` + ${o.gold} po` : "") : "Tu achèteras ton équipement toi-même."))));
    return [h("h2", {}, "Équipement de départ"), h("p", { class: "small muted" }, "Noms d'objets en anglais (SRD). Les sacs d'équipement sont déballés automatiquement."),
      block(`Équipement de ${c.nameFr.toLowerCase()}`, c.equipment, "equipClass"), block(`Équipement d'historique (${b.nameFr.toLowerCase()})`, b.equipment, "equipBg")];
  }
  function stepSpells() {
    const fake = { class: st.class, level: 1 }; const lim = spellLimits(R, fake);
    return [h("h2", {}, "Sorts"), h("p", { class: "small muted" }, "Survole ou appuie longuement pour lire la description. Tu pourras traduire chaque sort depuis ta fiche."),
      lim.cantrips ? spellPicker(`Tours de magie (${lim.cantrips})`, classSpellList(R, st.class, 0).filter((s) => s.level === 0), lim.cantrips, st.cantrips) : null,
      spellPicker(`Sorts de niveau 1 préparés (${lim.prepared})`, classSpellList(R, st.class, 1).filter((s) => s.level === 1), lim.prepared, st.spells)];
  }
  function stepIdentity() {
    const name = h("input", { type: "text", maxlength: 60, value: st.name, placeholder: "Le nom de ton héros" }); name.oninput = () => (st.name = name.value);
    const origin = h("input", { type: "text", maxlength: 120, value: st.origin, list: "origins", placeholder: ardyn ? "Ex. Belion, Hardyll, Bois de Belm…" : "Village, cité, royaume…" }); origin.oninput = () => (st.origin = origin.value);
    const app = h("textarea", { rows: 2, maxlength: 1500, placeholder: "Taille, cheveux, cicatrice, vêtements…" }, st.appearance); app.oninput = () => (st.appearance = app.value);
    const story = h("textarea", { rows: 5, maxlength: 4000, placeholder: "D'où viens-tu ? Que cherches-tu ? Qui comptes-tu retrouver ? Le MJ s'en servira pour l'aventure." }, st.backstory); story.oninput = () => (st.backstory = story.value);
    const ch = preview();
    const d = derive(R, ch);
    return [h("h2", {}, "Qui es-tu ?"), h("label", {}, "Nom"), name, h("label", {}, "Icône"), h("div", { class: "emoji-pick" }, ...PORTRAITS.map((p) => h("button", { "aria-pressed": String(st.portrait === p), onclick: () => { st.portrait = p; draw(); } }, p))),
      h("label", {}, "Origine"), origin, h("datalist", { id: "origins" }, ...(ardyn ? ARDYN_ORIGINS : []).map((o) => h("option", { value: o }))),
      h("label", {}, "Apparence"), app, h("label", {}, "Histoire"), story,
      h("div", { class: "panel section" }, h("h3", {}, "Aperçu"), h("p", {}, `${R.species[st.species].nameFr} ${R.classes[st.class].nameFr.toLowerCase()} · ${hpAtLevel1(R, ch)} PV · CA ${d.ac} · Initiative ${fmtMod(d.initiative)}`),
        h("p", { class: "small muted" }, ABILITIES.map((a) => `${ABI_FR[a]} ${d.abilities[a]}`).join(" · ")))];
  }
  function preview() {
    const abilities = Object.fromEntries(ABILITIES.map((a) => [a, Math.min(20, st.base[a] + (st.bgBonus[a] || 0))]));
    const sp = R.species[st.species]; const c = R.classes[st.class];
    const opt = c.equipment?.[0]?.options?.[st.equipClass];
    const inventory = (opt?.items || []).map((x, i) => ({ id: "p" + i, index: x.index, name: x.name, qty: x.count, equipped: true }));
    // Une seule armure équipée pour l'aperçu
    let armorSeen = false;
    for (const it of inventory) { const e = R.equipment[it.index]; if (e?.ac && !e.cats.includes("shields")) { if (armorSeen) it.equipped = false; armorSeen = true; } }
    return { class: st.class, species: st.species, subspecies: st.subspecies, level: 1, abilities, traits: [...sp.traits, ...(st.subspecies ? R.subspecies[st.subspecies].traits : [])],
      skills: [...R.backgrounds[st.background].skills, ...st.classSkills], feats: [st.fightingStyle].filter(Boolean), inventory };
  }

  function valid(i) {
    const c = st.class && R.classes[st.class];
    switch (i) {
      case 0: if (ardyn && ARDYN_PEOPLES[st.species] && !st.people) return "Choisis ton peuple en Ardyn.";
        return (!!st.species && (!R.species[st.species].subspecies.length || !!st.subspecies)) || "Choisis un peuple (et une lignée).";
      case 1: return !!st.class || "Choisis une classe.";
      case 2: return !!st.background || "Choisis un historique.";
      case 3: { if (st.abilityMethod === "roll" && !st.rolled) return "Lance d'abord tes caractéristiques.";
        if (st.abilityMethod === "pointbuy" && pointBuySpent(st.base) > POINT_BUY_TOTAL) return "Trop de points dépensés.";
        const v = Object.values(st.bgBonus).sort().join(","); return v === "1,2" || v === "1,1,1" || "Choisis le bonus de l'historique."; }
      case 4: { if (st.classSkills.length !== c.skills.choose) return `Choisis ${c.skills.choose} compétences.`;
        if (st.species === "human" && (!st.humanSkill || !st.humanFeat)) return "Choisis la compétence et le don bonus de l'humain.";
        const l1 = c.levels["1"].features;
        if (l1.some((f) => f.endsWith("fighting-style")) && !st.fightingStyle) return "Choisis un style de combat.";
        if (l1.some((f) => f.endsWith("-expertise")) && st.expertise.length !== 2) return "Choisis 2 compétences d'expertise.";
        return true; }
      case 6: { if (!isCaster()) return true; const lim = spellLimits(R, { class: st.class, level: 1 });
        return (st.cantrips.length === lim.cantrips && st.spells.length === lim.prepared) || `Choisis ${lim.cantrips ? lim.cantrips + " tours de magie et " : ""}${lim.prepared} sorts.`; }
      case 7: return st.name.trim().length > 0 || "Donne un nom à ton héros.";
      default: return true;
    }
  }

  function draw() {
    err.classList.add("hidden");
    const vis = visibleSteps(); const pos = vis.indexOf(st.step);
    bar.replaceChildren(...vis.map((i, k) => h("i", { class: k <= pos ? "done" : "", title: steps[i] })));
    const view = [stepSpecies, stepClass, stepBackground, stepAbilities, stepSkills, stepEquipment, stepSpells, stepIdentity][st.step];
    body.replaceChildren(h("p", { class: "small muted" }, `Étape ${pos + 1} sur ${vis.length} · ${steps[st.step]}`), ...[].concat(view()).filter(Boolean));
    const prev = h("button", { class: "btn", disabled: pos === 0, onclick: () => { st.step = vis[pos - 1]; draw(); window.scrollTo(0, 0); } }, "Précédent");
    const last = pos === vis.length - 1;
    const next = h("button", { class: "btn primary" }, last ? "Créer mon héros" : "Suivant");
    next.onclick = busy(next, async () => {
      const v = valid(st.step);
      if (v !== true) { err.textContent = "⚠️ " + v; err.classList.remove("hidden"); err.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
      err.classList.add("hidden");
      if (!last) { st.step = vis[pos + 1]; draw(); window.scrollTo(0, 0); return; }
      const draft = { ...st, bgBonus: st.bgBonus };
      await fn("createCharacter", { campaignId: S.cid, draft });
      toast(`${st.name} est prêt pour l'aventure !`); go(`#/c/${S.cid}`);
    });
    nav.replaceChildren(prev, h("span", { class: "grow" }), next);
  }
  draw();
}
