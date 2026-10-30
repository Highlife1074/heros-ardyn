import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signOut, sendPasswordResetEmail } from "../vendor/firebase/firebase-auth.js";
import { auth, S, fn, go, APP_VERSION, openCampaign, closeCampaign, watchMyCampaigns, watchMyWorlds, loadRules, onChange } from "./core.js";
import { h, $, toast, busy, errMsg, modal, timeAgo, topbar, toggleTheme } from "./ui.js";
import { renderTable } from "./table.js";
import { renderCreate } from "./create.js";
import { renderSheetPage } from "./sheet.js";
import { renderHost } from "./host.js";
import { renderScreen } from "./screen.js";
import { renderWorld } from "./world.js";
import { warmDice } from "./dice3d.js";

const app = $("#app");
let cleanup = [];
const mount = (...nodes) => { cleanup.forEach((f) => f()); cleanup = []; app.replaceChildren(...nodes); window.scrollTo(0, 0); };
export const addCleanup = (f) => cleanup.push(f);

try { const t = localStorage.getItem("theme"); if (t) document.documentElement.dataset.theme = t; } catch {}

// ---------------------------------------------------------------- Connexion
function renderAuth() {
  let mode = "login";
  const email = h("input", { type: "email", autocomplete: "email", required: true });
  const pass = h("input", { type: "password", autocomplete: "current-password", minlength: 6, required: true });
  const name = h("input", { type: "text", autocomplete: "nickname", maxlength: 30, placeholder: "Ex. Papa, Amaury…" });
  const nameField = h("div", { class: "hidden" }, h("label", {}, "Ton prénom à la table"), name);
  const submit = h("button", { class: "btn primary", type: "submit", style: { width: "100%", marginTop: "18px" } }, "Se connecter");
  const toggle = h("button", { class: "btn ghost", type: "button", style: { width: "100%", marginTop: "8px" } }, "Créer un compte");
  const forgot = h("button", { class: "btn ghost small", type: "button" }, "Mot de passe oublié");
  toggle.onclick = () => {
    mode = mode === "login" ? "signup" : "login";
    nameField.classList.toggle("hidden", mode === "login");
    submit.textContent = mode === "login" ? "Se connecter" : "Créer mon compte";
    toggle.textContent = mode === "login" ? "Créer un compte" : "J'ai déjà un compte";
    pass.autocomplete = mode === "login" ? "current-password" : "new-password";
  };
  forgot.onclick = busy(forgot, async () => {
    if (!email.value) return toast("Indique d'abord ton e-mail.");
    await sendPasswordResetEmail(auth, email.value.trim()); toast("E-mail de réinitialisation envoyé.");
  });
  const form = h("form", { class: "panel", style: { marginTop: "24px" } },
    h("label", {}, "E-mail"), email, h("label", {}, "Mot de passe"), pass, nameField, submit, toggle, h("div", { class: "row end" }, forgot));
  form.onsubmit = (e) => { e.preventDefault(); busy(submit, async () => {
    if (mode === "login") await signInWithEmailAndPassword(auth, email.value.trim(), pass.value);
    else {
      if (!name.value.trim()) throw new Error("Indique ton prénom.");
      const cred = await createUserWithEmailAndPassword(auth, email.value.trim(), pass.value);
      await updateProfile(cred.user, { displayName: name.value.trim() });
      S.displayName = name.value.trim(); route();
    }
  })(); };
  mount(h("main", { class: "wrap", style: { maxWidth: "440px", paddingTop: "8vh" } },
    h("h1", { class: "brand" }, "Héros d'Ardyn", h("small", {}, "Le Maître du Jeu raconte, vous jouez. Chacun sur son téléphone, les dés roulent pour tout le monde.")),
    form));
}

