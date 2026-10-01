import {useCallback,useEffect,useMemo,useState} from "react";
import {RefreshCw,ShieldCheck,Server,Settings2} from "lucide-react";

const SWITCHES=[
 ["enabled","Dev Control API","Master Dev Control switch."],
 ["read_only_mode","Read-only mode","Allow status reads while blocking mutations."],
 ["require_critical_confirmation","Critical confirmations","Require confirmation for production-changing actions."],
 ["secret_redaction","Secret redaction","Never return configured secrets through Dev Control."],
 ["audit_logging","Audit logging","Record Dev Control mutations."],
 ["emergency_kill_switch","Emergency kill switch","Immediately blocks Dev Control mutations."],
] as const;

const TARGET_LABELS:any={
 base:["V1 Base","Primary · Base releases"],
 engine:["V1 Engine / Updater","Primary · Update releases"],
 license_manager:["Custom License Manager","Secondary · Authority integration"],
 billing_store:["V2 Billing Store","Secondary · Service integration"],
};

export function DevControlWorkspace({session}:{session:any;onOperations?:()=>void}){
 const [settings,setSettings]=useState<any>(null);
 const [systems,setSystems]=useState<any[]>([]);
 const [busy,setBusy]=useState("");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const headers=useMemo(()=>({Authorization:`Bearer ${session.token}`,"Content-Type":"application/json"}),[session.token]);
 const request=useCallback(async(path:string,init:RequestInit={})=>{
  const r=await fetch("/api/dev-control/v1"+path,{...init,headers:{...headers,...(init.headers||{})},cache:"no-store"});
  const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b?.error||"Dev Control request failed");return b;
 },[headers]);
 const load=useCallback(async()=>{setError("");try{const [s,sys]=await Promise.all([request("/settings"),request("/systems")]);setSettings(s.settings);setSystems(sys.systems||[])}catch(x:any){setError(x?.message||"Unable to load Dev Control")}},[request]);
 useEffect(()=>{void load()},[load]);

 async function toggle(key:string,value:boolean){
  setBusy(key);setError("");setNotice("");
  try{const r=await request("/settings",{method:"PATCH",body:JSON.stringify({[key]:value})});setSettings(r.settings);setNotice("Saved.")}catch(x:any){setError(x?.message||"Unable to save setting")}finally{setBusy("")}
 }
 async function toggleTarget(key:string){
  const current=Array.isArray(settings?.allowed_services)?settings.allowed_services:[];
  const next=current.includes(key)?current.filter((x:string)=>x!==key):[...current,key];
  setBusy("target:"+key);setError("");setNotice("");
  try{const r=await request("/settings",{method:"PATCH",body:JSON.stringify({allowed_services:next})});setSettings(r.settings);setNotice("Target access updated.")}catch(x:any){setError(x?.message||"Unable to update target access")}finally{setBusy("")}
 }

 return <section className="space-y-4">
  <div className="orbit-page-hero">
   <div><p className="orbit-eyebrow">NETWORKING / DEV CONTROL</p><h1>Dev Control</h1><p>Owner-only API settings and access boundaries. Operational buttons stay in their existing release and Operations pages.</p></div>
   <div className="flex items-center gap-2"><span className="orbit-status-chip"><span className="orbit-dot orbit-dot-good"/>API {settings?.emergency_kill_switch?"LOCKED":settings?.enabled===false?"OFF":"ONLINE"}</span><button className="button-secondary" onClick={()=>void load()}><RefreshCw size={14}/>Refresh</button></div>
  </div>
  {error&&<div className="rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-2.5 text-xs text-red-100">{error}</div>}
  {notice&&<div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2.5 text-xs text-emerald-100">{notice}</div>}

  <section className="release-surface overflow-hidden">
   <div className="orbit-section-bar"><div className="orbit-section-head"><span className="orbit-section-icon"><Settings2 size={15}/></span><div><h2>API controls</h2><p>Dev Control settings only. These do not replace Base, Engine, Operations, or Licence Manager controls.</p></div></div></div>
   <div>{SWITCHES.map(([key,label,detail])=>{const on=Boolean(settings?.[key]);return <div key={key} className="flex flex-col gap-3 border-b p-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"><div><strong className="text-sm">{label}</strong><p className="mt-1 text-[11px] text-muted-foreground">{detail}</p></div><button disabled={busy===key} onClick={()=>void toggle(key,!on)} className={`min-w-[78px] rounded-full border px-3 py-1.5 text-[10px] font-bold ${on?"border-emerald-400/40 bg-emerald-400/10 text-emerald-300":"border-border bg-muted text-muted-foreground"}`}>{on?"ON":"OFF"}</button></div>})}</div>
  </section>

  <section className="release-surface overflow-hidden">
   <div className="orbit-section-bar"><div className="orbit-section-head"><span className="orbit-section-icon"><Server size={15}/></span><div><h2>Controlled systems</h2><p>Base and Engine are primary. Licence Manager and Billing Store are secondary integrations.</p></div></div></div>
   <div className="grid gap-px bg-border md:grid-cols-2">{systems.map((system:any)=>{const allowed=(settings?.allowed_services||[]).includes(system.key);const labels=TARGET_LABELS[system.key]||[system.label,system.kind];return <div key={system.key} className="bg-card p-4">
    <div className="flex items-start justify-between gap-3"><div><strong className="text-sm">{labels[0]}</strong><p className="mt-1 text-[10px] uppercase tracking-[.12em] text-muted-foreground">{labels[1]}</p></div><button disabled={busy==="target:"+system.key} onClick={()=>void toggleTarget(system.key)} className={`rounded-full border px-3 py-1.5 text-[10px] font-bold ${allowed?"border-emerald-400/40 bg-emerald-400/10 text-emerald-300":"border-border bg-muted text-muted-foreground"}`}>{allowed?"ALLOWED":"BLOCKED"}</button></div>
    <code className="mt-3 block truncate text-[10px] text-muted-foreground">{system.repo}</code>
    <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground"><ShieldCheck size={12}/>{system.ok?"Reachable":"Status unavailable"}{system.releaseRef?" · "+system.releaseRef:""}</div>
   </div>})}</div>
  </section>
 </section>;
}
