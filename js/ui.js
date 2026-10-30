// replaceChildren/append ignorent les valeurs vides (null, false) pour éviter d'afficher « null ».
for (const m of ["replaceChildren", "append"]) {
  const orig = Element.prototype[m];
  Element.prototype[m] = function (...nodes) { return orig.apply(this, nodes.flat(Infinity).filter((x) => x != null && x !== false)); };
}

// Petits utilitaires d'interface, sans framework.
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "html") el.innerHTML = v;
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Markdown minimal et sûr : **gras**, *italique*, paragraphes, listes. */
export function md(text) {
  const blocks = esc(text).split(/\n{2,}/);
  return blocks.map((b) => {
    let t = b.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*(?!\s)(.+?)\*/g, "$1<em>$2</em>");
    if (/^\s*[-•] /m.test(t)) return "<ul>" + t.split("\n").map((l) => l.replace(/^\s*[-•] /, "")).map((l) => `<li>${l}</li>`).join("") + "</ul>";
    if (/^#{1,3} /.test(t)) return `<h4>${t.replace(/^#{1,3} /, "")}</h4>`;
    return `<p>${t.replace(/\n/g, "<br>")}</p>`;
  }).join("");
}

let toastTimer;
export function toast(msg, kind = "info") {
  let el = $("#toast");
  if (!el) { el = h("div", { id: "toast", role: "status", "aria-live": "polite" }); document.body.append(el); }
  el.textContent = msg; el.className = `show ${kind}`;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (el.className = ""), 3800);
}

export function modal(title, body, actions = []) {
  return new Promise((resolve) => {
    const close = (v) => { wrap.remove(); document.removeEventListener("keydown", onKey); resolve(v); };
    const onKey = (e) => { if (e.key === "Escape") close(null); };
    const wrap = h("div", { class: "modal-wrap", onclick: (e) => e.target === wrap && close(null) },
      h("div", { class: "modal", role: "dialog", "aria-modal": "true", "aria-label": title },
        h("header", {}, h("h3", {}, title), h("button", { class: "icon-btn", "aria-label": "Fermer", onclick: () => close(null) }, "✕")),
        h("div", { class: "modal-body" }, body),
        actions.length ? h("footer", {}, actions.map((a) => h("button", { class: a.class || "btn", onclick: async () => { const v = a.value instanceof Function ? await a.value() : a.value; if (v !== undefined) close(v); } }, a.label))) : null));
    document.body.append(wrap); document.addEventListener("keydown", onKey);
    setTimeout(() => wrap.querySelector("input,textarea,select,button.primary")?.focus(), 30);
  });
}

export const confirmBox = (title, text, ok = "Confirmer") => modal(title, h("p", {}, text), [{ label: "Annuler", value: false }, { label: ok, class: "btn primary", value: true }]);

export function busy(btn, fn) {
  return async (...args) => {
    if (btn.disabled) return;
    btn.disabled = true; btn.classList.add("loading");
    try { return await fn(...args); } catch (e) { toast(errMsg(e), "error"); } finally { btn.disabled = false; btn.classList.remove("loading"); }
  };
}

export function errMsg(e) {
  const m = e?.message || String(e);
  if (/auth\/invalid-credential|wrong-password|user-not-found/.test(m)) return "E-mail ou mot de passe incorrect.";
  if (/email-already-in-use/.test(m)) return "Un compte existe déjà avec cet e-mail.";
  if (/weak-password/.test(m)) return "Mot de passe trop court (6 caractères minimum).";
  if (/invalid-email/.test(m)) return "Adresse e-mail invalide.";
  if (/network/i.test(m)) return "Connexion impossible : vérifie Internet.";
  return m.replace(/^FirebaseError:\s*/, "").replace(/\s*\(functions\/[a-z-]+\)\.?$/, "");
}

export const timeAgo = (ms) => {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return "à l'instant"; if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`; return new Date(ms).toLocaleDateString("fr-FR");
};

export function topbar(...kids) { return h("header", { class: "topbar" }, h("div", { class: "inner" }, ...kids)); }
export function toggleTheme() {
  const cur = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  const next = cur === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = next; try { localStorage.setItem("theme", next); } catch {}
}