// ---------------------------------------------------------------- Accueil
function renderHome() {
  closeCampaign();
  const list = h("ul", { class: "list" }, h("li", { class: "muted" }, "Chargement…"));
  const unsub = watchMyCampaigns((camps, err) => {
    if (!camps) { list.replaceChildren(h("li", { style: { color: "var(--blood)" } }, `Lecture impossible : ${errMsg(err)}. Vérifie que les règles Firestore sont publiées.`)); return; }
    list.replaceChildren(...(camps.length ? camps.map((c) => h("li", {},
      h("div", { class: "camp-item", role: "button", tabindex: 0, onclick: () => go(`#/c/${c.id}`), onkeydown: (e) => e.key === "Enter" && go(`#/c/${c.id}`) },
        h("div", { class: "seal" }, c.setting === "ardyn" ? "🐉" : "🗺️"),
        h("div", { class: "grow" }, h("b", {}, c.name), h("div", { class: "small muted" },
          `${(c.members || []).length} joueur${(c.members || []).length > 1 ? "s" : ""}`, c.ownerUid === S.user.uid ? " · tu es l'hôte" : "",
          c.state?.lastGmAt ? ` · dernière partie ${timeAgo(c.state.lastGmAt)}` : "")),
        h("span", { class: "muted" }, "›"))))
      : [h("li", { class: "muted" }, "Aucune campagne pour l'instant. Crée la tienne ou rejoins celle d'un proche avec son code.")]));
  });
  addCleanup(unsub);
  const createBtn = h("button", { class: "btn primary", onclick: () => createCampaignDialog() }, "Créer une campagne");
  const joinBtn = h("button", { class: "btn", onclick: () => joinDialog() }, "Rejoindre avec un code");
  mount(
    topbar(h("span", { class: "title" }, "Héros d'Ardyn"), h("span", { class: "grow" }),
      h("button", { class: "icon-btn", title: "Thème clair / sombre", "aria-label": "Changer de thème", onclick: toggleTheme }, "🌓"),
      h("button", { class: "btn ghost small", onclick: () => signOut(auth) }, "Déconnexion")),
    h("main", { class: "wrap stack" },
      h("h2", {}, `Bonjour ${S.displayName || ""} !`),
      h("div", { class: "row" }, createBtn, joinBtn),
      h("section", { class: "panel" }, h("h3", {}, "Mes campagnes"), list),
      h("p", { class: "small muted" }, `Version ${APP_VERSION}`)));
}

async function createCampaignDialog() {
  const name = h("input", { type: "text", maxlength: 80, value: "Les Ombres de Moncalm" });
  const world = h("select", {}, h("option", {}, "Chargement…"));
  const unsub = watchMyWorlds((ws) => {
    world.replaceChildren(
      ...ws.sort((a, b) => (b.version || 1) - (a.version || 1)).map((w) => h("option", { value: "w:" + w.id }, `${w.name} — bible v${w.version}${w.entryCount ? `, ${w.entryCount} ajouts` : ""}`)),
      h("option", { value: "new:ardyn" }, "Nouveau monde : Ardyn (bible d'origine)"),
      h("option", { value: "new:generic" }, "Nouveau monde : fantasy médiévale (le MJ l'invente)"),
      h("option", { value: "new:custom" }, "Nouveau monde : mon propre univers"));
  });
  const tone = h("select", {}, h("option", { value: "famille" }, "Famille (dès 10 ans)"), h("option", { value: "ado" }, "Ados"), h("option", { value: "adulte" }, "Adultes"));
  const premise = h("textarea", { placeholder: "Facultatif : une envie de départ. Ex. « Les héros escortent une caravane naine à travers les bois de Moncalm. »" });
  const r = await modal("Nouvelle campagne", h("div", {}, h("label", {}, "Nom de la campagne"), name,
    h("label", {}, "Monde"), world, h("p", { class: "small muted" }, "Reprendre un monde existant permet de retrouver tout ce que le MJ y a ajouté lors des campagnes précédentes. Le cadre (ton, magie, interdits) se règle ensuite dans l'écran Monde."),
    h("label", {}, "Public"), tone, h("label", {}, "Point de départ"), premise), [
    { label: "Annuler", value: null },
    { label: "Créer", class: "btn primary", value: async () => {
      const [kind, val] = world.value.split(":");
      try { return await fn("createCampaign", { name: name.value, ...(kind === "w" ? { worldId: val } : { setting: val }), premise: premise.value, settings: { tone: tone.value }, displayName: S.displayName }); }
      catch (e) { toast(errMsg(e), "error"); return undefined; }
    } }]);
  unsub();
  if (r?.id) { toast(`Campagne créée. Code d'invitation : ${r.inviteCode}`); go(`#/c/${r.id}/world`); }
}

