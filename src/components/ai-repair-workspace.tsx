import {useCallback,useEffect,useMemo,useState,type ReactNode} from "react";
import {Activity,AlertTriangle,CheckCircle2,ChevronDown,Clipboard,ExternalLink,FileCode2,Github,Loader2,RefreshCw,Search,ShieldCheck,Terminal,Wrench, Zap} from "lucide-react";
import {getAiRepairOverview,getAiRepairRun,getAiRepairJobLog,getAiRepairServiceState,getAiRepairIncidents,getAiRepairIncident,requestAiRepairDiagnosis,validateAiRepairProposal} from "@/lib/ai-repair.server";

type Section="overview"|"incidents"|"workspace"|"history"|"recovery"|"settings";
const SECTIONS:[Section,string][]=[["overview","Overview"],["incidents","Incidents"],["workspace","Repair workspace"],["history","Job history"],["recovery","Release recovery"],["settings","Settings"]];
function date(v?:string){return v?new Date(v).toLocaleString():"—"}
function Pill({label,ok}:{label:string;ok?:boolean}){return <span className={`orbit-status-pill ${ok===true?"orbit-status-tone-success":ok===false?"orbit-status-tone-warning":"orbit-status-tone-neutral"}`}>{label}</span>}
function Card({title,children}:{title:string;children:ReactNode}){return <section className="rounded-xl border border-border bg-card p-4 space-y-3"><h3 className="text-sm font-semibold">{title}</h3>{children}</section>}
function Copy({text}:{text:string}){const [done,setDone]=useState(false);return <button className="button-secondary inline-flex items-center gap-2" type="button" disabled={!text} onClick={async()=>{try{await navigator.clipboard.writeText(text);setDone(true);setTimeout(()=>setDone(false),1800)}catch{setDone(false)}}}><Clipboard size={14}/>{done?"Copied":"Copy for ChatGPT"}</button>}

