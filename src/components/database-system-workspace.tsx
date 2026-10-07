import {useEffect,useMemo,useState} from "react";
import {Activity,AlertTriangle,CheckCircle2,Database,ExternalLink,PackageCheck,Play,RefreshCw,Server,ShieldCheck,Wrench} from "lucide-react";
import {getDatabaseSystemState,runDatabaseSystemBuild,runMainServiceDatabaseAction} from "@/lib/panel.server";

const PRODUCT_TARGETS=[
 ["all","All product databases"],
 ["base","Base"],
 ["engine-shared","Shared Engine"],
 ["mcp","MCP"],
 ["apex","APEX"],
 ["studio","Studio"],
] as const;

const COMPONENT_LABELS:any={
 base:"Base",
 "engine-shared":"Shared Engine",
 mcp:"MCP",
 apex:"APEX",
 studio:"Studio"
};

function statusClass(value:any){
 const text=String(value||"").toLowerCase();
 if(["success","completed","current","ready","ok","passed"].includes(text))return "text-emerald-500";
 if(["failure","cancelled","failed","error"].includes(text))return "text-red-500";
 if(["queued","in_progress","waiting","pending","candidate","running"].includes(text))return "text-amber-500";
 return "text-muted-foreground";
}
function shortSha(value:any){const text=String(value||"");return text?text.slice(0,8):"—"}
function Flow({items}:{items:string[]}){
 return <div className="flex flex-wrap items-center gap-2 text-xs">{items.map((item,index)=><div key={item} className="flex items-center gap-2"><span className="rounded-md border bg-background/45 px-2.5 py-1.5 font-medium">{item}</span>{index<items.length-1&&<span className="text-muted-foreground">→</span>}</div>)}</div>
}

