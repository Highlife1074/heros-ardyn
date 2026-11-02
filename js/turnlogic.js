// Logique pure du tour de table (sans base de données) : partagée par l'écran et la logique de jeu.
/** Héros actifs et vivants, dans un ordre stable (date de création). */
export function partyOrder(c, chars) {
  const active = new Set(Object.values(c.activeCharacters || {}));
  return chars.filter((x) => active.has(x.id) && x.alive !== false).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

/** Qui a la parole ? { mode: "free" | "round" | "combat" | "gm", charId, waitingRolls } */
export function whoseTurn(c, chars) {
  const s = { turnMode: "free", ...(c.settings || {}) };
  const st = c.state || {};
  const waitingRolls = (st.pendingRolls || []).length > 0;
  const cb = st.combat;
  if (cb?.active) {
    const cur = (cb.order || [])[cb.turn || 0];
    if (cur?.kind === "pc") return { mode: "combat", charId: cur.characterId, waitingRolls };
    return { mode: "gm", waitingRolls }; // au tour d'un adversaire : le MJ joue
  }
  if (s.turnMode !== "round") return { mode: "free", waitingRolls };
  const r = st.round;
  if (!r || r.idx >= (r.order || []).length) return { mode: "free", waitingRolls, noRound: true };
  return { mode: "round", charId: r.order[r.idx], round: r, waitingRolls };
}

/** Ouvre un nouveau tour de table (après chaque réponse du MJ). L'ordre tourne à chaque tour pour que chacun commence à son tour. */
export function newRound(c, chars) {
  const order = partyOrder(c, chars).map((x) => x.id);
  if (!order.length) return null;
  const n = (c.state?.round?.n || 0) + 1;
  const k = (n - 1) % order.length;
  return { n, order: [...order.slice(k), ...order.slice(0, k)], idx: 0, done: [], startedAt: Date.now() };
}