export function AiRepairWorkspace({session}:{session:any}){
 const [section,setSection]=useState<Section>("overview");
 const [overview,setOverview]=useState<any>(null);
 const [service,setService]=useState<any>(null);
 const [incidents,setIncidents]=useState<any[]>([]);
 const [selected,setSelected]=useState<any>(null);
 const [detail,setDetail]=useState<any>(null);
 const [incidentDetail,setIncidentDetail]=useState<any>(null);
 const [log,setLog]=useState("");
 const [proposal,setProposal]=useState<any>(null);
 const [validation,setValidation]=useState<any>(null);
 const [query,setQuery]=useState("");
 const [kind,setKind]=useState("all");
 const [busy,setBusy]=useState("");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const token=session.token;
 const load=useCallback(async()=>{
  setBusy("refresh");setError("");
  try{
   const [o,s]=await Promise.all([getAiRepairOverview({data:{token}}),getAiRepairServiceState({data:{token}})]);
   setOverview(o);setService(s);
   if(s.available){try{const r=await getAiRepairIncidents({data:{token}});setIncidents(r.incidents||[]);}catch(e:any){setError(e.message||"Cannot load incident storage")}}
  }catch(e:any){setError(e.message||"Failed to load AI Repair Centre")}
  finally{setBusy("")}
 },[token]);
 useEffect(()=>{void load();const interval=setInterval(()=>{if(document.visibilityState==="visible")void load()},60000);return ()=>clearInterval(interval)},[load]);
 const runs=useMemo(()=>overview?.groups?.flatMap((g:any)=>g.runs||[])||[],[overview]);
 const rows=useMemo(()=>{
  const combined=[...incidents.map((i:any)=>({...i,kind:i.kind||(i.repo?.toLowerCase().includes("engine")?"engine":"base"),origin:"stored"})),...runs.filter((r:any)=>!incidents.some((i:any)=>i.repo===r.repo&&i.runId===r.id)).map((r:any)=>({...r,runId:r.id,origin:"github",status:"detected"}))];
  return combined.filter((r:any)=>(kind==="all"||r.kind===kind)&&[r.repo,r.name,r.workflow,r.jobName,r.classification,r.runId].join(" ").toLowerCase().includes(query.toLowerCase())).sort((a:any,b:any)=>new Date(b.detectedAt||b.createdAt||0).getTime()-new Date(a.detectedAt||a.createdAt||0).getTime());
 },[incidents,runs,query,kind]);
 async function open(item:any){
  setSelected(item);setDetail(null);setIncidentDetail(null);setProposal(null);setValidation(null);setLog("");setError("");setSection("workspace");setBusy("detail");
  try{
   if(item.origin==="stored"){
    const d=await getAiRepairIncident({data:{token,incidentId:item.id,source:false}});
    setIncidentDetail(d);setLog(d.incident?.log||"");
   }else{
    const d=await getAiRepairRun({data:{token,repo:item.repo,runId:item.runId}});
    setDetail(d);
   }
  }catch(e:any){setError(e.message||"Unable to inspect job")}finally{setBusy("")}
 }
 async function getLog(jobId:number){
  if(!selected)return;setBusy("logs");setError("");
  try{setLog((await getAiRepairJobLog({data:{token,repo:selected.repo,jobId}})).log||"")}catch(e:any){setError(e.message||"Could not retrieve logs")}finally{setBusy("")}
 }
 async function loadSource(){
  if(!selected?.id||selected.origin!=="stored")return;setBusy("source");setError("");
  try{const d=await getAiRepairIncident({data:{token,incidentId:selected.id,source:true}});setIncidentDetail(d)}catch(e:any){setError(e.message)}finally{setBusy("")}
 }
 async function diagnose(){
  if(!selected?.id||selected.origin!=="stored"||!service?.available)return;
  if(!window.confirm("Use one manual OpenRouter free-model request for this incident?"))return;
  setBusy("diagnose");setError("");
  try{const result=await requestAiRepairDiagnosis({data:{token,incidentId:selected.id,confirm:"RUN_AI_DIAGNOSIS"}});setProposal(result.proposal);setNotice("AI proposal returned; no source files were changed.")}catch(e:any){setError(e.message||"AI diagnosis failed")}finally{setBusy("")}
 }
 async function validate(){
  if(!selected?.id||!proposal?.files?.length||!service?.available)return;
  if(!window.confirm("Test proposed replacements in an isolated workspace? This does not commit or publish."))return;
  setBusy("validate");setError("");
  try{const result=await validateAiRepairProposal({data:{token,incidentId:selected.id,proposal,confirm:"VALIDATE_ISOLATED_REPAIR"}});setValidation(result);setNotice(result.status==="validated"?"Sandbox checks passed. Source is unchanged.":"Sandbox checks did not pass.")}catch(e:any){setError(e.message||"Validation failed")}finally{setBusy("")}
 }
 const total=rows.length;
 const current=overview?.selection;
 const available=Boolean(service?.available);
 return <div className="space-y-4">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div><p className="orbit-reference-kicker">OPERATIONS / AI REPAIR</p><h1 className="text-2xl font-bold tracking-tight">AI Repair Centre</h1><p className="mt-1 text-sm text-muted-foreground">One workspace for Base and Shared Engine failures, across Main and Fallback.</p></div>
   <div className="flex items-center gap-2"><Pill label={current?.profile==="primary"?"MAIN PROFILE":current?.profile==="fallback"?"FALLBACK PROFILE":"PROFILE UNKNOWN"}/><button className="button-secondary inline-flex items-center gap-2" onClick={()=>void load()} disabled={busy==="refresh"}><RefreshCw size={14} className={busy==="refresh"?"animate-spin":""}/>Refresh</button></div>
  </div>
  {error&&<div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</div>}
  {notice&&<div className="rounded-lg border border-border px-3 py-2 text-sm">{notice}<button className="ml-3 underline" onClick={()=>setNotice("")}>Dismiss</button></div>}
  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
   {[
    ["Failed runs",String(runs.length),Activity],
    ["Stored incidents",String(incidents.length),AlertTriangle],
    ["Worker",available?"Connected":"Not connected",Terminal],
    ["OpenRouter",available?"Manual only":"Unavailable",Zap]
   ].map(([title,value,Icon]:any)=><div key={title} className="rounded-xl border border-border bg-card p-4"><p className="flex items-center gap-2 text-xs text-muted-foreground"><Icon size={14}/>{title}</p><p className="mt-3 text-xl font-semibold">{value}</p></div>)}
  </div>
  <nav className="flex flex-wrap gap-1 border-b border-border pb-2" aria-label="AI Repair sections">
   {SECTIONS.map(([id,label])=><button key={id} type="button" className={`rounded-md px-3 py-2 text-xs font-medium ${section===id?"bg-primary text-primary-foreground":"text-muted-foreground hover:bg-muted"}`} aria-current={section===id?"page":undefined} onClick={()=>setSection(id)}>{label}</button>)}
  </nav>
  {(section==="overview"||section==="incidents"||section==="history")&&<>
   <div className="flex flex-wrap items-center gap-2"><div className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-2.5 text-muted-foreground" size={15}/><input className="control w-full pl-9" placeholder="Search failures, repository, run…" value={query} onChange={e=>setQuery(e.target.value)}/></div><select className="control max-w-[150px]" value={kind} onChange={e=>setKind(e.target.value)}><option value="all">All systems</option><option value="base">Base</option><option value="engine">Engine</option></select><Pill label={total+" results"}/></div>
   {overview?.groups?.some((g:any)=>g.error)&&<Card title="Connection warnings">{overview.groups.filter((g:any)=>g.error).map((g:any)=><p key={g.repo} className="text-xs text-muted-foreground">{g.repo}: {g.error}</p>)}</Card>}
   <div className="overflow-x-auto rounded-xl border border-border"><table className="w-full min-w-[700px] text-left text-xs"><thead className="bg-muted/50 text-muted-foreground"><tr><th className="p-3">System / Source</th><th className="p-3">Failure</th><th className="p-3">Status</th><th className="p-3">Detected</th><th className="p-3">Action</th></tr></thead><tbody>{rows.map((r:any)=><tr key={r.origin+":"+r.repo+":"+(r.id||r.runId)+":"+(r.jobId||"")} className="border-t border-border"><td className="p-3"><b className="uppercase">{r.kind}</b><p className="max-w-[260px] truncate text-muted-foreground">{r.repo}</p><p className="text-muted-foreground">{r.profile}</p></td><td className="p-3"><b>{r.jobName||r.name||r.workflow||"Failed workflow"}</b><p className="text-muted-foreground">Run #{r.runId}{r.jobId?" · Job #"+r.jobId:""}</p></td><td className="p-3"><Pill label={r.lastValidation?.status||r.status||"failed"} ok={r.lastValidation?.status==="validated"}/></td><td className="p-3">{date(r.detectedAt||r.createdAt)}</td><td className="p-3"><button className="button-secondary" onClick={()=>void open(r)}>Investigate</button></td></tr>)}</tbody></table>{!rows.length&&<div className="p-8 text-center text-sm text-muted-foreground">No matching failed jobs. Refresh or check your profile and GitHub connections.</div>}</div>
  </>}
  {section==="workspace"&&<div className="space-y-3">
   {!selected?<Card title="Choose a failed job"><p className="text-sm text-muted-foreground">Open an incident from Overview or Incidents to inspect its errors and source.</p><button className="button-secondary" onClick={()=>setSection("incidents")}>Open incidents</button></Card>:<>
    <Card title="Source and failure identity"><div className="flex flex-wrap gap-2"><Pill label={selected.profile||"Profile unknown"}/><Pill label={selected.kind||"System"}/><Pill label={selected.classification||"Failure"}/></div><p className="break-all text-xs">{selected.repo}</p><p className="text-xs text-muted-foreground">Commit: {selected.sha} · Run #{selected.runId}</p>{selected.runUrl||selected.url?<a className="inline-flex items-center gap-1 text-xs underline" href={selected.runUrl||selected.url} target="_blank" rel="noreferrer">View GitHub workflow <ExternalLink size={12}/></a>:null}</Card>
    {detail?.jobs?.length>0&&<Card title="Failed jobs">{detail.jobs.filter((j:any)=>j.conclusion==="failure").map((j:any)=><div key={j.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3"><div><b className="text-sm">{j.name}</b><p className="text-xs text-muted-foreground">{(j.failedSteps||[]).join(", ")||"Failed"}</p></div><button className="button-secondary" disabled={Boolean(busy)} onClick={()=>void getLog(j.id)}>Load error log</button></div>)}</Card>}
    <Card title="Error console"><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-3 font-mono text-[11px]">{log||"Select a failed job to fetch its error log, or open a stored incident."}</pre></Card>
    {incidentDetail&&<Card title="Local diagnosis"><div className="flex flex-wrap gap-2"><Pill label={incidentDetail.diagnosis?.classification||"Unknown"}/><Pill label={"Confidence: "+(incidentDetail.diagnosis?.confidence||"low")}/>{(incidentDetail.diagnosis?.components||[]).map((x:string)=><Pill key={x} label={x}/>)}</div><p className="text-sm">{incidentDetail.diagnosis?.recommendation}</p><div className="flex flex-wrap gap-2"><Copy text={incidentDetail.copyForAI||""}/><button className="button-secondary" disabled={Boolean(busy)} onClick={()=>void loadSource()}><FileCode2 size={13}/> Fetch source context</button><button className="button-primary" disabled={!available||Boolean(busy)} onClick={()=>void diagnose()}><Zap size={13}/> Request AI diagnosis</button></div>{!available&&<p className="text-xs text-muted-foreground">AI requires the Repair Centre backend. No request is sent until connected and confirmed.</p>}</Card>}
    {selected.origin!=="stored"&&<Card title="Repair handoff"><p className="text-sm text-muted-foreground">This is a live GitHub failure. The repair backend will attach a persistent incident once connected. You can inspect its logs now without using AI.</p><Copy text={["OrbitFS failed release",selected.repo,"Commit: "+selected.sha,"Run: "+selected.runId,"Log:",log,"Keep License Manager approval and manual Billing publication"].join("\n")}/></Card>}
    {proposal&&<Card title="Proposed repair — not yet applied"><p className="text-sm">{proposal.diagnosis}</p><div className="space-y-2">{(proposal.files||[]).map((f:any,i:number)=><details key={i} className="rounded-lg border border-border p-3"><summary className="cursor-pointer text-xs font-semibold">{f.path}</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-[11px]">{f.content}</pre></details>)}</div><button className="button-primary" disabled={!available||!proposal.files?.length||Boolean(busy)} onClick={()=>void validate()}><ShieldCheck size={14}/> Validate in sandbox</button></Card>}
    {validation&&<Card title="Sandbox validation result"><Pill label={validation.status} ok={validation.status==="validated"}/>{(validation.steps||[]).map((step:any,i:number)=><details key={i} className="rounded border border-border p-2"><summary className="cursor-pointer text-xs">{step.ok?"Passed":"Failed"} · {step.name}</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-[11px]">{step.output}</pre></details>)}<p className="text-xs text-muted-foreground">Source push: No · Release publication: Manual only</p></Card>}
    {busy&&<p className="inline-flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="animate-spin" size={13}/> {busy}…</p>}
   </>}
  </div>}
  {section==="recovery"&&<Card title="Release recovery"><p className="text-sm text-muted-foreground">Repair results must re-enter the existing GitHub release workflow, License Manager validation and technical approval. Billing final review and publication are always manual.</p><div className="flex flex-wrap gap-2"><Pill label="Automatic publication disabled" ok/><Pill label="Recovery dispatch not configured"/></div><p className="text-xs text-muted-foreground">No alternate release registry or approval state is created here.</p></Card>}
  {section==="settings"&&<div className="grid gap-3 md:grid-cols-2"><Card title="Service connection"><Pill label={available?"Repair service connected":"Repair service not connected"} ok={available}/><p className="text-xs text-muted-foreground">{service?.error||"Connected server-side. Credentials stay out of browser code."}</p><p className="text-xs text-muted-foreground">The worker requires an approved host or GitHub Actions adapter. These settings are server-managed.</p></Card><Card title="Profile and source authority"><p className="text-sm">Active profile: <b>{current?.profile||"unavailable"}</b></p><p className="text-xs break-all">{current?.baseRepo}</p><p className="text-xs break-all">{current?.engineRepo}</p><p className="text-xs text-muted-foreground">This page follows License Manager's existing switch. It cannot override the profile.</p></Card><Card title="AI and usage"><p className="text-sm">OpenRouter: Manual approval only</p><p className="text-xs text-muted-foreground">No automatic AI calls, paid model fallbacks or silent retries. Daily request limits are enforced by Repair Centre backend.</p></Card><Card title="Safety policy"><p className="text-sm">Restricted repairs and audited validation</p><p className="text-xs text-muted-foreground">No remote source writes or release actions from this UI. Production release authorisation belongs to License Manager. Customer publication remains manual.</p></Card></div>}
 </div>;
}
