import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
  createContext,
  useContext,
} from "react";

/**
 * EK Ordre – Auth, Kunder m/brukere (inntil 10) & Full forespørsel/tilbud/aksept/bestilling (clean build)
 * - Ingen overflødige komponenter, ryddet hooks og parenteser
 * - Inkluderer testsender (kunde -> admin) knapp
 */

// ========= Utilities =========
const textEncoder = new TextEncoder();

async function pbkdf2Hash(password, salt, iterations = 120000, length = 32) {
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    textEncoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const saltBytes = hexToBytes(salt);
  const bits = await window.crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations },
    keyMaterial,
    length * 8
  );
  return bytesToHex(new Uint8Array(bits));
}
function genSalt(byteLen = 16) {
  const salt = new Uint8Array(byteLen);
  window.crypto.getRandomValues(salt);
  return bytesToHex(salt);
}
function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}
function hexToBytes(hex) {
  if (!hex || hex.length % 2 !== 0) return new Uint8Array();
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.substr(i * 2, 2), 16);
  return arr;
}
function b64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

// ========= Local Storage Keys =========
const LS_KEYS = {
  USERS: "ekordre_auth_users",
  SESSION: "ekordre_auth_session",
  BACKEND: "ekordre_backend_kind",
  ORDERS: "ekordre_orders",
  CUSTOMERS: "ekordre_customers",
};

// ========= Backend (local) =========
class BackendAdapter {
  async init() {}
  async getCurrentUser(){ return null; }
  async signIn(){ throw new Error("Not implemented"); }
  async signOut(){ throw new Error("Not implemented"); }
  async listOrders(){ throw new Error("Not implemented"); }
  async saveOrder(){ throw new Error("Not implemented"); }
}
class LocalStorageAdapter extends BackendAdapter {
  async init(){}
  async getCurrentUser() {
    const raw = localStorage.getItem(LS_KEYS.SESSION);
    if (!raw) return null;
    try {
      const s = JSON.parse(raw);
      if (s.expiresAt && Date.now() > s.expiresAt) {
        localStorage.removeItem(LS_KEYS.SESSION);
        return null;
      }
      return s;
    } catch { return null; }
  }
  async signIn(email, password) {
    const users = JSON.parse(localStorage.getItem(LS_KEYS.USERS) || "[]");
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) throw new Error("Ugyldig e-post eller passord");
    const candidate = await pbkdf2Hash(password, user.salt);
    if (candidate !== user.hash) throw new Error("Ugyldig e-post eller passord");
    const session = { email: user.email, role: user.role || "user", expiresAt: Date.now() + 7*24*60*60*1000 };
    localStorage.setItem(LS_KEYS.SESSION, JSON.stringify(session));
    return session;
  }
  async signOut(){ localStorage.removeItem(LS_KEYS.SESSION); }
  async listOrders(){ return JSON.parse(localStorage.getItem(LS_KEYS.ORDERS) || "[]"); }
  async saveOrder(order){
    const orders = JSON.parse(localStorage.getItem(LS_KEYS.ORDERS) || "[]");
    const idx = orders.findIndex(o => o.id === order.id);
    if (idx >= 0) orders[idx] = order; else orders.push(order);
    localStorage.setItem(LS_KEYS.ORDERS, JSON.stringify(orders));
    return order;
  }
}
const adapters = { local: new LocalStorageAdapter() };

// ========= Auth store =========
function readUsers(){ try { return JSON.parse(localStorage.getItem(LS_KEYS.USERS) || "[]"); } catch { return []; } }
function writeUsers(u){ localStorage.setItem(LS_KEYS.USERS, JSON.stringify(u)); }
async function createUser({ email, password, role="user" }){
  const users = readUsers();
  if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) throw new Error("Bruker finnes allerede");
  const salt = genSalt();
  const hash = await pbkdf2Hash(password, salt);
  users.push({ email, role, salt, hash });
  writeUsers(users);
  return { email, role };
}

// ========= Auth context =========
const AuthCtx = createContext(null);
export function useAuth(){ return useContext(AuthCtx); }

