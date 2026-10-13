import {useCallback,useEffect,useState} from "react";
import {ArrowLeft,ArrowRight,CheckCircle2,ExternalLink,GitBranch,RefreshCw,ShieldAlert,ShieldCheck,Loader2,AlertTriangle} from "lucide-react";
import {getRepositorySyncState,runRepositorySync} from "@/lib/panel.server";

const PAIRS=[
 ["Base","V1-vercel-base","OrbitFS-Base-System"],
 ["Engine","V1-vercel-engine","OrbitFS_Engine"],
 ["License Manager","Custom-licence-manager","OrbitFS-License-Administration"],
 ["Billing Store","V2_Billing_Store","OrbitFS-Billing-Shopfront"],
 ["Dev Panel","Dev-panel","OrbitFS-Control-Centre"],
] as const;
const activeStatuses=new Set(["queued","in_progress","waiting","requested","pending"]);
function displayDate(value?:string){return value?new Date(value).toLocaleString():"—"}
export function RepositorySyncWorkspace({session}: {session:{token:string}}){
 const [state,setState]=useState<any>(null),[busy,setBusy]=useState(""),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const load=useCallback(async()=>{
  try{const result=await getRepositorySyncState({data:{token:session.token}});setState(result);setError("");}
  catch(e:any){setError(e?.message||"Unable to retrieve the live GitHub sync state.");}
 },[session.token]);
 // Sync status is requested only via Refresh or after the user starts a sync.
 const direction=state?.side==="fallback"?"fallback-to-main":"main-to-fallback";
 const running=Boolean(state?.active)||activeStatuses.has(String(state?.activeRun?.status||""));
 const latest=state?.activeRun||state?.latestRun;
 const conclusion=String(latest?.conclusion||"");
 const status=running?"Sync in progress":conclusion==="success"?"Last run successful":conclusion==="failure"?"Last run failed":latest?"Last run: "+(conclusion||latest.status||"unknown"):"No sync run reported";
 const start=async()=>{
  if(!state||running)return;
  const directionLabel=state.sourceOwner+" → "+state.targetOwner;
  if(!window.confirm("SYNC ALL FIVE REPOSITORIES: "+directionLabel+"? The current GitHub workflow replaces destination files (including deletions) and does not fully protect mode-specific source configuration. Review both sides before continuing."))return;
  setBusy("start");setNotice("");setError("");
  try{const result=await runRepositorySync({data:{token:session.token}});setNotice(result.message||"Sync requested.");await load();}
  catch(e:any){setError(e.message||"Sync dispatch failed.")}
  finally{setBusy("")}
 };
 return <section className="space-y-5">
  <div className="orbit-page-hero">
   <div><p className="orbit-eyebrow">ORBITFS / GITHUB CONTROL</p><h1>Repository Sync</h1><p>Five connected repository pairs. Source and destination stay visible throughout each transfer.</p></div>
   <div className="flex flex-wrap gap-2"><button type="button" className="button-secondary" disabled={busy!==""} onClick={()=>void load()}><RefreshCw size={15}/>Refresh status</button>{latest?.html_url&&<a className="button-secondary" href={latest.html_url} target="_blank" rel="noreferrer"><ExternalLink size={14}/>GitHub run</a>}</div>
  </div>
  {error&&<div role="alert" className="rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}
  {notice&&<div role="status" className="rounded-xl border border-blue-400/40 bg-blue-500/10 px-4 py-3 text-sm text-blue-100">{notice}</div>}
  <div className="grid gap-3 md:grid-cols-3">
   <div className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Direction</p><div className="mt-2 flex items-center gap-2 font-semibold text-foreground"><GitBranch size={16}/>{state?state.sourceOwner+" → "+state.targetOwner:"Loading…"}</div><p className="mt-2 text-xs text-muted-foreground">Determined by the active source mode.</p></div>
   <div className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">GitHub Actions</p><p className="mt-2 font-semibold">{running?<Loader2 className="mr-2 inline animate-spin" size={16}/>:conclusion==="success"?<CheckCircle2 className="mr-2 inline" size={16}/>:<GitBranch className="mr-2 inline" size={16}/>} {status}</p><p className="mt-2 text-xs text-muted-foreground">Updated every 8 seconds · {displayDate(latest?.updated_at)}</p></div>
   <div className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Target protection</p><p className="mt-2 flex items-center gap-2 font-semibold"><ShieldAlert size={16}/> Review required</p><p className="mt-2 text-xs text-muted-foreground">Existing sync can overwrite destination files. Mode credentials are not transferred.</p></div>
  </div>
  <div className="overflow-hidden rounded-2xl border border-border bg-card">
   <div className="border-b border-border px-4 py-4 sm:px-6"><h2 className="font-semibold text-lg">Five-repository connection map</h2><p className="mt-1 text-xs text-muted-foreground">Live workflow status is reported above. Individual repository verification is not available from the current backend; no row is represented as verified.</p></div>
   <div className="grid grid-cols-[minmax(0,1fr)_64px_minmax(0,1fr)] items-center gap-2 border-b border-border bg-background/30 px-3 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:grid-cols-[minmax(0,1fr)_140px_minmax(0,1fr)] sm:px-6"><span>Main · lucaskerim123</span><span className="text-center">Transfer</span><span className="text-right">Fallback · remipetrovich-design</span></div>
   <div className="divide-y divide-border">
    {PAIRS.map(([label,main,fallback])=><div key={label} className="grid grid-cols-[minmax(0,1fr)_64px_minmax(0,1fr)] items-center gap-2 px-3 py-4 sm:grid-cols-[minmax(0,1fr)_140px_minmax(0,1fr)] sm:px-6">
     <a className="min-w-0 rounded-xl border border-border bg-background/60 p-3 transition-colors hover:border-blue-400/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400" href={"https://github.com/lucaskerim123/"+main} target="_blank" rel="noreferrer"><span className="block text-xs font-semibold">{label}</span><span className="mt-1 block break-all text-[11px] text-muted-foreground">{main}</span></a>
     <div className="flex flex-col items-center gap-1 text-center"><span className="text-[10px] text-muted-foreground">{running?"Running":"Unverified"}</span><div className={"flex w-full items-center justify-center rounded-full border border-border bg-background/60 py-2 "+(running?"animate-pulse":"")}>{direction==="main-to-fallback"?<ArrowRight size={20} className="text-blue-400"/>:<ArrowLeft size={20} className="text-blue-400"/>}</div></div>
     <a className="min-w-0 rounded-xl border border-border bg-background/60 p-3 text-right transition-colors hover:border-blue-400/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400" href={"https://github.com/remipetrovich-design/"+fallback} target="_blank" rel="noreferrer"><span className="block text-xs font-semibold">{label}</span><span className="mt-1 block break-all text-[11px] text-muted-foreground">{fallback}</span></a>
    </div>)}
   </div>
  </div>
  <div className="rounded-xl border border-amber-400/30 bg-amber-500/5 p-4">
   <div className="flex gap-3"><AlertTriangle className="mt-0.5 shrink-0 text-amber-300" size={18}/><div><p className="text-sm font-semibold">Current workflow is not a safe merge</p><p className="mt-1 text-xs leading-5 text-muted-foreground">It copies files in the selected direction, can delete target files, and excludes GitHub workflow files. This screen does not claim that application features or mode-specific settings match. Review changes before dispatching.</p></div></div>
   <div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" className="button-primary" disabled={!state||running||busy!==""} onClick={()=>void start()}>{running?<Loader2 className="animate-spin" size={15}/>:<ShieldCheck size={15}/>} {running?"Sync running":busy==="start"?"Starting…":state?.buttonLabel||"Sync repositories"}</button><span className="text-xs text-muted-foreground">Runs existing GitHub workflow · no deployment requested by this page</span></div>
  </div>
 </section>;
}
