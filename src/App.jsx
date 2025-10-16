
import React, { useEffect, useMemo, useState } from "react";

// Helpers
function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : initial; } catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }, [key, value]);
  return [value, setValue];
}
const uid = () => crypto.randomUUID();
const SUPPLIERS = ['Interroll','Festo','Banner','Unic','GMT','SICK','Generell','Annet'];
const emptyLine = () => ({ id: uid(), leverandor: SUPPLIERS[0], varenr: '', navn: '', antall: 1, merknad: '' });

function useSeed() {
  useEffect(() => {
    if (!JSON.parse(localStorage.getItem('demo_companies')||'null')) localStorage.setItem('demo_companies', JSON.stringify([
      { id:'ekmulti', name:'EK Multi AS', org:'NO 987 654 321', cc:[] },
      { id:'kunde-a', name:'Kunde A AS', org:'NO 999 111 222', cc:[] },
      { id:'kunde-b', name:'Kunde B AS', org:'NO 333 444 555', cc:[] },
    ]));
    if (!JSON.parse(localStorage.getItem('demo_users')||'null')) localStorage.setItem('demo_users', JSON.stringify([{ id:'u-demo', name:'Demo Bruker', email:'demo@ekms.no' }]));
    if (!JSON.parse(localStorage.getItem('demo_links')||'null')) localStorage.setItem('demo_links', JSON.stringify([{ userId:'u-demo', companyId:'ekmulti', role:'customer_user', isDefault:true }]));
    if (!localStorage.getItem('demo_orders')) localStorage.setItem('demo_orders', JSON.stringify([]));
    if (!localStorage.getItem('demo_emails')) localStorage.setItem('demo_emails', JSON.stringify([]));
  }, []);
}

