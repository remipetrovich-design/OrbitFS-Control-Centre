import {useCallback,useEffect,useMemo,useState} from "react";
import {Activity,CloudCog,Database,RefreshCw,Server,ShieldAlert,ShieldCheck,Terminal,Zap} from "lucide-react";

type SystemState={key:string;label:string;repo:string;branch:string;ok:boolean;error?:string;currentSha?:string;productionSha?:string;productionCurrent?:boolean;latestScan?:any;latestDeploy?:any;latestQuickDeploy?:any;activeRun?:any};
type Job={id:string;action:string;target:string;status:string;source_sha?:string;workflow?:string;external_run_url?:string;created_at:string;error?:string;run?:any;console?:any[]};

const DEV_SWITCHES=[
 ["enabled","Dev Control API","Master switch for Dev Control mutations and control-plane access."],
 ["read_only_mode","Read-only mode","Keep status and diagnostics available while blocking mutations."],
 ["quick_deploy_enabled","Quick Deploy","Allow the explicit fast deployment workflow."],
 ["production_deploy_enabled","Production Deploy","Allow validated production deployment after exact-source Full Scan."],
 ["updater_controls_enabled","Updater controls","Expose updater, deployer and installation lifecycle control surfaces."],
 ["license_controls_enabled","Licence controls","Allow protected Licence Manager bridge operations."],
 ["billing_controls_enabled","Billing controls","Allow Billing Store operations exposed by Dev Control."],
 ["require_critical_confirmation","Critical confirmations","Require confirmation before production-changing actions."],
 ["post_deploy_health_check","Post-deploy health check","Require verification as part of deployment workflows."],
 ["auto_rollback_on_failed_verification","Automatic rollback","Reserved for supported verified rollback flows. Off by default."],
 ["secret_redaction","Secret redaction","Prevent secret values from being returned through Dev Control."],
 ["audit_logging","Audit logging","Record Dev Control settings and mutations."],
 ["emergency_kill_switch","Dev Control kill switch","Immediately blocks Dev Control mutations. This is separate from Licence Manager lockdown."],
] as const;

const AUTHORITY_SWITCHES=[
 ["system_enabled","External authority","Master License Manager authority switch."],
 ["licensing_enabled","Licence validation & issuance","Controls validation and licence issuance."],
 ["maintenance_mode","Maintenance enforcement","Makes runtime validation deliberately unavailable."],
 ["customer_self_unlock_enabled","Customer installation unlock","Allows customers to release their own active installation binding."],
 ["release_system_enabled","Release authority","Controls authoritative release APIs."],
 ["deployment_enabled","Deployment authorization","Master customer deployment authorization gate."],
 ["base_deployment_enabled","Base deployment authorization","Controls Base install/redeploy authorization."],
 ["update_deployment_enabled","Update deployment authorization","Controls manifest-driven Update authorization."],
 ["rollback_enabled","Rollback authorization","Controls supported customer rollback/checkpoint authorization."],
] as const;

const LICENSE_ACTIONS=[
 ["suspend","Suspend"],
 ["activate","Activate"],
 ["rotate","Rotate key"],
] as const;

function tone(value:string){
 const v=value.toLowerCase();
 if(["success","ready","online","active","enabled","healthy","completed"].some(x=>v.includes(x)))return "success";
 if(["failed","error","disabled","blocked","kill","suspended","revoked"].some(x=>v.includes(x)))return "danger";
 if(["queued","running","pending","waiting","progress"].some(x=>v.includes(x)))return "warning";
 return "neutral";
}
function Pill({text}:{text:string}){return <span className={`orbit-status-pill orbit-status-tone-${tone(String(text||""))}`}>{text}</span>}
function shortSha(value?:string){return value?value.slice(0,8):"—"}
function pretty(value:string){return String(value||"").replaceAll("_"," ").replace(/\b\w/g,x=>x.toUpperCase())}

