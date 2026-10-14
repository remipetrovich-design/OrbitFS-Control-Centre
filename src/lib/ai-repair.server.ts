import {createServerFn} from "@tanstack/react-start";
import {requireOwner} from "@/lib/panel.server";
import {activeGithubProfileName,githubProfileDefinitions} from "@/lib/github-profile";

const timeout=()=>AbortSignal.timeout(12000);
function source(kind:"base"|"engine",profile:"primary"|"fallback"){
 const def=githubProfileDefinitions()[profile];
 return kind==="base"?def.base.repo:def.engine.repo;
}
function token(profile:"primary"|"fallback"){
 const name=profile==="primary"?(process.env.MAIN_GITHUB_RELEASE_TOKEN?"MAIN_GITHUB_RELEASE_TOKEN":process.env.MAIN_GITHUB_TOKEN?"MAIN_GITHUB_TOKEN":"ORBITFS_RELEASE_DISPATCH_TOKEN"):(process.env.FALLBACK_GITHUB_RELEASE_TOKEN?"FALLBACK_GITHUB_RELEASE_TOKEN":process.env.FALLBACK_GITHUB_TOKEN?"FALLBACK_GITHUB_TOKEN":"ORBITFS_FALLBACK_GITHUB_TOKEN");
 const value=process.env[name]||"";
 if(!value)throw Error("GitHub read access for "+profile+" is not configured");
 return value;
}
async function github(repo:string,path:string,profile:"primary"|"fallback",accept="application/vnd.github+json"){
 const response=await fetch("https://api.github.com/repos/"+repo+path,{headers:{Authorization:"Bearer "+token(profile),Accept:accept,"X-GitHub-Api-Version":"2022-11-28"},cache:"no-store",signal:timeout()});
 if(!response.ok)throw Error("GitHub "+repo+" returned HTTP "+response.status);
 return response;
}
function requireKind(value:string):"base"|"engine"{if(value!=="base"&&value!=="engine")throw Error("Invalid system");return value;}
function safeId(value:number|string){if(!/^\d+$/.test(String(value)))throw Error("Invalid run/job ID");return String(value);}
async function active(){
 const mode=await activeGithubProfileName();
 return {mode,profile:mode,baseRepo:source("base",mode),engineRepo:source("engine",mode)};
}
export const getAiRepairOverview=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string}})=>{
 requireOwner(data.token);
 await requireAiRepairEnabled();
 const selection=await active();
 const targets=[{kind:"base" as const,repo:selection.baseRepo},{kind:"engine" as const,repo:selection.engineRepo},{kind:"base" as const,repo:githubProfileDefinitions()[selection.profile].devPanel.repo}];
 const statuses=await Promise.allSettled(targets.map(async ({kind,repo})=>{
  const result=await(await github(repo,"/actions/runs?status=failure&per_page=15",selection.profile)).json();
  return {kind,repo,runs:(result.workflow_runs||[]).map((x:any)=>({id:x.id,repo,kind,profile:selection.profile,sha:x.head_sha,branch:x.head_branch,name:x.name,url:x.html_url,createdAt:x.created_at,conclusion:x.conclusion}))};
 }));
 const groups=statuses.map((s,i)=>s.status==="fulfilled"?s.value:{kind:i===0?"base":"engine",repo:targets[i].repo,runs:[],error:String((s as PromiseRejectedResult).reason?.message||"GitHub unavailable")});
 return {selection,groups,checkedAt:new Date().toISOString(),worker:workerConfig()};
});
function workerConfig(){
 const value=String(process.env.AI_REPAIR_SERVICE_URL||"").trim();
 return {configured:Boolean(value),automaticAiWhenConfigured:true,publication:"manual",mode:value?"connected-configured":"unconfigured"};
}
function repairEndpoint(){
 const raw=String(process.env.AI_REPAIR_SERVICE_URL||"").trim();
 if(!raw)throw Error("Repair worker is not connected. Configure AI_REPAIR_SERVICE_URL and AI_REPAIR_SERVICE_TOKEN.");
 const url=new URL(raw);
 if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash)throw Error("Repair worker URL must be a clean HTTPS address");
 if(!process.env.AI_REPAIR_SERVICE_TOKEN)throw Error("AI_REPAIR_SERVICE_TOKEN missing");
 return url.origin+url.pathname.replace(/\/$/,"");
}
async function repairService(path:string,method:"GET"|"POST"="GET",payload?:unknown){
 const response=await fetch(repairEndpoint()+"/api/v1/repair/"+path,{
  method,headers:{Authorization:"Bearer "+process.env.AI_REPAIR_SERVICE_TOKEN,"Content-Type":"application/json"},
  body:method==="POST"?JSON.stringify(payload):undefined,cache:"no-store",signal:AbortSignal.timeout(method==="GET"?12000:120000)
 });
 const body=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(String(body.error||"Repair service returned "+response.status));
 return body;
}
// Read-only live worker console. Status comes from GitHub Actions, never a local copy.
export const getAiRepairLiveActions=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string}})=>{
 requireOwner(data.token);
 await requireAiRepairEnabled();
 const selection=await active();
 // The scheduled diagnosis worker currently belongs to the Fallback system only.
 if(selection.profile!=="fallback")return {profile:selection.profile,available:false,runs:[],reason:"The dedicated AI Repair Actions worker is configured for Fallback only.",checkedAt:new Date().toISOString()};
 const repo="remipetrovich-design/AI-Repair-Centre";
 const workerToken=String(process.env.FALLBACK_AI_REPAIR_WORKER_GITHUB_TOKEN||process.env.AI_REPAIR_WORKER_GITHUB_TOKEN||"").trim();
 if(!workerToken)throw Error("AI Repair worker GitHub access is not configured.");
 const headers={Authorization:"Bearer "+workerToken,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"};
 const get=async(path:string)=>{
  const response=await fetch("https://api.github.com/repos/"+repo+path,{headers,cache:"no-store",signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Error("AI Repair worker GitHub Actions status returned HTTP "+response.status);
  return response.json();
 };
 const recent=await get("/actions/runs?per_page=30");
 const all=(recent.workflow_runs||[]).filter((run:any)=>run.event!=="pull_request");
 const activeStatuses=new Set(["queued","in_progress","waiting","requested","pending"]);
 const activeRuns=all.filter((run:any)=>activeStatuses.has(String(run.status||"").toLowerCase()));
 // Include recent completed attempts so the console remains useful after a worker finishes.
 const display=[...activeRuns,...all.filter((run:any)=>!activeStatuses.has(String(run.status||"").toLowerCase())).slice(0,5)].slice(0,12);
 const entries=await Promise.allSettled(display.map(async(run:any)=>{
  const jobs=await get("/actions/runs/"+run.id+"/jobs?per_page=100");
  return {id:run.id,workflow:run.name,displayTitle:run.display_title||run.name,status:run.status,conclusion:run.conclusion,branch:run.head_branch,sha:run.head_sha,
   url:run.html_url,createdAt:run.created_at,updatedAt:run.updated_at,startedAt:run.run_started_at,
   jobs:(jobs.jobs||[]).map((job:any)=>({id:job.id,name:job.name,status:job.status,conclusion:job.conclusion,
    url:job.html_url,startedAt:job.started_at,completedAt:job.completed_at,
    steps:(job.steps||[]).map((step:any)=>({name:step.name,number:step.number,status:step.status,conclusion:step.conclusion,startedAt:step.started_at,completedAt:step.completed_at}))}))};
 }));
 const runs=entries.map((result,i)=>result.status==="fulfilled"?result.value:{
  id:display[i].id,workflow:display[i].name,status:display[i].status,conclusion:display[i].conclusion,
  url:display[i].html_url,jobs:[],error:String((result as PromiseRejectedResult).reason?.message||"Job details unavailable")
 });
 return {profile:selection.profile,available:true,repo,runs,activeCount:activeRuns.length,checkedAt:new Date().toISOString()};
});

export const getAiRepairRun=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string;repo:string;runId:number}})=>{
 requireOwner(data.token);
 await requireAiRepairEnabled();
 const selection=await active();
 const kind=data.repo===githubProfileDefinitions()[selection.profile].devPanel.repo?"base":(["base","engine"] as const).find(k=>source(k,selection.profile)===data.repo);
 if(!kind)throw Error("Run does not belong to current active profile");
 const id=safeId(data.runId);
 const [run,jobs]=await Promise.all([
  github(data.repo,"/actions/runs/"+id,selection.profile).then(x=>x.json()),
  github(data.repo,"/actions/runs/"+id+"/jobs?per_page=100",selection.profile).then(x=>x.json())
 ]);
 return {repo:data.repo,profile:selection.profile,kind,sha:run.head_sha,url:run.html_url,runId:run.id,jobs:(jobs.jobs||[]).map((j:any)=>({id:j.id,name:j.name,conclusion:j.conclusion,failedSteps:(j.steps||[]).filter((x:any)=>x.conclusion==="failure").map((x:any)=>x.name)}))};
});
export const getAiRepairJobLog=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string;repo:string;jobId:number}})=>{
 requireOwner(data.token);
 await requireAiRepairEnabled();
 const selection=await active();
 if(![selection.baseRepo,selection.engineRepo,githubProfileDefinitions()[selection.profile].devPanel.repo].includes(data.repo))throw Error("Repository is not in the active profile");
 const response=await github(data.repo,"/actions/jobs/"+safeId(data.jobId)+"/logs",selection.profile,"application/vnd.github+json");
 const raw=await response.text();
 return {log:raw.slice(-32000).replace(/(?:gh[pousr]_|github_pat_|sk-)[A-Za-z0-9_-]+/gi,"[REDACTED]").replace(/Bearer\s+\S+/gi,"Bearer [REDACTED]")};
});
export const getAiRepairServiceState=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string}})=>{
 requireOwner(data.token);
 await requireAiRepairEnabled();
 if(!workerConfig().configured){
  const historyAvailable=Boolean(process.env.REPAIR_SUPABASE_SERVICE_ROLE_KEY);
  return {configured:historyAvailable,available:false,historyAvailable,mode:historyAvailable?"scheduled-github-actions":"unconfigured",automaticAIRequestsEnabled:historyAvailable,error:historyAvailable?"Repair history connected. Scheduled GitHub Actions diagnosis requires a successful worker run. Manual sandbox actions need a dedicated backend.":"Set REPAIR_SUPABASE_SERVICE_ROLE_KEY in the Dev Panel server to read persisted diagnoses."};
 }
 try{return {configured:true,available:true,...await repairService("status")}}catch(e:any){return {configured:true,available:false,error:e.message};}
});
export const getAiRepairIncidents=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string}})=>{
 requireOwner(data.token);
 await requireAiRepairEnabled();
 if(workerConfig().configured)return await repairService("incidents");
 const selection=await active();
 if(!process.env.REPAIR_SUPABASE_SERVICE_ROLE_KEY)return {incidents:[],historyAvailable:false};
 const key=String(process.env.REPAIR_SUPABASE_SERVICE_ROLE_KEY);
 const policy=(await repairSettings()).settings;
 const root="https://ffmfogljikvybzgunauo.supabase.co/rest/v1/repair_incidents?profile=eq."+(selection.profile==="primary"?"main":"fallback")+"&archived_at=is.null&order=detected_at.desc&limit="+(policy?.incident_page_size||100);
 const response=await fetch(root,{headers:{apikey:key,Authorization:"Bearer "+key},cache:"no-store",signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw new Error("Repair history lookup failed: "+response.status);
 const rows=await response.json();
 const [archived,hidden]=await Promise.all([repairDbRead("repair_incidents?select=repository,run_id&profile=eq."+(selection.profile==="primary"?"main":"fallback")+"&archived_at=not.is.null&limit=300"),repairDbRead("repair_hidden_runs?select=repository,run_id&profile=eq."+(selection.profile==="primary"?"main":"fallback")+"&limit=1000")]);
 return {historyAvailable:true,archivedRuns:[...archived,...hidden].map((row:any)=>({repo:row.repository,runId:row.run_id})),incidents:rows.map((row:any)=>({id:row.id,profile:row.profile,kind:row.kind,repo:row.repository,sha:row.source_sha,runId:row.run_id,jobId:row.job_id,runUrl:row.run_url,workflow:row.workflow_name,jobName:row.job_name,failedSteps:row.failed_steps,status:row.status,classification:row.classification,detectedAt:row.detected_at,logExcerpt:row.error_excerpt?.slice(-3000)}))};
});
export const getAiRepairIncident=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string;incidentId:string;source?:boolean}})=>{
 requireOwner(data.token);
 await requireAiRepairEnabled();
 if(!/^[a-z0-9-]{1,80}$/i.test(data.incidentId))throw Error("Invalid incident ID");
 if(workerConfig().configured)return await repairService("incidents/"+data.incidentId+(data.source?"?source=true":""));
 const selection=await active();
 const key=String(process.env.REPAIR_SUPABASE_SERVICE_ROLE_KEY||"");
 if(!key)throw new Error("Repair history is not connected");
 const headers={apikey:key,Authorization:"Bearer "+key};
 const fetchRows=async(url:string)=>{const r=await fetch("https://ffmfogljikvybzgunauo.supabase.co/rest/v1/"+url,{headers,cache:"no-store",signal:AbortSignal.timeout(8000)});if(!r.ok)throw new Error("Repair history lookup: "+r.status);return await r.json()};
 const rows=await fetchRows("repair_incidents?id=eq."+encodeURIComponent(data.incidentId)+"&archived_at=is.null&limit=1");
 const row=rows?.[0];if(!row||row.profile!==(selection.profile==="primary"?"main":"fallback"))throw new Error("Incident unavailable in active profile");
 const diagnosed=row.fingerprint?await fetchRows("repair_diagnoses?repository=eq."+encodeURIComponent(row.repository)+"&fingerprint=eq."+encodeURIComponent(row.fingerprint)+"&origin=eq.openrouter&limit=1"):[];
 const diagnosis=diagnosed?.[0]||null;
 const proposals=diagnosis?await fetchRows("repair_proposals?diagnosis_id=eq."+encodeURIComponent(diagnosis.id)+"&limit=1"):[];
 const proposal=proposals?.[0]?.proposal||null;
 return {incident:{id:row.id,repo:row.repository,profile:row.profile,kind:row.kind,runId:row.run_id,jobId:row.job_id,sha:row.source_sha,classification:row.classification,log:row.error_excerpt,ai:diagnosis?{status:"completed",diagnosis:{summary:diagnosis.summary,confidence:diagnosis.confidence},proposal}:null},diagnosis:{classification:row.classification,confidence:diagnosis?.confidence||"low",recommendation:diagnosis?.recommendation||"Inspect failed source; do not bypass release approval",components:[]},source:[],copyForAI:["OrbitFS repair",row.repository,row.source_sha,row.error_excerpt].join("\n")};
});
export const requestAiRepairDiagnosis=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string;incidentId:string;confirm:string}})=>{
 requireOwner(data.token);
 await requireAiRepairEnabled();
 if(data.confirm!=="RUN_AI_DIAGNOSIS")throw Error("Explicit confirmation required");
 return await repairService("diagnose","POST",{incidentId:data.incidentId,confirm:data.confirm});
});
export const validateAiRepairProposal=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string;incidentId:string;proposal:any;confirm:string}})=>{
 requireOwner(data.token);
 await requireAiRepairEnabled();
 if(data.confirm!=="VALIDATE_ISOLATED_REPAIR")throw Error("Explicit validation confirmation required");
 return await repairService("validate","POST",{incidentId:data.incidentId,proposal:data.proposal,confirm:data.confirm});
});

