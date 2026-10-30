// Faux Firestore en mémoire (suffisant pour tester la logique serveur sans émulateur).
const store = new Map(); // path -> data
let auto = 0;
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

class Sentinel { constructor(kind, val) { this.kind = kind; this.val = val; } }
export const FieldValue = {
  serverTimestamp: () => new Sentinel("ts"),
  increment: (n) => new Sentinel("inc", n),
  arrayUnion: (...v) => new Sentinel("union", v),
  arrayRemove: (...v) => new Sentinel("remove", v),
  delete: () => new Sentinel("del"),
};

function applyValue(cur, v) {
  if (!(v instanceof Sentinel)) return clone(v);
  switch (v.kind) {
    case "ts": return Date.now();
    case "inc": return (cur || 0) + v.val;
    case "union": { const a = [...(cur || [])]; for (const x of v.val) if (!a.some((y) => JSON.stringify(y) === JSON.stringify(x))) a.push(clone(x)); return a; }
    case "remove": return (cur || []).filter((y) => !v.val.some((x) => JSON.stringify(x) === JSON.stringify(y)));
    case "del": return undefined;
  }
}
function setPath(obj, dotted, v) {
  const parts = dotted.split("."); let o = obj;
  for (let i = 0; i < parts.length - 1; i++) { if (typeof o[parts[i]] !== "object" || o[parts[i]] === null) o[parts[i]] = {}; o = o[parts[i]]; }
  const last = parts[parts.length - 1]; const nv = applyValue(o[last], v);
  if (nv === undefined) delete o[last]; else o[last] = nv;
}
function deepMerge(a, b) {
  for (const [k, v] of Object.entries(b)) {
    if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Sentinel) && a[k] && typeof a[k] === "object" && !Array.isArray(a[k])) deepMerge(a[k], v);
    else { const nv = applyValue(a[k], v); if (nv === undefined) delete a[k]; else a[k] = nv; }
  }
  return a;
}
function resolveSentinels(obj) { const o = {}; deepMerge(o, obj); return o; }

class Snap { constructor(ref, data) { this.ref = ref; this.id = ref.id; this._d = data; this.exists = data !== undefined; } data() { return clone(this._d); } }
class DocRef {
  constructor(path) { this.path = path; this.id = path.split("/").pop(); }
  async get() { return new Snap(this, store.get(this.path)); }
  async set(data, opts = {}) { const cur = opts.merge ? clone(store.get(this.path) || {}) : {}; store.set(this.path, deepMerge(cur, data)); }
  async update(data) {
    if (!store.has(this.path)) throw new Error("NOT_FOUND " + this.path);
    const cur = clone(store.get(this.path));
    for (const [k, v] of Object.entries(data)) setPath(cur, k, v);
    store.set(this.path, cur);
  }
  async delete() { store.delete(this.path); }
  collection(p) { return new Query(`${this.path}/${p}`); }
}
class Query {
  constructor(path, filters = [], order = null, lim = null) { this.path = path; this.filters = filters; this.order = order; this.lim = lim; }
  doc(id) { return new DocRef(`${this.path}/${id || "auto" + ++auto + Math.random().toString(36).slice(2, 7)}`); }
  async add(data) { const r = this.doc(); await r.set(data); return r; }
  where(f, op, v) { return new Query(this.path, [...this.filters, [f, op, v]], this.order, this.lim); }
  orderBy(f, dir = "asc") { return new Query(this.path, this.filters, [f, dir], this.lim); }
  limit(n) { return new Query(this.path, this.filters, this.order, n); }
  async get() {
    const depth = this.path.split("/").length + 1;
    let docs = [...store.entries()].filter(([p]) => p.startsWith(this.path + "/") && p.split("/").length === depth)
      .map(([p, d]) => new Snap(new DocRef(p), d));
    for (const [f, op, v] of this.filters) docs = docs.filter((s) => { const x = s._d[f]; return op === ">" ? x > v : op === "==" ? x === v : op === "array-contains" ? (x || []).includes(v) : true; });
    if (this.order) { const [f, dir] = this.order; docs.sort((a, b) => (a._d[f] > b._d[f] ? 1 : -1) * (dir === "desc" ? -1 : 1)); }
    if (this.lim) docs = docs.slice(0, this.lim);
    return { docs, size: docs.length, empty: !docs.length };
  }
}
export const db = {
  doc: (p) => new DocRef(p),
  collection: (p) => new Query(p),
  async runTransaction(fn) {
    const ops = [];
    const tx = { get: (r) => r.get(), set: (r, d, o) => ops.push(() => r.set(d, o)), update: (r, d) => ops.push(() => r.update(d)) };
    const out = await fn(tx); for (const op of ops) await op(); return out;
  },
};
export const dump = (prefix) => [...store.entries()].filter(([p]) => p.startsWith(prefix));
export const raw = (p) => clone(store.get(p));
