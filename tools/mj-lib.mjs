// Commandes du MJ externe. La plateforme (Firestore, règles) doit déjà être installée dans globalThis.__PLATFORM__ (ou __TEST__).
const out = (...a) => console.log(...a);

function fmtParam(name, p, req) {
  let t = p.type || "any";
  if (p.enum) t = p.enum.join("|");
  if (t === "array") t = "[" + (p.items?.type === "object" ? "{…}" : p.items?.type || "…") + "]";
  return `${name}${req ? "" : "?"}: ${t}`;
}
function fmtTool(t) {
  const props = t.input_schema?.properties || {}; const req = new Set(t.input_schema?.required || []);
  const params = Object.entries(props).map(([k, v]) => fmtParam(k, v, req.has(k))).join(", ");
  return `- ${t.name}(${params})\n    ${String(t.description || "").replace(/\s+/g, " ").trim()}`;
}

export async function run(argv, { readStdin } = {}) {
  const [cmd, ...rest] = argv;
  const gm = await import("../js/server/gm.js");
  const cid = rest[0];
  const need = () => { if (!cid) throw new Error(`Usage : mj.mjs ${cmd} <idCampagne> …`); };
  switch (cmd) {
    case "status": { need(); out(JSON.stringify(await gm.externalStatus(cid), null, 2)); break; }
    case "context": {
      need();
      const c = await gm.externalContext(cid, rest[1] || "players");
      out("######## CONSIGNES PERMANENTES DU MJ ########\n" + c.system + "\n\n######## SITUATION ACTUELLE ########\n" + c.context);
      break;
    }
    case "tools": {
      out("OUTILS DU MJ — exécute-les avec : node tools/mj.mjs tool <idCampagne> <nom> '<json>'\n");
      out(gm.externalToolList().map(fmtTool).join("\n"));
      break;
    }
    case "tool": {
      need();
      const name = rest[1]; if (!name) throw new Error("Nom d'outil manquant.");
      let input = {}; const raw = rest[2] ?? (readStdin ? await readStdin() : "");
      if (raw && raw.trim()) { try { input = JSON.parse(raw); } catch (e) { throw new Error("JSON invalide : " + e.message); } }
      out(await gm.externalTool(cid, name, input));
      break;
    }
    case "say": {
      need();
      const text = rest.slice(1).join(" ") || (readStdin ? await readStdin() : "");
      await gm.externalSay(cid, text);
      out("Récit publié. Le tour suivant est ouvert pour les joueurs.");
      break;
    }
    case "wait": {
      need();
      const limit = Number(rest[1] || 600) * 1000; const t0 = Date.now();
      for (;;) {
        const st = await gm.externalStatus(cid);
        if (st.waiting) { out(JSON.stringify({ waiting: true, ...st.waiting })); return; }
        if (Date.now() - t0 > limit) { out("TIMEOUT : personne n'a demandé le MJ."); return; }
        await new Promise((r) => setTimeout(r, 4000));
      }
    }
    default:
      out(`Commandes :
  campaigns                         liste tes campagnes
  status  <id>                      qui attend le MJ, jets en attente, tour en cours
  context <id>                      consignes + situation complète (à lire avant de répondre)
  tools                             liste des outils du MJ
  tool    <id> <nom> '<json>'       exécute un outil (jet demandé, PV, scène, quête…)
  say     <id> "<récit>"            publie le récit (ou via stdin) et ouvre le tour suivant
  wait    <id> [secondes]           attend qu'un joueur appelle le MJ`);
  }
}
