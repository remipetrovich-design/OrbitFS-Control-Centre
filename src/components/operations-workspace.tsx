import {useCallback,useEffect,useMemo,useState} from "react";
import {Activity,AlertTriangle,CheckCircle2,ChevronDown,ChevronRight,ExternalLink,FileCode2,Github,Loader2,Play,RefreshCw,Server,ShieldCheck,Terminal,XCircle,Zap} from "lucide-react";
import {getDatabasePackageSyncState,getOperationsState,getOperationsScan,getRepositorySyncState,runDatabasePackageSync,runOperation,runRepositorySync} from "@/lib/panel.server";

const SYSTEMS=[
 {key:"licenseManager",label:"Custom License Manager"},
 {key:"billingStore",label:"V2 Billing Store"},
] as const;

function time(v?:string|null){return v?new Date(v).toLocaleString():"—"}
function duration(start?:string|null,end?:string|null){if(!start)return "—";const finish=end?new Date(end).getTime():Date.now();const seconds=Math.max(0,Math.floor((finish-new Date(start).getTime())/1000));return seconds<60?`${seconds}s`:`${Math.floor(seconds/60)}m ${seconds%60}s`}
function runStatus(run:any){if(!run)return "NO RUN";if(run.status!=="completed")return "LIVE";return run.conclusion==="success"?"PASSED":run.conclusion==="cancelled"?"CANCELLED":String(run.conclusion||"FAILED").toUpperCase()}
function tone(value:any){const s=String(value||"").toLowerCase();if(["fail","error"].some(x=>s.includes(x)))return "danger";if(["live","running","queued","in_progress","pending"].some(x=>s.includes(x)))return "warning";if(["pass","success","ready"].some(x=>s.includes(x)))return "success";return "neutral"}
function Pill({text}:{text:string}){return <span className={`orbit-status-pill orbit-status-tone-${tone(text)}`}>{text}</span>}

