// Test de bout en bout de la logique serveur (faux Firestore + MJ scripté). Lancer : npm test
const txt = (c) => typeof c === "string" ? c : c.map((b) => b.text || "").join("");
import assert from "node:assert/strict";
import * as F from "./fakefs.js";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const here = new URL(".", import.meta.url);
const load = (f) => readFileSync(new URL(`../data/${f}`, here), "utf8");
const gmWakes = [];

const script = []; // réponses successives du « modèle »
const calls = [];
globalThis.__TEST__ = {
  db: F.db, FieldValue: F.FieldValue,
  RULES: JSON.parse(load("rules.json")), MONSTERS: JSON.parse(load("monsters.json")), BIBLE: load("bible-ardyn.md"),
  hash: async (t) => createHash("sha1").update(t).digest("hex"),
  requestGm: (cid, reason) => gmWakes.push({ cid, reason }), apiKey: "test",
  anthropic: { messages: {
    create: async (req) => { calls.push(req); const r = script.shift(); if (!r) throw new Error("script vide"); return r(req); },
    stream: (req) => ({ finalMessage: async () => { calls.push(req); return script.shift()(req); } }),
  } },
};
const tool = (name, input, id = name + Math.random()) => ({ type: "tool_use", id, name, input });
const resp = (content, stop = "tool_use") => () => ({ content, stop_reason: stop, usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 800 } });

const camp = await import("../js/server/campaigns.js");
const chars = await import("../js/server/characters.js");
const dice = await import("../js/server/dice.js");
const gm = await import("../js/server/gm.js");
const worlds = await import("../js/server/worlds.js");
const E = await import("../js/engine.js");
const { RULES: R } = await import("../js/server/common.js");

let ok = 0; const t = async (name, fn) => { await fn(); ok++; console.log("✓", name); };
const expectErr = async (p, re) => { try { await p; } catch (e) { assert.match(e.message, re); return; } assert.fail("aurait dû échouer : " + re); };

const P = "papa", K = "enfant";
let cid, code, fighterId, wizId;

await t("création et invitation", async () => {
  const r = await camp.createCampaign(P, { name: "Les Ombres de Moncalm", setting: "ardyn", displayName: "Philippe" });
  cid = r.id; code = r.inviteCode; assert.equal(code.length, 6);
  await camp.joinCampaign(K, { code: code.toLowerCase(), displayName: "Amaury" });
  const c = F.raw(`campaigns/${cid}`); assert.deepEqual(c.members, [P, K]);
  await expectErr(camp.joinCampaign("x", { code: "ZZZZZZ" }), /inconnu/);
});

await t("création d'un guerrier nain (tableau standard)", async () => {
  const draft = { name: "Thrain", species: "dwarf", class: "fighter", background: "soldier", abilityMethod: "standard",
    base: { str: 15, dex: 13, con: 14, int: 8, wis: 12, cha: 10 }, bgBonus: { str: 2, con: 1 },
    classSkills: ["perception", "survival"], equipClass: 0, equipBg: 0, fightingStyle: "defense", portrait: "⚒️" };
  await expectErr(chars.createCharacter(P, { campaignId: cid, draft: { ...draft, base: { ...draft.base, str: 16 } } }), /standard/);
  await expectErr(chars.createCharacter(P, { campaignId: cid, draft: { ...draft, classSkills: ["athletics", "survival"] } }), /compétences/);
  fighterId = (await chars.createCharacter(P, { campaignId: cid, draft })).id;
  const ch = { id: fighterId, ...F.raw(`campaigns/${cid}/characters/${fighterId}`) };
  assert.equal(ch.abilities.str, 17); assert.equal(ch.hp.max, 10 + 2 + 1);
  const d = E.derive(R, ch);
  assert.equal(d.ac, 16 + 1, "cotte de mailles + style Défense");
  assert.ok(d.attacks.some((a) => a.name === "Épée à deux mains" || a.name === "Fléau d'armes"));
});