export const dispatchAiSourceValidation=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string;repo:string;sha:string}})=>{
 requireOwner(data.token);
 await requireAiRepairEnabled();
 const selection=await active();
 const eligible=[{system:"base",repo:selection.baseRepo},{system:"engine",repo:selection.engineRepo}].find(item=>item.repo===data.repo);
 if(!eligible)throw Error("Only the active profile's Base and Engine source commits may be validated");
 if(!/^[a-f0-9]{40}$/i.test(data.sha))throw Error("Exact commit SHA required");
 const workerToken=String(process.env.FALLBACK_AI_REPAIR_WORKER_GITHUB_TOKEN||process.env.AI_REPAIR_WORKER_GITHUB_TOKEN||"").trim();
 if(!workerToken)throw Error("AI_REPAIR_WORKER_GITHUB_TOKEN not configured. Manual source validation is unavailable.");
 const workerRepo="remipetrovich-design/AI-Repair-Centre";
 const response=await fetch("https://api.github.com/repos/"+workerRepo+"/actions/workflows/validate-source.yml/dispatches",{
  method:"POST",headers:{Authorization:"Bearer "+workerToken,Accept:"application/vnd.github+json","Content-Type":"application/json","X-GitHub-Api-Version":"2022-11-28"},
  body:JSON.stringify({ref:"main",inputs:{profile:selection.profile==="primary"?"main":"fallback",system:eligible.system,commit_sha:data.sha}}),
  signal:timeout()
 });
 if(!response.ok)throw Error("GitHub Actions dispatch failed: HTTP "+response.status);
 return {dispatched:true,workerUrl:"https://github.com/"+workerRepo+"/actions/workflows/validate-source.yml",profile:selection.profile,system:eligible.system,sha:data.sha,publication:"manual-only"};
});

