import {createClient} from "@supabase/supabase-js";
import crypto from "node:crypto";
import {requireOwner} from "@/lib/panel.server";

export type DevControlTarget="base"|"engine"|"license_manager"|"billing_store";
export type DevControlAction="prepare_latest_source"|"quick_deploy"|"production_deploy"|"redeploy";

const TARGETS={
 base:{
  key:"base" as const,label:"V1 Base",repo:process.env.BASE_RELEASE_REPO||"lucaskerim123/V1-vercel-base",
  branch:"main",kind:"release" as const,priority:"primary" as const,releaseRef:process.env.BASE_RELEASE_REF||"base-release",promotionWorkflow:"sync-release-branch.yml",
 },
 engine:{
  key:"engine" as const,label:"V1 Engine / Updater",repo:process.env.ENGINE_RELEASE_REPO||"lucaskerim123/V1-vercel-engine",
  branch:"main",kind:"release" as const,priority:"primary" as const,releaseRef:process.env.ENGINE_RELEASE_REF||"UPDATE_RELEASE",promotionWorkflow:"sync-release-branch.yml",
 },
 license_manager:{
  key:"license_manager" as const,label:"Custom License Manager",repo:process.env.LICENSE_MANAGER_REPO||"lucaskerim123/Custom-licence-manager",
  branch:"main",kind:"service" as const,priority:"secondary" as const,
  scan:process.env.OPERATIONS_CI_WORKFLOW||"ci.yml",deploy:process.env.OPERATIONS_DEPLOY_WORKFLOW||"production-deploy.yml",quick:process.env.LICENSE_MANAGER_QUICK_DEPLOY_WORKFLOW||"quick-deploy.yml",
 },
 billing_store:{
  key:"billing_store" as const,label:"V2 Billing Store",repo:process.env.BILLING_STORE_REPO||"lucaskerim123/V2_Billing_Store",
  branch:"main",kind:"service" as const,priority:"secondary" as const,
  scan:process.env.OPERATIONS_CI_WORKFLOW||"ci.yml",deploy:process.env.OPERATIONS_DEPLOY_WORKFLOW||"production-deploy.yml",quick:process.env.BILLING_STORE_QUICK_DEPLOY_WORKFLOW||"quick-redesign-deploy.yml",
 },
};

const DEFAULT_SETTINGS={
 enabled:true,
 read_only_mode:false,
 quick_deploy_enabled:true,
 production_deploy_enabled:true,
 restart_enabled:false,
 rollback_enabled:false,
 updater_controls_enabled:true,
 license_controls_enabled:true,
 billing_controls_enabled:true,
 require_critical_confirmation:true,
 post_deploy_health_check:true,
 auto_rollback_on_failed_verification:false,
 secret_redaction:true,
 audit_logging:true,
 emergency_kill_switch:false,
 allowed_services:["base","engine","license_manager","billing_store"],
};