await t("création d'un magicien elfe (4d6 tirés par le serveur)", async () => {
  const rolls = await chars.rollAbilityScores(K, { campaignId: cid });
  const again = await chars.rollAbilityScores(K, { campaignId: cid });
  assert.deepEqual(rolls.values, again.values, "pas de re-tirage");
  const v = [...rolls.values].sort((a, b) => b - a);
  const base = { int: v[0], dex: v[1], con: v[2], wis: v[3], cha: v[4], str: v[5] };
  const cantrips = ["fire-bolt", "light", "mage-hand"]; const spells = E.classSpellList(R, "wizard", 1).filter((s) => s.level === 1).slice(0, 4).map((s) => s.index);
  const draft = { name: "Lysandre", species: "elf", subspecies: "elven-lineage-high-elf", class: "wizard", background: "sage", abilityMethod: "roll",
    base, bgBonus: { int: 2, con: 1 }, classSkills: ["investigation", "insight"], equipClass: 0, equipBg: 0, cantrips, spells };
  await expectErr(chars.createCharacter(K, { campaignId: cid, draft: { ...draft, base: { ...base, int: 2 } } }), /dés lancés|ne correspondent/);
  await expectErr(chars.createCharacter(K, { campaignId: cid, draft: { ...draft, spells: ["fireball", ...spells.slice(1)] } }), /Sort invalide/);
  wizId = (await chars.createCharacter(K, { campaignId: cid, draft })).id;
  const ch = F.raw(`campaigns/${cid}/characters/${wizId}`);
  assert.equal(ch.slots["1"].max, 2); assert.equal(ch.spells.prepared.length, 4);
});

await t("le MJ ouvre l'aventure et lance un combat", async () => {
  script.push(resp([{ type: "text", text: "La brume tombe sur Moncalm." }, tool("update_scene", { title: "La route de Moncalm", mood: "tension" }),
    tool("start_combat", { enemies: [{ monster_key: "goblin-warrior", name: "Gobelin", count: 2 }] })]));
  script.push(resp([{ type: "text", text: "Deux silhouettes surgissent ! Lancez l'initiative." }], "end_turn"));
  await gm.runGm(cid, "players");
  const c = F.raw(`campaigns/${cid}`);
  assert.equal(c.state.combat.active, true); assert.equal(c.state.combat.order.length, 4);
  assert.equal(c.state.pendingRolls.length, 2); assert.ok(!("dc" in c.state.pendingRolls[0]));
  assert.equal(c.state.gmBusy, false);
  const sys = calls[0].system.map((b) => b.text).join(""); assert.match(sys, /Ardyn/);
  assert.match(txt(calls[0].messages[0].content), /Thrain/);
  const logs = (await F.db.collection(`campaigns/${cid}/log`).where("tms", ">", 0).get()).docs.map((d) => d.data());
  assert.ok(logs.some((l) => l.type === "gm" && /brume/.test(l.text)));
});

await t("anti-triche : jets d'initiative sur demande, mauvais perso refusé", async () => {
  const c = F.raw(`campaigns/${cid}`);
  const reqF = c.state.pendingRolls.find((p) => p.characterId === fighterId);
  const reqW = c.state.pendingRolls.find((p) => p.characterId === wizId);
  await expectErr(dice.roll(K, { campaignId: cid, characterId: fighterId, requestId: reqF.id }), /pas ton personnage/);
  await expectErr(dice.roll(K, { campaignId: cid, characterId: wizId, requestId: reqF.id }), /autre personnage/);
  const r1 = await dice.roll(P, { campaignId: cid, characterId: fighterId, requestId: reqF.id });
  assert.ok(r1.total >= 2 && r1.total <= 21);
  await expectErr(dice.roll(P, { campaignId: cid, characterId: fighterId, requestId: reqF.id }), /déjà été fait/);
  await dice.roll(K, { campaignId: cid, characterId: wizId, requestId: reqW.id });
  const c2 = F.raw(`campaigns/${cid}`);
  assert.equal(c2.state.pendingRolls.length, 0);
  assert.ok(c2.state.combat.order.every((o) => o.init != null));
  assert.equal(gmWakes.length, 1, "le MJ est relancé automatiquement quand tous les jets sont faits");
});

