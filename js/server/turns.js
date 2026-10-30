// Tour de table : chacun annonce son action à son tour, puis le MJ répond à tout le monde d'un coup.
// En combat, c'est l'ordre d'initiative qui décide qui parle.
import { HttpsError, db, addLog, loadCampaign, str } from "./common.js";

import { partyOrder, whoseTurn, newRound } from "../turnlogic.js";
export { partyOrder, whoseTurn, newRound };

/**
 * Le joueur dont c'est le tour annonce son action (ou passe). Quand tout le monde a parlé, on rend la main au MJ.
 * Renvoie { callGm: true } quand il faut lancer le MJ.
 */
export async function submitTurn(uid, { campaignId, text = "", pass = false, hostSkip = false }) {
  const { data: c } = await loadCampaign(campaignId, uid);
  const ref = db.doc(`campaigns/${campaignId}`);
  const charsSnap = await db.collection(`campaigns/${campaignId}/characters`).get();
  const chars = charsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const turn = whoseTurn(c, chars);
  if (turn.mode === "free" || turn.mode === "gm") throw new HttpsError("failed-precondition", "Ce n'est le tour de personne pour l'instant.");
  const ch = chars.find((x) => x.id === turn.charId);
  if (!ch) throw new HttpsError("not-found", "Héros introuvable.");
  const isHost = c.ownerUid === uid;
  if (ch.ownerUid !== uid && !isHost) throw new HttpsError("permission-denied", `C'est au tour de ${ch.name}.`);
  const words = str(text, 1200).trim();
  if (!pass && !hostSkip && !words) throw new HttpsError("invalid-argument", "Décris ce que fait ton héros, ou passe ton tour.");

  if (words) await addLog(campaignId, { type: "player", uid, authorName: ch.name, playerName: c.memberNames?.[ch.ownerUid] || "", characterId: ch.id, portrait: ch.portrait || "🙂", text: words, turn: true });
  else await addLog(campaignId, { type: "system", text: hostSkip && ch.ownerUid !== uid ? `⏭️ L'hôte passe le tour de ${ch.name}.` : `⏭️ ${ch.name} passe son tour.` });

  if (turn.mode === "combat") return { callGm: true };

  // Tour de table : on avance (transaction pour éviter que deux joueurs avancent en même temps)
  let complete = false;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const r = snap.data()?.state?.round;
    if (!r || r.order[r.idx] !== ch.id) return; // quelqu'un a déjà avancé
    const idx = r.idx + 1; complete = idx >= r.order.length;
    tx.update(ref, { "state.round.idx": idx, "state.round.done": [...(r.done || []), ch.id] });
  });
  return { callGm: complete };
}

/** L'hôte clôt le tour avant que tout le monde ait parlé (quelqu'un est absent, par exemple). */
export async function closeRound(uid, { campaignId }) {
  const { data: c } = await loadCampaign(campaignId, uid, { ownerOnly: true });
  const r = c.state?.round;
  if (r) await db.doc(`campaigns/${campaignId}`).update({ "state.round.idx": (r.order || []).length });
  await addLog(campaignId, { type: "system", text: "⏩ L'hôte clôt le tour de table : le MJ reprend la parole." });
  return { callGm: true };
}

export const TURN_GM_RULES = {
  round: "Déroulement en TOUR DE TABLE : chaque héros vient d'annoncer UNE action, chacun à son tour (ou a passé). Résous toutes ces actions dans ta réponse, en donnant à chaque héros sa part de récit, dans un ordre logique. Ne laisse pas un seul joueur décider pour le groupe. Termine en décrivant la nouvelle situation pour tout le groupe, sans t'adresser à un seul héros : un nouveau tour de table commence automatiquement après ta réponse. Si un héros a passé ou n'a rien dit, il reste en retrait sans que tu le fasses agir.",
  combat: "En combat, un seul héros agit à la fois, dans l'ordre d'initiative : réponds uniquement à l'action du héros dont c'était le tour, joue ensuite les adversaires suivants, puis appelle next_turn jusqu'au héros suivant et arrête-toi.",
};