function AuthProvider({ children, backendKind }) {
  const [backend] = useState(() => adapters[backendKind] || adapters.local);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await backend.init();
        const current = await backend.getCurrentUser();
        if (alive) setUser(current);
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [backend]);

  const signIn = useCallback(async (email, password) => {
    setError("");
    try {
      const session = await backend.signIn(email, password);
      setUser(session);
      return session;
    } catch (e) {
      setError(e.message || "Innlogging feilet");
      throw e;
    }
  }, [backend]);

  const signOut = useCallback(async () => {
    try { await backend.signOut(); } finally { setUser(null); }
  }, [backend]);

  const value = useMemo(() => ({ user, signIn, signOut, backend }), [user, signIn, signOut, backend]);

  if (loading) return (
    <div className="min-h-screen grid place-items-center p-8 text-center">
      <div>
        <div className="animate-pulse text-2xl font-semibold">Laster…</div>
        <p className="opacity-60 mt-2">Klargjør EK Ordre</p>
      </div>
    </div>
  );

  return (
    <AuthCtx.Provider value={value}>
      {user ? children : <AuthGate onCreatedAdmin={() => setError("")} error={error} onSubmit={signIn} />}
    </AuthCtx.Provider>
  );
}

function AuthGate({ onSubmit, error, onCreatedAdmin }) {
  const [hasUsers, setHasUsers] = useState(() => readUsers().length > 0);
  const [mode, setMode] = useState(hasUsers ? "login" : "create-admin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const exists = readUsers().length > 0;
    setHasUsers(exists);
    if (!exists) setMode("create-admin");
  }, []);

  const doLogin = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try { await onSubmit(email, password); } finally { setBusy(false); }
  };
  const doCreateAdmin = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      await createUser({ email, password, role: "admin" });
      setMsg("Admin opprettet – du kan logge inn nå.");
      setMode("login");
      onCreatedAdmin?.();
    } catch (e) {
      setMsg(e.message || "Kunne ikke opprette admin");
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-neutral-50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow p-6">
        <h1 className="text-2xl font-bold">EK Ordre</h1>
        <p className="text-sm opacity-70 mb-6">Lokal innlogging</p>

        {!hasUsers || mode === "create-admin" ? (
          <form onSubmit={doCreateAdmin} className="space-y-3">
            <div className="text-sm font-medium">Opprett første admin</div>
            <label className="block">
              <span className="text-sm">E‑post</span>
              <input className="mt-1 w-full border rounded-xl px-3 py-2" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-sm">Passord</span>
              <input className="mt-1 w-full border rounded-xl px-3 py-2" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <button disabled={busy} className="w-full rounded-xl px-3 py-2 bg-black text-white disabled:opacity-60">
              {busy ? "Lagrer…" : "Opprett admin"}
            </button>
            {msg && <p className="text-sm mt-2">{msg}</p>}
          </form>
        ) : (
          <form onSubmit={doLogin} className="space-y-3">
            <div className="text-sm font-medium">Logg inn</div>
            <label className="block">
              <span className="text-sm">E‑post</span>
              <input className="mt-1 w-full border rounded-xl px-3 py-2" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-sm">Passord</span>
              <input className="mt-1 w-full border rounded-xl px-3 py-2" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <button disabled={busy} className="w-full rounded-xl px-3 py-2 bg-black text-white disabled:opacity-60">
              {busy ? "Logger inn…" : "Logg inn"}
            </button>
            {error && <p className="text-sm mt-2 text-red-600">{error}</p>}
          </form>
        )}
      </div>
    </div>
  );
}