function explainReleaseFailure(log:string,steps:string[]){
 const t=[log,...steps].join("\n");
 const options=[
  {key:"artifact",rx:/checksum|sha-?256|manifest|artifact (?:missing|invalid)|file count/i,title:"Release package or manifest validation failed",action:"Inspect the generated release manifest, packaged file inventory and SHA-256 values. Rebuild the same release candidate after correcting packaging; do not bypass License Manager validation."},
  {key:"database",rx:/migration|sqlstate|database schema|customer-schema|db:migrations/i,title:"Database or migration contract failed",action:"Check the exact migration contract and generated schema snapshot. Use forward-only migrations; do not rewrite applied migration history."},
  {key:"permissions",rx:/401|403|unauthori[sz]ed|forbidden|permission denied|bad credentials/i,title:"Release credentials or permissions failed",action:"Verify the active GitHub profile and configured read/release credentials. Do not copy secrets into logs or disable authentication."},
  {key:"dependency",rx:/npm err|npm ci|cannot find module|module not found|unable to resolve|package-lock/i,title:"Dependency installation or resolution failed",action:"Check package.json against the exact lockfile and failing imports. Reinstall locked dependencies and run check/build in a validation worker."},
  {key:"typecheck",rx:/error TS\d+|svelte-check|type error|typescript/i,title:"Source typecheck failed",action:"Open the failing source path and TypeScript diagnostic. Correct the source at the failed commit, then run npm run check and npm run build."},
  {key:"build",rx:/vite|rollup|build failed|syntaxerror|referenceerror/i,title:"Source build failed",action:"Inspect the failing build step and relevant source files. Validate a minimal correction at the failed commit before retrying the same release."},
  {key:"upstream",rx:/429|rate.limit|econnreset|etimedout|502|503|eai_again/i,title:"External service or network failure",action:"Check upstream service availability and retry only after confirming the error is transient; preserve release approval gates."}
 ];
 const match=options.find(x=>x.rx.test(t));
 return {category:match?.key||"unknown",title:match?.title||"Failed release needs source-level investigation",suggestion:match?.action||"Inspect the exact failed job output, source commit and release package. Identify the root cause before retrying the same release.",confidence:match?"rule-matched":"unclassified",aiRequests:0};
}
function sanitiseRepairLog(value:string){
 return String(value||"").replace(/(?:gh[pousr]_|github_pat_|sk-)[A-Za-z0-9_-]+/gi,"[REDACTED]").replace(/Bearer\s+\S+/gi,"Bearer [REDACTED]").replace(/((?:token|password|secret|api[_-]?key)\s*[:=]\s*)[^\s]+/gi,"$1[REDACTED]").slice(-16000);
}
const REPAIR_HISTORY_PROJECT="ffmfogljikvybzgunauo";
async function savedRepairForRun(repo:string,runId:string,profile:"primary"|"fallback"){
 const key=String(process.env.REPAIR_SUPABASE_SERVICE_ROLE_KEY||"").trim();
 if(!key)return null; // The rule-based repair panel remains usable until server secret is installed.
 const root="https://"+REPAIR_HISTORY_PROJECT+".supabase.co/rest/v1/";
 const headers={apikey:key,Authorization:"Bearer "+key,Accept:"application/json"};
 const read=async(path:string)=>{
  const response=await fetch(root+path,{headers,cache:"no-store",signal:AbortSignal.timeout(6000)});
  if(!response.ok)throw new Error("Repair history request failed: "+response.status);
  return await response.json();
 };
 const incidents=await read("repair_incidents?repository=eq."+encodeURIComponent(repo)+"&run_id=eq."+encodeURIComponent(runId)+"&order=detected_at.desc&limit=1");
 const incident=incidents?.[0];
 if(!incident||incident.profile!==(profile==="primary"?"main":"fallback"))return null;
 const diagnoses=incident.fingerprint?await read("repair_diagnoses?repository=eq."+encodeURIComponent(repo)+"&fingerprint=eq."+encodeURIComponent(incident.fingerprint)+"&origin=eq.openrouter&limit=1"):[];
 const diagnosis=diagnoses?.[0]||null;
 const proposals=diagnosis?await read("repair_proposals?diagnosis_id=eq."+encodeURIComponent(diagnosis.id)+"&order=created_at.desc&limit=1"):[];
 return {incident:{id:incident.id,status:incident.status,classification:incident.classification,sqlstate:incident.sqlstate},diagnosis:diagnosis?{summary:diagnosis.summary,recommendation:diagnosis.recommendation,confidence:diagnosis.confidence,model:diagnosis.model}:null,proposal:proposals?.[0]?.proposal||null};
}
export const getReleaseFixPreview=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string;repo:string;runId:number;type:"base"|"engine";savedError?:string}})=>{
 requireOwner(data.token);
 await requireAiRepairEnabled();
 const selection=await active();
 const type=requireKind(data.type);
 const authorisedRepos=type==="base"?[selection.baseRepo,githubProfileDefinitions()[selection.profile].devPanel.repo]:[selection.engineRepo];
 if(!authorisedRepos.includes(data.repo))throw Error("Release run does not belong to this active profile and release system");
 const id=safeId(data.runId);
 const run=await(await github(data.repo,"/actions/runs/"+id,selection.profile)).json();
 const jobs=await(await github(data.repo,"/actions/runs/"+id+"/jobs?per_page=100",selection.profile)).json();
 const job=(jobs.jobs||[]).find((x:any)=>x.conclusion==="failure")||null;
 const failedSteps=(job?.steps||[]).filter((x:any)=>x.conclusion==="failure").map((x:any)=>String(x.name));
 let log=sanitiseRepairLog(data.savedError||""),logError="";
 if(job){
  try{const response=await github(data.repo,"/actions/jobs/"+safeId(job.id)+"/logs",selection.profile);log=sanitiseRepairLog((await response.text()).slice(-80000))||log;}
  catch(e:any){logError=String(e.message||"Job logs unavailable");}
 }
 let stored:any=null;
 try{stored=await savedRepairForRun(data.repo,id,selection.profile)}catch(error){console.error("Repair history lookup unavailable",error instanceof Error?error.message:"unknown");}
 const solution=stored?.diagnosis?{category:stored.incident.classification,title:stored.diagnosis.summary,suggestion:stored.diagnosis.recommendation,confidence:"AI · "+stored.diagnosis.confidence,aiRequests:0}:explainReleaseFailure(log,failedSteps);
 return {savedAi:stored,repo:data.repo,profile:selection.profile,type,runId:Number(id),jobId:job?.id||null,sha:String(run.head_sha||""),runUrl:run.html_url||null,status:run.status,conclusion:run.conclusion,failedSteps,log,logError,solution,ready:run.conclusion==="failure"||run.conclusion==="cancelled",checkedAt:new Date().toISOString()};
});


