import {useEffect,useState} from "react";
import {AlertTriangle,CheckCircle2,ChevronDown,Clipboard,ExternalLink,Loader2,RefreshCw,ShieldCheck,Terminal,Wrench} from "lucide-react";
import {dispatchAiSourceValidation,getReleaseFixPreview} from "@/lib/ai-repair.server";

function repositoryFromRunUrl(url:string){
 const match=String(url||"").match(/^https:\/\/github\.com\/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)\/actions\/runs\/\d+(?:\/.*)?$/);
 return match?.[1]||"";
}
const errorKinds=[
 {rx:/checksum|sha.?256|manifest|artifact|customer-schema/i,title:"Check the release artifact and manifest",tip:"Rebuild and verify artifact SHA-256, file inventory and License Manager intake."},
 {rx:/migration|database|sqlstate|schema/i,title:"Check the database migration contract",tip:"Review the schema snapshot and apply only forward migrations. Never rewrite migration history."},
 {rx:/401|403|unauthori[sz]ed|forbidden|permission/i,title:"Check source profile and credentials",tip:"Verify the active profile and release token permissions. Keep secrets out of reports."},
 {rx:/error TS\d+|svelte-check|type error/i,title:"Correct the source type error",tip:"Investigate the failing source diagnostic, then run check and build on the exact commit."},
 {rx:/npm ERR|npm ci|package-lock|cannot find module/i,title:"Repair dependency resolution",tip:"Validate package manifest, lockfile and imports before rebuilding the package."},
 {rx:/vite|rollup|build failed|syntaxerror|referenceerror/i,title:"Repair the failing build",tip:"Locate the failing build step, apply a minimal fix and validate it before retrying the same release."}
];
function savedAdvice(message:string){
 const match=errorKinds.find(x=>x.rx.test(message));
 return {title:match?.title||"Inspect the failed workflow and source commit",suggestion:match?.tip||"Review the failed job output, identify the root cause and validate the source before retrying."};
}
export function ReleaseFixPanel({session,type,draft,attempt,runRepo,compact=false}:{session:any;type:"base"|"engine";draft:any;attempt?:any;runRepo?:string;compact?:boolean}){
 const runId=Number(attempt?.run_id||draft?.last_run_id||0);
 const repo=repositoryFromRunUrl(String(attempt?.run_url||draft?.last_run_url||""))||String(runRepo||"");
 const sourceError=String(attempt?.error_summary||draft?.last_error||"");
 const [preview,setPreview]=useState<any>(null);
 const [open,setOpen]=useState(false);
 const [busy,setBusy]=useState("");
 const [error,setError]=useState("");
 const [copied,setCopied]=useState(false);
 const [dispatch,setDispatch]=useState<any>(null);
 const advice=preview?.solution||savedAdvice(sourceError);
 useEffect(()=>{
  setPreview(null);setError("");
  if(!runId||!repo)return;
  let cancelled=false;
  const load=async()=>{
   try{
    const next=await getReleaseFixPreview({data:{token:session.token,repo,runId,type,savedError:sourceError}});
    if(!cancelled)setPreview(next);
   }catch(e:any){if(!cancelled)setError(String(e.message||"Failed job details unavailable"));}
  };
  void load();
  return()=>{cancelled=true};
 },[session.token,repo,runId,type,sourceError]);
 const hasFailure=Boolean(sourceError)||["failure","cancelled","skipped"].includes(String(attempt?.status||"").toLowerCase());
 if(!hasFailure&&!preview?.ready)return null;
 const report=[
  "OrbitFS release repair request",
  "Release: "+(type==="base"?"Base":"Update")+" v"+String(draft?.version||"unknown"),
  "Channel: "+String(draft?.channel||"stable"),
  "GitHub repository: "+(preview?.repo||repo),
  "Failed commit: "+String(preview?.sha||draft?.source_sha||"unavailable"),
  "Run: "+String(preview?.runUrl||draft?.last_run_url||runId),
  "Failed steps: "+(preview?.failedSteps||[]).join(", "),
  "Likely cause: "+String(advice.title||"Unknown"),
  "Suggested investigation: "+String(advice.suggestion||""),
  "Captured output:",String(preview?.log||sourceError||"Log not available"),
  "Investigate the root cause, propose a minimal source fix with validation. Do not bypass License Manager or automatically publish in Billing."
 ].join("\n\n");
 async function copy(){
  try{await navigator.clipboard.writeText(report);setCopied(true);setTimeout(()=>setCopied(false),1800)}catch{setError("Could not copy the repair report")}
 }
 async function validateSource(){
  if(!preview?.sha||!preview?.repo)return;
  if(!window.confirm("Start manual GitHub Actions checks against the exact source commit? This does not apply a fix or publish."))return;
  setBusy("validate");setError("");
  try{setDispatch(await dispatchAiSourceValidation({data:{token:session.token,repo:preview.repo,sha:preview.sha}}))}
  catch(e:any){setError(e.message||"Worker dispatch failed")}finally{setBusy("")}
 }
 return <section className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 sm:p-4" aria-label="Release repair">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div className="min-w-0 flex-1"><p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-destructive"><AlertTriangle size={13}/> Failed release · Repair available</p><h3 className="mt-1 text-sm font-semibold">{advice.title}</h3><p className="mt-1 text-xs text-muted-foreground">{advice.suggestion}</p></div>
   <button type="button" className="button-primary inline-flex items-center gap-2" onClick={()=>setOpen(v=>!v)}><Wrench size={14}/> Fix <ChevronDown size={13} className={open?"rotate-180":""}/></button>
  </div>
  {!open&&preview?.checkedAt&&<p className="mt-2 text-[10px] text-muted-foreground">Job inspected · {new Date(preview.checkedAt).toLocaleString()} · Diagnosis uses no AI requests</p>}
  {open&&<div className="mt-4 space-y-3 border-t border-border pt-3">
   <div className="grid gap-2 text-xs sm:grid-cols-2"><div><span className="text-muted-foreground">Release</span><p>v{draft?.version} · {draft?.channel}</p></div><div><span className="text-muted-foreground">Source commit</span><p className="break-all font-mono">{preview?.sha||draft?.source_sha||"Unknown"}</p></div><div><span className="text-muted-foreground">Failed step</span><p>{preview?.failedSteps?.join(", ")||"See GitHub error log"}</p></div><div><span className="text-muted-foreground">Analysis</span><p>{preview?.solution?.confidence||"From saved failure"}</p></div></div>
   <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md bg-background p-3 text-[11px]">{preview?.log||sourceError||"No failure log saved"}</pre>
   {preview?.logError&&<p className="text-xs text-muted-foreground">{preview.logError}</p>}
   {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
   <div className="flex flex-wrap gap-2">
    <button type="button" className="button-secondary inline-flex items-center gap-1" onClick={()=>void copy()}><Clipboard size={13}/>{copied?"Copied":"Copy repair to ChatGPT"}</button>
    <button type="button" className="button-secondary inline-flex items-center gap-1" onClick={()=>void validateSource()} disabled={Boolean(busy)||!preview?.sha||type==="base"&&preview?.repo?.endsWith("OrbitFS-Control-Centre")}><Terminal size={13}/>{busy?"Starting checks…":"Validate source"}</button>
    {(preview?.runUrl||draft?.last_run_url)&&<a className="button-secondary inline-flex items-center gap-1" href={preview?.runUrl||draft?.last_run_url} target="_blank" rel="noreferrer"><ExternalLink size={13}/> GitHub run</a>}
   </div>
   {dispatch&&<div className="rounded-lg border border-border p-3 text-xs"><span className="inline-flex items-center gap-2"><CheckCircle2 size={14}/> Source validation queued.</span> <a href={dispatch.workerUrl} target="_blank" rel="noreferrer" className="underline">View GitHub Actions</a></div>}
   <p className="text-[11px] text-muted-foreground">This diagnosis is prepared automatically from GitHub without OpenRouter. Fix does not silently edit source, rerun a release or bypass approvals. AI source changes require a separately authorised repair execution path.</p>
  </div>}
 </section>;
}