// ========= Customers & Users =========
function readCustomers(){ try { return JSON.parse(localStorage.getItem(LS_KEYS.CUSTOMERS) || "[]"); } catch { return []; } }
function writeCustomers(c){ localStorage.setItem(LS_KEYS.CUSTOMERS, JSON.stringify(c)); }
function ensureCustomersSeed() {
  const have = readCustomers();
  if (have.length === 0) {
    const seed = [
      { id: "cust_ekmulti", name: "EK Multi AS", orgnr: "931 642 898", users: [
        { email: "guttorm@ekms.no", name: "Guttorm Kallevåg", role: "admin" },
        { email: "drift@ekms.no", name: "Drift", role: "user" },
      ]},
      { id: "cust_skl", name: "SKL", orgnr: "999 999 999", users: [
        { email: "kontakt@skl.no", name: "SKL Kontakt", role: "customer" }
      ]},
      { id: "cust_test", name: "Testkunde AS", orgnr: "000 000 000", users: [
        { email: "kunde@test.no", name: "Test Kunde", role: "customer" }
      ]},
    ];
    writeCustomers(seed);
  }
}
function upsertCustomerUser(customerId, user) {
  const list = readCustomers();
  const c = list.find(x => x.id === customerId);
  if (!c) throw new Error("Kunde ikke funnet");
  if (!c.users) c.users = [];
  const exists = c.users.find(u => u.email.toLowerCase() === user.email.toLowerCase());
  if (!exists && c.users.length >= 10) throw new Error("Maks 10 brukere per kunde");
  if (exists) Object.assign(exists, user); else c.users.push(user);
  writeCustomers(list);
}
function removeCustomerUser(customerId, email) {
  const list = readCustomers();
  const c = list.find(x => x.id === customerId);
  if (!c) return;
  c.users = (c.users || []).filter(u => u.email.toLowerCase() !== email.toLowerCase());
  writeCustomers(list);
}

// ========= Orders / Requests =========
function migrateOrdersAttachCustomer() {
  const orders = JSON.parse(localStorage.getItem(LS_KEYS.ORDERS) || "[]");
  let changed = false;
  for (const o of orders) {
    if (!o.customerId) { o.customerId = "cust_skl"; changed = true; }
  }
  if (changed) localStorage.setItem(LS_KEYS.ORDERS, JSON.stringify(orders));
}
function newId(prefix = "ord"){ return `${prefix}_${Math.random().toString(36).slice(2,8)}_${Date.now().toString(36)}`; }
function createRequest({ customerId, createdBy, payload }) {
  if (!customerId) throw new Error("customerId mangler");
  const id = newId("req");
  const order = { id, type: "request", status: "Forespørsel sendt", customerId, createdBy, payload, createdAt: Date.now() };
  const list = JSON.parse(localStorage.getItem(LS_KEYS.ORDERS) || "[]");
  list.push(order); localStorage.setItem(LS_KEYS.ORDERS, JSON.stringify(list));
  return order;
}
function respondWithOffer(orderId, { offerNo, price, notes }) {
  const list = JSON.parse(localStorage.getItem(LS_KEYS.ORDERS) || "[]");
  const idx = list.findIndex(o => o.id === orderId);
  if (idx === -1) throw new Error("Forespørsel ikke funnet");
  const o = list[idx];
  const updated = { ...o, type: "offer", status: "Tilbud mottatt", offerNo, price, notes, offeredAt: Date.now() };
  list[idx] = updated; localStorage.setItem(LS_KEYS.ORDERS, JSON.stringify(list));
  return updated;
}
function acceptOffer(orderId) {
  const list = JSON.parse(localStorage.getItem(LS_KEYS.ORDERS) || "[]");
  const idx = list.findIndex(o => o.id === orderId);
  if (idx === -1) throw new Error("Tilbud ikke funnet");
  const o = list[idx];
  const updated = { ...o, type: "accepted", status: "Tilbud akseptert", acceptedAt: Date.now(), acceptLink: `https://ekms.no/accept/${b64(o.id)}` };
  list[idx] = updated; localStorage.setItem(LS_KEYS.ORDERS, JSON.stringify(list));
  return updated;
}
function createDirectOrder({ customerId, createdBy, payload }) {
  if (!customerId) throw new Error("customerId mangler");
  const id = newId("ord");
  const order = { id, type: "order", status: "Bestilling mottatt", customerId, createdBy, payload, createdAt: Date.now() };
  const list = JSON.parse(localStorage.getItem(LS_KEYS.ORDERS) || "[]");
  list.push(order); localStorage.setItem(LS_KEYS.ORDERS, JSON.stringify(list));
  return order;
}