function required(name:string){const value=process.env[name];if(!value)throw new Error("Missing server environment variable: "+name);return value}
function sb(){return createClient(required("SUPABASE_URL"),required("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false}})}
function targetConfig(target:string){const cfg=TARGETS[target as DevControlTarget];if(!cfg)throw new Error("Unknown Dev Control target");return cfg}
function serviceTargetConfig(target:string){const cfg=targetConfig(target);if(cfg.kind!=="service")throw new Error("This action belongs to Operations and is only valid for service targets");return cfg}
function cleanRun(run:any){return run?{id:Number(run.id),name:run.name,status:run.status,conclusion:run.conclusion,run_number:run.run_number,head_sha:run.head_sha,head_branch:run.head_branch,event:run.event,created_at:run.created_at,updated_at:run.updated_at,html_url:run.html_url}:null}
async function github(path:string,init:RequestInit={}){
 const response=await fetch("https://api.github.com"+path,{
  ...init,
  headers:{accept:"application/vnd.github+json",authorization:"Bearer "+required("ORBITFS_RELEASE_DISPATCH_TOKEN"),"x-github-api-version":process.env.GITHUB_API_VERSION||"2022-11-28","content-type":"application/json",...(init.headers||{})},
  cache:"no-store",
 });
 const text=await response.text();
 let body:any=null;try{body=text?JSON.parse(text):null}catch{}
 if(!response.ok)throw new Error(body?.message||("GitHub API returned HTTP "+response.status));
 return body;
}
export function devControlBearer(request:Request){return String(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim()}
export function requireDevControlOwner(request:Request){
 const token=devControlBearer(request);
 if(!token)throw new Error("UNAUTHORIZED");
 const apiToken=String(process.env.DEV_CONTROL_API_TOKEN||"").trim();
 if(apiToken){
  const a=Buffer.from(token),b=Buffer.from(apiToken);
  if(a.length===b.length&&crypto.timingSafeEqual(a,b))return {id:null,email:"dev-control-api",display_name:"Dev Control API",role:"owner",service:true};
 }
 return requireOwner(token);
}
export function devControlTargetList(){return Object.values(TARGETS).map((x:any)=>({key:x.key,label:x.label,repo:x.repo,branch:x.branch,kind:x.kind,priority:x.priority,releaseRef:x.releaseRef||null}))}

export async function getDevControlSettings(){
 const client=sb();
 const {data,error}=await client.from("dev_control_settings").select("*").eq("id",true).maybeSingle();
 if(error){
  if(error.code==="42P01")return {...DEFAULT_SETTINGS,storageReady:false};
  throw new Error("Unable to load Dev Control settings");
 }
 return {...DEFAULT_SETTINGS,...(data||{}),allowed_services:Array.isArray(data?.allowed_services)?data.allowed_services:DEFAULT_SETTINGS.allowed_services,storageReady:true};
}

const BOOLEAN_SETTINGS=new Set([
 "enabled","read_only_mode","quick_deploy_enabled","production_deploy_enabled","restart_enabled","rollback_enabled",
 "updater_controls_enabled","license_controls_enabled","billing_controls_enabled","require_critical_confirmation",
 "post_deploy_health_check","auto_rollback_on_failed_verification","secret_redaction","audit_logging","emergency_kill_switch",
]);

export async function updateDevControlSettings(actor:any,patch:Record<string,unknown>){
 const current=await getDevControlSettings();
 if(!current.storageReady)throw new Error("Dev Control database migration has not been applied");
 const clean:any={updated_by:actor.id,updated_at:new Date().toISOString()};
 for(const [key,value] of Object.entries(patch||{})){
  if(BOOLEAN_SETTINGS.has(key)&&typeof value==="boolean")clean[key]=value;
  if(key==="allowed_services"&&Array.isArray(value)){
   const allowed=value.map(String).filter(x=>["base","engine","license_manager","billing_store"].includes(x));
   clean.allowed_services=[...new Set(allowed)];
  }
 }
 if(Object.keys(clean).length<=2)throw new Error("No valid Dev Control settings supplied");
 const client=sb();
 const {data,error}=await client.from("dev_control_settings").update(clean).eq("id",true).select("*").single();
 if(error)throw new Error("Unable to update Dev Control settings");
 if(data.audit_logging!==false){
  await client.from("dev_control_audit").insert({actor_id:actor.id,actor_email:actor.email,action:"settings.update",target:"dev_control",detail:{changed:Object.keys(clean).filter(x=>!["updated_by","updated_at"].includes(x))}});
 }
 return {...DEFAULT_SETTINGS,...data,storageReady:true};
}

const DEFAULT_MCP_SETTINGS={
 enabled:true,
 read_only_mode:false,
 allow_mutations:true,
 require_critical_confirmation:true,
 expose_base:true,
 expose_engine:true,
 expose_license_manager:true,
 expose_billing_store:true,
 expose_authority_controls:true,
 audit_logging:true,
};

export async function getDevMcpSettings(){
 const {data,error}=await sb().from("dev_mcp_settings").select("*").eq("id",true).maybeSingle();
 if(error){if(error.code==="42P01")return {...DEFAULT_MCP_SETTINGS,storageReady:false};throw new Error("Unable to load MCP settings")}
 return {...DEFAULT_MCP_SETTINGS,...(data||{}),storageReady:true};
}

const MCP_BOOLEAN_SETTINGS=new Set(Object.keys(DEFAULT_MCP_SETTINGS));
export async function updateDevMcpSettings(actor:any,patch:Record<string,unknown>){
 const clean:any={updated_by:actor.id,updated_at:new Date().toISOString()};
 for(const [key,value] of Object.entries(patch||{}))if(MCP_BOOLEAN_SETTINGS.has(key)&&typeof value==="boolean")clean[key]=value;
 if(Object.keys(clean).length<=2)throw new Error("No valid MCP settings supplied");
 const {data,error}=await sb().from("dev_mcp_settings").update(clean).eq("id",true).select("*").single();
 if(error)throw new Error("Unable to update MCP settings");
 await recordDevControlAudit(actor,"mcp.settings.update","dev_mcp",{changed:Object.keys(clean).filter(x=>!["updated_by","updated_at"].includes(x))});
 return {...DEFAULT_MCP_SETTINGS,...data,storageReady:true};
}

async function latestRuns(cfg:any){
 const [ref,scan,deploy,quick]=await Promise.all([
  github("/repos/"+cfg.repo+"/git/ref/heads/"+encodeURIComponent(cfg.branch)),
  github("/repos/"+cfg.repo+"/actions/workflows/"+cfg.scan+"/runs?branch="+encodeURIComponent(cfg.branch)+"&per_page=5"),
  github("/repos/"+cfg.repo+"/actions/workflows/"+cfg.deploy+"/runs?branch="+encodeURIComponent(cfg.branch)+"&per_page=5"),
  github("/repos/"+cfg.repo+"/actions/workflows/"+cfg.quick+"/runs?branch="+encodeURIComponent(cfg.branch)+"&per_page=5"),
 ]);
 const sha=String(ref?.object?.sha||"");
 const scans=(scan?.workflow_runs||[]).map(cleanRun);
 const deploys=(deploy?.workflow_runs||[]).map(cleanRun);
 const quicks=(quick?.workflow_runs||[]).map(cleanRun);
 const successful=[...deploys,...quicks].filter((x:any)=>x?.conclusion==="success").sort((a:any,b:any)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime());
 const active=[...scans,...deploys,...quicks].filter((x:any)=>x&&x.status!=="completed").sort((a:any,b:any)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime())[0]||null;
 return {sha,scan:scans[0]||null,deploy:deploys[0]||null,quick:quicks[0]||null,lastSuccessful:successful[0]||null,active};
}

export async function getDevControlSystems(){
 const settings=await getDevControlSettings();
 const systems=await Promise.all(Object.values(TARGETS).map(async (cfg:any)=>{
  try{
   if(cfg.kind==="release"){
    const [mainRef,releaseRef,runs]=await Promise.all([
     github("/repos/"+cfg.repo+"/git/ref/heads/"+encodeURIComponent(cfg.branch)),
     github("/repos/"+cfg.repo+"/git/ref/heads/"+encodeURIComponent(cfg.releaseRef)),
     github("/repos/"+cfg.repo+"/actions/workflows/"+cfg.promotionWorkflow+"/runs?per_page=5"),
    ]);
    const currentSha=String(mainRef?.object?.sha||""),preparedSha=String(releaseRef?.object?.sha||"");
    const latestPromotion=cleanRun((runs?.workflow_runs||[])[0]);
    return {key:cfg.key,label:cfg.label,repo:cfg.repo,branch:cfg.branch,kind:cfg.kind,priority:cfg.priority,releaseRef:cfg.releaseRef,ok:true,currentSha,preparedSha,preparedCurrent:Boolean(currentSha&&preparedSha===currentSha),latestPromotion};
   }
   const runs=await latestRuns(cfg);
   return {key:cfg.key,label:cfg.label,repo:cfg.repo,branch:cfg.branch,kind:cfg.kind,priority:cfg.priority,ok:true,currentSha:runs.sha,productionSha:runs.lastSuccessful?.head_sha||null,productionCurrent:Boolean(runs.sha&&runs.lastSuccessful?.head_sha===runs.sha),latestScan:runs.scan,latestDeploy:runs.deploy,latestQuickDeploy:runs.quick,activeRun:runs.active};
  }catch(error:any){
   return {key:cfg.key,label:cfg.label,repo:cfg.repo,branch:cfg.branch,kind:cfg.kind,priority:cfg.priority,ok:false,error:error?.message||"Unable to inspect target"};
  }
 }));
 return {settings,systems,checkedAt:new Date().toISOString()};
}

async function findRun(cfg:any,workflow:string,startedAt:number){
 for(let i=0;i<8;i++){
  const rows=await github("/repos/"+cfg.repo+"/actions/workflows/"+workflow+"/runs?branch="+encodeURIComponent(cfg.branch)+"&per_page=10");
  const run=(rows?.workflow_runs||[]).find((x:any)=>new Date(x.created_at).getTime()>=startedAt-3000);
  if(run)return cleanRun(run);
  await new Promise(resolve=>setTimeout(resolve,600));
 }
 return null;
}

async function audit(actor:any,action:string,target:string|null,jobId:string|null,detail:any={}){
 const settings=await getDevControlSettings();
 if(settings.audit_logging===false||settings.storageReady===false)return;
 await sb().from("dev_control_audit").insert({actor_id:actor.id,actor_email:actor.email,action,target,job_id:jobId,detail});
}

export async function recordDevControlAudit(actor:any,action:string,target:string|null,detail:any={}){
 return audit(actor,action,target,null,detail);
}

async function createJob(actor:any,input:{action:string;target:string;sourceRef?:string|null;sourceSha?:string|null;workflow?:string|null;detail?:any}){
 const settings=await getDevControlSettings();
 if(!settings.storageReady)return {id:crypto.randomUUID(),ephemeral:true};
 const {data,error}=await sb().from("dev_control_jobs").insert({action:input.action,target:input.target,status:"queued",source_ref:input.sourceRef||null,source_sha:input.sourceSha||null,workflow:input.workflow||null,requested_by:actor.id,requested_by_email:actor.email,detail:input.detail||{}}).select("id").single();
 if(error)throw new Error("Unable to create Dev Control job");
 return data;
}
async function updateJob(id:string,patch:any){const settings=await getDevControlSettings();if(settings.storageReady===false)return;await sb().from("dev_control_jobs").update({...patch,updated_at:new Date().toISOString()}).eq("id",id)}

export async function preparePrimaryReleaseSource(actor:any,target:"base"|"engine",confirm=false){
 const settings=await getDevControlSettings();
 const mcp=await getDevMcpSettings();
 if(settings.enabled===false||settings.read_only_mode||settings.emergency_kill_switch)throw new Error("Dev Control mutations are blocked");
 if(mcp.enabled===false||mcp.read_only_mode||mcp.allow_mutations===false)throw new Error("MCP mutations are blocked");
 if(mcp.require_critical_confirmation&&!confirm)throw new Error("Explicit confirmation is required");
 if(!settings.allowed_services.includes(target))throw new Error("Target is not allowed by Dev Control settings");
 const cfg:any=targetConfig(target);
 if(cfg.kind!=="release")throw new Error("Release source preparation is only valid for Base or Engine");
 const current=await github("/repos/"+cfg.repo+"/git/ref/heads/"+encodeURIComponent(cfg.branch));
 const sourceSha=String(current?.object?.sha||"");
 const job=await createJob(actor,{action:"prepare_release_source",target,sourceRef:cfg.branch,sourceSha,workflow:cfg.promotionWorkflow,detail:{repo:cfg.repo,label:cfg.label,releaseRef:cfg.releaseRef}});
 await audit(actor,"job.requested",target,job.id,{action:"prepare_release_source",source_sha:sourceSha,workflow:cfg.promotionWorkflow});
 try{
  const startedAt=Date.now();
  await github("/repos/"+cfg.repo+"/actions/workflows/"+cfg.promotionWorkflow+"/dispatches",{method:"POST",body:JSON.stringify({ref:cfg.branch,inputs:{confirmation:"PROMOTE"}})});
  const run=await findRun(cfg,cfg.promotionWorkflow,startedAt);
  await updateJob(job.id,{status:run?.status||"queued",external_run_id:run?.id||null,external_run_url:run?.html_url||null});
  await audit(actor,"job.dispatched",target,job.id,{action:"prepare_release_source",run_id:run?.id||null});
  return {ok:true,jobId:job.id,target,sourceSha,releaseRef:cfg.releaseRef,run,message:cfg.label+" release-source preparation queued."};
 }catch(error:any){
  await updateJob(job.id,{status:"failed",error:error?.message||"Dispatch failed",completed_at:new Date().toISOString()});
  await audit(actor,"job.failed",target,job.id,{action:"prepare_release_source",error:error?.message||"Dispatch failed"});
  throw error;
 }
}

export async function runDevControlAction(actor:any,input:{action:DevControlAction;target:DevControlTarget;confirm?:boolean}){
 const settings=await getDevControlSettings();
 const envEnabled=String(process.env.DEV_CONTROL_ENABLED||"true").toLowerCase()!=="false";
 if(!envEnabled||settings.enabled===false)throw new Error("Dev Control is disabled");
 if(settings.emergency_kill_switch)throw new Error("Dev Control emergency kill switch is active");
 if(settings.read_only_mode)throw new Error("Dev Control is in read-only mode");
 if(!settings.allowed_services.includes(input.target))throw new Error("Target is not allowed by Dev Control settings");
 const cfg=serviceTargetConfig(input.target);
 const action=input.action;
 const critical=action==="quick_deploy"||action==="production_deploy"||action==="redeploy";
 if(critical&&settings.require_critical_confirmation&&!input.confirm)throw new Error("Explicit confirmation is required for this production action");
 if(action==="quick_deploy"&&!settings.quick_deploy_enabled)throw new Error("Quick Deploy is disabled");
 if((action==="production_deploy"||action==="redeploy")&&!settings.production_deploy_enabled)throw new Error("Production Deploy is disabled");

 const before=await latestRuns(cfg);
 let workflow=cfg.scan;
 if(action==="quick_deploy")workflow=cfg.quick;
 if(action==="production_deploy"||action==="redeploy")workflow=cfg.deploy;

 if(action==="production_deploy"||action==="redeploy"){
  if(action==="production_deploy"&&before.lastSuccessful?.head_sha===before.sha)throw new Error("The current source is already deployed. Use redeploy instead.");
  const scans=await github("/repos/"+cfg.repo+"/actions/workflows/"+cfg.scan+"/runs?branch="+encodeURIComponent(cfg.branch)+"&event=workflow_dispatch&per_page=50");
  const exact=(scans?.workflow_runs||[]).filter((x:any)=>x.head_sha===before.sha).sort((a:any,b:any)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime())[0];
  if(!exact||exact.status!=="completed"||exact.conclusion!=="success")throw new Error("Production Deploy is blocked until the exact current source commit has a successful Full Scan");
 }

 const job=await createJob(actor,{action,target:input.target,sourceRef:cfg.branch,sourceSha:before.sha,workflow,detail:{repo:cfg.repo,label:cfg.label}});
 await audit(actor,"job.requested",input.target,job.id,{action,source_sha:before.sha,workflow});
 try{
  const dispatch:any={ref:cfg.branch};
  if(action==="quick_deploy"&&input.target==="billing_store")dispatch.inputs={branch:"main"};
  const startedAt=Date.now();
  await github("/repos/"+cfg.repo+"/actions/workflows/"+workflow+"/dispatches",{method:"POST",body:JSON.stringify(dispatch)});
  const run=await findRun(cfg,workflow,startedAt);
  await updateJob(job.id,{status:run?.status||"queued",external_run_id:run?.id||null,external_run_url:run?.html_url||null});
  await audit(actor,"job.dispatched",input.target,job.id,{action,workflow,run_id:run?.id||null});
  return {ok:true,jobId:job.id,action,target:input.target,sourceSha:before.sha,workflow,run,message:cfg.label+" "+action.replaceAll("_"," ")+" queued."};
 }catch(error:any){
  await updateJob(job.id,{status:"failed",error:error?.message||"Dispatch failed",completed_at:new Date().toISOString()});
  await audit(actor,"job.failed",input.target,job.id,{action,error:error?.message||"Dispatch failed"});
  throw error;
 }
}

export async function getDevControlJobs(limit=25){
 const settings=await getDevControlSettings();
 if(!settings.storageReady)return {jobs:[],storageReady:false};
 const {data,error}=await sb().from("dev_control_jobs").select("*").order("created_at",{ascending:false}).limit(Math.min(100,Math.max(1,limit)));
 if(error)throw new Error("Unable to load Dev Control jobs");
 const jobs=await Promise.all((data||[]).map(async row=>{
  if(!row.external_run_id)return row;
  try{
   const cfg=targetConfig(row.target);
   const run=cleanRun(await github("/repos/"+cfg.repo+"/actions/runs/"+row.external_run_id));
   const status=run?.status==="completed"?(run.conclusion||"completed"):(run?.status||row.status);
   if(status!==row.status){
    await updateJob(row.id,{status,completed_at:run?.status==="completed"?run.updated_at:null,external_run_url:run?.html_url||row.external_run_url});
   }
   return {...row,status,run};
  }catch{return row}
 }));
 return {jobs,storageReady:true};
}

async function refreshDevControlJob(row:any){
 if(!row?.external_run_id)return row;
 try{
  const cfg=targetConfig(row.target);
  const run=cleanRun(await github("/repos/"+cfg.repo+"/actions/runs/"+row.external_run_id));
  const status=run?.status==="completed"?(run.conclusion||"completed"):(run?.status||row.status);
  if(status!==row.status||run?.html_url!==row.external_run_url){
   await updateJob(row.id,{status,completed_at:run?.status==="completed"?run.updated_at:null,external_run_url:run?.html_url||row.external_run_url});
  }
  return {...row,status,run};
 }catch{return row}
}

export async function getDevControlJob(jobId:string){
 const {data,error}=await sb().from("dev_control_jobs").select("*").eq("id",jobId).maybeSingle();
 if(error||!data)throw new Error("Dev Control job not found");
 const row=await refreshDevControlJob(data);
 let console:any[]=[];
 if(row.external_run_id){
  try{
   const cfg=targetConfig(row.target);
   const payload=await github("/repos/"+cfg.repo+"/actions/runs/"+row.external_run_id+"/jobs?filter=latest&per_page=100");
   console=(payload?.jobs||[]).map((job:any)=>({
    id:job.id,name:job.name,status:job.status,conclusion:job.conclusion,started_at:job.started_at,completed_at:job.completed_at,html_url:job.html_url,
    steps:(job.steps||[]).map((step:any)=>({number:step.number,name:step.name,status:step.status,conclusion:step.conclusion,started_at:step.started_at,completed_at:step.completed_at}))
   }));
  }catch{}
 }
 return {...row,console};
}

export async function controlDevControlJob(actor:any,jobId:string,action:"cancel"|"retry"){
 const settings=await getDevControlSettings();
 if(settings.enabled===false||settings.read_only_mode||settings.emergency_kill_switch)throw new Error("Dev Control mutations are blocked");
 const {data,error}=await sb().from("dev_control_jobs").select("*").eq("id",jobId).maybeSingle();
 if(error||!data)throw new Error("Dev Control job not found");
 if(!data.external_run_id)throw new Error("Job has no attached workflow run");
 const cfg=targetConfig(data.target);
 if(action==="cancel"){
  await github("/repos/"+cfg.repo+"/actions/runs/"+data.external_run_id+"/cancel",{method:"POST",body:"{}"});
  await updateJob(jobId,{status:"cancelling"});
 }else{
  await github("/repos/"+cfg.repo+"/actions/runs/"+data.external_run_id+"/rerun",{method:"POST",body:"{}"});
  await updateJob(jobId,{status:"queued",error:null,completed_at:null});
 }
 await audit(actor,"job."+action,data.target,jobId,{run_id:data.external_run_id});
 return getDevControlJob(jobId);
}

export async function getDevControlAudit(limit=100){
 const {data,error}=await sb().from("dev_control_audit").select("*").order("created_at",{ascending:false}).limit(Math.min(200,Math.max(1,limit)));
 if(error)throw new Error("Unable to load Dev Control audit");
 return {events:data||[]};
}

export async function licenseManagerRequest(path:string,init:RequestInit={}){
 const base=String(process.env.LICENSE_MASTER_URL||"").replace(/\/+$/,"");
 if(!base)throw new Error("LICENSE_MASTER_URL is not configured");
 const token=String(process.env.LICENSE_MASTER_CONTROL_API_TOKEN||process.env.LICENSE_MASTER_API_TOKEN||"").trim();if(!token)throw new Error("License Manager control API token is not configured");
 const response=await fetch(base+path,{...init,headers:{authorization:"Bearer "+token,"content-type":"application/json",...(init.headers||{})},cache:"no-store"});
 const text=await response.text();let body:any={};try{body=text?JSON.parse(text):{}}catch{body={raw:text}}
 if(!response.ok)throw new Error(body?.error||body?.message||("License Manager returned HTTP "+response.status));
 return body;
}

export async function licenseManagerRecoveryRequest(init:RequestInit={}){
 const base=String(process.env.LICENSE_MASTER_URL||"").replace(/\/+$/,"");
 if(!base)throw new Error("LICENSE_MASTER_URL is not configured");
 const token=String(process.env.LICENSE_MANAGER_LOCKDOWN_RECOVERY_TOKEN||"").trim();
 if(!token)throw new Error("License Manager lockdown recovery token is not configured");
 const response=await fetch(base+"/lockdown/recover",{...init,headers:{authorization:"Bearer "+token,"content-type":"application/json",...(init.headers||{})},cache:"no-store"});
 const text=await response.text();let body:any={};try{body=text?JSON.parse(text):{}}catch{body={raw:text}}
 if(!response.ok)throw new Error(body?.error||body?.message||body?.code||("License Manager recovery returned HTTP "+response.status));
 return body;
}