export function DatabaseSystemWorkspace({session}:{session:any}){
 const [state,setState]=useState<any>(null);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState("");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [target,setTarget]=useState("all");

 const load=async()=>{
  setLoading(true);setError("");
  try{setState(await getDatabaseSystemState({data:{token:session.token}}))}
  catch(e:any){setError(e?.message||"Unable to load database operations state.")}
  finally{setLoading(false)}
 };
 useEffect(()=>{void load()},[session?.token]);

 const recentRuns=useMemo(()=>[...(state?.workflows?.build||[]),...(state?.workflows?.control||[]),...(state?.workflows?.freshInstall||[]),...(state?.workflows?.migrations||[])]
  .sort((a:any,b:any)=>new Date(b.createdAt||0).getTime()-new Date(a.createdAt||0).getTime()),[state]);

 const verifyAll=async()=>{
  setBusy("verify");setError("");setNotice("");
  try{
   const result=await runDatabaseSystemBuild({data:{token:session.token,component:"all",registerCandidate:true,reason:"Dev Panel manual verify and sync"}});
   setNotice(result?.run?.id?`Verification workflow #${result.run.id} queued.`:"Product database verification queued.");
   await load();
  }catch(e:any){setError(e?.message||"Unable to verify product databases.")}
  finally{setBusy("")}
 };
 const rebuild=async()=>{
  setBusy("rebuild");setError("");setNotice("");
  try{
   const result=await runDatabaseSystemBuild({data:{token:session.token,component:target,registerCandidate:false,reason:"Dev Panel manual package rebuild"}});
   setNotice(result?.run?.id?`Database workflow #${result.run.id} queued.`:"Database package build queued.");
   await load();
  }catch(e:any){setError(e?.message||"Unable to queue database package build.")}
  finally{setBusy("")}
 };
 const mainService=async(service:string,action:"fresh-install"|"migrate")=>{
  const label=service==="billing-storefront"?"Billing Storefront":"License Manager + Dev Panel";
  const verb=action==="fresh-install"?"INSTALL A FRESH DATABASE INTO THE CONFIGURED SUPABASE PROJECT":"APPLY PENDING CENTRAL MIGRATIONS TO THE CONFIGURED LIVE SUPABASE PROJECT";
  if(!window.confirm(`${verb}\n\nTarget: ${label}\n\nThis is an explicit live database mutation. Continue?`))return;
  setBusy(service+action);setError("");setNotice("");
  try{
   const result=await runMainServiceDatabaseAction({data:{token:session.token,service,action,confirmed:true}});
   setNotice(result?.run?.id?`Database workflow #${result.run.id} queued for ${label}.`:result.message||"Database workflow queued.");
   await load();
  }catch(e:any){setError(e?.message||"Unable to queue database action.")}
  finally{setBusy("")}
 };

 const components=["base","engine-shared","mcp","apex","studio"];
 const validation=state?.automation?.latestValidation;
 const automaticReady=state?.automation?.centralReady===true;

 return <section className="orbit-screen space-y-4">
  <div className="orbit-reference-head">
   <div>
    <p className="orbit-reference-kicker">DATABASE OPERATIONS</p>
    <h1>OrbitFS databases</h1>
    <span>Centralized database source, automatic release attachment, and recovery controls. Normal releases do not require a separate database step.</span>
   </div>
   <div className="orbit-reference-actions">
    {state?.repoUrl&&<a className="button-secondary" href={state.repoUrl} target="_blank" rel="noreferrer"><ExternalLink size={14}/> Database source</a>}
    <button className="button-secondary" onClick={()=>void load()} disabled={loading}><RefreshCw size={14} className={loading?"animate-spin":""}/> Refresh</button>
   </div>
  </div>

  {error&&<div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-500">{error}</div>}
  {notice&&<div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-500">{notice}</div>}

  <div className="grid gap-4 xl:grid-cols-3">
   <section className="orbit-panel p-4">
    <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 font-semibold"><Database size={16}/> Central source</div><CheckCircle2 size={16} className={automaticReady?"text-emerald-500":"text-amber-500"}/></div>
    <div className="mt-4 space-y-2 text-sm">
     <div className="flex justify-between gap-3"><span className="text-muted-foreground">Repository</span><b>Master Database System</b></div>
     <div className="flex justify-between gap-3"><span className="text-muted-foreground">Source</span><b className="font-mono">{shortSha(state?.headSha)}</b></div>
     <div className="flex justify-between gap-3"><span className="text-muted-foreground">Real DB validation</span><b className={statusClass(validation?.conclusion||validation?.status)}>{validation?.conclusion||validation?.status||"unknown"}</b></div>
    </div>
   </section>

   <section className="orbit-panel p-4">
    <div className="flex items-center gap-2 font-semibold"><ShieldCheck size={16}/> Automatic release integration</div>
    <p className="mt-2 text-xs leading-5 text-muted-foreground">Starting a normal Base or Update release automatically ensures the matching central database packages are validated and available, then License Manager attaches the exact immutable package set.</p>
    <div className="mt-3 rounded-lg border bg-background/40 p-3 text-xs"><b>No separate database action required.</b></div>
   </section>

   <section className="orbit-panel p-4">
    <div className="flex items-center gap-2 font-semibold"><Server size={16}/> Customer execution</div>
    <p className="mt-2 text-xs leading-5 text-muted-foreground">License Manager authorizes the package set. The customer deployer executes it. Dev Panel only monitors and provides recovery controls.</p>
    <div className="mt-3 text-xs text-muted-foreground">Authority: <b className="text-foreground">{state?.authority||"License Manager"}</b></div>
   </section>
  </div>

  <section className="orbit-panel p-4">
   <div className="flex items-center gap-2 font-semibold"><Activity size={16}/> Automatic flow</div>
   <div className="mt-4 space-y-4">
    <div><div className="mb-2 text-[11px] font-semibold uppercase tracking-[.12em] text-muted-foreground">Base release</div><Flow items={state?.automation?.baseFlow||["Base release","Central DB validation","License Manager package attach","Inner Deployer / customer database"]}/></div>
    <div><div className="mb-2 text-[11px] font-semibold uppercase tracking-[.12em] text-muted-foreground">Update / addons</div><Flow items={state?.automation?.updateFlow||["Update release","License Manager package attach","Inner Deployer verification","Shared Engine Host","Selected addon database additions"]}/></div>
    <div className="rounded-lg border bg-background/35 p-3 text-xs leading-5 text-muted-foreground"><b className="text-foreground">Inner Deployer → Shared Engine Host</b> must be verified before Shared/MCP/APEX/STUDIO database migrations are allowed to run.</div>
   </div>
  </section>

  <section className="orbit-panel p-4">
   <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 font-semibold"><PackageCheck size={16}/> Release database packages</div><span className={automaticReady?"text-xs text-emerald-500":"text-xs text-amber-500"}>{automaticReady?"Ready for releases":"Needs verification"}</span></div>
   <div className="mt-4 overflow-x-auto">
    <table className="w-full min-w-[700px] text-left text-sm">
     <thead className="text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="pb-2">Component</th><th className="pb-2">Release state</th><th className="pb-2">Schema</th><th className="pb-2">Central source</th><th className="pb-2">Package</th></tr></thead>
     <tbody>{components.map(component=>{
      const ready=state?.ready?.[component]||null;
      const current=state?.current?.[component]||null;
      const candidate=(state?.candidates||[]).find((x:any)=>x.component===component);
      const row=ready||candidate||current;
      return <tr key={component} className="border-t">
       <td className="py-3 font-semibold">{COMPONENT_LABELS[component]||component}</td>
       <td className={`py-3 ${ready?"text-emerald-500":statusClass(row?.status)}`}>{ready?"ready":row?.status||"missing"}</td>
       <td className="py-3">{row?.schemaVersion||"—"}</td>
       <td className="py-3 font-mono text-xs">{shortSha(row?.sourceCommit)}</td>
       <td className="py-3 font-mono text-xs">{row?.id?String(row.id).slice(0,8):"—"}</td>
      </tr>
     })}</tbody>
    </table>
   </div>
  </section>

  <section className="orbit-panel p-4">
   <div className="flex items-center gap-2 font-semibold"><Activity size={16}/> Inner Deployer / database activity</div>
   <p className="mt-1 text-xs text-muted-foreground">Recent Shared Engine verification, customer migration and deployment events.</p>
   <div className="mt-4 space-y-2">
    {(state?.activity||[]).slice(0,12).map((event:any)=><div key={event.id||`${event.event_type}-${event.created_at}`} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border px-3 py-2">
     <div className="min-w-0"><div className="text-xs font-semibold">{event.message||event.event_type}</div><div className="mt-1 font-mono text-[10px] text-muted-foreground">{event.event_type} · {event.installation_id||"installation"}</div></div>
     <div className="text-right text-[10px]"><div className={statusClass(event.status)}>{event.status||"info"}</div><div className="mt-1 text-muted-foreground">{event.created_at?new Date(event.created_at).toLocaleString():""}</div></div>
    </div>)}
    {!state?.activity?.length&&<div className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">No recent Inner Deployer or database execution events.</div>}
   </div>
  </section>

  <details className="orbit-panel p-4">
   <summary className="cursor-pointer list-none"><div className="flex items-center justify-between gap-3"><div><div className="flex items-center gap-2 font-semibold"><Wrench size={16}/> Manual recovery tools</div><p className="mt-1 text-xs text-muted-foreground">Normally unnecessary. Use these to re-verify or rebuild centralized product packages.</p></div><span className="text-xs text-muted-foreground">Advanced</span></div></summary>
   <div className="mt-4 grid gap-4 lg:grid-cols-2">
    <div className="rounded-lg border p-4">
     <div className="font-semibold">Verify & sync product databases</div>
     <p className="mt-1 text-xs leading-5 text-muted-foreground">Runs the same real Base + Shared Engine + addon validation used by automatic release preparation and refreshes License Manager candidates.</p>
     <button className="button-primary mt-4" disabled={Boolean(busy)} onClick={()=>void verifyAll()}><RefreshCw size={14} className={busy==="verify"?"animate-spin":""}/>{busy==="verify"?"Verifying…":"Verify & sync product databases"}</button>
    </div>
    <div className="rounded-lg border p-4">
     <div className="font-semibold">Rebuild package only</div>
     <p className="mt-1 text-xs leading-5 text-muted-foreground">Build an artifact for inspection without changing License Manager package state.</p>
     <div className="mt-3 flex gap-2"><select className="control min-w-0 flex-1" value={target} onChange={e=>setTarget(e.target.value)}>{PRODUCT_TARGETS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><button className="button-secondary" disabled={Boolean(busy)} onClick={()=>void rebuild()}><Play size={14}/>{busy==="rebuild"?"Queuing…":"Build"}</button></div>
    </div>
   </div>
  </details>

  <details className="orbit-panel p-4">
   <summary className="cursor-pointer list-none"><div className="flex items-center justify-between gap-3"><div><div className="flex items-center gap-2 font-semibold"><AlertTriangle size={16} className="text-amber-500"/> Main-service database recovery</div><p className="mt-1 text-xs text-muted-foreground">Direct License Manager/Dev Panel and Billing Storefront database mutations. Not part of Base/Update customer releases.</p></div><span className="text-xs text-amber-500">Live database controls</span></div></summary>
   <div className="mt-4 grid gap-4 xl:grid-cols-2">
    {[["license-manager-dev-panel","License Manager + Dev Panel"],["billing-storefront","Billing Storefront"]].map(([service,label])=><div key={service} className="rounded-lg border p-4">
     <div className="flex items-center gap-2 font-semibold"><Server size={15}/>{label}</div>
     <div className="mt-3 flex flex-wrap gap-2"><button className="button-secondary" disabled={Boolean(busy)} onClick={()=>void mainService(service,"migrate")}>Apply pending migrations</button><button className="button-secondary" disabled={Boolean(busy)} onClick={()=>void mainService(service,"fresh-install")}>Fresh install</button></div>
    </div>)}
   </div>
  </details>

  <details className="orbit-panel p-4">
   <summary className="cursor-pointer list-none"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 font-semibold"><RefreshCw size={16}/> Recent database workflows</div><span className="text-xs text-muted-foreground">{recentRuns.length} shown</span></div></summary>
   <div className="mt-4 space-y-2">{recentRuns.slice(0,12).map((run:any)=><div key={`${run.id}-${run.name}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"><div><b>{run.name}</b><div className="font-mono text-[11px] text-muted-foreground">{shortSha(run.headSha)} · #{run.runNumber||run.id}</div></div><div className="flex items-center gap-3"><span className={statusClass(run.conclusion||run.status)}>{run.conclusion||run.status}</span>{run.url&&<a href={run.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground"><ExternalLink size={14}/></a>}</div></div>)}</div>
  </details>
 </section>;
}