// Components
function Card({ title, children }){
  return (<section className="card p-4 md:p-5">{title && <h2 className="text-sm font-semibold mb-3">{title}</h2>}{children}</section>);
}
function EmailLog(){
  const [emails,setEmails]=useState([]);
  useEffect(()=>{setEmails(JSON.parse(localStorage.getItem('demo_emails')||'[]'))},[]);
  return(<Card title="Sendte e-poster (demo)">{emails.length===0?(<p className="text-xs text-slate-500">Ingen e-poster sendt enda.</p>):(
    <ul className="space-y-3 text-xs">{emails.map(m=>(<li key={m.id} className="border rounded-lg p-2 bg-slate-50">
      <div><span className="font-medium">{m.subject}</span> → {m.to}</div>
      <div className="text-slate-500 text-[11px]">{new Date(m.tidspunkt).toLocaleString()}</div>
      <pre className="bg-white border rounded p-2 overflow-auto mt-1 whitespace-pre-wrap text-[11px]">{m.body}</pre>
    </li>))}</ul>
  )}</Card>);
}
function LoginCard({ users, setUsers, onLogin }){
  const [existingId, setExistingId] = useState(users[0]?.id || '');
  const [name, setName] = useState(''); const [email, setEmail] = useState('');
  function createUser(e){ e.preventDefault(); if(!name.trim()) return; const u={id:uid(),name:name.trim(),email:email.trim()}; setUsers(p=>[...p,u]); onLogin({id:u.id,navn:u.name,email:u.email}); }
  function useExisting(e){ e.preventDefault(); const u=users.find(x=>x.id===existingId)||users[0]; if(!u) return; onLogin({id:u.id,navn:u.name,email:u.email}); }
  return (<div className="max-w-2xl mx-auto grid md:grid-cols-2 gap-4">
    <Card title="Logg inn – eksisterende bruker">
      <form onSubmit={useExisting} className="space-y-3">
        <label className="label">Velg bruker</label>
        <select className="input" value={existingId} onChange={e=>setExistingId(e.target.value)}>{users.map(u=><option key={u.id} value={u.id}>{u.name} ({u.email||'uten e-post'})</option>)}</select>
        <button className="px-4 py-2 rounded-xl bg-slate-900 text-white">Logg inn</button>
      </form>
    </Card>
    <Card title="Opprett ny bruker og logg inn">
      <form onSubmit={createUser} className="space-y-3">
        <input className="input" placeholder="Navn" value={name} onChange={e=>setName(e.target.value)} />
        <input className="input" type="email" placeholder="E-post (valgfri)" value={email} onChange={e=>setEmail(e.target.value)} />
        <button className="px-4 py-2 rounded-xl bg-slate-900 text-white">Opprett & logg inn</button>
      </form>
    </Card>
  </div>);
}
function AdminPanel({ companies, setCompanies, users, setUsers, links, setLinks }){
  const [cName,setCName]=useState(''); const [cOrg,setCOrg]=useState(''); const [ccInput,setCcInput]=useState('');
  const [uName,setUName]=useState(''); const [uEmail,setUEmail]=useState('');
  const [selUser,setSelUser]=useState(users[0]?.id||''); const [selCompany,setSelCompany]=useState(companies[0]?.id||''); const [role,setRole]=useState('customer_user'); const [isDefault,setIsDefault]=useState(false);
  const roles=['customer_user','approver','admin','ek_staff'];
  function addCompany(e){e.preventDefault(); if(!cName.trim()) return; setCompanies(p=>[...p,{id:uid(),name:cName.trim(),org:cOrg.trim(),cc:[]}]); setCName(''); setCOrg('');}
  function addUser(e){e.preventDefault(); if(!uName.trim()) return; setUsers(p=>[...p,{id:uid(),name:uName.trim(),email:uEmail.trim()}]); setUName(''); setUEmail('');}
  function addLink(e){e.preventDefault(); if(!selUser||!selCompany) return; let newLinks=links.filter(l=>!(l.userId===selUser&&l.companyId===selCompany)); if(isDefault){ newLinks=newLinks.map(l=>l.userId===selUser?{...l,isDefault:false}:l);} newLinks.push({userId:selUser,companyId:selCompany,role,isDefault}); setLinks(newLinks);}
  function removeLink(uId,cId){ setLinks(links.filter(l=>!(l.userId===uId&&l.companyId===cId))); }
  function addCc(companyId){ if(!ccInput.trim()) return; setCompanies(p=>p.map(c=>c.id===companyId?{...c,cc:[...(c.cc||[]),ccInput.trim()]}:c)); setCcInput(''); }
  function removeCc(companyId,email){ setCompanies(p=>p.map(c=>c.id===companyId?{...c,cc:(c.cc||[]).filter(x=>x!==email)}:c)); }
  return (<div className="grid md:grid-cols-3 gap-4">
    <section className="md:col-span-1 space-y-4">
      <Card title="Opprett Kunde">
        <form onSubmit={addCompany} className="space-y-3">
          <input className="input" placeholder="Navn" value={cName} onChange={e=>setCName(e.target.value)} />
          <input className="input" placeholder="Org.nr (valgfri)" value={cOrg} onChange={e=>setCOrg(e.target.value)} />
          <button className="px-4 py-2 rounded-xl bg-slate-900 text-white">Lagre</button>
        </form>
      </Card>
      <Card title="Opprett Bruker">
        <form onSubmit={addUser} className="space-y-3">
          <input className="input" placeholder="Navn" value={uName} onChange={e=>setUName(e.target.value)} />
          <input className="input" type="email" placeholder="E-post (valgfri)" value={uEmail} onChange={e=>setUEmail(e.target.value)} />
          <button className="px-4 py-2 rounded-xl bg-slate-900 text-white">Lagre</button>
        </form>
      </Card>
    </section>
    <section className="md:col-span-2 space-y-4">
      <Card title="Tildel bruker ↔ kunde">
        <form onSubmit={addLink} className="grid md:grid-cols-5 gap-3 items-end">
          <div><label className="label">Bruker</label><select className="input" value={selUser} onChange={e=>setSelUser(e.target.value)}>{users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
          <div><label className="label">Kunde</label><select className="input" value={selCompany} onChange={e=>setSelCompany(e.target.value)}>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div><label className="label">Rolle</label><select className="input" value={role} onChange={e=>setRole(e.target.value)}>{roles.map(r=><option key={r}>{r}</option>)}</select></div>
          <div><label className="label">Default</label><br/><label className="inline-flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={isDefault} onChange={e=>setIsDefault(e.target.checked)} /> Gjør til standard</label></div>
          <div><button className="px-4 py-2 rounded-xl bg-slate-900 text-white w-full">Tildel</button></div>
        </form>
      </Card>
      <Card title="Kunder – CC-mottakere">
        {companies.length===0?(<p className="text-sm text-slate-600">Opprett en kunde først.</p>):(
          <ul className="space-y-4">{companies.map(c=>(
            <li key={c.id} className="p-3 border rounded-xl bg-white">
              <div className="flex items-center justify-between"><div className="font-medium">{c.name}</div><div className="text-xs text-slate-500">Org: {c.org||'—'}</div></div>
              <div className="mt-2 flex items-center gap-2"><input className="input" placeholder="leggtil@eksempel.no" value={ccInput} onChange={e=>setCcInput(e.target.value)} /><button onClick={()=>addCc(c.id)} className="px-3 py-2 rounded-lg border">+ Legg til CC</button></div>
              <div className="mt-2 flex flex-wrap gap-2">{(c.cc||[]).map(mail=>(<span key={mail} className="px-2 py-1 rounded-full text-xs border bg-slate-50">{mail}<button className="ml-2 text-slate-500" onClick={()=>removeCc(c.id,mail)}>✕</button></span>))}{(c.cc||[]).length===0 && <span className="text-xs text-slate-500">Ingen CC-adresser</span>}</div>
            </li>
          ))}</ul>
        )}
      </Card>
      <Card title="Oversikt over koblinger">
        {users.length===0||companies.length===0?(<p className="text-sm text-slate-600">Opprett minst én bruker og én kunde.</p>):(
          <div className="overflow-auto"><table className="min-w-full text-sm">
            <thead><tr className="text-left text-slate-500"><th className="py-2 pr-4">Bruker</th><th className="py-2 pr-4">Kunde</th><th className="py-2 pr-4">Rolle</th><th className="py-2 pr-4">Default</th><th className="py-2"></th></tr></thead>
            <tbody>{links.map((l,i)=>{const u=users.find(x=>x.id===l.userId); const c=companies.find(x=>x.id===l.companyId); return (<tr key={i} className="border-t"><td className="py-2 pr-4">{u?.name}</td><td className="py-2 pr-4">{c?.name}</td><td className="py-2 pr-4">{l.role}</td><td className="py-2 pr-4">{l.isDefault?'Ja':'Nei'}</td><td className="py-2"><button onClick={()=>removeLink(l.userId,l.companyId)} className="px-2 py-1 text-xs rounded-lg border">Fjern</button></td></tr>)})}</tbody>
          </table></div>
        )}
      </Card>
    </section>
  </div>);
}

function Inbox({ orders, sendSvar }){
  const [pris, setPris] = useState(''); const [levering, setLevering] = useState(''); const [kommentar, setKommentar] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  return (<div className="grid md:grid-cols-3 gap-4">
    <section className="md:col-span-2"><Card title="Innkomne saker">
      {orders.length===0?(<p className="text-sm text-slate-600">Ingen saker mottatt ennå.</p>):(
        <ul className="space-y-3">{orders.map(o=>(
          <li key={o.id} className={`p-3 rounded-xl border bg-white ${selectedId===o.id?'ring-2 ring-slate-900':''}`}>
            <div className="flex items-center justify-between">
              <div className="text-sm">
                <div className="font-medium">{o.id} · {o.type==='bestilling'?'Bestilling':'Førespørsel'}</div>
                <div className="text-slate-500">{new Date(o.tidspunkt).toLocaleString()} · {o.company?.name || '—'} · Status: <span className="font-medium">{o.status}</span></div>
              </div>
              <button className="px-2 py-1 text-xs rounded-lg border" onClick={()=>setSelectedId(o.id)}>Velg</button>
            </div>
            {o.bilder && o.bilder.length>0 && (<div className="mt-2 text-xs text-slate-600">Bilder: {o.bilder.map(b=>b.navn).join(', ')}</div>)}
            <details className="mt-2"><summary className="text-xs cursor-pointer px-2 py-1 rounded-lg border inline-block">Vis detaljer</summary>
              <pre className="bg-slate-900 text-white text-xs p-3 rounded-xl overflow-auto mt-2">{JSON.stringify(o, null, 2)}</pre>
            </details>
          </li>
        ))}</ul>
      )}
    </Card></section>
    <aside><Card title="Svar med pris og levering">
      {selectedId?(
        <form onSubmit={(e)=>{e.preventDefault(); sendSvar(selectedId,pris,levering,kommentar); setPris(''); setLevering(''); setKommentar('');}} className="space-y-3">
          <div><label className="label">Pris</label><input className="input" value={pris} onChange={e=>setPris(e.target.value)} placeholder="F.eks. 12 500,-" /></div>
          <div><label className="label">Leveringstid</label><input className="input" value={levering} onChange={e=>setLevering(e.target.value)} placeholder="F.eks. 2–3 uker" /></div>
          <div><label className="label">Kommentar (valgfritt)</label><textarea className="input" rows={4} value={kommentar} onChange={e=>setKommentar(e.target.value)} placeholder="Evt. forbehold, del-levering, etc." /></div>
          <button className="px-4 py-2 rounded-xl bg-slate-900 text-white">Send svar</button>
        </form>
      ):(<p className="text-sm text-slate-600">Velg en sak fra listen for å svare.</p>)}
    </Card></aside>
  </div>);
}

export default function Wrapper(){ return <RootApp/> } // placeholder to avoid duplicate default export

function RootApp(){
  useSeed();
  const [activeTab, setActiveTab] = useLocalStorage('tab', 'app');
  const [user, setUser] = useLocalStorage('user', { id:'u-demo', navn:'Demo Bruker', email:'demo@ekms.no' });
  const [loggedIn, setLoggedIn] = useLocalStorage('logged_in', false);
  const [companies, setCompanies] = useLocalStorage('demo_companies', []);
  const [users, setUsers] = useLocalStorage('demo_users', []);
  const [links, setLinks] = useLocalStorage('demo_links', []);
  const [orders, setOrders] = useLocalStorage('demo_orders', []);

  const myLinks = useMemo(() => links.filter(l => l.userId === user.id), [links, user.id]);
  const myCompanies = useMemo(() => myLinks.map(l => ({ link: l, company: companies.find(c => c.id === l.companyId) })).filter(x => !!x.company), [myLinks, companies]);
  const defaultCompanyId = useMemo(() => (myLinks.find(l => l.isDefault)?.companyId) || myLinks[0]?.companyId, [myLinks]);
  const [activeCompanyId, setActiveCompanyId] = useLocalStorage('active_company_id', defaultCompanyId || 'ekmulti');
  useEffect(() => { const valid = myLinks.some(l => l.companyId === activeCompanyId); if (!valid && defaultCompanyId) setActiveCompanyId(defaultCompanyId); }, [myLinks, activeCompanyId, defaultCompanyId, setActiveCompanyId]);
  const activeCompany = useMemo(() => companies.find(c => c.id === activeCompanyId), [companies, activeCompanyId]);

  const [modus, setModus] = useState('foresporsel');
  const [linjer, setLinjer] = useState([emptyLine()]);
  const [ordreref, setOrdreref] = useState('');
  const [refNavn, setRefNavn] = useState('');
  const [kvittering, setKvittering] = useState(null);
  const [bilder, setBilder] = useState([]);

  useEffect(() => () => { bilder.forEach(b => URL.revokeObjectURL(b.url)); }, [bilder]);

  function sendEmail(to, subject, body){ const existing=JSON.parse(localStorage.getItem('demo_emails')||'[]'); existing.unshift({id:uid(),to,subject,body,tidspunkt:new Date().toISOString()}); localStorage.setItem('demo_emails', JSON.stringify(existing)); }
  function handleFiles(e){ const files=Array.from(e.target.files||[]); const withUrls=files.map(f=>({id:uid(),file:f,url:URL.createObjectURL(f)})); setBilder(p=>[...p,...withUrls]); }
  function removeImage(id){ const img=bilder.find(b=>b.id===id); if(img) URL.revokeObjectURL(img.url); setBilder(p=>p.filter(b=>b.id!==id)); }
  function handleSubmit(e){ e.preventDefault(); const id=`REQ-${Math.random().toString(36).slice(2,8).toUpperCase()}`; const payload={id,type:modus,bruker:{id:user.id,navn:user.navn,email:user.email},company:activeCompany,ordreref,refNavn,linjer,bilder:bilder.map(b=>({navn:b.file.name,size:b.file.size})),tidspunkt:new Date().toISOString(),status:'Mottatt',svar:[]}; setKvittering(payload); setOrders([payload,...orders]); const subject=modus==='bestilling'?`Kvittering bestilling ${id}`:`Kvittering førespørsel ${id}`; const body=JSON.stringify(payload,null,2); sendEmail(user.email||'test@demo.local',subject,body); (activeCompany?.cc||[]).forEach(cc=>sendEmail(cc,subject+' (CC)',body)); if(modus==='bestilling') sendEmail('post@ekms.no',subject+' (kopi)',body); setLinjer([emptyLine()]); setOrdreref(''); setRefNavn(''); setBilder([]); }
  function sendSvar(orderId,pris,levering,kommentar){ const list=[...orders]; const idx=list.findIndex(o=>o.id===orderId); if(idx===-1)return; const o=list[idx]; const svar={id:uid(),pris,levering,kommentar,tidspunkt:new Date().toISOString()}; o.svar=[...(o.svar||[]),svar]; o.status='Besvart'; list[idx]=o; setOrders(list); const subject=`Svar på ${o.type==='bestilling'?'bestilling':'førespørsel'} ${o.id}`; const body=JSON.stringify({orderId:o.id,pris,levering,kommentar},null,2); if(o.bruker?.email) sendEmail(o.bruker.email,subject,body); (o.company?.cc||[]).forEach(cc=>sendEmail(cc,subject+' (CC)',body)); }

  return (<div className="min-h-screen bg-slate-50">
    <header className="sticky top-0 z-10 backdrop-blur bg-white/70 border-b">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-semibold">EK</div>
          <div><div className="text-sm text-slate-500">EK Ordre</div><h1 className="text-lg font-semibold">Førespørsel / Bestilling</h1></div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={()=>setActiveTab('app')} className={`px-3 py-1.5 rounded-lg text-sm ${activeTab==='app'?'bg-slate-900 text-white':'border'}`}>App</button>
          <button onClick={()=>setActiveTab('admin')} className={`px-3 py-1.5 rounded-lg text-sm ${activeTab==='admin'?'bg-slate-900 text-white':'border'}`}>Admin</button>
          <button onClick={()=>setActiveTab('inbox')} className={`px-3 py-1.5 rounded-lg text-sm ${activeTab==='inbox'?'bg-slate-900 text-white':'border'}`}>Innboks</button>
        </div>
      </div>
    </header>
    <main className="max-w-6xl mx-auto p-4">
      {activeTab==='admin' ? <AdminPanel companies={companies} setCompanies={setCompanies} users={users} setUsers={setUsers} links={links} setLinks={setLinks} /> :
       activeTab==='inbox' ? <Inbox orders={orders} sendSvar={sendSvar}/> :
       (!JSON.parse(localStorage.getItem('logged_in')||'false') ? <LoginCard users={users} setUsers={setUsers} onLogin={({id,navn,email})=>{ setUser({id,navn,email}); localStorage.setItem('logged_in','true'); setLoggedIn(true);} }/> :
        <div className="grid md:grid-cols-3 gap-4">
          <section className="md:col-span-2 space-y-4">
            <div className="flex items-center gap-2">
              <div className="card p-1 inline-flex">
                <button className={`px-4 py-2 rounded-xl text-sm ${modus==='foresporsel'?'bg-slate-900 text-white':''}`} onClick={()=>setModus('foresporsel')} type="button">Førespørsel</button>
                <button className={`px-4 py-2 rounded-xl text-sm ${modus==='bestilling'?'bg-slate-900 text-white':''}`} onClick={()=>setModus('bestilling')} type="button">Bestilling</button>
              </div>
              <div className="ml-auto text-sm"><span className="text-slate-500">Innlogget: </span><span className="font-medium">{user.navn}</span> (<span className="text-slate-600">{user.email||'uten e-post'}</span>)</div>
            </div>
            <Card title="Aktiv Kunde">
              {myCompanies.length===0?(<p className="text-sm text-slate-600">Du har ingen tildelte kunder ennå. Gå til <strong>Admin</strong> og tildel brukeren en kunde.</p>):(
                <div className="grid md:grid-cols-3 gap-3 items-end">
                  <div><label className="label">Velg aktiv kunde</label>
                    <select className="input" value={activeCompanyId} onChange={e=>setActiveCompanyId(e.target.value)}>
                      {myCompanies.map(({company})=> (<option key={company.id} value={company.id}>{company.name}</option>))}
                    </select>
                  </div>
                  <div className="text-sm text-slate-600">Org.nr: <span className="font-medium">{activeCompany?.org||'—'}</span></div>
                  <div className="text-sm text-slate-600">CC: {(activeCompany?.cc||[]).length>0 ? activeCompany.cc.join(', ') : 'Ingen'}</div>
                </div>
              )}
            </Card>
            <form onSubmit={handleSubmit} className="space-y-6">
              <Card title="Linjer">
                <div className="space-y-4">{linjer.map(l=>(
                  <div key={l.id} className="grid md:grid-cols-12 gap-3 items-start">
                    <div className="md:col-span-2"><label className="label">Leverandør</label>
                      <select className="input" value={l.leverandor} onChange={e=>setLinjer(prev=>prev.map(x=>x.id===l.id?{...x,leverandor:e.target.value}:x))}>
                        {SUPPLIERS.map(v=><option key={v}>{v}</option>)}
                      </select>
                    </div>
                    <div className="md:col-span-3"><label className="label">Varenr</label><input className="input" value={l.varenr} onChange={e=>setLinjer(prev=>prev.map(x=>x.id===l.id?{...x,varenr:e.target.value}:x))} placeholder="F.eks. 123-ABC" /></div>
                    <div className="md:col-span-3"><label className="label">Navn/beskrivelse</label><input className="input" value={l.navn} onChange={e=>setLinjer(prev=>prev.map(x=>x.id===l.id?{...x,navn:e.target.value}:x))} placeholder="F.eks. Sensor M18" /></div>
                    <div className="md:col-span-2"><label className="label">Antall</label><input type="number" min={1} className="input" value={l.antall} onChange={e=>setLinjer(prev=>prev.map(x=>x.id===l.id?{...x,antall:Number(e.target.value)}:x))} /></div>
                    <div className="md:col-span-2 flex md:justify-end"><button type="button" onClick={()=>setLinjer(prev=>prev.filter(x=>x.id!==l.id))} className="mt-6 px-3 py-2 text-sm rounded-xl border bg-white hover:bg-slate-50">Fjern</button></div>
                    <div className="md:col-span-12 -mt-2"><label className="label">Merknad (valgfritt)</label><input className="input" value={l.merknad} onChange={e=>setLinjer(prev=>prev.map(x=>x.id===l.id?{...x,merknad:e.target.value}:x))} placeholder="Tilleggsinfo per linje" /></div>
                  </div>
                ))}
                <button type="button" onClick={()=>setLinjer(prev=>[...prev, emptyLine()])} className="px-4 py-2 rounded-xl bg-slate-900 text-white hover:opacity-90">+ Legg til linje</button></div>
              </Card>
              <Card title="Bilder (valgfritt)">
                <div className="space-y-3">
                  <input type="file" accept="image/*" multiple onChange={handleFiles} />
                  {bilder.length>0 && (<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {bilder.map(b=>(<div key={b.id} className="relative group">
                      <img src={b.url} alt={b.file.name} className="w-full h-28 object-cover rounded-xl border" />
                      <button type="button" onClick={()=>removeImage(b.id)} className="absolute top-1 right-1 text-xs px-2 py-1 rounded-lg bg-white/90 border opacity-0 group-hover:opacity-100">Fjern</button>
                      <div className="text-[11px] mt-1 truncate text-slate-600" title={b.file.name}>{b.file.name}</div>
                    </div>))}
                  </div>)}
                </div>
              </Card>
              <Card title="Detaljer">
                <div className="grid md:grid-cols-2 gap-4">
                  <div><label className="label">Ordrereferanse (valgfritt)</label><input className="input" value={ordreref} onChange={e=>setOrdreref(e.target.value)} placeholder="Din interne referanse" /></div>
                  <div><label className="label">Referansenavn</label><input className="input" value={refNavn} onChange={e=>setRefNavn(e.target.value)} placeholder="Hvem kan vi kontakte?" /></div>
                </div>
              </Card>
              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-500">Kunde: <span className="font-medium">{activeCompany?.name || '—'}</span></div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={()=>{localStorage.setItem('logged_in','false');}} className="px-3 py-2 text-sm rounded-xl border bg-white hover:bg-slate-50">Logg ut</button>
                  <button className="px-5 py-2.5 rounded-xl bg-slate-900 text-white hover:opacity-90">{(modus==='bestilling')?'Send bestilling':'Send førespørsel'}</button>
                </div>
              </div>
            </form>
            {kvittering && (<Card title="Kvittering"><pre className="bg-slate-900 text-white text-xs p-3 rounded-xl overflow-auto">{JSON.stringify(kvittering, null, 2)}</pre></Card>)}
          </section>
          <aside className="space-y-4">
            <Card title="Leverandører"><ul className="text-sm text-slate-700 grid grid-cols-2 gap-2">{SUPPLIERS.map(l=><li key={l} className="px-3 py-2 rounded-xl border bg-white">{l}</li>)}</ul></Card>
            <EmailLog/>
          </aside>
        </div>
       )}
    </main>
    <style>{`.card{background:#fff;border:1px solid #e2e8f0;border-radius:1rem;box-shadow:0 1px 2px rgba(0,0,0,.04)}.label{display:block;font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;color:#64748b;margin-bottom:.25rem}.input{width:100%;border:1px solid #cbd5e1;border-radius:.75rem;background:#fff;padding:.5rem .75rem;font-size:.875rem;outline:none}`}</style>
  </div>);
}
