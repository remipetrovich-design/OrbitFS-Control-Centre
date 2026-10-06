import {useEffect,useMemo,useState} from "react";
import {AlertTriangle,Database,ExternalLink,PackageCheck,Play,RefreshCw,Server,ShieldCheck} from "lucide-react";
import {getDatabaseSystemState,runDatabaseSystemBuild,runMainServiceDatabaseAction} from "@/lib/panel.server";

const TARGETS=[
 ["all","All product databases"],
 ["base","Base"],
 ["engine-shared","Shared Engine"],
 ["mcp","MCP"],
 ["apex","APEX"],
 ["studio","Studio"],
 ["license-manager-dev-panel","License Manager + Dev Panel"],
 ["billing-storefront","Billing Storefront"],
] as const;

function statusClass(value:any){
 const text=String(value||"").toLowerCase();
 if(["success","completed","current"].includes(text))return "text-emerald-500";
 if(["failure","cancelled","failed"].includes(text))return "text-red-500";
 if(["queued","in_progress","waiting","pending","candidate"].includes(text))return "text-amber-500";
 return "text-muted-foreground";
}
function shortSha(value:any){const text=String(value||"");return text?text.slice(0,8):"—"}

export function DatabaseSystemWorkspace({session}:{session:any}){
 const [state,setState]=useState<any>(null);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState("");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [target,setTarget]=useState("all");
 const [registerCandidate,setRegisterCandidate]=useState(false);

 const load=async()=>{
  setLoading(true);setError("");
  try{setState(await getDatabaseSystemState({data:{token:session.token}}))}
  catch(e:any){setError(e?.message||"Unable to load Master Database System state.")}
  finally{setLoading(false)}
 };
 useEffect(()=>{void load()},[session?.token]);

 const latest=useMemo(()=>{
  const rows=[...(state?.workflows?.build||[]),...(state?.workflows?.control||[])];
  return rows.sort((a:any,b:any)=>new Date(b.createdAt||0).getTime()-new Date(a.createdAt||0).getTime())[0]||null;
 },[state]);

 const build=async()=>{
  setBusy("build");setError("");setNotice("");
  try{
   const result=await runDatabaseSystemBuild({data:{token:session.token,component:target,registerCandidate,reason:"Dev Panel database control"}});
   setNotice(result?.run?.id?`Database workflow #${result.run.id} queued.`:result.message||"Database build queued.");
   await load();
  }catch(e:any){setError(e?.message||"Unable to queue database build.")}
  finally{setBusy("")}
 };
 const mainService=async(service:string,action:"fresh-install"|"migrate")=>{
  const label=service==="billing-storefront"?"Billing Storefront":"License Manager + Dev Panel";
  const verb=action==="fresh-install"?"INSTALL A FRESH DATABASE INTO THE CONFIGURED SUPABASE PROJECT":"APPLY PENDING CENTRAL MIGRATIONS TO THE CONFIGURED LIVE SUPABASE PROJECT";
  if(!window.confirm(`${verb}\n\nTarget: ${label}\n\nThis is an explicit database mutation. Continue?`))return;
  setBusy(service+action);setError("");setNotice("");
  try{
   const result=await runMainServiceDatabaseAction({data:{token:session.token,service,action,confirmed:true}});
   setNotice(result?.run?.id?`Database workflow #${result.run.id} queued for ${label}.`:result.message||"Database workflow queued.");
   await load();
  }catch(e:any){setError(e?.message||"Unable to queue database action.")}
  finally{setBusy("")}
 };

 const components=["base","engine-shared","mcp","apex","studio"];
 return <section className="orbit-screen space-y-4">
  <div className="orbit-reference-head">
   <div><p className="orbit-reference-kicker">DATABASE CONTROL</p><h1>Master Database System</h1><span>Build, package, inspect and operate OrbitFS database sources. License Manager remains the technical authority.</span></div>
   <div className="orbit-reference-actions">
    {state?.repoUrl&&<a className="button-secondary" href={state.repoUrl} target="_blank" rel="noreferrer"><ExternalLink size={14}/> Repository</a>}
    <button className="button-secondary" onClick={()=>void load()} disabled={loading}><RefreshCw size={14} className={loading?"animate-spin":""}/> Refresh</button>
   </div>
  </div>

  {error&&<div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-500">{error}</div>}
  {notice&&<div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-500">{notice}</div>}

  <div className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
   <section className="orbit-panel p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
     <div><div className="flex items-center gap-2 font-semibold"><Database size={16}/> Central build</div><p className="mt-1 text-xs text-muted-foreground">Validate and build immutable database artifacts from Master-Database-System/main.</p></div>
     <div className="text-right text-xs text-muted-foreground"><div>{state?.repo||"Master-Database-System"}</div><div className="font-mono">{shortSha(state?.headSha)}</div></div>
    </div>
    <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
     <select className="control" value={target} onChange={e=>setTarget(e.target.value)}>
      {TARGETS.map(([value,label])=><option key={value} value={value}>{label}</option>)}
     </select>
     <button className="button-primary" disabled={Boolean(busy)} onClick={()=>void build()}><Play size={14}/>{busy==="build"?"Queuing…":"Build"}</button>
    </div>
    {!["license-manager-dev-panel","billing-storefront"].includes(target)&&<label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
     <input type="checkbox" checked={registerCandidate} onChange={e=>setRegisterCandidate(e.target.checked)}/>
     Register built product package(s) as License Manager candidate(s). This does not publish them.
    </label>}
   </section>

   <section className="orbit-panel p-4">
    <div className="flex items-center gap-2 font-semibold"><ShieldCheck size={16}/> Authority boundary</div>
    <div className="mt-4 space-y-2 text-sm">
     <div className="flex justify-between gap-3"><span className="text-muted-foreground">Authority</span><b>{state?.authority||"License Manager"}</b></div>
     <div className="flex justify-between gap-3"><span className="text-muted-foreground">Production DB apply</span><b>Manual only</b></div>
     <div className="flex justify-between gap-3"><span className="text-muted-foreground">Customer execution</span><b>Deployer / Updater</b></div>
     <div className="flex justify-between gap-3"><span className="text-muted-foreground">Last build</span><b className={statusClass(latest?.conclusion||latest?.status)}>{latest?.conclusion||latest?.status||"No run"}</b></div>
    </div>
   </section>
  </div>

  <section className="orbit-panel p-4">
   <div className="flex items-center gap-2 font-semibold"><PackageCheck size={16}/> Product database packages</div>
   <div className="mt-4 overflow-x-auto">
    <table className="w-full min-w-[720px] text-left text-sm">
     <thead className="text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="pb-2">Component</th><th className="pb-2">Current</th><th className="pb-2">Schema</th><th className="pb-2">Source</th><th className="pb-2">Candidate</th></tr></thead>
     <tbody>{components.map(component=>{
      const current=state?.current?.[component]||null;
      const candidate=(state?.candidates||[]).find((x:any)=>x.component===component);
      return <tr key={component} className="border-t"><td className="py-3 font-semibold">{component}</td><td className={`py-3 ${statusClass(current?.status)}`}>{current?current.status:"none"}</td><td className="py-3">{current?.schemaVersion||"—"}</td><td className="py-3 font-mono text-xs">{shortSha(current?.sourceCommit)}</td><td className={`py-3 ${statusClass(candidate?.status)}`}>{candidate?`v${candidate.schemaVersion} · ${shortSha(candidate.sourceCommit)}`:"—"}</td></tr>
     })}</tbody>
    </table>
   </div>
  </section>

  <div className="grid gap-4 xl:grid-cols-2">
   {[
    ["license-manager-dev-panel","License Manager + Dev Panel"],
    ["billing-storefront","Billing Storefront"]
   ].map(([service,label])=><section key={service} className="orbit-panel p-4">
    <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2 font-semibold"><Server size={16}/>{label}</div><p className="mt-1 text-xs text-muted-foreground">Central fresh schema + forward migrations. These controls mutate only the explicitly configured main-service Supabase project.</p></div><AlertTriangle size={17} className="text-amber-500"/></div>
    <div className="mt-4 flex flex-wrap gap-2">
     <button className="button-secondary" disabled={Boolean(busy)} onClick={()=>void mainService(service,"migrate")}>Apply pending migrations</button>
     <button className="button-secondary" disabled={Boolean(busy)} onClick={()=>void mainService(service,"fresh-install")}>Fresh install</button>
    </div>
   </section>)}
  </div>

  <section className="orbit-panel p-4">
   <div className="flex items-center gap-2 font-semibold"><RefreshCw size={16}/> Recent database workflows</div>
   <div className="mt-4 space-y-2">
    {[...(state?.workflows?.build||[]),...(state?.workflows?.control||[]),...(state?.workflows?.freshInstall||[]),...(state?.workflows?.migrations||[])]
      .sort((a:any,b:any)=>new Date(b.createdAt||0).getTime()-new Date(a.createdAt||0).getTime()).slice(0,12)
      .map((run:any)=><div key={`${run.id}-${run.name}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
       <div><b>{run.name}</b><div className="font-mono text-[11px] text-muted-foreground">{shortSha(run.headSha)} · #{run.runNumber||run.id}</div></div>
       <div className="flex items-center gap-3"><span className={statusClass(run.conclusion||run.status)}>{run.conclusion||run.status}</span>{run.url&&<a href={run.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground"><ExternalLink size={14}/></a>}</div>
      </div>)}
    {!state&&!loading&&<div className="text-sm text-muted-foreground">No database workflow state available.</div>}
   </div>
  </section>
 </section>;
}