type RepairSettings={enabled:boolean;auto_diagnose:boolean;enable_base:boolean;enable_engine:boolean;enable_release_worker:boolean;enable_sql_diagnosis:boolean;lookback_hours:number;daily_ai_limit:number;model:string;show_github_failures:boolean;auto_archive_days:number;incident_page_size:number};
const DEFAULT_REPAIR_SETTINGS:RepairSettings={enabled:false,auto_diagnose:false,enable_base:true,enable_engine:true,enable_release_worker:false,enable_sql_diagnosis:false,lookback_hours:6,daily_ai_limit:1,model:"openrouter/free",show_github_failures:true,auto_archive_days:0,incident_page_size:100};
const REPAIR_SETTINGS_FIELDS=["enabled","auto_diagnose","enable_base","enable_engine","enable_release_worker","enable_sql_diagnosis","show_github_failures"] as const;
function workerGithubToken(){return String(process.env.FALLBACK_AI_REPAIR_WORKER_GITHUB_TOKEN||process.env.AI_REPAIR_WORKER_GITHUB_TOKEN||"").trim();}
function repairDbKey(){return String(process.env.REPAIR_SUPABASE_SERVICE_ROLE_KEY||"").trim();}
async function repairDbRead(path:string,options?:{method:"GET"|"POST";body?:object}){
 const key=repairDbKey();
 if(!key)throw Error("Dev Panel database connection missing. Configure REPAIR_SUPABASE_SERVICE_ROLE_KEY in this deployment.");
 const response=await fetch("https://ffmfogljikvybzgunauo.supabase.co/rest/v1/"+path,{
  method:options?.method||"GET",headers:{apikey:key,Authorization:"Bearer "+key,Accept:"application/json","Content-Type":"application/json"},
  body:options?.body?JSON.stringify(options.body):undefined,cache:"no-store",signal:AbortSignal.timeout(8000)
 });
 if(!response.ok)throw Error("Repair database request failed: HTTP "+response.status);
 return response.status===204?null:await response.json();
}
async function repairSettings(){
 const activeProfile=(await active()).profile==="primary"?"main":"fallback";
 const rows=await repairDbRead("repair_settings?profile=eq."+activeProfile+"&limit=1");
 return {profile:activeProfile,settings:{...DEFAULT_REPAIR_SETTINGS,...(rows?.[0]||{})}};
}
async function requireAiRepairEnabled(){
 const state=await repairSettings();
 if(state.settings?.enabled!==true)throw Error("AI Repair Centre is disabled for this mode. Enable it in AI Repair settings.");
}
export const getAiRepairControls=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string}})=>{
 requireOwner(data.token);
 const selection=await active();
 const profile=selection.profile==="primary"?"main":"fallback";
 const connected=Boolean(repairDbKey());
 if(!connected)return {profile,connected:false,settings:null,counts:null,workerDispatchConfigured:false,message:"AI Repair settings unavailable: REPAIR_SUPABASE_SERVICE_ROLE_KEY is missing. Configure it for this mode; operations stay disabled."};
 const [{settings},usage,incidents]=await Promise.all([
  repairSettings(),
  repairDbRead("repair_ai_usage?select=id&usage_day=eq."+new Date().toISOString().slice(0,10)),
  repairDbRead("repair_incidents?select=id&profile=eq."+profile+"&archived_at=is.null")
 ]);
 return {profile,connected:true,settings,counts:{aiUsedToday:usage.length,storedIncidents:incidents.length},workerDispatchConfigured:Boolean(workerGithubToken())};
});
export const saveAiRepairControls=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string;settings:RepairSettings}})=>{
 requireOwner(data.token);
 const profile=(await active()).profile==="primary"?"main":"fallback";
 const input=data.settings;
 if(!input||typeof input!=="object")throw Error("Invalid settings");
 const cleaned:Record<string,boolean|number|string>={};
 for(const field of REPAIR_SETTINGS_FIELDS){if(typeof input[field]!=="boolean")throw Error("Invalid "+field);cleaned[field]=input[field];}
 if(!Number.isInteger(input.lookback_hours)||input.lookback_hours<1||input.lookback_hours>24)throw Error("Lookback must be 1–24 hours");
 if(!Number.isInteger(input.daily_ai_limit)||input.daily_ai_limit<1||input.daily_ai_limit>5)throw Error("Daily AI limit must be 1–5");
 const model=String(input.model||"");
 if(model!=="openrouter/free"&&!/^[a-zA-Z0-9._/-]+:free$/.test(model))throw Error("Only OpenRouter free models allowed");
 if(!Number.isInteger(input.auto_archive_days)||input.auto_archive_days<0||input.auto_archive_days>365)throw Error("Auto-archive days must be 0–365");
 if(!Number.isInteger(input.incident_page_size)||input.incident_page_size<20||input.incident_page_size>300)throw Error("Incident page size must be 20–300");
 cleaned.lookback_hours=input.lookback_hours;cleaned.daily_ai_limit=input.daily_ai_limit;cleaned.model=model;
 cleaned.auto_archive_days=input.auto_archive_days;cleaned.incident_page_size=input.incident_page_size;
 const saved=await repairDbRead("rpc/repair_update_settings",{method:"POST",body:{p_profile:profile,p_settings:cleaned}});
 return {profile,settings:saved,updated:true};
});
export const requestAiRepairWorkerCheck=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string;verifyOnly:boolean}})=>{
 requireOwner(data.token);
 await requireAiRepairEnabled();
 const selection=await active();
 if(data.verifyOnly!==true)throw Error("Only read-only worker verification can be dispatched here");
 const token=workerGithubToken();
 if(!token)throw Error("No GitHub token for the AI Repair worker. Set AI_REPAIR_WORKER_GITHUB_TOKEN with Actions: Write on the repair repository.");
 const response=await fetch("https://api.github.com/repos/remipetrovich-design/AI-Repair-Centre/actions/workflows/automatic-diagnosis.yml/dispatches",{
  method:"POST",headers:{Authorization:"Bearer "+token,Accept:"application/vnd.github+json","Content-Type":"application/json","X-GitHub-Api-Version":"2022-11-28"},
  body:JSON.stringify({ref:"main",inputs:{verify_only:true}}),signal:timeout()
 });
 if(!response.ok)throw Error("Verification dispatch failed: HTTP "+response.status);
 return {dispatched:true,url:"https://github.com/remipetrovich-design/AI-Repair-Centre/actions/workflows/automatic-diagnosis.yml",profile:selection.profile};
});