export function OperationsWorkspace({session}:{session:any}){
 const [data,setData]=useState<any>({systems:{}});
 const [scans,setScans]=useState<Record<string,any>>({});
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState("");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [collapsed,setCollapsed]=useState<Record<string,boolean>>({});
 const [consoleOpen,setConsoleOpen]=useState<Record<string,boolean>>({licenseManager:true,billingStore:true});
 const [scanOpen,setScanOpen]=useState<Record<string,boolean>>({});
 const [syncState,setSyncState]=useState<any>(null);
 const [databaseSync,setDatabaseSync]=useState<any>(null);

 const load=useCallback(async(silent=false)=>{
  if(!silent)setLoading(true);
  try{const r=await getOperationsState({data:{token:session.token}});setData(r);setError("")}
  catch(x:any){setError(x.message||"Unable to load Operations state.")}
  finally{if(!silent)setLoading(false)}
 },[session.token]);

 const loadSync=useCallback(async()=>{
  try{const r=await getRepositorySyncState({data:{token:session.token}});setSyncState(r)}
  catch(x:any){setError(x.message||"Unable to load repository sync state.")}
 },[session.token]);

 const loadDatabaseSync=useCallback(async()=>{
  try{const r=await getDatabasePackageSyncState({data:{token:session.token}});setDatabaseSync(r)}
  catch(x:any){setError(x.message||"Unable to load database package state.")}
 },[session.token]);

 const refreshAll=async()=>{
  setLoading(true);setError("");void loadSync();void loadDatabaseSync();
  try{
   const [state,...scanResults]=await Promise.all([
    getOperationsState({data:{token:session.token}}),
    ...SYSTEMS.map(system=>getOperationsScan({data:{token:session.token,system:system.key as any}}))
   ]);
   setData(state);
   setScans(Object.fromEntries(SYSTEMS.map((system,index)=>[system.key,scanResults[index]])));
  }catch(x:any){setError(x.message||"Unable to refresh Operations state and repository changes.")}
  finally{setLoading(false)}
 };

 useEffect(()=>{void load()},[load]);
 useEffect(()=>{void loadSync()},[loadSync]);
 useEffect(()=>{void loadDatabaseSync()},[loadDatabaseSync]);
 const syncLive=Boolean(syncState?.activeRun&&syncState.activeRun.status!=="completed");
 useEffect(()=>{if(!syncLive)return;const t=setInterval(()=>void loadSync(),15000);return()=>clearInterval(t)},[syncLive,loadSync]);
 const databaseSyncLive=Boolean(databaseSync?.activeRun&&databaseSync.activeRun.status!=="completed");
 useEffect(()=>{if(!databaseSyncLive)return;const t=setInterval(()=>void loadDatabaseSync(),15000);return()=>clearInterval(t)},[databaseSyncLive,loadDatabaseSync]);
 const live=useMemo(()=>SYSTEMS.some(s=>{const r=data.systems?.[s.key]?.run;return r?.status&&r.status!=="completed"}),[data]);
 useEffect(()=>{const t=setInterval(()=>void load(true),live?15000:60000);return()=>clearInterval(t)},[live,load]);

 const action=async(system:string,actionType:"ci"|"deploy"|"override-deploy")=>{
  const systemLabel=SYSTEMS.find(x=>x.key===system)?.label||system;
  if(actionType==="deploy"&&!window.confirm(`Deploy ${systemLabel}? This reuses the successful Full Scan for the exact current main commit and does not scan again.`))return;
  if(actionType==="override-deploy"&&!window.confirm(`Quick Deploy ${systemLabel}? This intentionally bypasses the Full Scan gate and deploys the current main commit directly.`))return;
  setBusy(system+actionType);setError("");setNotice("");
  try{
   const r=await runOperation({data:{token:session.token,system:system as any,action:actionType}});
   setNotice(r.message||"Workflow queued.");
   setConsoleOpen(v=>({...v,[system]:true}));
   await load(true);
  }catch(x:any){setError(x.message||"Unable to start workflow.")}
  finally{setBusy("")}
 };

 const syncRepositories=async()=>{
  if(!syncState)return;
  const direction=syncState.sourceOwner+" → "+syncState.targetOwner;
  if(!window.confirm("Sync all five main repositories "+direction+"? Target main branches will be made identical to the source, including file deletions."))return;
  setBusy("repository-sync");setError("");setNotice("");
  try{
   const r=await runRepositorySync({data:{token:session.token}});
   setNotice(r.message||"Repository sync queued.");
   await loadSync();
  }catch(x:any){setError(x.message||"Unable to start repository sync.")}
  finally{setBusy("")}
 };

 const syncDatabasePackages=async(scope:"all"|"base"|"engine"="all")=>{
  const label=scope==="all"?"Base + Engine/MCP/APEX/Studio":scope==="base"?"Base":"Shared Engine + MCP/APEX/Studio";
  if(!window.confirm("Rebuild and publish the current customer database packages for "+label+"? Existing customer databases are not reset; this updates the package authority used by fresh deploys and the inner deployer."))return;
  setBusy("database-sync-"+scope);setError("");setNotice("");
  try{
   const r=await runDatabasePackageSync({data:{token:session.token,scope}});
   setNotice(r.message||"Database package synchronization queued.");
   await loadDatabaseSync();
  }catch(x:any){setError(x.message||"Unable to synchronize database packages.")}
  finally{setBusy("")}
 };

 const loadScan=async(system:string)=>{
  setBusy(system+"scan");setError("");
  try{const r=await getOperationsScan({data:{token:session.token,system:system as any}});setScans(v=>({...v,[system]:r}));setScanOpen(v=>({...v,[system]:true}))}
  catch(x:any){setError(x.message||"Unable to inspect repository changes.")}
  finally{setBusy("")}
 };

 return <section className="space-y-4">
  <div className="orbit-page-hero">
   <div>
    <p className="orbit-eyebrow">ORBITFS / PRODUCTION OPERATIONS</p>
    <h1>Operations</h1>
    <p>Manual production deployment, live GitHub Actions output and failure diagnostics for License Manager and Billing Store.</p>
   </div>
   <div className="flex flex-wrap items-center gap-2">
    <span className="orbit-status-chip"><span className={`orbit-dot ${live?"orbit-dot-good":""}`}/>{live?"LIVE MONITORING":"STATUS MONITOR"}</span>
    <button className="button-secondary" onClick={()=>void refreshAll()} disabled={loading||!!busy}><RefreshCw size={14} className={loading?"animate-spin":""}/>Refresh</button>
   </div>
  </div>

  {error&&<div className="rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-2.5 text-xs text-red-100">{error}</div>}
  {notice&&<div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2.5 text-xs text-emerald-100">{notice}</div>}

  <section className="release-surface overflow-hidden">
   <div className="orbit-section-bar">
    <div className="orbit-section-head"><span className="orbit-section-icon"><ShieldCheck size={15}/></span><div><h2>Manual deployment control</h2><p>Run Full Scan once, then Deploy the exact scanned commit without scanning again. Quick Deploy remains the intentional override path.</p></div></div>
    <span className="text-[10px] text-muted-foreground">Manual workflow dispatch only</span>
   </div>
  </section>

  <section className="release-surface overflow-hidden">
   <div className="orbit-section-bar">
    <div className="orbit-section-head"><span className="orbit-section-icon"><Github size={15}/></span><div><h2>Repository mirror sync</h2><p>Manual one-way sync of all five OrbitFS main repositories. Target-specific GitHub workflows are preserved while application files are mirrored.</p></div></div>
    <Pill text={syncLive?"LIVE":syncState?.latestRun?.conclusion==="success"?"PASSED":syncState?.latestRun?.conclusion?String(syncState.latestRun.conclusion).toUpperCase():"IDLE"}/>
   </div>
   <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
    <div className="min-w-0">
     <p className="text-xs font-semibold">{syncState?syncState.sourceOwner+" → "+syncState.targetOwner:"Loading sync direction…"}</p>
     <p className="mt-1 text-[10px] leading-5 text-muted-foreground">Syncs Base, Engine, License Manager, Billing Store and this control panel on <code>main</code>. Target workflow configuration is preserved and no extra branches are created.</p>
     {syncState?.latestRun&&<p className="mt-1 text-[9px] text-muted-foreground">Last run #{syncState.latestRun.run_number} · {syncState.latestRun.status}{syncState.latestRun.conclusion?" · "+syncState.latestRun.conclusion:""}</p>}
    </div>
    <div className="flex flex-wrap items-center gap-2">
     {syncState?.latestRun?.html_url&&<a className="button-secondary" href={syncState.latestRun.html_url} target="_blank" rel="noreferrer"><ExternalLink size={13}/>Last sync</a>}
     <button className="button-primary" onClick={()=>void syncRepositories()} disabled={!syncState||!!busy||syncLive}>{busy==="repository-sync"?<Loader2 size={13} className="animate-spin"/>:<RefreshCw size={13}/>} {syncState?.buttonLabel||"Sync repositories"}</button>
    </div>
   </div>
  </section>

  <section className="release-surface overflow-hidden">
   <div className="orbit-section-bar">
    <div className="orbit-section-head"><span className="orbit-section-icon"><Server size={15}/></span><div><h2>Central database package authority</h2><p>One verified source feeds Base, Shared Engine, MCP, APEX and Studio packages. Fresh customer deploys and the inner deployer consume published snapshots; they do not require the central source database to be online at deployment time.</p></div></div>
    <Pill text={databaseSyncLive?"SYNCING":databaseSync?.registryOnline===false?"OFFLINE":databaseSync?.allCurrent?"SYNCED":"ACTION NEEDED"}/>
   </div>
   <div className="p-4">
    <div className="mx-auto max-w-3xl rounded-xl border bg-background/50 p-4 text-center">
     <p className="text-[10px] font-bold tracking-[.14em] text-muted-foreground">CENTRAL DATABASE / PACKAGE SOURCE</p>
     <p className="mt-2 text-sm font-semibold">{databaseSync?.registryOnline===false?"Registry unavailable — published release packages remain usable":"Authoritative package registry + source repositories"}</p>
     <p className="mt-1 text-[10px] leading-5 text-muted-foreground">{databaseSync?.registryError||"Rebuilds are generated from the current Base and Engine source commits, then published as immutable customer-facing database packages."}</p>
    </div>
    <div className="py-2 text-center text-lg text-muted-foreground">↓</div>
    <div className="grid gap-2 md:grid-cols-5">
     {(databaseSync?.packages||[
      {component:"base",status:"loading"},{component:"engine-shared",status:"loading"},{component:"mcp",status:"loading"},{component:"apex",status:"loading"},{component:"studio",status:"loading"}
     ]).map((row:any)=><div key={row.component} className="rounded-xl border bg-background/40 p-3">
      <div className="flex items-center justify-between gap-2"><p className="text-[10px] font-bold tracking-[.12em]">{String(row.component).replace("engine-shared","SHARED ENGINE").toUpperCase()}</p><Pill text={row.ok?"CURRENT":String(row.status||"MISSING").toUpperCase()}/></div>
      <p className="mt-2 truncate font-mono text-[9px] text-muted-foreground">{row.sourceCommit?String(row.sourceCommit).slice(0,12):"no current package"}</p>
      <p className="mt-1 text-[9px] text-muted-foreground">Schema {row.databaseSchemaVersion??"—"}{row.publishedAt?" · "+time(row.publishedAt):""}</p>
     </div>)}
    </div>
    <div className="py-2 text-center text-lg text-muted-foreground">↓</div>
    <div className="rounded-xl border bg-background/40 p-3">
     <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div><p className="text-xs font-semibold">Customer deployers / inner deployer</p><p className="mt-1 text-[10px] leading-5 text-muted-foreground">Fresh Base deployments use the Base release snapshot. Shared Engine and add-ons use their packaged migration contracts. The central authority is needed to regenerate/publish packages, not to execute an already-published deployment.</p></div>
      <div className="flex flex-wrap gap-2">
       <button className="button-secondary" onClick={()=>void loadDatabaseSync()} disabled={!!busy}><RefreshCw size={13}/>Verify</button>
       <button className="button-secondary" onClick={()=>void syncDatabasePackages("base")} disabled={!!busy||databaseSyncLive}>{busy==="database-sync-base"?<Loader2 size={13} className="animate-spin"/>:<RefreshCw size={13}/>}Rebuild Base</button>
       <button className="button-secondary" onClick={()=>void syncDatabasePackages("engine")} disabled={!!busy||databaseSyncLive}>{busy==="database-sync-engine"?<Loader2 size={13} className="animate-spin"/>:<RefreshCw size={13}/>}Rebuild Engine/add-ons</button>
       <button className="button-primary" onClick={()=>void syncDatabasePackages("all")} disabled={!!busy||databaseSyncLive}>{busy==="database-sync-all"?<Loader2 size={13} className="animate-spin"/>:<Zap size={13}/>}Force sync all</button>
      </div>
     </div>
     {databaseSync?.latestRun&&<p className="mt-3 text-[9px] text-muted-foreground">Last database sync run #{databaseSync.latestRun.run_number} · {databaseSync.latestRun.status}{databaseSync.latestRun.conclusion?" · "+databaseSync.latestRun.conclusion:""}{databaseSync.latestRun.html_url?" · workflow available":""}</p>}
    </div>
   </div>
  </section>

  <div className="space-y-3">
   {SYSTEMS.map(system=>{
    const s=data.systems?.[system.key]||{};
    const run=s.run;
    const fullRun=s.ciRun;
    const deployRun=s.deployRun;
    const quickRun=s.quickDeployRun;
    const fullCurrent=fullRun?.status==="completed"&&fullRun?.conclusion==="success"&&fullRun?.head_sha===s.currentSha;
    const quickCurrent=quickRun?.status==="completed"&&quickRun?.conclusion==="success"&&quickRun?.head_sha===s.currentSha;
    const productionCurrent=!!s.productionCurrent;
    const isCollapsed=!!collapsed[system.key];
    const isConsoleOpen=consoleOpen[system.key]!==false;
    const scan=scans[system.key];
    return <article key={system.key} className="release-surface overflow-hidden">
     <button className="flex w-full items-center justify-between gap-4 border-b px-4 py-3 text-left hover:bg-muted/20" onClick={()=>setCollapsed(v=>({...v,[system.key]:!isCollapsed}))}>
      <div className="flex min-w-0 items-center gap-3">
       <span className="orbit-section-icon"><Server size={15}/></span>
       <div className="min-w-0"><p className="text-sm font-semibold">{system.label}</p><code className="block truncate text-[10px] text-muted-foreground">{s.repo||"—"}</code></div>
      </div>
      <div className="flex items-center gap-2"><Pill text={runStatus(run)}/>{isCollapsed?<ChevronRight size={15}/>:<ChevronDown size={15}/>}</div>
     </button>
     {!isCollapsed&&<div>
      <div className="grid gap-px border-b bg-border md:grid-cols-4">
       <div className="orbit-tech-stat"><span>Main commit</span><strong className="font-mono">{s.currentSha?.slice(0,12)||"—"}</strong></div>
       <div className="orbit-tech-stat"><span>Full scan</span><strong>{fullRun?fullCurrent?"Passed · #"+fullRun.run_number:"#"+fullRun.run_number:"No run"}</strong></div>
       <div className="orbit-tech-stat"><span>Quick deploy</span><strong>{quickRun?quickCurrent?"Current · #"+quickRun.run_number:"#"+quickRun.run_number:"No run"}</strong></div>
       <div className="orbit-tech-stat"><span>Production state</span><strong>{productionCurrent?"Current":s.latestDeployment?"Update pending":"Not deployed"}</strong></div>
      </div>

      <div className="grid gap-0 lg:grid-cols-2">
       <div className="border-b p-4 lg:border-b-0 lg:border-r">
        <div className="flex items-start justify-between gap-3">
         <div><p className="text-xs font-semibold">Full Scan</p><p className="mt-1 text-[10px] leading-5 text-muted-foreground">Runs the complete code/security review and production validation for the exact current main commit.</p></div>
         <div className="flex flex-wrap justify-end gap-2">
          {fullRun?.html_url&&<a className="button-secondary" href={fullRun.html_url} target="_blank" rel="noreferrer"><ExternalLink size={13}/>Last full scan</a>}
          <button className="button-primary" onClick={()=>action(system.key,"ci")} disabled={!!busy}>{busy===system.key+"ci"?<Loader2 size={13} className="animate-spin"/>:<Play size={13}/>}Full Scan</button>
         </div>
        </div>
       </div>
       <div className="p-4">
        <div className="flex items-start justify-between gap-3">
         <div><p className="text-xs font-semibold">Deploy</p><p className="mt-1 text-[10px] leading-5 text-muted-foreground">{productionCurrent?"Current main is already deployed.":fullCurrent?"Ready — exact current main passed Full Scan. Deploy will not scan again.":"Blocked until the exact current main commit passes Full Scan."}</p></div>
         <div className="flex flex-wrap justify-end gap-2">
          {deployRun?.html_url&&<a className="button-secondary" href={deployRun.html_url} target="_blank" rel="noreferrer"><ExternalLink size={13}/>Last deploy</a>}
          <button className="button-primary" onClick={()=>action(system.key,"deploy")} disabled={!!busy||!fullCurrent||productionCurrent}>{busy===system.key+"deploy"?<Loader2 size={13} className="animate-spin"/>:<Zap size={13}/>}Deploy</button>
          <button className="button-secondary border-red-400/30 text-red-200" onClick={()=>action(system.key,"override-deploy")} disabled={!!busy}>{busy===system.key+"override-deploy"?<Loader2 size={13} className="animate-spin"/>:<AlertTriangle size={13}/>}Quick Deploy</button>
         </div>
        </div>
       </div>
      </div>
      {productionCurrent&&<div className="border-t border-emerald-400/20 bg-emerald-400/5 px-4 py-3 text-[10px] text-emerald-100"><b>Production is current.</b> The latest main commit <code>{s.currentSha?.slice(0,12)}</code> matches the last successful normal or Quick deployment.</div>}
      {!productionCurrent&&s.latestDeployment&&<div className="border-t border-amber-400/20 bg-amber-400/5 px-4 py-3 text-[10px] text-amber-100"><b>Update pending.</b> Production is on <code>{s.deployedSha?.slice(0,12)||"an older commit"}</code>; main is <code>{s.currentSha?.slice(0,12)||"unknown"}</code>.</div>}

      <div className="border-t">
       <button className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/20" onClick={()=>setConsoleOpen(v=>({...v,[system.key]:!isConsoleOpen}))}>
        <div className="flex items-center gap-2"><Terminal size={14} className="text-primary"/><div><p className="text-[10px] font-bold tracking-[.12em]">LIVE CONSOLE</p><p className="mt-1 text-[9px] text-muted-foreground">{run?.status==="completed"?"Final output":`Workflow status refreshes every ${live?"15":"60"} seconds`}</p></div></div>
        <div className="flex items-center gap-2"><Pill text={run?.status==="completed"?"CLOSED":run?"LIVE":"IDLE"}/>{isConsoleOpen?<ChevronDown size={14}/>:<ChevronRight size={14}/>}</div>
       </button>
       {isConsoleOpen&&<div className="border-t bg-black/20 p-3">
        {!run?<div className="p-6 text-center text-xs text-muted-foreground">No workflow run is available yet.</div>:<>
         <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {[["Workflow",s.monitoring||run.name],["Run","#"+run.run_number],["Commit",run.head_sha],["Updated",time(run.updated_at)],["State",runStatus(run)]].map(([k,v])=><div key={k} className="rounded-lg border bg-background/40 p-2"><span className="block text-[9px] uppercase tracking-wider text-muted-foreground">{k}</span><code className="mt-1 block truncate text-[10px]">{v}</code></div>)}
         </div>
         <div className="mt-3 space-y-2">{(s.jobs||[]).map((job:any)=><article key={job.id} className="rounded-lg border bg-background/30">
          <div className="flex items-center justify-between gap-3 border-b px-3 py-2"><div><p className="text-xs font-semibold">{job.name}</p><p className="mt-1 text-[9px] text-muted-foreground">{job.status} · {job.conclusion||"in progress"} · {duration(job.started_at,job.completed_at)}</p></div><Pill text={job.conclusion==="success"?"PASSED":job.conclusion==="failure"?"FAILED":String(job.status||"").toUpperCase()}/></div>
          <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-3">{(job.steps||[]).map((step:any)=><div key={step.name} className="flex items-start gap-2 bg-card px-3 py-2">{step.conclusion==="success"?<CheckCircle2 size={13} className="mt-0.5 text-emerald-400"/>:step.conclusion==="failure"?<XCircle size={13} className="mt-0.5 text-red-400"/>:<Activity size={13} className="mt-0.5 text-primary"/>}<div className="min-w-0"><p className="truncate text-[10px] font-medium">{step.name}</p><p className="text-[9px] text-muted-foreground">{step.status}{step.conclusion?" · "+step.conclusion:""}</p></div></div>)}</div>
          <details open={job.conclusion==="failure"}><summary className="cursor-pointer border-t px-3 py-2 text-[10px] font-medium text-muted-foreground">{job.conclusion==="failure"?"Failed output":"Console output"} · {job.status==="completed"?"final":"live"}</summary><pre className="max-h-72 overflow-auto whitespace-pre-wrap border-t bg-black/35 p-3 text-[10px] leading-5 text-slate-300">{job.logTail||job.logError||"Waiting for GitHub to expose console output…"}</pre></details>
         </article>)}</div>
         {s.failure&&<div className="mt-3 rounded-lg border border-red-400/30 bg-red-400/5">
          <div className="flex items-center gap-2 border-b border-red-400/20 px-3 py-2 text-red-200"><AlertTriangle size={14}/><p className="text-xs font-semibold">Failure report</p></div>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap p-3 text-[10px] leading-5 text-red-100/90">{(s.failure.lines||[]).join("\n")}</pre>
          {s.chatPrompt&&<div className="border-t border-red-400/20 p-3"><div className="mb-2 flex items-center justify-between gap-2"><p className="text-[10px] font-semibold">ChatGPT / Codex repair prompt</p><button className="button-secondary" onClick={()=>navigator.clipboard.writeText(s.chatPrompt)}>Copy prompt</button></div><pre className="max-h-64 overflow-auto whitespace-pre-wrap text-[10px] leading-5 text-muted-foreground">{s.chatPrompt}</pre></div>}
         </div>}
        </>}
       </div>}
      </div>

      <div className="border-t">
       <button className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/20" onClick={()=>scan?setScanOpen(v=>({...v,[system.key]:!v[system.key]})):loadScan(system.key)} disabled={busy===system.key+"scan"}>
        <div className="flex items-center gap-2"><FileCode2 size={14} className="text-primary"/><div><p className="text-[10px] font-bold tracking-[.12em]">REPOSITORY CHANGE SCAN</p><p className="mt-1 text-[9px] text-muted-foreground">Compare current main against the last successful production deployment.</p></div></div>
        <div className="flex items-center gap-2">{busy===system.key+"scan"?<Loader2 size={14} className="animate-spin"/>:scan&&<Pill text={scan.updateAvailable?`${scan.changedFileCount} FILES`:"CURRENT"}/>} {scanOpen[system.key]?<ChevronDown size={14}/>:<ChevronRight size={14}/>}</div>
       </button>
       {scan&&scanOpen[system.key]&&<div className="border-t p-3">
        <div className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4"><div className="orbit-tech-stat"><span>Current</span><strong className="font-mono">{scan.currentSha?.slice(0,12)||"—"}</strong></div><div className="orbit-tech-stat"><span>Production baseline</span><strong className="font-mono">{scan.baselineSha?.slice(0,12)||"—"}</strong></div><div className="orbit-tech-stat"><span>Commits</span><strong>{scan.commitCount}</strong></div><div className="orbit-tech-stat"><span>Changed files</span><strong>{scan.changedFileCount}</strong></div></div>
        {(scan.commits||[]).length>0&&<div className="mt-3 overflow-hidden rounded-lg border"><div className="orbit-subhead">COMMITS <span>{scan.commits.length}</span></div>{scan.commits.slice(0,30).map((c:any)=><div className="orbit-change-row" key={c.sha}><code>{c.sha.slice(0,7)}</code><span>{c.message}</span></div>)}</div>}
        {(scan.changedFiles||[]).length>0&&<div className="mt-3 max-h-80 overflow-auto rounded-lg border"><div className="orbit-subhead sticky top-0">CHANGED FILES <span>{scan.changedFiles.length}</span></div>{scan.changedFiles.map((f:any)=><div className="orbit-file-row" key={f.path}><span>{f.status}</span><code>{f.path}</code><span>{f.size??"—"}</span></div>)}</div>}
       </div>}
      </div>
     </div>}
    </article>
   })}
  </div>
 </section>;
}
