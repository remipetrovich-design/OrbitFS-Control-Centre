import {createServerFn} from "@tanstack/react-start";
import {requireOwner} from "@/lib/panel.server";
import {activeGithubProfileName,githubProfileDefinitions} from "@/lib/github-profile";

const timeout=()=>AbortSignal.timeout(12000);
function source(kind:"base"|"engine",profile:"primary"|"fallback"){
 const def=githubProfileDefinitions()[profile];
 return kind==="base"?def.base.repo:def.engine.repo;
}
function token(profile:"primary"|"fallback"){
 const name=profile==="primary"?"ORBITFS_RELEASE_DISPATCH_TOKEN":"ORBITFS_FALLBACK_GITHUB_TOKEN";
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
 const selection=await active();
 const statuses=await Promise.allSettled((["base","engine"] as const).map(async kind=>{
  const repo=source(kind,selection.profile);
  const result=await(await github(repo,"/actions/runs?status=failure&per_page=15",selection.profile)).json();
  return {kind,repo,runs:(result.workflow_runs||[]).map((x:any)=>({id:x.id,repo,kind,profile:selection.profile,sha:x.head_sha,branch:x.head_branch,name:x.name,url:x.html_url,createdAt:x.created_at,conclusion:x.conclusion}))};
 }));
 const groups=statuses.map((s,i)=>s.status==="fulfilled"?s.value:{kind:i===0?"base":"engine",repo:source(i===0?"base":"engine",selection.profile),runs:[],error:String((s as PromiseRejectedResult).reason?.message||"GitHub unavailable")});
 return {selection,groups,checkedAt:new Date().toISOString(),worker:workerConfig()};
});
function workerConfig(){
 const value=String(process.env.AI_REPAIR_SERVICE_URL||"").trim();
 return {configured:Boolean(value),aiManualOnly:true,publication:"manual",mode:value?"connected-configured":"unconfigured"};
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
export const getAiRepairRun=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string;repo:string;runId:number}})=>{
 requireOwner(data.token);
 const selection=await active();
 const kind=(["base","engine"] as const).find(k=>source(k,selection.profile)===data.repo);
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
 const selection=await active();
 if(![selection.baseRepo,selection.engineRepo].includes(data.repo))throw Error("Repository is not in the active profile");
 const response=await github(data.repo,"/actions/jobs/"+safeId(data.jobId)+"/logs",selection.profile,"application/vnd.github+json");
 const raw=await response.text();
 return {log:raw.slice(-32000).replace(/(?:gh[pousr]_|github_pat_|sk-)[A-Za-z0-9_-]+/gi,"[REDACTED]").replace(/Bearer\s+\S+/gi,"Bearer [REDACTED]")};
});
export const getAiRepairServiceState=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string}})=>{
 requireOwner(data.token);
 if(!workerConfig().configured)return {configured:false,available:false,error:"Repair service not configured. Read-only GitHub inspection is available."};
 try{return {configured:true,available:true,...await repairService("status")}}catch(e:any){return {configured:true,available:false,error:e.message};}
});
export const getAiRepairIncidents=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string}})=>{
 requireOwner(data.token);
 return await repairService("incidents");
});
export const getAiRepairIncident=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string;incidentId:string;source?:boolean}})=>{
 requireOwner(data.token);
 if(!/^[a-z0-9-]{1,80}$/i.test(data.incidentId))throw Error("Invalid incident ID");
 return await repairService("incidents/"+data.incidentId+(data.source?"?source=true":""));
});
export const requestAiRepairDiagnosis=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string;incidentId:string;confirm:string}})=>{
 requireOwner(data.token);
 if(data.confirm!=="RUN_AI_DIAGNOSIS")throw Error("Explicit confirmation required");
 return await repairService("diagnose","POST",{incidentId:data.incidentId,confirm:data.confirm});
});
export const validateAiRepairProposal=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string;incidentId:string;proposal:any;confirm:string}})=>{
 requireOwner(data.token);
 if(data.confirm!=="VALIDATE_ISOLATED_REPAIR")throw Error("Explicit validation confirmation required");
 return await repairService("validate","POST",{incidentId:data.incidentId,proposal:data.proposal,confirm:data.confirm});
});
