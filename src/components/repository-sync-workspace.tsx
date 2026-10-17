import {useCallback,useState} from "react";
import {ArrowLeft,ArrowRight,CheckCircle2,ExternalLink,GitBranch,RefreshCw,ShieldAlert,ShieldCheck,Loader2,AlertTriangle} from "lucide-react";
import {getRepositorySyncState,runRepositorySync} from "@/lib/panel.server";

const PAIRS=[
 ["Base","V1-vercel-base","OrbitFS-Base-System","base"],
 ["Engine","V1-vercel-engine","OrbitFS_Engine","engine"],
 ["License Manager","Custom-licence-manager","OrbitFS-License-Administration","license"],
 ["Billing Store","V2_Billing_Store","OrbitFS-Billing-Shopfront","billing"],
 ["Dev Panel","Dev-panel","OrbitFS-Control-Centre","control"],
] as const;
type Pair=(typeof PAIRS)[number][3];
type Direction="main-to-fallback"|"fallback-to-main";
const activeStatuses=new Set(["queued","in_progress","waiting","requested","pending"]);
function displayDate(value?:string){return value?new Date(value).toLocaleString():"—"}
export function RepositorySyncWorkspace({session}: {session:{token:string}}){
 const [state,setState]=useState<any>(null),[busy,setBusy]=useState(""),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [directionChoice,setDirectionChoice]=useState<Direction|null>(null);
 const load=useCallback(async()=>{
  try{const result=await getRepositorySyncState({data:{token:session.token}});setState(result);setError("");}
  catch(e:any){setError(e?.message||"Unable to retrieve the live GitHub sync state.");}
 },[session.token]);
 // Sync status is requested only via Refresh or after the user starts a sync.
 const direction:Direction=directionChoice??(state?.side==="fallback"?"fallback-to-main":"main-to-fallback");
 const sourceOwner=direction==="main-to-fallback"?"lucaskerim123":"remipetrovich-design";
 const targetOwner=direction==="main-to-fallback"?"remipetrovich-design":"lucaskerim123";
 const enabled=state?.enabled===true;
 const running=Boolean(state?.active)||activeStatuses.has(String(state?.activeRun?.status||""));
 const latest=state?.activeRun||state?.latestRun;
 const conclusion=String(latest?.conclusion||"");
 const status=running?"Sync in progress":conclusion==="success"?"Last run successful":conclusion==="failure"?"Last run failed":latest?"Last run: "+(conclusion||latest.status||"unknown"):"No sync run reported";
 const pairRun=(pair:Pair)=>state?.pairRuns?.[direction+":"+pair];
 const canApply=(pair:Pair)=>{
  const run=pairRun(pair);
  return enabled&&!running&&busy===""&&run?.status==="completed"&&run?.conclusion==="success"&&run?.preview===true;
 };
 const start=async(pair:Pair,operation:"preview"|"apply")=>{
  if(!state||running||busy!==""||state.enabled!==true)return;
  if(operation==="apply"&&!canApply(pair)){setError("Preview this repository in the selected direction successfully before applying.");return;}
  const label=PAIRS.find(item=>item[3]===pair)?.[0]||pair;
  if(!window.confirm((operation==="preview"?"PREVIEW ONLY — NO REPOSITORY CHANGES: ":"APPLY REVIEWED CODE CHANGES: ")+label+" · "+sourceOwner+" → "+targetOwner+"? Other repository pairs will not be synced. Mode-specific configuration and credentials stay untouched. Continue?"))return;
  setBusy(pair+":"+operation);setNotice("");setError("");
  try{const result=await runRepositorySync({data:{token:session.token,operation,pair,direction}});setNotice(result.message||"Sync requested.");await load();}
  catch(e:any){setError(e?.message||"Sync dispatch failed.");}
  finally{setBusy("");}
 };
 return <section className="space-y-5">
  <div className="orbit-page-hero">
   <div><p className="orbit-eyebrow">ORBITFS / GITHUB CONTROL</p><h1>Repository Sync</h1><p>Five paired repositories · manual feature synchronization · independent Main/Fallback configurations.</p></div>
   <div className="flex flex-wrap gap-2"><button type="button" className="button-secondary" disabled={busy!==""} onClick={()=>void load()}><RefreshCw size={15}/>Refresh status</button>{latest?.html_url&&<a className="button-secondary" href={latest.html_url} target="_blank" rel="noreferrer"><ExternalLink size={14}/>GitHub run</a>}</div>
  </div>
  {error&&<div role="alert" className="rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}
  {notice&&<div role="status" className="rounded-xl border border-blue-400/40 bg-blue-500/10 px-4 py-3 text-sm text-blue-100">{notice}</div>}
  {state&&state.enabled!==true&&<div role="status" className="rounded-xl border border-border bg-card p-4 text-sm">Cross-mode repository sync is <strong>disabled</strong>. Add <code>ORBITFS_REPOSITORY_SYNC_ENABLED=true</code> to the current Dev Panel Vercel Production project AND the matching GitHub repository Actions Variables, then redeploy Dev Panel. This only unlocks the manual action; it never starts a sync automatically.</div>}
  <div className="grid gap-3 md:grid-cols-3">
   <div className="rounded-xl border border-border bg-card p-4"><label htmlFor="repository-sync-direction" className="text-xs text-muted-foreground">Direction</label><div className="mt-2 flex items-center gap-2 font-semibold text-foreground"><GitBranch size={16}/><span className="min-w-0 break-words">{sourceOwner+" → "+targetOwner}</span></div><select id="repository-sync-direction" className="control mt-3 w-full text-xs" value={direction} disabled={running||busy!==""} onChange={event=>setDirectionChoice(event.target.value as Direction)}><option value="main-to-fallback">Main → Fallback</option><option value="fallback-to-main">Fallback → Main</option></select><p className="mt-2 text-xs text-muted-foreground">Choose direction without switching the active account or changing either configuration.</p></div>
   <div className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">GitHub Actions</p><p className="mt-2 font-semibold">{running?<Loader2 className="mr-2 inline animate-spin" size={16}/>:conclusion==="success"?<CheckCircle2 className="mr-2 inline" size={16}/>:<GitBranch className="mr-2 inline" size={16}/>} {status}</p><p className="mt-2 text-xs text-muted-foreground">Last GitHub run update: {displayDate(latest?.updated_at)} · press Refresh for current status</p></div>
   <div className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Target protection</p><p className="mt-2 flex items-center gap-2 font-semibold"><ShieldAlert size={16}/> Preserve mode settings</p><p className="mt-2 text-xs text-muted-foreground">Existing destination files are retained; protected configuration and credentials are excluded. Shared files can still be updated, and conflicting work stops the sync.</p></div>
  </div>
  <div className="overflow-hidden rounded-2xl border border-border bg-card">
   <div className="border-b border-border px-4 py-4 sm:px-6"><h2 className="font-semibold text-lg">Five-repository connection map</h2><p className="mt-1 text-xs text-muted-foreground">Each repository can be previewed and synchronized on its own. Open the GitHub run summary for file-level results; conflicts or independent edits require review.</p></div>
   <div className="grid grid-cols-[minmax(0,1fr)_110px_minmax(0,1fr)] items-center gap-2 border-b border-border bg-background/30 px-3 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:grid-cols-[minmax(0,1fr)_150px_minmax(0,1fr)] sm:px-6"><span>Main · lucaskerim123</span><span className="text-center">Manual sync</span><span className="text-right">Fallback · remipetrovich-design</span></div>
   <div className="divide-y divide-border">
    {PAIRS.map(([label,main,fallback,pair])=>{
     const pairLatest=pairRun(pair);
     const pairRunning=running&&state?.activeRun?.pair===pair&&state?.activeRun?.direction===direction;
     const pairReady=canApply(pair);
     return <div key={pair} className="grid grid-cols-[minmax(0,1fr)_110px_minmax(0,1fr)] items-center gap-2 px-3 py-4 sm:grid-cols-[minmax(0,1fr)_150px_minmax(0,1fr)] sm:px-6">
      <a className="min-w-0 rounded-xl border border-border bg-background/60 p-3 transition-colors hover:border-blue-400/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400" href={"https://github.com/lucaskerim123/"+main} target="_blank" rel="noreferrer"><span className="block text-xs font-semibold">{label}</span><span className="mt-1 block break-all text-[11px] text-muted-foreground">{main}</span></a>
      <div className="flex min-w-0 flex-col items-center gap-1 text-center">
       <span className="flex items-center gap-1 text-[10px] text-muted-foreground">{direction==="main-to-fallback"?<ArrowRight size={13}/>:<ArrowLeft size={13}/>} {pairRunning?"Running":pairReady?"Preview ready":pairLatest?.conclusion==="failure"?"Last failed":pairLatest?.conclusion==="success"?"Last synced":"Not previewed"}</span>
       <button type="button" className="button-secondary flex w-full items-center justify-center !px-2 !py-2 text-[11px]" disabled={!enabled||running||busy!==""} onClick={()=>void start(pair,"preview")}>{busy===pair+":preview"||pairRunning?<Loader2 size={13} className="animate-spin"/>:<ShieldCheck size={13}/>}Preview</button>
       <button type="button" className="button-primary flex w-full items-center justify-center !px-2 !py-2 text-[11px]" disabled={!pairReady} onClick={()=>void start(pair,"apply")}>{busy===pair+":apply"?<Loader2 size={13} className="animate-spin"/>:<RefreshCw size={13}/>}Sync</button>
       {pairLatest?.html_url&&<a href={pairLatest.html_url} target="_blank" rel="noreferrer" className="text-[10px] text-blue-400 hover:underline">View run</a>}
      </div>
      <a className="min-w-0 rounded-xl border border-border bg-background/60 p-3 text-right transition-colors hover:border-blue-400/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400" href={"https://github.com/remipetrovich-design/"+fallback} target="_blank" rel="noreferrer"><span className="block text-xs font-semibold">{label}</span><span className="mt-1 block break-all text-[11px] text-muted-foreground">{fallback}</span></a>
     </div>;
    })}
   </div>
  </div>
  <div className="rounded-xl border border-border bg-card p-4 text-sm space-y-2"><p className="font-semibold">Activation checklist</p><p>1. GitHub Actions repository variable <code>ORBITFS_REPOSITORY_SYNC_ENABLED=true</code> on the current control repository (Main Dev-panel or Fallback Control-Centre).</p><p>2. Dev Panel Vercel Production environment variable with the same name and value; redeploy after changing it.</p><p>3. Select a direction, press Preview for one repository, and inspect the linked GitHub run. Only a successful preview for that same repository and direction unlocks its Sync button. Switching direction never starts synchronization.</p><p>Environment values and mode-owned files remain independent. If development introduces a new required variable, add it separately to the correct Fallback destination; synchronization never transfers its value.</p></div>
  <div className="rounded-xl border border-amber-400/30 bg-amber-500/5 p-4">
   <div className="flex gap-3"><AlertTriangle className="mt-0.5 shrink-0 text-amber-300" size={18}/><div><p className="text-sm font-semibold">Manual code synchronization — safeguards</p><p className="mt-1 text-xs leading-5 text-muted-foreground">New portable files and shared feature updates can transfer. The workflow refuses destination-file deletions, protects environment files and selected mode-owned configuration, and stops on detected independent changes. A source-baselined three-way merge is attempted when safe; unresolved independent edits remain preserved. Inspect the run report and build both sides before release.</p></div></div>
   <p className="mt-4 text-xs text-muted-foreground">Use the Preview and Sync controls in each repository row. Only the selected repository is affected.</p>
  </div>
 </section>;
}