await t("tour de combat : attaque de monstre, dégâts, test demandé avec DD secret", async () => {
  const c = F.raw(`campaigns/${cid}`);
  const gob = c.state.combat.order.find((o) => o.kind === "npc");
  script.push(resp([tool("npc_attack", { attacker_id: gob.id, target_character_id: fighterId, attack_bonus: 30, damage_expr: "1d6+2", damage_type: "slashing", attack_name: "Cimeterre" }),
    tool("modify_hp", { target_id: gob.id, amount: -50 }), tool("request_roll", { character_id: wizId, kind: "skill", skill: "arcana", dc: 13, label: "Reconnaître le symbole" })]));
  script.push(resp([{ type: "text", text: "Le gobelin frappe Thrain ! Lysandre, que sais-tu de ce symbole ?" }], "end_turn"));
  await gm.runGm(cid, "rolls");
  const f = F.raw(`campaigns/${cid}/characters/${fighterId}`);
  assert.ok(f.hp.current < f.hp.max);
  const c2 = F.raw(`campaigns/${cid}`);
  assert.equal(c2.state.combat.order.find((o) => o.id === gob.id).status, "Vaincu");
  assert.equal(F.raw(`campaigns/${cid}/secret/gm`).pending[c2.state.pendingRolls[0].id].dc, 13);
  const r = await dice.roll(K, { campaignId: cid, characterId: wizId, requestId: c2.state.pendingRolls[0].id, advantage: "adv" });
  assert.equal(r.adv, "normal", "le joueur ne peut pas s'offrir l'avantage sur un jet demandé");
  const last = txt(calls[calls.length - 1].messages[0].content); assert.match(last, /Combat en cours/);
});

await t("le contexte suivant donne au MJ le résultat et la réussite", async () => {
  script.push(resp([tool("end_combat", { outcome: "victoire" }), tool("award_xp", { amount_each: 300, reason: "Gobelins vaincus" }), tool("grant_rest", { type: "short" })]));
  script.push(resp([{ type: "text", text: "Victoire !" }], "end_turn"));
  await gm.runGm(cid, "rolls");
  const ctx = txt(calls[calls.length - 2].messages[0].content);
  assert.match(ctx, /Reconnaître le symbole : \d+.*DD 13 → (RÉUSSITE|ÉCHEC)/);
  assert.equal(F.raw(`campaigns/${cid}`).state.combat.active, false);
  assert.equal(F.raw(`campaigns/${cid}/characters/${fighterId}`).xp, 300);
});

await t("repos court et dés de vie", async () => {
  await chars.rest(K, { campaignId: cid, characterId: wizId, type: "short" });
  await expectErr(chars.rest(K, { campaignId: cid, characterId: wizId, type: "short" }), /déjà pris/);
  await expectErr(chars.rest(K, { campaignId: cid, characterId: wizId, type: "long" }), /pas encore accordé/);
  const before = F.raw(`campaigns/${cid}/characters/${fighterId}`);
  await dice.roll(P, { campaignId: cid, characterId: fighterId, kind: "hitdie" });
  const after = F.raw(`campaigns/${cid}/characters/${fighterId}`);
  assert.equal(after.hitDice.remaining, 0); assert.ok(after.hp.current >= before.hp.current);
});

await t("montée de niveau du guerrier (niveau 2)", async () => {
  const r = await chars.levelUp(P, { campaignId: cid, characterId: fighterId, choices: {} });
  const f = F.raw(`campaigns/${cid}/characters/${fighterId}`);
  assert.equal(f.level, 2); assert.equal(f.hp.max, 13 + r.gain); assert.ok(f.resources.actionSurge);
  await expectErr(chars.levelUp(P, { campaignId: cid, characterId: fighterId, choices: {} }), /expérience/);
});