export const archiveAiRepairIncident=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string;incidentId:string;confirm:string}})=>{
 requireOwner(data.token);
 await requireAiRepairEnabled();
 if(data.confirm!=="DELETE_FROM_REPAIR_CENTRE")throw Error("Explicit delete confirmation required");
 if(!/^[a-f0-9]{20,64}$/.test(data.incidentId))throw Error("Invalid incident ID");
 const profile=(await active()).profile==="primary"?"main":"fallback";
 const success=await repairDbRead("rpc/repair_archive_incident",{method:"POST",body:{p_incident_id:data.incidentId,p_profile:profile}});
 return {deleted:success===true,profile,preservesAudit:true,preservesGitHub:true};
});

export const hideAiRepairGithubRun=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string;repo:string;runId:number;confirm:string}})=>{
 requireOwner(data.token);
 await requireAiRepairEnabled();
 if(data.confirm!=="HIDE_GITHUB_FAILURE")throw Error("Confirmation required");
 if(!Number.isSafeInteger(data.runId)||data.runId<=0)throw Error("Invalid run ID");
 const selection=await active();
 const allowed=[selection.baseRepo,selection.engineRepo,githubProfileDefinitions()[selection.profile].devPanel.repo];
 if(!allowed.includes(data.repo))throw Error("Repository does not belong to the active profile");
 const profile=selection.profile==="primary"?"main":"fallback";
 const result=await repairDbRead("rpc/repair_hide_run",{method:"POST",body:{p_profile:profile,p_repository:data.repo,p_run_id:data.runId}});
 return {hidden:result===true,profile,githubPreserved:true};
});

