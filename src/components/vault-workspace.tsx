import { useEffect, useMemo, useState } from "react";
import { KeyRound, Lock, Plus, Search, ShieldCheck, Trash2, Copy, Pencil, X } from "lucide-react";
import { getVaultEnvelope, saveVaultEnvelope } from "@/lib/vault.server";
import { createEnvelope, decryptEnvelope, type VaultEnvelope, type VaultRecord } from "@/lib/vault-crypto";

const SYSTEMS=["Vercel","GitHub","Supabase","License Manager","Billing Store","Other"];
const SERVICES=["Environment","API","Billing","Licence","Database","Deployment","Dev","Custom"];

export function VaultWorkspace({session}:{session:any}){
  const [phase,setPhase]=useState<"loading"|"setup"|"locked"|"open">("loading");
  const [envelope,setEnvelope]=useState<VaultEnvelope|null>(null);
  const [password,setPassword]=useState("");
  const [confirm,setConfirm]=useState("");
  const [activePassword,setActivePassword]=useState("");
  const [records,setRecords]=useState<VaultRecord[]>([]);
  const [query,setQuery]=useState("");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const [editing,setEditing]=useState<VaultRecord|null>(null);
  const [draft,setDraft]=useState({system:"GitHub",otherSystem:"",service:"Environment",customService:"",keyName:"",secret:""});

  useEffect(()=>{void loadEnvelope()},[session?.token]);

  async function loadEnvelope(){
    setPhase("loading");setError("");
    try{
      const result=await getVaultEnvelope({data:{token:session.token}});
      if(result.exists&&result.envelope){setEnvelope(result.envelope as VaultEnvelope);setPhase("locked")}
      else {setEnvelope(null);setPhase("setup")}
    }catch(x:any){setError(x.message||"Unable to load Vault.");setPhase("locked")}
  }

  async function persist(next:VaultRecord[],passwordOverride=activePassword){
    const nextEnvelope=await createEnvelope(passwordOverride,next);
    const saved=await saveVaultEnvelope({data:{token:session.token,envelope:nextEnvelope}});
    setEnvelope({...nextEnvelope,updatedAt:saved.updatedAt});
    setRecords(next);
  }

  async function unlock(event:React.FormEvent){
    event.preventDefault();setError("");setBusy(true);
    try{
      if(phase==="setup"){
        if(password.length<10)throw new Error("Use a Vault password of at least 10 characters.");
        if(password!==confirm)throw new Error("Vault passwords do not match.");
        await persist([],password);setActivePassword(password);setRecords([]);setPhase("open");
      }else{
        if(!envelope)throw new Error("Encrypted Vault is unavailable.");
        const next=await decryptEnvelope(password,envelope);setRecords(next);setActivePassword(password);setPhase("open");
      }
      setPassword("");setConfirm("");
    }catch(x:any){setError(phase==="setup"?(x.message||"Unable to create Vault."):"Wrong Vault password or unreadable Vault.")}
    finally{setBusy(false)}
  }

  function lock(){setRecords([]);setActivePassword("");setPassword("");setConfirm("");setEditing(null);setPhase("locked");setNotice("")}

  async function save(event:React.FormEvent){
    event.preventDefault();setError("");setBusy(true);
    try{
      const system=draft.system.trim(),service=draft.service.trim(),keyName=draft.keyName.trim();
      if(!system||!service||!keyName||!draft.secret)throw new Error("System, service, key name and secret are required.");
      const record:VaultRecord={id:editing?.id||crypto.randomUUID(),systems:[system==="Other"?(draft.otherSystem.trim()||"Other"):system],otherSystem:system==="Other"?draft.otherSystem.trim():"",service:service==="Custom"?(draft.customService.trim()||"Custom"):service,customService:service==="Custom"?draft.customService.trim():"",keyName,secret:draft.secret};
      const next=editing?records.map(row=>row.id===editing.id?record:row):[record,...records];
      await persist(next);setEditing(null);setDraft({system:"GitHub",otherSystem:"",service:"Environment",customService:"",keyName:"",secret:""});setNotice(editing?"Vault entry updated.":"Vault entry saved.");
    }catch(x:any){setError(x.message||"Unable to save Vault entry.")}
    finally{setBusy(false)}
  }

  async function remove(id:string){
    if(!window.confirm("Remove this Vault entry?"))return;
    setBusy(true);setError("");
    try{await persist(records.filter(row=>row.id!==id));setNotice("Vault entry removed.")}
    catch(x:any){setError(x.message||"Unable to remove Vault entry.")}
    finally{setBusy(false)}
  }

  function edit(row:VaultRecord){
    const knownSystem=SYSTEMS.includes(row.systems[0]);
    const knownService=SERVICES.includes(row.service);
    setEditing(row);setDraft({system:knownSystem?row.systems[0]:"Other",otherSystem:knownSystem?"":row.systems[0],service:knownService?row.service:"Custom",customService:knownService?"":row.service,keyName:row.keyName,secret:row.secret});
    window.scrollTo({top:0,behavior:"smooth"});
  }

  const filtered=useMemo(()=>{const q=query.trim().toLowerCase();return q?records.filter(row=>[...row.systems,row.service,row.keyName].some(v=>String(v).toLowerCase().includes(q))):records},[records,query]);

  if(phase!=="open")return <section className="space-y-4">
    <div className="orbit-reference-page-head"><p>SECURE OPERATIONS</p><h1>Vault</h1><span>Persistent encrypted credentials with a separate Vault unlock.</span></div>
    <div className="mx-auto max-w-lg orbit-panel p-5">
      <div className="orbit-section-head"><span className="orbit-section-icon"><Lock size={15}/></span><div><h2>{phase==="setup"?"Create Vault":"Unlock Vault"}</h2><p>{phase==="setup"?"Create the independent password used to encrypt this Vault.":"Your Dev Panel session is active. Unlock the encrypted Vault separately."}</p></div></div>
      {error&&<div className="mt-4 rounded-lg border border-red-400/40 bg-red-400/10 p-3 text-xs text-red-100">{error}</div>}
      {phase==="loading"?<p className="mt-5 text-xs text-muted-foreground">Loading encrypted Vault…</p>:<form className="mt-5 space-y-4" onSubmit={unlock}>
        <label className="block text-xs font-medium">Vault password<input className="control mt-1" type="password" autoComplete="off" value={password} onChange={e=>setPassword(e.target.value)} required/></label>
        {phase==="setup"&&<label className="block text-xs font-medium">Confirm Vault password<input className="control mt-1" type="password" autoComplete="off" value={confirm} onChange={e=>setConfirm(e.target.value)} required/></label>}
        <button className="button-primary w-full" disabled={busy}>{busy?"Working…":phase==="setup"?"Create encrypted Vault":"Unlock Vault"}</button>
      </form>}
      <div className="mt-4 flex items-start gap-2 text-[10px] leading-5 text-muted-foreground"><ShieldCheck size={14} className="mt-0.5 shrink-0"/><span>The server stores encrypted ciphertext only. The Vault password is not saved and cannot be recovered.</span></div>
    </div>
  </section>;

  return <section className="space-y-4">
    <div className="orbit-reference-head"><div><p className="orbit-reference-kicker">SECURE OPERATIONS</p><h1>Vault</h1><span>Central encrypted credentials · {records.length} {records.length===1?"entry":"entries"}</span></div><div className="orbit-reference-actions"><button className="button-secondary" onClick={lock}><Lock size={14}/> Lock Vault</button></div></div>
    {error&&<div className="rounded-lg border border-red-400/40 bg-red-400/10 p-3 text-xs text-red-100">{error}</div>}
    {notice&&<div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-3 text-xs text-emerald-100">{notice}</div>}
    <form onSubmit={save} className="orbit-panel p-4">
      <div className="orbit-section-head"><span className="orbit-section-icon"><Plus size={15}/></span><div><h2>{editing?"Edit Vault entry":"New Vault entry"}</h2><p>Changes are encrypted in your browser before persistence.</p></div></div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="block text-xs font-medium">System<select className="control mt-1" value={draft.system} onChange={e=>setDraft({...draft,system:e.target.value})}>{SYSTEMS.map(x=><option key={x}>{x}</option>)}</select></label>
        <label className="block text-xs font-medium">Service<select className="control mt-1" value={draft.service} onChange={e=>setDraft({...draft,service:e.target.value})}>{SERVICES.map(x=><option key={x}>{x}</option>)}</select></label>
        {draft.system==="Other"&&<label className="block text-xs font-medium">Other system<input className="control mt-1" value={draft.otherSystem} onChange={e=>setDraft({...draft,otherSystem:e.target.value})}/></label>}
        {draft.service==="Custom"&&<label className="block text-xs font-medium">Custom service<input className="control mt-1" value={draft.customService} onChange={e=>setDraft({...draft,customService:e.target.value})}/></label>}
        <label className="block text-xs font-medium">Key name<input className="control mt-1" autoComplete="off" value={draft.keyName} onChange={e=>setDraft({...draft,keyName:e.target.value})}/></label>
        <label className="block text-xs font-medium">Secret<input className="control mt-1 font-mono" type="password" autoComplete="off" value={draft.secret} onChange={e=>setDraft({...draft,secret:e.target.value})}/></label>
      </div>
      <div className="mt-4 flex gap-2"><button className="button-primary" disabled={busy}>{busy?"Saving…":editing?"Save changes":"Add to Vault"}</button>{editing&&<button type="button" className="button-secondary" onClick={()=>{setEditing(null);setDraft({system:"GitHub",otherSystem:"",service:"Environment",customService:"",keyName:"",secret:""})}}><X size={14}/> Cancel</button>}</div>
    </form>
    <section className="orbit-panel overflow-hidden">
      <div className="border-b p-4"><div className="relative"><Search size={14} className="absolute left-3 top-3 text-muted-foreground"/><input className="control pl-9" placeholder="Search system, service or key name…" value={query} onChange={e=>setQuery(e.target.value)}/></div></div>
      <div>{filtered.map(row=><div key={row.id} className="border-b p-4 last:border-b-0"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="font-mono text-xs font-semibold break-all">{row.keyName}</p><p className="mt-1 text-[10px] text-muted-foreground">{row.systems.join(" · ")} · {row.service}</p><p className="mt-2 font-mono text-xs tracking-widest text-muted-foreground">••••••••••••</p></div><div className="flex gap-1"><button className="icon-button" title="Copy secret" onClick={()=>void navigator.clipboard.writeText(row.secret)}><Copy size={14}/></button><button className="icon-button" title="Edit" onClick={()=>edit(row)}><Pencil size={14}/></button><button className="icon-button" title="Remove" onClick={()=>void remove(row.id)}><Trash2 size={14}/></button></div></div></div>)}{!filtered.length&&<div className="p-8 text-center text-xs text-muted-foreground">{records.length?"No Vault entries match your search.":"No Vault entries yet."}</div>}</div>
    </section>
  </section>;
}