async function joinDialog() {
  const code = h("input", { type: "text", maxlength: 8, placeholder: "Ex. K7PQ2M", style: { textTransform: "uppercase", letterSpacing: ".2em", fontSize: "1.3rem" } });
  const r = await modal("Rejoindre une campagne", h("div", {}, h("p", { class: "muted" }, "Demande le code à l'hôte de la partie (il le trouve dans les réglages de la campagne)."), code), [
    { label: "Annuler", value: null },
    { label: "Rejoindre", class: "btn primary", value: async () => {
      try { return await fn("joinCampaign", { code: code.value, displayName: S.displayName }); } catch (e) { toast(errMsg(e), "error"); return undefined; }
    } }]);
  if (r?.id) go(`#/c/${r.id}`);
}

// ---------------------------------------------------------------- Routeur
export function showError(title, e, retry) {
  const msg = typeof e === "string" ? e : errMsg(e);
  const perm = /permission|insufficient/i.test(msg);
  mount(topbar(h("button", { class: "icon-btn", "aria-label": "Retour", onclick: () => go("#/") }, "‹"), h("span", { class: "title" }, "Héros d'Ardyn")),
    h("main", { class: "wrap stack" }, h("h2", {}, title), h("p", { class: "panel small", style: { borderColor: "var(--blood)" } }, msg),
      perm ? h("p", {}, "Firebase refuse l'accès : vérifie que les règles Firestore ont bien été publiées (Console Firebase → Firestore Database → Règles).") : null,
      h("div", { class: "row" }, retry ? h("button", { class: "btn primary", onclick: () => location.reload() }, "Réessayer") : null, h("button", { class: "btn", onclick: () => go("#/") }, "Mes campagnes"))));
}

async function route() {
  if (!S.user) return renderAuth();
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] !== "c" || !parts[1]) return renderHome();
  const cid = parts[1]; const sub = parts[2] || "table";
  mount(h("main", { class: "wrap" }, h("p", { class: "muted" }, "Ouverture de la campagne…")));
  try { await loadRules(); }
  catch (e) { return showError("Impossible de charger les règles du jeu", e, true); }
  openCampaign(cid);
  // Garde-fou : si la campagne n'arrive pas, on explique au lieu de rester bloqué.
  const t = setTimeout(() => { if (!S.campaign && S.cid === cid) showError("La campagne ne répond pas", S.lastError || "Aucune réponse de Firebase après 12 secondes.", true); }, 12000);
  addCleanup(() => clearTimeout(t));
  const ctx = { cid, sub, arg: parts[3], mount, addCleanup, onChange };
  if (sub === "create") return renderCreate(ctx);
  if (sub === "sheet") return renderSheetPage(ctx);
  if (sub === "host") return renderHost(ctx);
  if (sub === "screen") return renderScreen(ctx);
  if (sub === "world") return renderWorld(ctx);
  return renderTable(ctx);
}

window.addEventListener("hashchange", route);
onAuthStateChanged(auth, (u) => {
  S.user = u; S.displayName = u?.displayName || u?.email?.split("@")[0] || "";
  route();
  if (u) warmDice();
});
window.addEventListener("unhandledrejection", (e) => { console.error(e.reason); toast(errMsg(e.reason), "error"); });