export const requestAiRepairRunDiagnosis=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string;repo:string;runId:number;confirm:string}})=>{
 requireOwner(data.token);
 await requireAiRepairEnabled();
 if(data.confirm!=="REQUEST_AI_REPAIR")throw Error("Explicit repair request confirmation required");
 if(!Number.isSafeInteger(data.runId)||data.runId<=0)throw Error("Invalid workflow run ID");
 const selection=await active();
 const allowed=[selection.baseRepo,selection.engineRepo,githubProfileDefinitions()[selection.profile].devPanel.repo];
 if(!allowed.includes(data.repo))throw Error("Cannot repair repository outside the active GitHub profile");
 const run=await(await github(data.repo,"/actions/runs/"+data.runId,selection.profile)).json();
 if(run.conclusion!=="failure")throw Error("The selected GitHub workflow is not failed");
 const repairToken=String(process.env.FALLBACK_AI_REPAIR_WORKER_GITHUB_TOKEN||process.env.AI_REPAIR_WORKER_GITHUB_TOKEN||"").trim();
 if(!repairToken)throw Error("AI_REPAIR_WORKER_GITHUB_TOKEN is missing from this Dev Panel Production environment");
 const payload={ref:"main",inputs:{verify_only:"false",apply_fix:"true",target_repo:data.repo,target_run_id:String(data.runId)}};
 const response=await fetch("https://api.github.com/repos/remipetrovich-design/AI-Repair-Centre/actions/workflows/automatic-diagnosis.yml/dispatches",{
  method:"POST",headers:{Authorization:"Bearer "+repairToken,Accept:"application/vnd.github+json","Content-Type":"application/json","X-GitHub-Api-Version":"2022-11-28"},
  body:JSON.stringify(payload),signal:timeout()
 });
 if(!response.ok){
  const code=response.status;
  if(code===401||code===403)throw Error("AI Repair worker token lacks GitHub Actions write permission (HTTP "+code+"). Check AI_REPAIR_WORKER_GITHUB_TOKEN access to remipetrovich-design/AI-Repair-Centre.");
  throw Error("Could not submit diagnosis to AI Repair worker: GitHub HTTP "+code);
 }
 return {submitted:true,profile:selection.profile,runId:data.runId,repo:data.repo,workerUrl:"https://github.com/remipetrovich-design/AI-Repair-Centre/actions/workflows/automatic-diagnosis.yml",repairRequested:true,automaticApplication:"low-risk validated main-only",publication:"manual"};
});