await t("sorts : lancer consomme un emplacement, dégâts calculés", async () => {
  const w = F.raw(`campaigns/${cid}/characters/${wizId}`);
  const s = w.spells.prepared.find((x) => R.spells[x].level === 1);
  const out = await chars.castSpell(K, { campaignId: cid, characterId: wizId, spell: s, slotLevel: 1 });
  assert.equal(F.raw(`campaigns/${cid}/characters/${wizId}`).slots["1"].used, 1);
  const fb = await chars.castSpell(K, { campaignId: cid, characterId: wizId, spell: "fire-bolt" });
  assert.equal(fb.damage, "1d10"); assert.ok(out);
  await chars.castSpell(K, { campaignId: cid, characterId: wizId, spell: s, slotLevel: 1 });
  await expectErr(chars.castSpell(K, { campaignId: cid, characterId: wizId, spell: s, slotLevel: 1 }), /Plus d'emplacement/);
});

await t("inventaire : équiper, donner", async () => {
  const f = F.raw(`campaigns/${cid}/characters/${fighterId}`);
  const jav = f.inventory.find((i) => i.index === "javelin");
  await chars.inventory(P, { campaignId: cid, characterId: fighterId, action: "give", itemId: jav.id, targetCharacterId: wizId, qty: 2 });
  assert.equal(F.raw(`campaigns/${cid}/characters/${wizId}`).inventory.find((i) => i.index === "javelin").qty, 2);
  await expectErr(chars.inventory(K, { campaignId: cid, characterId: fighterId, action: "drop", itemId: jav.id }), /pas ton personnage/);
});

await t("0 PV, jets contre la mort, soins", async () => {
  script.push(resp([tool("modify_hp", { target_id: wizId, amount: -999 })]));
  script.push(resp([{ type: "text", text: "Lysandre s'effondre…" }], "end_turn"));
  await gm.runGm(cid, "players");
  let w = F.raw(`campaigns/${cid}/characters/${wizId}`);
  assert.equal(w.alive, false, "dégâts massifs = mort instantanée");
  await chars.hostAdjust(P, { campaignId: cid, characterId: wizId, patch: { alive: true, hpDelta: 1 } });
  await expectErr(chars.hostAdjust(K, { campaignId: cid, characterId: wizId, patch: { hpDelta: 5 } }), /hôte/);
  w = F.raw(`campaigns/${cid}/characters/${wizId}`);
  const { upd } = chars.applyHpChange(w, -1); assert.ok(upd.conditions.includes("unconscious"));
});

await t("expressions de dés", async () => {
  assert.equal(E.parseDice("1d7"), null); assert.equal(E.parseDice("100d6"), null); assert.equal(E.parseDice("1d20; rm"), null);
  const many = Array.from({ length: 2000 }, () => (dice && E.evalDice(E.parseDice("1d20"), (s) => 1 + Math.floor(Math.random() * s)).total));
  assert.ok(Math.min(...many) === 1 && Math.max(...many) === 20);
});

await t("monde vivant : cadre dans le prompt, ajouts du MJ, codex", async () => {
  const c = F.raw(`campaigns/${cid}`); assert.ok(c.worldId);
  const w = F.raw(`worlds/${c.worldId}`); assert.equal(w.version, 1); assert.deepEqual(w.readers.sort(), [K, P].sort());
  script.push(resp([tool("world_add", { category: "lieu", name: "L'Auberge du Sanglier Gris", summary: "Relais fortifié sur la route de Moncalm.", details: "Tenue par la veuve Morra, qui renseigne les Veilleurs.", revealed: true }),
    tool("world_add", { category: "pnj", name: "Capitaine Aldo Venn", summary: "Chef des gardes de caravane, endetté.", revealed: false })]));
  script.push(resp([{ type: "text", text: "Une auberge se dresse dans la brume." }], "end_turn"));
  await gm.runGm(cid, "players");
  const sys = calls[calls.length - 2].system.map((b) => b.text).join("\n");
  assert.match(sys, /CADRE DU MONDE/); assert.match(sys, /Lancedragon/); assert.match(sys, /MAGIE RARE/);
  script.push(resp([{ type: "text", text: "…" }], "end_turn"));
  await gm.runGm(cid, "players");
  const sys2 = calls[calls.length - 1].system.map((b) => b.text).join("\n");
  assert.match(sys2, /Sanglier Gris/); assert.match(sys2, /Aldo Venn.*connu du MJ seulement/);
  const entries = (await F.db.collection(`worlds/${c.worldId}/entries`).get()).docs.map((d) => d.data());
  assert.equal(entries.length, 2); assert.equal(entries.find((e) => e.name.includes("Sanglier")).revealed, true);
});

await t("réglage du monde : classes interdites, mode validation", async () => {
  const wid = F.raw(`campaigns/${cid}`).worldId;
  await expectErr(worlds.updateWorld(K, { worldId: wid, setup: { magic: "high" } }), /créateur/);
  await worlds.updateWorld(P, { worldId: wid, setup: { allowedClasses: ["fighter", "rogue", "ranger"], additionMode: "review" } });
  await expectErr(chars.createCharacter(K, { campaignId: cid, draft: { class: "wizard", species: "human", background: "sage", name: "X" } }), /n'existe pas dans ce monde/);
  script.push(resp([tool("world_add", { category: "faction", name: "Les Fils de la Brume", summary: "Contrebandiers." })]));
  script.push(resp([{ type: "text", text: "…" }], "end_turn"));
  await gm.runGm(cid, "players");
  const e = (await F.db.collection(`worlds/${wid}/entries`).get()).docs.map((d) => d.data()).find((x) => x.name === "Les Fils de la Brume");
  assert.equal(e.status, "proposed");
});

await t("Bible v2 : fusion des ajouts validés, nouvelle campagne dans le même monde", async () => {
  const wid = F.raw(`campaigns/${cid}`).worldId;
  const base = F.raw(`worlds/${wid}`).baseText;
  script.push(resp([{ type: "text", text: base + "\n\n## L'Auberge du Sanglier Gris\nRelais fortifié…\n\n## Journal des versions\n- v2 : auberge, capitaine." }], "end_turn"));
  const r = await gm.consolidateWorld(P, { worldId: wid, note: "Après la séance 1", campaignId: cid });
  assert.equal(r.version, 2); assert.equal(r.added, 2, "la proposition non validée n'est pas fusionnée");
  const w = F.raw(`worlds/${wid}`); assert.equal(w.version, 2); assert.match(w.baseText, /Journal des versions/);
  const v = await gm.getWorldVersion(P, { worldId: wid, version: 1 }); assert.match(v.text, /ARDYN/);
  await expectErr(gm.getWorldVersion(K, { worldId: wid }), /réservée/);
  const c2 = await camp.createCampaign(P, { name: "Campagne 2", worldId: wid, displayName: "Philippe" });
  assert.equal(F.raw(`campaigns/${c2.id}`).worldId, wid);
  await expectErr(camp.createCampaign(K, { name: "Vol", worldId: wid }), /appartient/);
});

await t("carnet des héros : élément de la bible découvert, intégration simple et sélective à la bible", async () => {
  const wid = F.raw(`campaigns/${cid}`).worldId;
  script.push(resp([tool("world_reveal", { name: "Draishlin", category: "pnj", known: "Grand Mage de la cour d'Idaris, chef de la Guilde des Mages." }),
    tool("world_reveal", { name: "Inconnu total" }),
    tool("world_add", { category: "lieu", name: "Le Gué aux Corbeaux", summary: "Passage à gué sur l'Enduine.", revealed: true }),
    tool("world_add", { category: "pnj", name: "Mère Ortie", summary: "Herboriste du gué.", revealed: true })]));
  script.push(resp([{ type: "text", text: "…" }], "end_turn"));
  await gm.runGm(cid, "players");
  const all = (await F.db.collection(`worlds/${wid}/entries`).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const dr = all.find((e) => e.name === "Draishlin");
  assert.ok(dr.revealed && dr.merged && dr.source === "bible", "élément de la bible : au carnet, pas proposé à la bible");
  assert.ok(!all.find((e) => e.name === "Inconnu total"));
  // le MJ sait ce qui est déjà au carnet
  script.push(resp([{ type: "text", text: "…" }], "end_turn"));
  await gm.runGm(cid, "players");
  assert.match(calls[calls.length - 1].system.map((b) => b.text).join("\n"), /CARNET DES HÉROS[^]*Draishlin/);
  // l'hôte choisit : seul le gué entre dans la bible, en ajout simple (sans réécriture par Claude)
  const gue = all.find((e) => e.name === "Le Gué aux Corbeaux"); const ortie = all.find((e) => e.name === "Mère Ortie");
  assert.equal(gue.status, "proposed", "mode validation : l'hôte décide");
  await worlds.editEntry(P, { worldId: wid, entryId: gue.id, patch: { status: "canon" } });
  await worlds.editEntry(P, { worldId: wid, entryId: ortie.id, patch: { status: "canon" } });
  const before = F.raw(`worlds/${wid}`);
  const r = await gm.consolidateWorld(P, { worldId: wid, entryIds: [gue.id], simple: true, note: "Séance 2" });
  assert.equal(r.added, 1); assert.equal(r.version, before.version + 1);
  const w = F.raw(`worlds/${wid}`);
  assert.ok(w.baseText.startsWith(before.baseText)); assert.match(w.baseText, /Ajouts des parties — version \d+ \(Séance 2\)[^]*Le Gué aux Corbeaux/);
  assert.doesNotMatch(w.baseText, /Mère Ortie/);
  assert.equal(F.raw(`worlds/${wid}/entries/${ortie.id}`).merged, false, "non cochée : reste en attente");
});

await t("tour de table : ordre tournant, tour imposé, MJ appelé quand tout le monde a joué", async () => {
  const turns = await import("../js/server/turns.js");
  const c = F.raw(`campaigns/${cid}`); const chars = F.dump(`campaigns/${cid}/characters/`).map(([p, d]) => ({ id: p.split("/").pop(), ...d }));
  const r1 = turns.newRound({ ...c, state: {} }, chars); const r2 = turns.newRound({ ...c, state: { round: r1 } }, chars);
  assert.equal(r1.order.length, 2); assert.deepEqual(r2.order, [r1.order[1], r1.order[0]], "l'ordre tourne à chaque tour");
  await F.db.doc(`campaigns/${cid}`).update({ "state.round": r1, "state.combat": { active: false }, "state.pendingRolls": [], "settings.turnMode": "round" });
  const first = chars.find((x) => x.id === r1.order[0]); const second = chars.find((x) => x.id === r1.order[1]);
  await expectErr(turns.submitTurn(second.ownerUid === P ? K : second.ownerUid, { campaignId: cid, text: "Je fonce !" }), /tour de/);
  const a = await turns.submitTurn(first.ownerUid, { campaignId: cid, text: "J'observe." }); assert.equal(a.callGm, false);
  const b = await turns.submitTurn(second.ownerUid, { campaignId: cid, pass: true }); assert.equal(b.callGm, true);
  assert.equal(F.raw(`campaigns/${cid}`).state.round.idx, 2);
});

await t("MJ externe : l'app n'appelle pas l'API, Claude joue via l'outil en ligne de commande", async () => {
  await F.db.doc(`campaigns/${cid}`).update({ "settings.externalGm": true });
  const before = calls.length;
  const r = await gm.runGm(cid, "players");
  assert.equal(r.external, true); assert.equal(calls.length, before, "aucun appel à l'API");
  assert.ok(F.raw(`campaigns/${cid}`).state.gmWaiting, "l'attente du MJ est signalée aux joueurs");
  const logs = [];
  const real = console.log; console.log = (...a) => logs.push(a.join(" "));
  const lib = await import("../tools/mj-lib.mjs");
  try {
    await lib.run(["status", cid]); await lib.run(["context", cid]); await lib.run(["tools"]);
    const hero = F.dump(`campaigns/${cid}/characters/`).map(([p, d]) => ({ id: p.split("/").pop(), ...d }))[0];
    await lib.run(["tool", cid, "request_roll", JSON.stringify({ character_id: hero.id, kind: "skill", skill: "perception", label: "Repérer l'embuscade", dc: 13 })]);
    await lib.run(["tool", cid, "remember", JSON.stringify({ fact: "Le pont est piégé." })]);
    await lib.run(["tool", cid, "update_scene", JSON.stringify({ title: "Le pont de Brumeval", location: "Moncalm", mood: "mystère", ambiance: "forêt", illustration: "Un vieux pont de pierre dans la brume" })]);
    await lib.run(["say", cid, "Le vent se lève sur la route de Brumeval."]);
  } finally { console.log = real; }
  const all = logs.join("\n");
  assert.match(all, /CONSIGNES PERMANENTES/); assert.match(all, /SITUATION ACTUELLE/); assert.match(all, /request_roll\(/); assert.match(all, /Récit publié/);
  assert.match(all, /Thrain|Lysandre/, "les fiches des héros sont dans le contexte");
  const st = F.raw(`campaigns/${cid}`).state;
  assert.equal(st.gmWaiting, undefined, "l'attente est levée après le récit");
  assert.equal(st.pendingRolls.length >= 1, true, "le jet demandé apparaît chez le joueur");
  assert.ok(F.dump(`campaigns/${cid}/log/`).some(([, d]) => d.type === "gm" && /Brumeval/.test(d.text)));
  assert.ok((F.raw(`campaigns/${cid}/secret/gm`).memory || []).includes("Le pont est piégé."));
  assert.equal(st.scene.imagePending, true, "MJ externe : l'illustration est demandée à un appareil de la table");
  assert.match(st.scene.illustration, /vieux pont/);
  await F.db.doc(`campaigns/${cid}`).update({ "settings.externalGm": false });
});

console.log(`\n${ok} tests réussis. Appels modèle simulés : ${calls.length}`);
