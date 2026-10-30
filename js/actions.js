// Actions de jeu partagées entre la table et la fiche : tous les dés passent par le serveur.
import { S, fn, myChar } from "./core.js";
import { h, modal, toast, errMsg } from "./ui.js";
import { animateRoll } from "./dice3d.js";
import { DAMAGE_FR } from "./engine.js";

let rolling = false;
export async function doRoll(params, label) {
  if (rolling) return null;
  rolling = true;
  try {
    const r = await fn("roll", { campaignId: S.cid, ...params });
    await animateRoll(r, label || r.label);
    return r;
  } catch (e) { toast(errMsg(e), "error"); return null; } finally { rolling = false; }
}

/** Choix avantage / normal / désavantage avant un jet libre. */
export function advPicker(onPick) {
  return h("div", { class: "row" },
    h("button", { class: "btn small", onclick: () => onPick("dis") }, "Désavantage"),
    h("button", { class: "btn small primary", onclick: () => onPick("normal") }, "Lancer"),
    h("button", { class: "btn small", onclick: () => onPick("adv") }, "Avantage"));
}

export async function rollWithAdv(params, label) {
  const pick = await modal(label, h("p", { class: "muted small" }, "L'avantage ou le désavantage dépend de la situation : en cas de doute, lance normalement, le MJ tranchera."),
    [{ label: "Désavantage", value: "dis" }, { label: "Avantage", value: "adv" }, { label: "Lancer", class: "btn primary", value: "normal" }]);
  if (!pick) return null;
  return doRoll({ ...params, advantage: pick }, label);
}

/** Attaque à l'arme : jet d'attaque puis proposition de jet de dégâts. */
export async function attackWith(atk, ch = myChar()) {
  const r = await rollWithAdv({ characterId: ch.id, kind: "attack", weaponId: atk.id }, `Attaque — ${atk.name}`);
  if (!r) return;
  if (r.fumble) { toast("1 naturel : raté !"); return; }
  const go = await modal(r.crit ? "Coup critique !" : `Total : ${r.total}`,
    h("p", {}, r.crit ? "Un 20 naturel touche toujours : les dés de dégâts sont doublés." : "Si ça touche (le MJ connaît la CA de la cible), lance les dégâts."),
    [{ label: "Pas de dégâts", value: false }, ...(atk.versatile ? [{ label: `À deux mains (${atk.versatile})`, value: "two" }] : []), { label: `Dégâts ${atk.damage}`, class: "btn primary", value: "one" }]);
  if (!go) return;
  await doRoll({ characterId: ch.id, kind: "damage", weaponId: atk.id, crit: !!r.crit, twoHanded: go === "two" }, `Dégâts — ${atk.name}`);
}

/** Lancer un sort : consomme l'emplacement côté serveur, puis propose attaque / dégâts / soins. */
export async function castSpellFlow(spellIndex, ch = myChar()) {
  const R = S.rules; const sp = R.spells[spellIndex];
  let slot = 0;
  if (sp.level > 0) {
    const avail = Object.entries(ch.slots || {}).filter(([l, s]) => Number(l) >= sp.level && s.used < s.max).map(([l]) => Number(l));
    if (!avail.length) return toast("Plus d'emplacement de sort disponible.", "error");
    if (avail.length === 1) slot = avail[0];
    else {
      slot = await modal(`Lancer ${sp.name}`, h("p", {}, "Avec quel emplacement ? Un emplacement plus élevé renforce certains sorts."),
        avail.map((l) => ({ label: `Niveau ${l}`, class: l === sp.level ? "btn primary" : "btn", value: l })));
      if (!slot) return;
    }
  }
  let info;
  try { info = await fn("castSpell", { campaignId: S.cid, characterId: ch.id, spell: spellIndex, slotLevel: slot }); }
  catch (e) { return toast(errMsg(e), "error"); }
  let crit = false;
  if (info.attack) {
    const r = await rollWithAdv({ characterId: ch.id, kind: "spellAttack", spell: spellIndex }, `Attaque de sort — ${sp.name}`);
    if (!r || r.fumble) return;
    crit = r.crit;
  } else if (info.save) {
    toast(`Les cibles font un jet de sauvegarde (DD ${info.dc}). Le MJ s'en charge.`);
  }
  if (info.damage) {
    const ok = await modal(sp.name, h("p", {}, `Lancer les dégâts : ${info.damage}${info.damageType ? " " + (DAMAGE_FR[info.damageType] || "") : ""}${crit ? " (critique : dés doublés)" : ""} ?`),
      [{ label: "Plus tard", value: false }, { label: "Lancer les dégâts", class: "btn primary", value: true }]);
    if (ok) await doRoll({ characterId: ch.id, kind: "damage", expr: info.damage, label: sp.name, damageType: info.damageType, crit }, `Dégâts — ${sp.name}`);
  }
  if (info.heal) {
    const targets = Object.values(S.chars).filter((c) => Object.values(S.campaign.activeCharacters || {}).includes(c.id));
    const t = await modal(`${sp.name} — soins ${info.heal}`, h("p", {}, "Qui soignes-tu ?"),
      [{ label: "Annuler", value: null }, ...targets.map((c) => ({ label: c.name, class: "btn", value: c.id }))]);
    if (t) await doRoll({ characterId: ch.id, kind: "heal", expr: info.heal, label: sp.name, targetCharacterId: t }, `Soins — ${sp.name}`);
  }
}

/** Traduction à la demande d'un texte de règles (mise en cache côté serveur). */
export async function translateInto(el, text) {
  el.textContent = "Traduction…";
  try { const r = await fn("translate", { campaignId: S.cid, text }); el.textContent = r.text; }
  catch (e) { el.textContent = text; toast(errMsg(e), "error"); }
}