// ========= Customer UI =========
function CustomerPicker({ value, onChange }) {
  const [customers, setCustomers] = useState(() => readCustomers());
  useEffect(() => { ensureCustomersSeed(); setCustomers(readCustomers()); }, []);
  return (
    <div className="grid gap-2">
      <label className="text-sm">Kunde</label>
      <select className="border rounded-xl px-3 py-2" value={value || ""} onChange={(e)=>onChange(e.target.value)}>
        <option value="">Velg kunde…</option>
        {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.orgnr})</option>)}
      </select>
    </div>
  );
}
function CustomerUsersPanel({ customerId }) {
  const [customers, setCustomers] = useState(()=>readCustomers());
  const c = customers.find(x=>x.id===customerId);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("customer");
  const refresh = ()=> setCustomers(readCustomers());
  if (!customerId) return <div className="text-sm opacity-70">Velg en kunde for å se brukere.</div>;
  const users = c?.users || [];
  const onAdd = async (e) => { e.preventDefault(); await upsertCustomerUser(customerId, { email, name, role }); setEmail(""); setName(""); setRole("customer"); refresh(); };
  const onDel = (em) => { removeCustomerUser(customerId, em); refresh(); };
  return (
    <div className="bg-white rounded-2xl shadow p-4">
      <div className="font-medium mb-3">Brukere hos {c?.name}</div>
      <form onSubmit={onAdd} className="grid md:grid-cols-4 gap-2 mb-3">
        <input className="border rounded-xl px-3 py-2" placeholder="Navn" value={name} onChange={(e)=>setName(e.target.value)} required />
        <input className="border rounded-xl px-3 py-2" type="email" placeholder="E‑post" value={email} onChange={(e)=>setEmail(e.target.value)} required />
        <select className="border rounded-xl px-3 py-2" value={role} onChange={(e)=>setRole(e.target.value)}>
          <option value="customer">Kunde</option>
          <option value="manager">Manager</option>
        </select>
        <button className="rounded-xl bg-black text-white px-3 py-2">Legg til</button>
      </form>
      {users.length >= 10 && <div className="text-xs text-red-600 mb-2">Maks 10 brukere nådd.</div>}
      <ul className="divide-y">
        {users.map(u => (
          <li key={u.email} className="py-2 flex items-center justify-between">
            <div>
              <div className="font-medium">{u.name}</div>
              <div className="text-xs opacity-60">{u.email} · {u.role}</div>
            </div>
            <button onClick={()=>onDel(u.email)} className="border rounded-lg px-3 py-1 text-sm">Fjern</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ========= Main App =========
export default function EKOrdreWithAuth() {
  return (
    <AuthProvider>
      <ExistingApp />
    </AuthProvider>
  );
}

function ExistingApp() {
  const { user, signOut } = useAuth();
  const [orders, setOrders] = useState([]);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("flow");
  const [customerId, setCustomerId] = useState("");
  const [customerUser, setCustomerUser] = useState("");
  const [payload, setPayload] = useState({ title: "Riving av 72,5kV linjenett – Forespørsel", cc: [], images: [], notes: "" });

  useEffect(()=>{ ensureCustomersSeed(); migrateOrdersAttachCustomer(); }, []);

  const loadOrders = useCallback(()=>{
    setBusy(true);
    try { setOrders(JSON.parse(localStorage.getItem(LS_KEYS.ORDERS) || "[]")); }
    finally { setBusy(false); }
  }, []);
  useEffect(()=>{ loadOrders(); }, [loadOrders]);

  const onSendRequest = () => { const o = createRequest({ customerId, createdBy: customerUser, payload }); setOrders(x=>[o, ...x]); };
  const onSendDirectOrder = () => { const o = createDirectOrder({ customerId, createdBy: customerUser, payload }); setOrders(x=>[o, ...x]); };
  const onRespondOffer = (id) => {
    const offerNo = `EK-${new Date().getFullYear()}-${Math.floor(Math.random()*900+100)}`;
    const o = respondWithOffer(id, { offerNo, price: 1250000, notes: "Standard betingelser" });
    setOrders(xs => xs.map(x => x.id===id ? o : x));
  };
  const onAccept = (id) => { const o = acceptOffer(id); setOrders(xs => xs.map(x => x.id===id ? o : x)); };

  const usersForCustomer = useMemo(()=>{
    const c = readCustomers().find(x=>x.id===customerId);
    return c?.users || [];
  }, [customerId]);

  // CC & images helpers
  const [ccInput, setCcInput] = useState("");
  function addCc() {
    const emails = ccInput.split(",").map(s=>s.trim()).filter(Boolean);
    if (emails.length === 0) return;
    setPayload(p => ({...p, cc: Array.from(new Set([...(p.cc||[]), ...emails]))}));
    setCcInput("");
  }
  function removeCc(email){ setPayload(p => ({...p, cc: (p.cc||[]).filter(e => e !== email)})); }
  async function onPickImages(files){
    const chosen = Array.from(files||[]).slice(0, 10 - (payload.images?.length||0));
    const reads = await Promise.all(chosen.map(file => new Promise(res => {
      const r = new FileReader();
      r.onload = () => res({ name: file.name, size: file.size, type: file.type, dataUrl: r.result });
      r.readAsDataURL(file);
    })));
    setPayload(p => ({...p, images: [...(p.images||[]), ...reads]}));
  }
  function removeImage(idx){ setPayload(p => ({...p, images: (p.images||[]).filter((_,i)=>i!==idx)})); }

  // Testsender
  function sendTestRequest() {
    const testCustomerId = "cust_test";
    const testUser = "kunde@test.no";
    const testPayload = {
      title: "(TEST) Forespørsel fra Testkunde AS",
      notes: "Automatisk generert testforespørsel",
      cc: ["guttorm@ekms.no"],
      images: [],
    };
    const o = createRequest({ customerId: testCustomerId, createdBy: testUser, payload: testPayload });
    setOrders(x => [o, ...x]);
    alert("Test-forespørsel sendt fra kunde@test.no til administrasjonen.");
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="flex items-center justify-between p-4 bg-white shadow">
        <div className="font-semibold">EK Ordre</div>
        <nav className="flex items-center gap-2 text-sm">
          <button className={`px-3 py-1 rounded-lg ${tab==='flow'?'bg-black text-white':'border'}`} onClick={() => setTab('flow')}>Forespørsel/Bestilling</button>
          <button className={`px-3 py-1 rounded-lg ${tab==='customers'?'bg-black text-white':'border'}`} onClick={() => setTab('customers')}>Kunder & brukere</button>
          <button className={`px-3 py-1 rounded-lg ${tab==='orders'?'bg-black text-white':'border'}`} onClick={() => setTab('orders')}>Alle saker</button>
        </nav>
        <div className="flex items-center gap-3 text-sm">
          <span className="opacity-70">{user?.email} ({user?.role})</span>
          <button onClick={signOut} className="rounded-lg border px-3 py-1">Logg ut</button>
        </div>
      </header>

      <main className="p-4 grid gap-4">
        {tab === 'flow' && (
          <section className="grid md:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl shadow p-4 md:col-span-1">
              {/* Testsender */}
              <div className="mb-4 p-3 border rounded-xl bg-gray-50">
                <div className="text-sm font-medium mb-1">Testsender</div>
                <p className="text-xs opacity-70 mb-2">Klikk for å simulere at en kunde sender en forespørsel til administrator.</p>
                <button className="border rounded-lg px-3 py-2 text-sm" onClick={sendTestRequest}>Send test‑forespørsel (kunde → admin)</button>
              </div>

              <CustomerPicker value={customerId} onChange={setCustomerId} />
              <div className="grid gap-2 mt-3">
                <label className="text-sm">Bruker hos kunden</label>
                <select className="border rounded-xl px-3 py-2" value={customerUser} onChange={(e)=>setCustomerUser(e.target.value)}>
                  <option value="">Velg bruker…</option>
                  {usersForCustomer.map(u => <option key={u.email} value={u.email}>{u.name} ({u.email})</option>)}
                </select>
              </div>
              <div className="grid gap-2 mt-3">
                <label className="text-sm">Tittel</label>
                <input className="border rounded-xl px-3 py-2" value={payload.title} onChange={(e)=>setPayload({...payload, title: e.target.value})} />
                <label className="text-sm">Notat</label>
                <textarea className="border rounded-xl px-3 py-2" rows={4} value={payload.notes} onChange={(e)=>setPayload({...payload, notes: e.target.value})} />
                <div className="grid gap-2">
                  <label className="text-sm">CC (kommaseparert)</label>
                  <div className="flex gap-2">
                    <input className="border rounded-xl px-3 py-2 flex-1" placeholder="epost1@domene.no, epost2@domene.no" value={ccInput} onChange={(e)=>setCcInput(e.target.value)} onKeyDown={(e)=>{ if(e.key==='Enter'){ e.preventDefault(); addCc(); } }} />
                    <button type="button" className="border rounded-lg px-3 py-2" onClick={addCc}>Legg til</button>
                  </div>
                  {(payload.cc||[]).length>0 && (
                    <div className="flex flex-wrap gap-2 mt-1">
                      {payload.cc.map((e)=> (
                        <span key={e} className="px-2 py-1 border rounded-full text-xs flex items-center gap-2">
                          {e}
                          <button type="button" className="text-xs" onClick={()=>removeCc(e)}>✕</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="grid gap-2">
                  <label className="text-sm">Bilder (maks 10 totalt)</label>
                  <input type="file" multiple accept="image/*" onChange={(e)=>onPickImages(e.target.files)} />
                  {(payload.images||[]).length>0 && (
                    <div className="grid grid-cols-3 gap-2">
                      {payload.images.map((img, idx)=> (
                        <div key={idx} className="relative border rounded-xl overflow-hidden">
                          <img src={img.dataUrl} alt={img.name} className="w-full h-24 object-cover" />
                          <div className="p-2 text-[10px] truncate">{img.name}</div>
                          <button type="button" className="absolute top-1 right-1 bg-white/80 border rounded px-1 text-[10px]" onClick={()=>removeImage(idx)}>Fjern</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button className="border rounded-lg px-3 py-2" disabled={!customerId || !customerUser} onClick={onSendRequest}>Send forespørsel</button>
                <button className="border rounded-lg px-3 py-2" disabled={!customerId || !customerUser} onClick={onSendDirectOrder}>Direkte bestilling</button>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow p-4 md:col-span-2">
              <div className="font-medium mb-3">Aktive saker</div>
              <ul className="divide-y">
                {orders.length === 0 && <li className="py-2 text-sm opacity-60">Ingen saker ennå.</li>}
                {orders.slice(0,10).map(o => (
                  <li key={o.id} className="py-2 grid md:grid-cols-6 gap-2 items-center">
                    <div className="md:col-span-2">
                      <div className="font-medium">{o.payload?.title || o.title}</div>
                      <div className="text-xs opacity-60">{o.type} · {o.status}</div>
                    </div>
                    <div className="text-xs opacity-60">{o.customerId}</div>
                    {o.type!=="offer" && <button className="border rounded-lg px-3 py-1 text-sm" onClick={()=>onRespondOffer(o.id)}>Svar med tilbud</button>}
                    {o.type==="offer" && <button className="border rounded-lg px-3 py-1 text-sm" onClick={()=>onAccept(o.id)}>Aksepter</button>}
                    {o.acceptLink && <a className="underline text-sm" href={o.acceptLink} target="_blank">Aksept‑lenke</a>}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {tab === 'customers' && (
          <section className="grid md:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl shadow p-4">
              <div className="font-medium mb-3">Velg kunde</div>
              <CustomerPicker value={customerId} onChange={setCustomerId} />
            </div>
            <CustomerUsersPanel customerId={customerId} />
          </section>
        )}

        {tab === 'orders' && (
          <section className="bg-white rounded-2xl shadow p-4">
            <div className="font-medium mb-3">Alle saker (localStorage)</div>
            <button onClick={loadOrders} disabled={busy} className="rounded-lg bg-black text-white px-3 py-2 disabled:opacity-60">{busy?"Laster…":"Oppdater"}</button>
            <ul className="mt-4 space-y-2">
              {orders.map((o) => (
                <li key={o.id} className="bg-white rounded-xl p-3 shadow flex items-center justify-between">
                  <div>
                    <div className="font-medium">{o.payload?.title || o.title || `Sak ${o.id}`}</div>
                    <div className="text-xs opacity-70">{o.type} · {o.status} · {o.customerId}</div>
                  </div>
                  <div className="text-xs opacity-60">{new Date(o.createdAt||Date.now()).toLocaleString()}</div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