export function DevControlWorkspace({session}:{session:any;onOperations?:()=>void}){
 const [tab,setTab]=useState("overview");
 const [settings,setSettings]=useState<any>(null);
 const [systems,setSystems]=useState<SystemState[]>([]);
 const [jobs,setJobs]=useState<Job[]>([]);
 const [authority,setAuthority]=useState<any>(null);
 const [lockdown,setLockdown]=useState<any>(null);
 const [licenses,setLicenses]=useState<any[]>([]);
 const [jobDetail,setJobDetail]=useState<Job|null>(null);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState("");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [bridgeError,setBridgeError]=useState("");

 const headers=useMemo(()=>({Authorization:`Bearer ${session.token}`,"Content-Type":"application/json"}),[session.token]);

 const request=useCallback(async(path:string,init:RequestInit={})=>{
  const response=await fetch("/api/dev-control/v1"+path,{...init,headers:{...headers,...(init.headers||{})},cache:"no-store"});
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(body?.error||body?.message||(`HTTP ${response.status}`));
  return body;
 },[headers]);

 const load=useCallback(async()=>{
  setLoading(true);setError("");setBridgeError("");
  try{
   const [s,sys,j]=await Promise.all([request("/settings"),request("/systems"),request("/jobs?limit=20")]);
   setSettings(s.settings||null);setSystems(sys.systems||[]);setJobs(j.jobs||[]);
  }catch(x:any){setError(x?.message||"Unable to load Dev Control core")}
  const optional=await Promise.allSettled([
   request("/authority-control"),
   request("/lockdown"),
   request("/license-manager?view=licenses"),
  ]);
  if(optional[0].status==="fulfilled")setAuthority(optional[0].value.settings||optional[0].value.data?.settings||optional[0].value);
  if(optional[1].status==="fulfilled")setLockdown(optional[1].value);
  if(optional[2].status==="fulfilled")setLicenses(optional[2].value.data?.licenses||[]);
  const failures=optional.filter(x=>x.status==="rejected") as PromiseRejectedResult[];
  if(failures.length)setBridgeError(failures.map(x=>x.reason?.message||"Authority bridge unavailable").join(" · "));
  setLoading(false);
 },[request]);

 useEffect(()=>{void load();const timer=setInterval(()=>void load(),15000);return()=>clearInterval(timer)},[load]);

 async function toggleDev(key:string,value:boolean){
  setBusy("dev:"+key);setError("");setNotice("");
  try{const r=await request("/settings",{method:"PATCH",body:JSON.stringify({[key]:value})});setSettings(r.settings);setNotice(`${pretty(key)} updated.`)}
  catch(x:any){setError(x?.message||"Unable to update Dev Control setting")}finally{setBusy("")}
 }

 async function toggleAuthority(key:string,value:boolean){
  setBusy("authority:"+key);setError("");setNotice("");
  if(!window.confirm(`Set License Manager ${pretty(key)} to ${value?"ON":"OFF"}?`)){setBusy("");return}
  try{const r=await request("/authority-control",{method:"PATCH",body:JSON.stringify({[key]:value})});setAuthority(r.settings||r.data?.settings||r);setNotice(`License Manager ${pretty(key)} updated.`)}
  catch(x:any){setError(x?.message||"Unable to update authority setting")}finally{setBusy("")}
 }

 async function runAction(target:string,action:string){
  const critical=["quick_deploy","production_deploy","redeploy"].includes(action);
  if(critical&&!window.confirm(`Confirm ${pretty(action)} for ${pretty(target)} production?`))return;
  setBusy(target+":"+action);setError("");setNotice("");
  try{const r=await request("/actions",{method:"POST",body:JSON.stringify({target,action,confirm:critical})});setNotice(r.message||"Action queued.");await load()}
  catch(x:any){setError(x?.message||"Dev Control action failed")}finally{setBusy("")}
 }

 async function controlLockdown(action:"enable"|"disable"){
  const reason=window.prompt(action==="enable"?"Reason for GLOBAL License Manager lockdown:":"Reason for removing GLOBAL lockdown:");
  if(!reason?.trim())return;
  const word=action==="enable"?"LOCKDOWN":"UNLOCK";
  const typed=window.prompt(`Type ${word} to confirm.`);
  if(typed!==word)return;
  setBusy("lockdown");setError("");setNotice("");
  try{
   const r=await request("/lockdown",{method:"POST",body:JSON.stringify({action,confirm:word,reason:reason.trim()})});
   setLockdown(r);setNotice(action==="enable"?"Global License Manager lockdown enabled.":"Global License Manager lockdown removed.");
  }catch(x:any){setError(x?.message||"Lockdown control failed")}finally{setBusy("")}
 }

 async function licenseAction(licenseId:string,action:string){
  if(!window.confirm(`Confirm ${pretty(action)} for licence ${licenseId}?`))return;
  setBusy("license:"+licenseId+":"+action);setError("");setNotice("");
  try{await request("/license-manager",{method:"POST",body:JSON.stringify({license_id:licenseId,action})});setNotice(`Licence ${pretty(action)} completed.`);await load()}
  catch(x:any){setError(x?.message||"Licence control failed")}finally{setBusy("")}
 }

 async function inspectJob(id:string){
  setBusy("job:"+id);
  try{const r=await request("/job?job_id="+encodeURIComponent(id));setJobDetail(r.job)}
  catch(x:any){setError(x?.message||"Unable to inspect job")}finally{setBusy("")}
 }

 const tabs=[["overview","Overview"],["deploy","Deploy"],["settings","Dev API Settings"],["authority","Licence Authority"],["licenses","Licences"],["jobs","Jobs / Console"]];

 return <section className="space-y-4">
  <div className="orbit-page-hero">
   <div><p className="orbit-eyebrow">ORBITFS / DEV CONTROL API</p><h1>Dev Control</h1><p>Independent Owner-only API for service deployment, updater/deployer operations, jobs and protected authority controls.</p></div>
   <div className="flex flex-wrap items-center gap-2">
    <Pill text={settings?.emergency_kill_switch?"DEV KILL SWITCH":settings?.read_only_mode?"READ ONLY":settings?.enabled===false?"API DISABLED":"API ONLINE"}/>
    <button className="button-secondary" onClick={()=>void load()} disabled={loading}><RefreshCw size={14} className={loading?"animate-spin":""}/>Refresh</button>
   </div>
  </div>

  {error&&<div className="rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-2.5 text-xs text-red-100">{error}</div>}
  {notice&&<div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2.5 text-xs text-emerald-100">{notice}</div>}
  {bridgeError&&<div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2.5 text-xs text-amber-100"><b>Licence Manager bridge:</b> {bridgeError}</div>}

  <div className="flex gap-1 overflow-x-auto rounded-xl border bg-card p-1">
   {tabs.map(([key,label])=><button key={key} onClick={()=>setTab(key)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold ${tab===key?"bg-primary text-primary-foreground":"text-muted-foreground hover:bg-muted"}`}>{label}</button>)}
  </div>

  {tab==="overview"&&<>
   <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
    <div className="release-surface p-4"><ShieldCheck size={16}/><p className="mt-3 text-[10px] uppercase tracking-[.14em] text-muted-foreground">Control plane</p><strong className="mt-1 block">Independent v1 API</strong><code className="text-[10px] text-muted-foreground">/api/dev-control/v1</code></div>
    <div className="release-surface p-4"><Database size={16}/><p className="mt-3 text-[10px] uppercase tracking-[.14em] text-muted-foreground">Persistence</p><strong className="mt-1 block">{settings?.storageReady===false?"Migration required":"Ready"}</strong><span className="text-[10px] text-muted-foreground">Settings · Jobs · Audit</span></div>
    <div className="release-surface p-4"><CloudCog size={16}/><p className="mt-3 text-[10px] uppercase tracking-[.14em] text-muted-foreground">Services</p><strong className="mt-1 block">{systems.filter(x=>x.ok).length}/{systems.length||2} reachable</strong><span className="text-[10px] text-muted-foreground">Licence Manager · Billing Store</span></div>
    <div className="release-surface p-4"><ShieldAlert size={16}/><p className="mt-3 text-[10px] uppercase tracking-[.14em] text-muted-foreground">Authority lockdown</p><strong className="mt-1 block">{lockdown?.locked?"LOCKED":"Normal"}</strong><span className="text-[10px] text-muted-foreground">{lockdown?.locked?lockdown.message||"Global access blocked":"Licence authority operating normally"}</span></div>
   </div>
   <section className="release-surface overflow-hidden">
    <div className="orbit-section-bar"><div className="orbit-section-head"><span className="orbit-section-icon"><Server size={15}/></span><div><h2>Systems</h2><p>Current source and production workflow state.</p></div></div></div>
    <div className="grid gap-px bg-border lg:grid-cols-2">{systems.map(s=><div key={s.key} className="bg-card p-4">
     <div className="flex items-start justify-between gap-3"><div><strong className="text-sm">{s.label}</strong><code className="mt-1 block text-[10px] text-muted-foreground">{s.repo}@{s.branch}</code></div><Pill text={!s.ok?"ERROR":s.productionCurrent?"CURRENT":"SOURCE AHEAD"}/></div>
     <div className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><span className="text-muted-foreground">Source</span><code className="block">{shortSha(s.currentSha)}</code></div><div><span className="text-muted-foreground">Production</span><code className="block">{shortSha(s.productionSha)}</code></div></div>
     {s.activeRun&&<div className="mt-3 rounded-lg border bg-muted/20 p-2 text-xs"><b>Active:</b> {s.activeRun.name} · {s.activeRun.status}</div>}
    </div>)}</div>
   </section>
  </>}

  {tab==="deploy"&&<section className="grid gap-4 lg:grid-cols-2">
   {systems.map(s=><article key={s.key} className="release-surface overflow-hidden">
    <div className="orbit-section-bar"><div className="orbit-section-head"><span className="orbit-section-icon"><Terminal size={15}/></span><div><h2>{s.label}</h2><p>{s.repo}</p></div></div><Pill text={s.productionCurrent?"CURRENT":"CHECK SOURCE"}/></div>
    <div className="p-4">
     <div className="grid grid-cols-2 gap-3 text-xs"><div><span className="text-muted-foreground">Latest source</span><code className="block">{shortSha(s.currentSha)}</code></div><div><span className="text-muted-foreground">Production</span><code className="block">{shortSha(s.productionSha)}</code></div></div>
     <div className="mt-4 grid gap-2 sm:grid-cols-2">
      <button className="button-secondary" disabled={!!busy} onClick={()=>void runAction(s.key,"prepare_latest_source")}><Activity size={14}/>Prepare Latest Source</button>
      <button className="button-primary" disabled={!!busy||settings?.quick_deploy_enabled===false} onClick={()=>void runAction(s.key,"quick_deploy")}><Zap size={14}/>Quick Deploy</button>
      <button className="button-secondary" disabled={!!busy||settings?.production_deploy_enabled===false} onClick={()=>void runAction(s.key,"production_deploy")}>Validated Deploy</button>
      <button className="button-secondary" disabled={!!busy||settings?.production_deploy_enabled===false} onClick={()=>void runAction(s.key,"redeploy")}>Redeploy</button>
     </div>
     <div className="mt-4 space-y-2 text-[11px] text-muted-foreground">
      <div>Full Scan: <b className="text-foreground">{s.latestScan?.conclusion||s.latestScan?.status||"—"}</b> · {shortSha(s.latestScan?.head_sha)}</div>
      <div>Deploy: <b className="text-foreground">{s.latestDeploy?.conclusion||s.latestDeploy?.status||"—"}</b></div>
      <div>Quick Deploy: <b className="text-foreground">{s.latestQuickDeploy?.conclusion||s.latestQuickDeploy?.status||"—"}</b></div>
     </div>
    </div>
   </article>)}
  </section>}

  {tab==="settings"&&<section className="release-surface overflow-hidden">
   <div className="orbit-section-bar"><div className="orbit-section-head"><span className="orbit-section-icon"><CloudCog size={15}/></span><div><h2>Dev Control API switches</h2><p>These settings belong to Dev Control only. They do not modify Licence Manager authority switches.</p></div></div></div>
   <div>{DEV_SWITCHES.map(([key,label,help])=>{const enabled=Boolean(settings?.[key]);return <div key={key} className="flex flex-col gap-3 border-b p-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
    <div className="max-w-3xl"><strong className="text-sm">{label}</strong><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{help}</p></div>
    <button disabled={busy==="dev:"+key} onClick={()=>void toggleDev(key,!enabled)} className={`min-w-[84px] rounded-full border px-3 py-1.5 text-[10px] font-bold tracking-wide ${enabled?"border-emerald-400/40 bg-emerald-400/10 text-emerald-300":"border-border bg-muted text-muted-foreground"}`}>{enabled?"ON":"OFF"}</button>
   </div>})}</div>
  </section>}

  {tab==="authority"&&<div className="space-y-4">
   <section className={`release-surface overflow-hidden ${lockdown?.locked?"border-red-500/60":""}`}>
    <div className="orbit-section-bar"><div className="orbit-section-head"><span className="orbit-section-icon"><ShieldAlert size={15}/></span><div><h2>Global emergency lockdown</h2><p>Licence Manager-owned hard lock. Customer/runtime/admin/integration access is blocked until the isolated recovery route removes it.</p></div></div><Pill text={lockdown?.locked?"LOCKED":"NORMAL"}/></div>
    <div className="p-4"><p className="text-xs text-muted-foreground">{lockdown?.locked?(lockdown.message||"Global authority access is locked."):"Lockdown is currently inactive."}</p><div className="mt-3">{lockdown?.locked?<button className="button-secondary" disabled={!!busy} onClick={()=>void controlLockdown("disable")}>Remove Lockdown</button>:<button className="button-primary" disabled={!!busy} onClick={()=>void controlLockdown("enable")}>Emergency Lock Everything</button>}</div></div>
   </section>
   <section className="release-surface overflow-hidden">
    <div className="orbit-section-bar"><div className="orbit-section-head"><span className="orbit-section-icon"><ShieldCheck size={15}/></span><div><h2>Licence Manager authority switches</h2><p>These are external authoritative settings controlled through the protected Licence Manager API.</p></div></div></div>
    {!authority?<div className="p-6 text-xs text-muted-foreground">Authority control is unavailable until the matching Licence Manager API version is deployed.</div>:<div>{AUTHORITY_SWITCHES.map(([key,label,help])=>{const enabled=Boolean(authority?.[key]);return <div key={key} className="flex flex-col gap-3 border-b p-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"><div className="max-w-3xl"><strong className="text-sm">{label}</strong><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{help}</p></div><button disabled={!!busy} onClick={()=>void toggleAuthority(key,!enabled)} className={`min-w-[84px] rounded-full border px-3 py-1.5 text-[10px] font-bold ${enabled?"border-emerald-400/40 bg-emerald-400/10 text-emerald-300":"border-border bg-muted text-muted-foreground"}`}>{enabled?"ON":"OFF"}</button></div>})}</div>}
   </section>
  </div>}

  {tab==="licenses"&&<section className="release-surface overflow-hidden">
   <div className="orbit-section-bar"><div className="orbit-section-head"><span className="orbit-section-icon"><Database size={15}/></span><div><h2>Licence control</h2><p>Authoritative licence state from License Manager. Dev Control does not create a second source of truth.</p></div></div><Pill text={String(licenses.length)+" LICENCES"}/></div>
   <div className="divide-y">{licenses.map(l=><div key={l.id} className="p-4">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
     <div><div className="flex items-center gap-2"><strong className="text-sm">{l.product||l.product_code||"Licence"}</strong><Pill text={String(l.status||"unknown").toUpperCase()}/></div><code className="mt-1 block text-[10px] text-muted-foreground">{l.id} · …{l.license_key_last4||"----"}</code><p className="mt-1 text-[11px] text-muted-foreground">Customer: {l.customer_external_id||l.external_reference||"—"} · Installations: {(l.activations||[]).length}</p></div>
     <div className="flex flex-wrap gap-2">{LICENSE_ACTIONS.map(([action,label])=><button key={action} className="button-secondary" disabled={!!busy} onClick={()=>void licenseAction(l.id,action)}>{label}</button>)}</div>
    </div>
    {(l.activations||[]).length>0&&<div className="mt-3 grid gap-2">{l.activations.map((a:any)=><div key={a.id} className="rounded-lg border bg-muted/10 p-2 text-[11px]"><b>{a.installation_id}</b> · {a.status} · {a.product_version||"version —"} {a.status==="active"&&<button className="ml-2 underline" disabled={!!busy} onClick={()=>void request("/license-manager",{method:"POST",body:JSON.stringify({license_id:l.id,action:"unlock-installation",installation_id:a.installation_id})}).then(()=>load()).catch((x:any)=>setError(x.message))}>Release binding</button>}</div>)}</div>}
   </div>)}{!licenses.length&&<div className="p-8 text-center text-xs text-muted-foreground">No licence data returned.</div>}</div>
  </section>}

  {tab==="jobs"&&<div className="grid gap-4 xl:grid-cols-[.8fr_1.2fr]">
   <section className="release-surface overflow-hidden">
    <div className="orbit-section-bar"><div className="orbit-section-head"><span className="orbit-section-icon"><Activity size={15}/></span><div><h2>Recent jobs</h2><p>Dev Control job records linked to real workflow runs.</p></div></div></div>
    <div className="divide-y">{jobs.map(j=><button key={j.id} onClick={()=>void inspectJob(j.id)} className="block w-full p-3 text-left hover:bg-muted/20"><div className="flex items-center justify-between gap-2"><strong className="text-xs">{pretty(j.action)} · {pretty(j.target)}</strong><Pill text={String(j.status||"unknown").toUpperCase()}/></div><code className="mt-1 block text-[10px] text-muted-foreground">{shortSha(j.source_sha)} · {j.workflow||"—"}</code></button>)}{!jobs.length&&<div className="p-8 text-center text-xs text-muted-foreground">No Dev Control jobs yet.</div>}</div>
   </section>
   <section className="release-surface overflow-hidden">
    <div className="orbit-section-bar"><div className="orbit-section-head"><span className="orbit-section-icon"><Terminal size={15}/></span><div><h2>Live console</h2><p>Structured GitHub job and step state.</p></div></div>{jobDetail&&<Pill text={String(jobDetail.status||"unknown").toUpperCase()}/>}</div>
    {!jobDetail?<div className="p-10 text-center text-xs text-muted-foreground">Select a job to inspect its live steps.</div>:<div className="p-4"><div className="mb-4"><strong className="text-sm">{pretty(jobDetail.action)} · {pretty(jobDetail.target)}</strong><code className="mt-1 block text-[10px] text-muted-foreground">{jobDetail.id}</code></div><div className="space-y-3">{(jobDetail.console||[]).map((job:any)=><div key={job.id} className="rounded-lg border bg-black/20 p-3"><div className="flex items-center justify-between gap-2"><b className="text-xs">{job.name}</b><Pill text={String(job.conclusion||job.status).toUpperCase()}/></div><div className="mt-2 space-y-1">{(job.steps||[]).map((step:any)=><div key={step.number} className="flex items-center justify-between gap-3 font-mono text-[10px]"><span>{String(step.number).padStart(2,"0")} {step.name}</span><span className="text-muted-foreground">{step.conclusion||step.status}</span></div>)}</div></div>)}{!(jobDetail.console||[]).length&&<div className="text-xs text-muted-foreground">Workflow steps are not available yet.</div>}</div></div>}
   </section>
  </div>}
 </section>;
}
