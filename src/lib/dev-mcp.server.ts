import {createClient} from "@supabase/supabase-js";
import {createServerFn} from "@tanstack/react-start";
import crypto from "node:crypto";
import {inspectSourceCore,requireOwner,startReleaseCore} from "@/lib/panel.server";
import {oauthAdminState,revokeOAuthConnection} from "@/lib/dev-oauth.server";
import {activeGithubProfile,activeGithubProfileName,githubToken,githubProfiles} from "@/lib/github-profile";

type ReleaseTarget="base"|"engine";
type ServiceTarget="license_manager"|"billing_store";

export const DEFAULT_MCP_SETTINGS={
 enabled:true,read_only_mode:false,allow_mutations:true,
 expose_base:true,expose_engine:true,expose_license_manager:true,expose_billing_store:true,
 tool_show_dev:true,tool_status:true,tool_prepare:true,tool_deploy:true,tool_release:true,tool_update:true,tool_license:true,tool_license_change:true,tool_diagnose:true,tool_logs:true,
 allow_prepare:true,allow_service_scan:true,allow_service_deploy:true,allow_quick_deploy:true,allow_workflow_control:true,
 allow_release_review:true,allow_release_publish:true,allow_release_rollback:true,
 allow_update_apply:true,allow_update_rollback:true,
 allow_license_state_changes:true,allow_license_entitlement_changes:true,allow_installation_unlock:true,allow_license_linking:true,
 ui_enabled:true,ui_fullscreen_enabled:true,ui_pip_enabled:true,
 oauth_dcr_enabled:true,oauth_cimd_enabled:true,oauth_refresh_tokens_enabled:true
};

function required(name:string){const value=process.env[name];if(!value)throw new Error("Missing server environment variable: "+name);return value}
function db(){return createClient(required("SUPABASE_URL"),required("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false}})}
function compactSettings(row:any){return {...DEFAULT_MCP_SETTINGS,...Object.fromEntries(Object.keys(DEFAULT_MCP_SETTINGS).filter(k=>row?.[k]!==undefined).map(k=>[k,Boolean(row[k])]))}}
export async function getMcpSettings(){
 try{
  const {data,error}=await db().from("dev_mcp_settings").select("*").eq("id",true).maybeSingle();
  if(error)return {...DEFAULT_MCP_SETTINGS,storageReady:false,storageError:String(error.message||error.code||"MCP settings storage unavailable")};
  if(!data)return {...DEFAULT_MCP_SETTINGS,storageReady:false,storageError:"MCP settings row is missing"};
  return {...compactSettings(data),storageReady:true,storageError:null};
 }catch(error:any){
  return {...DEFAULT_MCP_SETTINGS,storageReady:false,storageError:String(error?.message||"MCP settings storage unavailable")};
 }
}
export async function updateMcpSettings(actor:any,patch:Record<string,unknown>){
 if(Object.prototype.hasOwnProperty.call(patch||{},"github_profile"))throw new Error("GitHub profile is controlled only from Dev Panel Configuration and cannot be changed through MCP settings.");
 const clean:any={updated_by:actor.id,updated_at:new Date().toISOString()};
 for(const key of Object.keys(DEFAULT_MCP_SETTINGS))if(typeof patch?.[key]==="boolean")clean[key]=patch[key];
 if(Object.keys(clean).length<=2)throw new Error("No valid MCP settings supplied");
 const {data,error}=await db().from("dev_mcp_settings").upsert({id:true,...clean},{onConflict:"id"}).select("*").single();
 if(error)throw new Error("Unable to update MCP settings: "+String(error.message||error.code||"storage error"));
 return {...compactSettings(data),storageReady:true,storageError:null};
}
export const getMcpSettingsForPanel=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string}})=>{
 requireOwner(data.token);
 const origin=String(process.env.DEV_MCP_PUBLIC_ORIGIN||process.env.APP_URL||"https://dev.incendiarynetworks.cc").replace(/\/+$/,"");
 return {settings:await getMcpSettings(),github:{active:await activeGithubProfileName(),profiles:await githubProfiles()},runtime:{
  endpoint:origin+"/devmcp",oauth:true,ownerOnly:true,pkce:"S256",resourceBinding:true,
  protectedResourceMetadata:origin+"/.well-known/oauth-protected-resource",
  authorizationMetadata:origin+"/.well-known/oauth-authorization-server",
  authorizeEndpoint:origin+"/oauth/authorize",tokenEndpoint:origin+"/oauth/token",registrationEndpoint:origin+"/oauth/register"
 }};
});
export const updateMcpSettingsForPanel=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string;patch:Record<string,unknown>}})=>{
 const actor=requireOwner(data.token);return {settings:await updateMcpSettings(actor,data.patch||{})};
});
export const getMcpConnectionsForPanel=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string}})=>{
 requireOwner(data.token);return oauthAdminState();
});
export const manageMcpConnectionForPanel=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string;clientId?:string;removeClient?:boolean;all?:boolean}})=>{
 requireOwner(data.token);return revokeOAuthConnection({clientId:data.clientId,removeClient:data.removeClient===true,all:data.all===true});
});

function cleanRun(run:any){return run?{id:Number(run.id),name:run.name,status:run.status,conclusion:run.conclusion,run_number:run.run_number,head_sha:run.head_sha,head_branch:run.head_branch,event:run.event,created_at:run.created_at,updated_at:run.updated_at,html_url:run.html_url}:null}
const githubReadCache=new Map<string,{value:any;expires:number;staleUntil:number}>();
let githubRateLimitedUntil=0;
async function github(path:string,init:RequestInit={}){
 const method=String(init.method||"GET").toUpperCase();
 const key=method==="GET"?path:"";
 const cached=key?githubReadCache.get(key):null;
 if(cached&&cached.expires>Date.now())return cached.value;
 if(method==="GET"&&githubRateLimitedUntil>Date.now()){
  if(cached&&cached.staleUntil>Date.now())return cached.value;
  throw new Error("GitHub API rate limit is cooling down; retry after the reset window.");
 }
 const response=await fetch("https://api.github.com"+path,{...init,headers:{accept:"application/vnd.github+json",authorization:"Bearer "+await githubToken(),"x-github-api-version":process.env.GITHUB_API_VERSION||"2022-11-28","content-type":"application/json",...(init.headers||{})},cache:"no-store"});
 const text=await response.text();let body:any=null;try{body=text?JSON.parse(text):null}catch{}
 if(!response.ok){
  if(response.status===403||response.status===429){
   const reset=Number(response.headers.get("x-ratelimit-reset")||0)*1000;
   githubRateLimitedUntil=Math.max(githubRateLimitedUntil,reset>Date.now()?reset:Date.now()+60000);
  }
  if(cached&&cached.staleUntil>Date.now())return cached.value;
  throw new Error(body?.message||("GitHub API returned HTTP "+response.status));
 }
 if(key)githubReadCache.set(key,{value:body,expires:Date.now()+15000,staleUntil:Date.now()+5*60*1000});
 else githubReadCache.clear();
 return body;
}
async function findRun(repo:string,workflow:string,branch:string,startedAt:number){
 for(let i=0;i<8;i++){
  const rows=await github("/repos/"+repo+"/actions/workflows/"+encodeURIComponent(workflow)+"/runs?branch="+encodeURIComponent(branch)+"&per_page=10");
  const run=(rows?.workflow_runs||[]).find((x:any)=>new Date(x.created_at).getTime()>=startedAt-3000);
  if(run)return cleanRun(run);
  await new Promise(resolve=>setTimeout(resolve,600));
 }
 return null;
}
async function releaseCfg(target:ReleaseTarget){
 const profile=await activeGithubProfile();
 return target==="base"
  ?{key:"base" as const,label:"V1 Base",repo:profile.base.repo,branch:profile.base.branch,releaseRef:profile.base.releaseRef,workflow:"sync-release-branch.yml"}
  :{key:"engine" as const,label:"V1 Engine",repo:profile.engine.repo,branch:profile.engine.branch,releaseRef:profile.engine.releaseRef,workflow:"sync-release-branch.yml"};
}
async function serviceCfg(target:ServiceTarget){
 const profile=await activeGithubProfile();
 return target==="license_manager"
  ?{key:"license_manager" as const,label:"Custom License Manager",repo:profile.licenseManager.repo,branch:profile.licenseManager.branch,scan:process.env.OPERATIONS_CI_WORKFLOW||"ci.yml",deploy:process.env.OPERATIONS_DEPLOY_WORKFLOW||"production-deploy.yml",quick:process.env.LICENSE_MANAGER_QUICK_DEPLOY_WORKFLOW||"quick-deploy.yml"}
  :{key:"billing_store" as const,label:"V2 Billing Store",repo:profile.billingStore.repo,branch:profile.billingStore.branch,scan:process.env.OPERATIONS_CI_WORKFLOW||"ci.yml",deploy:process.env.OPERATIONS_DEPLOY_WORKFLOW||"production-deploy.yml",quick:process.env.BILLING_STORE_QUICK_DEPLOY_WORKFLOW||"quick-redesign-deploy.yml"};
}

export async function releaseBranchState(target:ReleaseTarget){
 const cfg=await releaseCfg(target);
 const [mainRef,releaseRef,runs]=await Promise.all([
  github("/repos/"+cfg.repo+"/git/ref/heads/"+encodeURIComponent(cfg.branch)),
  github("/repos/"+cfg.repo+"/git/ref/heads/"+encodeURIComponent(cfg.releaseRef)).catch(()=>null),
  github("/repos/"+cfg.repo+"/actions/workflows/"+encodeURIComponent(cfg.workflow)+"/runs?branch="+encodeURIComponent(cfg.branch)+"&per_page=5").catch(()=>({workflow_runs:[]}))
 ]);
 const currentSha=String(mainRef?.object?.sha||""),preparedSha=String(releaseRef?.object?.sha||"");
 let compare:any=null;
 if(preparedSha&&currentSha&&preparedSha!==currentSha)compare=await github("/repos/"+cfg.repo+"/compare/"+preparedSha+"..."+currentSha).catch(()=>null);
 const latestPrepare=cleanRun((runs?.workflow_runs||[])[0]||null);
 return {
  target,label:cfg.label,repo:cfg.repo,sourceBranch:cfg.branch,releaseBranch:cfg.releaseRef,
  currentSha,preparedSha,preparedCurrent:Boolean(currentSha&&preparedSha===currentSha),
  commitsAhead:Number(compare?.ahead_by||0),commitsBehind:Number(compare?.behind_by||0),
  changedFiles:Array.isArray(compare?.files)?compare.files.map((f:any)=>({path:f.filename,status:f.status,additions:f.additions,deletions:f.deletions,changes:f.changes})):[],
  changedFileCount:Array.isArray(compare?.files)?compare.files.length:0,
  latestPrepare
 };
}
async function assertTargetEnabled(target?:ReleaseTarget|ServiceTarget){
 const settings=await getMcpSettings();
 if(settings.enabled===false)throw new Error("Dev MCP is disabled");
 if(target==="base"&&!settings.expose_base)throw new Error("Base tools are disabled");
 if(target==="engine"&&!settings.expose_engine)throw new Error("Engine tools are disabled");
 if(target==="license_manager"&&!settings.expose_license_manager)throw new Error("License Manager tools are disabled");
 if(target==="billing_store"&&!settings.expose_billing_store)throw new Error("Billing Store tools are disabled");
 return settings;
}
async function assertMutation(target?:ReleaseTarget|ServiceTarget){
 const settings=await assertTargetEnabled(target);
 if(settings.read_only_mode||settings.allow_mutations===false)throw new Error("Dev MCP mutations are disabled");
 return settings;
}
function requireSetting(settings:any,key:keyof typeof DEFAULT_MCP_SETTINGS,message:string){
 if(settings[key]===false)throw new Error(message);
}
export async function assertMcpToolEnabled(name:string){
 const settings=await getMcpSettings();
 if(settings.enabled===false)throw new Error("Dev MCP is disabled");
 const key=("tool_"+name) as keyof typeof DEFAULT_MCP_SETTINGS;
 if(Object.prototype.hasOwnProperty.call(DEFAULT_MCP_SETTINGS,key)&&settings[key]===false)throw new Error(name+" tool is disabled");
 return settings;
}
export async function prepareRelease(target:"base"|"engine"|"both"){
 const mutationSettings=await assertMutation(target==="both"?undefined:target);
 requireSetting(mutationSettings,"allow_prepare","Release preparation is disabled");
 const targets:ReleaseTarget[]=target==="both"?["base","engine"]:[target];
 const settings=await getMcpSettings();
 if(target==="both"){
  if(!settings.expose_base||!settings.expose_engine)throw new Error("Base and Engine must both be enabled to prepare both");
 }
 return {ok:true,target,results:await Promise.all(targets.map(async t=>{
  const before=await releaseBranchState(t),cfg=await releaseCfg(t);
  if(before.preparedCurrent)return {...before,queued:false,message:cfg.label+" release branch is already current."};
  const startedAt=Date.now();
  await github("/repos/"+cfg.repo+"/actions/workflows/"+encodeURIComponent(cfg.workflow)+"/dispatches",{method:"POST",body:JSON.stringify({ref:cfg.branch,inputs:{confirmation:"PROMOTE"}})});
  const run=await findRun(cfg.repo,cfg.workflow,cfg.branch,startedAt);
  return {...before,queued:true,workflow:cfg.workflow,run,message:cfg.label+" preparation queued. The workflow scans current main and only moves "+cfg.releaseRef+" after validation passes."};
 }))};
}

async function serviceState(target:ServiceTarget){
 const cfg=await serviceCfg(target);
 const [ref,scan,deploy,quick]=await Promise.all([
  github("/repos/"+cfg.repo+"/git/ref/heads/"+encodeURIComponent(cfg.branch)),
  github("/repos/"+cfg.repo+"/actions/workflows/"+encodeURIComponent(cfg.scan)+"/runs?branch="+encodeURIComponent(cfg.branch)+"&per_page=8"),
  github("/repos/"+cfg.repo+"/actions/workflows/"+encodeURIComponent(cfg.deploy)+"/runs?branch="+encodeURIComponent(cfg.branch)+"&per_page=8"),
  github("/repos/"+cfg.repo+"/actions/workflows/"+encodeURIComponent(cfg.quick)+"/runs?branch="+encodeURIComponent(cfg.branch)+"&per_page=8")
 ]);
 const currentSha=String(ref?.object?.sha||"");
 const scans=(scan?.workflow_runs||[]).map(cleanRun),deploys=(deploy?.workflow_runs||[]).map(cleanRun),quicks=(quick?.workflow_runs||[]).map(cleanRun);
 const successful=[...deploys,...quicks].filter((x:any)=>x?.conclusion==="success").sort((a:any,b:any)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime());
 const active=[...scans,...deploys,...quicks].filter((x:any)=>x&&x.status!=="completed").sort((a:any,b:any)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime())[0]||null;
 return {target,label:cfg.label,repo:cfg.repo,branch:cfg.branch,currentSha,latestScan:scans[0]||null,latestDeploy:deploys[0]||null,latestQuickDeploy:quicks[0]||null,lastSuccessful:successful[0]||null,productionCurrent:Boolean(currentSha&&successful[0]?.head_sha===currentSha),activeRun:active};
}
export async function deployService(target:ServiceTarget,action:"status"|"scan"|"deploy"|"quick_deploy"|"redeploy"|"cancel"|"retry",options:{run_id?:number}={}){
 if(action==="status"){await assertTargetEnabled(target);return serviceState(target);}
 const mutationSettings=await assertMutation(target);
 if(action==="scan")requireSetting(mutationSettings,"allow_service_scan","Service scans are disabled");
 if(action==="deploy"||action==="redeploy")requireSetting(mutationSettings,"allow_service_deploy","Service deployments are disabled");
 if(action==="quick_deploy")requireSetting(mutationSettings,"allow_quick_deploy","Quick Deploy is disabled");
 if(action==="cancel"||action==="retry")requireSetting(mutationSettings,"allow_workflow_control","Workflow cancel/retry is disabled");
 const cfg=await serviceCfg(target);
 if(action==="cancel"||action==="retry"){
  const runId=Number(options.run_id||0);if(!runId)throw new Error("run_id is required");
  await github("/repos/"+cfg.repo+"/actions/runs/"+runId+(action==="cancel"?"/cancel":"/rerun"),{method:"POST",body:"{}"});
  return {ok:true,target,action,runId,message:cfg.label+" workflow "+(action==="cancel"?"cancellation":"retry")+" requested."};
 }
 const before=await serviceState(target);
 let workflow=cfg.scan;
 if(action==="scan")workflow=cfg.scan;
 if(action==="quick_deploy")workflow=cfg.quick;
 if(action==="deploy"||action==="redeploy")workflow=cfg.deploy;
 if(action==="deploy"){
  const scans=await github("/repos/"+cfg.repo+"/actions/workflows/"+encodeURIComponent(cfg.scan)+"/runs?branch="+encodeURIComponent(cfg.branch)+"&event=workflow_dispatch&per_page=50");
  const exact=(scans?.workflow_runs||[]).find((x:any)=>x.head_sha===before.currentSha&&x.status==="completed"&&x.conclusion==="success");
  if(!exact)throw new Error("Deploy is blocked until the exact current main commit has a successful Full Scan. Run deploy with action=scan first, or use quick_deploy.");
 }
 if(action==="redeploy"&&before.lastSuccessful?.head_sha!==before.currentSha)throw new Error("Production is behind main. Redeploy would change the running version; use deploy or quick_deploy instead.");
 const startedAt=Date.now(),dispatch:any={ref:cfg.branch};
 await github("/repos/"+cfg.repo+"/actions/workflows/"+encodeURIComponent(workflow)+"/dispatches",{method:"POST",body:JSON.stringify(dispatch)});
 const run=await findRun(cfg.repo,workflow,cfg.branch,startedAt);
 return {ok:true,target,action,sourceSha:before.currentSha,branch:cfg.branch,workflow,run,message:cfg.label+" "+action.replaceAll("_"," ")+" queued."};
}

export async function licenseManagerRequest(path:string,init:RequestInit={}){
 const base=licenseManagerBase();
 const token=String(process.env.LICENSE_MASTER_CONTROL_API_TOKEN||process.env.LICENSE_MASTER_API_TOKEN||"").trim();if(!token)throw new Error("License Manager control API token is not configured");
 const response=await fetch(base+path,{...init,headers:{authorization:"Bearer "+token,"content-type":"application/json",...(init.headers||{})},cache:"no-store"});
 const text=await response.text();let body:any={};try{body=text?JSON.parse(text):{}}catch{body={raw:text}}
 if(!response.ok)throw Object.assign(new Error(body?.error||body?.message||body?.code||("License Manager returned HTTP "+response.status)),{status:response.status,body});
 return body;
}
function licenseManagerBase(){
 const raw=String(process.env.LICENSE_MASTER_URL||"https://incendiarynetworks.cc/api/v1").trim();
 let url:URL;
 try{url=new URL(raw)}catch{throw new Error("LICENSE_MASTER_URL is invalid")}
 if(url.protocol!=="https:")throw new Error("LICENSE_MASTER_URL must use HTTPS");
 const path=url.pathname.replace(/\/+$/,"");
 if(!path||path==="/")url.pathname="/api/v1";
 else if(path!=="/api/v1")throw new Error("LICENSE_MASTER_URL must point to the License Manager /api/v1 root");
 url.search="";url.hash="";
 return url.origin+url.pathname.replace(/\/+$/,"");
}
export async function licenseManagerLockdownStatus(){
 const response=await fetch(licenseManagerBase()+"/lockdown/status",{cache:"no-store",headers:{accept:"application/json"}});
 const text=await response.text();let body:any={};try{body=text?JSON.parse(text):{}}catch{body={raw:text}}
 if(!response.ok&&response.status!==423)throw Object.assign(new Error(body?.message||body?.code||("License Manager lockdown status returned HTTP "+response.status)),{status:response.status,body});
 return {
  ok:response.ok,
  locked:Boolean(body?.locked),
  code:String(body?.code|| (body?.locked?"AUTHORITY_LOCKDOWN":"AUTHORITY_AVAILABLE")),
  message:body?.message||null,
  lockedAt:body?.locked_at||body?.lockedAt||null
 };
}
export async function licenseManagerLockdownControl(input:{action:"status"|"lock"|"unlock";reason?:string;message?:string}){
 const action=input.action;
 if(action==="status")return licenseManagerLockdownStatus();
 if(action==="lock"){
  const reason=String(input.reason||"Emergency lockdown from private Dev MCP").trim();
  if(!reason)throw new Error("Lockdown reason is required");
  const result=await licenseManagerRequest("/lockdown",{method:"POST",body:JSON.stringify({confirm:"LOCKDOWN",reason,message:input.message||undefined})});
  return {ok:true,action:"lock",locked:true,code:result?.code||"AUTHORITY_LOCKDOWN",message:result?.message||null,lockedAt:result?.lockedAt||result?.locked_at||null};
 }
 const recoveryToken=String(process.env.LICENSE_MASTER_LOCKDOWN_RECOVERY_TOKEN||"").trim();
 if(!recoveryToken)throw new Error("LICENSE_MASTER_LOCKDOWN_RECOVERY_TOKEN is not configured in Dev Panel");
 const response=await fetch(licenseManagerBase()+"/lockdown/recover",{
  method:"POST",cache:"no-store",
  headers:{authorization:"Bearer "+recoveryToken,"content-type":"application/json"},
  body:JSON.stringify({confirm:"UNLOCK",reason:String(input.reason||"Owner recovery from private Dev MCP").trim()||"Owner recovery from private Dev MCP"})
 });
 const text=await response.text();let body:any={};try{body=text?JSON.parse(text):{}}catch{body={raw:text}}
 if(!response.ok)throw Object.assign(new Error(body?.error||body?.message||body?.code||("License Manager recovery returned HTTP "+response.status)),{status:response.status,body});
 return {ok:true,action:"unlock",locked:false,code:body?.code||"AUTHORITY_AVAILABLE",message:body?.message||null};
}
export const getLicenseManagerLockdownForPanel=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string}})=>{
 requireOwner(data.token);return licenseManagerLockdownStatus();
});
export const setLicenseManagerLockdownForPanel=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string;action:"lock"|"unlock";reason?:string;message?:string}})=>{
 requireOwner(data.token);return licenseManagerLockdownControl({action:data.action,reason:data.reason,message:data.message});
});
function billingOrigin(){
 const configured=String(process.env.BILLING_STORE_URL||process.env.CUSTOMER_PORTAL_URL||"").trim();if(!configured)throw new Error("Billing Store URL is not configured");
 const u=new URL(configured);if(u.protocol!=="https:")throw new Error("Billing Store URL must use HTTPS");return u.origin;
}
async function billingStoreRequest(path:string,init:RequestInit={}){
 const secret=String(process.env.DEV_PANEL_EVENT_SECRET||"").trim();if(!secret)throw new Error("DEV_PANEL_EVENT_SECRET is not configured");
 const response=await fetch(billingOrigin()+path,{...init,headers:{authorization:"Bearer "+secret,"content-type":"application/json",...(init.headers||{})},cache:"no-store"});
 const text=await response.text();let body:any={};try{body=text?JSON.parse(text):{}}catch{body={raw:text}}
 if(!response.ok)throw Object.assign(new Error(body?.error||body?.message||("Billing Store returned HTTP "+response.status)),{status:response.status,body});
 return body;
}
async function billingCustomer(identity:string){return billingStoreRequest("/api/internal/orbitfs/customer-lookup?identity="+encodeURIComponent(identity))}
const norm=(v:any)=>String(v??"").trim().toLowerCase();
const lid=(x:any)=>String(x?.id||x?.license_id||x?.licenseId||"").trim();
function customerMatchReason(x:any,c:any,orders:any[]){
 if(!c)return "";
 const number=norm(c.customer_number),id=norm(c.id),auth=norm(c.auth_user_id||c.user_id),email=norm(c.email);
 const refs=new Set((orders||[]).flatMap((o:any)=>[o.id,o.order_number]).filter(Boolean).map(norm)),m=x?.metadata||{};
 const vals=[x?.customer_external_id,x?.customer_ref,x?.external_customer_id,x?.customer_id,m.customerNumber,m.customerId,m.customerRecordId,m.customer_external_id,x?.external_reference,x?.order_ref,m.orderRef,m.order_number].map(norm).filter(Boolean);
 if(number&&vals.includes(number))return "customer number";if(id&&vals.includes(id))return "customer record";if(auth&&vals.includes(auth))return "account id";
 if(email&&[norm(x?.customer_email),norm(x?.email),norm(m.customerEmail),norm(m.email)].includes(email))return "email";
 if(vals.some(v=>refs.has(v)))return "order";return "";
}
export async function customerLicenseSnapshot(identity:string){
 const settings=await assertTargetEnabled("license_manager");
 const billing=settings.expose_billing_store
  ?await billingCustomer(identity).catch((error:any)=>({ok:false,found:false,error:error?.message||"Billing Store unavailable",customer:null,orders:[],bindings:[],installations:[]}))
  :{ok:false,found:false,error:"Billing Store tools are disabled",customer:null,orders:[],bindings:[],installations:[]};
 const master=await licenseManagerRequest("/license"),all=Array.isArray(master?.licenses)?master.licenses:[];
 const linked=new Set((billing?.bindings||[]).map((b:any)=>String(b.license_id||"")).filter(Boolean));
 const customer=billing?.customer||null,orders=billing?.orders||[];
 const licenses=all.map((x:any)=>({...x,_linked:linked.has(lid(x)),_match:customerMatchReason(x,customer,orders)})).filter((x:any)=>{
  if(x._linked||x._match)return true;
  const ident=norm(identity);
  return ident&&(norm(lid(x))===ident||norm(x.customer_external_id)===ident||norm(x.external_reference)===ident||norm(x.license_key_last4)===ident);
 });
 return {identity,billing:{found:Boolean(customer),customer,profile:billing?.profile||null,orders,orderItems:billing?.orderItems||[],bindings:billing?.bindings||[],installations:billing?.installations||[],providerConnections:billing?.providerConnections||[],error:billing?.error||null},licenses,licenseCount:licenses.length,unlinked:Boolean(customer)&&!linked.size};
}
function selectLicense(snapshot:any,licenseId?:string){
 const matches=Array.isArray(snapshot?.licenses)?snapshot.licenses:[];
 if(licenseId){const found=matches.find((x:any)=>lid(x)===licenseId);if(found)return found;throw new Error("Requested licence was not found for this customer/identity");}
 const linked=matches.filter((x:any)=>x._linked);
 if(linked.length===1)return linked[0];
 if(linked.length>1)throw Object.assign(new Error("Multiple linked licences match. Specify license_id."),{matches:linked.map((x:any)=>({id:lid(x),status:x.status,product:x.product_code||x.product}))});
 if(matches.length===1)return matches[0];
 if(matches.length>1)throw Object.assign(new Error("Multiple licences match. Specify license_id or link the intended licence first."),{matches:matches.map((x:any)=>({id:lid(x),status:x.status,product:x.product_code||x.product,match:x._match}))});
 throw new Error("No licence is linked or unambiguously matched to this customer. Use license_change action=link to link one.");
}
export async function licenseView(identity:string,view="summary",licenseId?:string){
 const snapshot=await customerLicenseSnapshot(identity);
 if(view==="summary"||view==="all")return snapshot;
 const selected=selectLicense(snapshot,licenseId);
 if(view==="runtime"||view==="installations")return {identity,license:{...selected,activations:selected.activations||[]},billingInstallations:snapshot.billing.installations};
 if(view==="entitlements"||view==="components")return {identity,licenseId:lid(selected),status:selected.status,components:selected.components||selected?.metadata?.license_policy?.components||{},metadata:selected.metadata||{}};
 if(view==="pulse")return {identity,licenseId:lid(selected),pulse:await licenseManagerRequest("/license/pulse?license_id="+encodeURIComponent(lid(selected)))};
 if(view==="events"||view==="history"){
  const events=await licenseManagerRequest("/audit-events?resource_type=license&limit=200");
  return {identity,licenseId:lid(selected),events:(events?.events||[]).filter((x:any)=>String(x.resource_id||"")===lid(selected))};
 }
 if(view==="eligibility"){
  const latest=await licenseManagerRequest("/updater",{method:"POST",body:JSON.stringify({product:selected.product_code||selected.product||"orbitfs_base",channel:"stable",type:"update"})});
  return {identity,license:selected,latestUpdate:latest?.release||null};
 }
 return snapshot;
}
export async function licenseChange(input:{identity:string;action:string;license_id?:string;installation_id?:string;component?:string;enabled?:boolean;components?:Record<string,boolean>;reason?:string}){
 const mutationSettings=await assertMutation("license_manager");
 const action=String(input.action||"").toLowerCase();
 if(action==="link"){
  requireSetting(mutationSettings,"allow_license_linking","Customer licence linking is disabled");
  await assertTargetEnabled("billing_store");
  if(!input.identity)throw new Error("Customer email or identity is required");
  return billingStoreRequest("/api/internal/orbitfs/customer-lookup",{method:"POST",body:JSON.stringify({action:"link_license",identity:input.identity,license_id:input.license_id,mode:input.license_id?"manual":"auto"})});
 }
 const snapshot=await customerLicenseSnapshot(input.identity),selected=selectLicense(snapshot,input.license_id),id=lid(selected);
 const map:any={suspend:"suspend",unsuspend:"activate",restore:"activate",activate:"activate",revoke:"revoke",rotate:"rotate",unlock_installation:"unlock-installation"};
 if(action==="force_revalidation"){
  requireSetting(mutationSettings,"allow_license_state_changes","Licence state/runtime changes are disabled");
  return licenseManagerRequest("/license/pulse",{method:"POST",body:JSON.stringify({action:"pulse",pulse_action:"full_recheck",scope:"license",license_id:id,reason:input.reason||"dev-mcp-force-revalidation"})});
 }
 if(action==="set_component"){
  requireSetting(mutationSettings,"allow_license_entitlement_changes","Licence component/entitlement changes are disabled");
  if(!input.component||typeof input.enabled!=="boolean")throw new Error("component and enabled are required");
  return licenseManagerRequest("/license/"+encodeURIComponent(id)+"/control",{method:"POST",body:JSON.stringify({action:"set-component",component:input.component,enabled:input.enabled})});
 }
 if(action==="set_components"){
  requireSetting(mutationSettings,"allow_license_entitlement_changes","Licence component/entitlement changes are disabled");
  if(!input.components||typeof input.components!=="object")throw new Error("components is required");
  return licenseManagerRequest("/license/"+encodeURIComponent(id)+"/control",{method:"POST",body:JSON.stringify({action:"set-components",components:input.components})});
 }
 const control=map[action];if(!control)throw new Error("Unsupported licence action");
 if(control==="unlock-installation")requireSetting(mutationSettings,"allow_installation_unlock","Installation unlock is disabled");
 else requireSetting(mutationSettings,"allow_license_state_changes","Licence state changes are disabled");
 let installationId=String(input.installation_id||"").trim();
 if(control==="unlock-installation"&&!installationId){
  const acts=Array.isArray(selected.activations)?selected.activations.filter((x:any)=>x.status==="active"):[];
  const billingInstalls=snapshot.billing.installations||[];
  if(acts.length===1)installationId=String(acts[0].installation_id||"");
  else if(billingInstalls.length===1)installationId=String(billingInstalls[0].installation_id||"");
  else throw new Error("Specify installation_id because more than one installation may match.");
 }
 return licenseManagerRequest("/license/"+encodeURIComponent(id)+"/control",{method:"POST",body:JSON.stringify({action:control,...(installationId?{installation_id:installationId}:{})})});
}


function nextPatchVersion(value:any){
 const match=String(value||"").trim().match(/^(\d+)\.(\d+)\.(\d+)/);
 return match?match[1]+"."+match[2]+"."+(Number(match[3])+1):"1.0.0";
}
function migrationPathInfo(target:ReleaseTarget,pathValue:any){
 const path=String(pathValue||"").replaceAll("\\","/");
 if(target==="base"){
  const match=path.match(/^supabase\/migrations\/(\d{14})_([A-Za-z0-9._-]+)\.sql$/);
  return match?{id:match[1]+"_"+match[2],component:"base",path}:null;
 }
 const match=path.match(/^supabase\/migrations\/(shared|base|apex|mcp|studio)\/(\d{14})_([A-Za-z0-9._-]+)\.sql$/);
 return match?{id:match[2]+"_"+match[3],component:match[1].toLowerCase(),path}:null;
}
async function githubFileSha256(repo:string,path:string,ref:string){
 const row=await github("/repos/"+repo+"/contents/"+path.split("/").map(encodeURIComponent).join("/")+"?ref="+encodeURIComponent(ref));
 const raw=String(row?.content||"").replace(/\n/g,"");
 if(!raw)throw new Error("Unable to read migration "+path+" at "+ref);
 const bytes=Buffer.from(raw,"base64");
 return crypto.createHash("sha256").update(bytes).digest("hex");
}
async function releaseDatabaseInspection(target:ReleaseTarget,inspection:any){
 const repo=String(inspection?.repo||(await releaseCfg(target)).repo),ref=String(inspection?.head||"");
 const files=Array.isArray(inspection?.files)?inspection.files:[];
 const migrations:any[]=[];
 const invalid:any[]=[];
 for(const file of files){
  const info=migrationPathInfo(target,file?.filename||file?.path);
  if(!info)continue;
  const status=String(file?.status||"modified").toLowerCase();
  const immutableViolation=!["added","snapshot"].includes(status);
  if(immutableViolation){
   invalid.push({...info,status,reason:"Published migrations are immutable; existing migration files cannot be "+status+"."});
   continue;
  }
  const sha256=await githubFileSha256(repo,info.path,ref);
  migrations.push({...info,status,sha256});
 }
 const ids=new Set<string>(),duplicates:string[]=[];
 for(const item of migrations){if(ids.has(item.id))duplicates.push(item.id);ids.add(item.id)}
 if(duplicates.length)for(const id of duplicates)invalid.push({id,status:"duplicate",reason:"Duplicate migration ID"});
 return {
  ok:invalid.length===0,
  changedMigrationCount:migrations.length,
  migrations,
  invalid,
  latestMigration:migrations.map(x=>x.id).sort().at(-1)||null,
  message:invalid.length?invalid.length+" database migration issue"+(invalid.length===1?"":"s")+" must be fixed before packaging.":migrations.length?migrations.length+" new immutable database migration"+(migrations.length===1?"":"s")+" ready for packaging.":"No database migration changes in this release."
 };
}
function releaseDocument(target:ReleaseTarget,input:any){
 const base=target==="base",inspection=input.inspection||{},version=String(input.version||"");
 const commits=(inspection.commits||[]).map((row:any)=>String(row?.commit?.message||row?.message||"").split("\n")[0].trim()).filter(Boolean).slice(0,20);
 const summary=inspection.changeSummary||{};
 const components=Array.isArray(input.components)?input.components:[];
 const db=input.database||{};
 return `# OrbitFS ${base?"Base Deployment":"Update"} — v${version}

## Source
Repository: ${inspection.repo}
Release ref: ${inspection.ref}
Source SHA: ${inspection.head}
Previous published version: ${inspection.baseline?.version||"none"}

## Change summary
Files: ${Number(summary.total??inspection.files?.length??0)}
Added: ${Number(summary.added||0)}
Modified: ${Number(summary.modified||0)}
Deleted: ${Number(summary.deleted||0)}
${base?"":`Components: ${components.join(", ")||"none"}`}

## Database
${db.message||"Database inspection not run."}
${(db.migrations||[]).map((m:any)=>`• ${m.id} · ${m.component} · sha256:${m.sha256}`).join("\n")||"No new database migrations."}

## Main changes
${commits.length?commits.map((x:string)=>"• "+x).join("\n"):"No commit summaries returned."}

## Compatibility
${base?"Base deployment compatibility is validated by the Base worker.":`Minimum Base version: ${input.minimumBaseVersion}\nMinimum deployer protocol: ${input.protocol}`}

## Notes
${String(input.notes||"").trim()||"No additional operator notes."}
`;
}
async function latestPublishedReleaseVersion(target:ReleaseTarget,channel:string){
 const type=target==="base"?"base":"update";
 const result=await licenseManagerRequest("/releases?product=orbitfs_base&type="+type+"&channel="+encodeURIComponent(channel)+"&include_archived=false").catch(()=>({releases:[]}));
 const rows=(Array.isArray(result?.releases)?result.releases:[])
  .filter((row:any)=>String(row?.status||"").toLowerCase()==="published"&&String(row?.review_status||"").toLowerCase()==="approved"&&!row?.archived_at)
  .sort((a:any,b:any)=>{
   const versionCompare=compareVersions(String(b?.version||""),String(a?.version||""));
   if(versionCompare!==0)return versionCompare;
   return new Date(b?.published_at||b?.created_at||0).getTime()-new Date(a?.published_at||a?.created_at||0).getTime();
  });
 return rows[0]||null;
}
export async function releaseBuildCommand(input:{action:string;target:ReleaseTarget;channel?:string;version?:string;minimum_base_version?:string;protocol?:string;notes?:string},actor?:any){
 const target=input.target;
 await assertTargetEnabled(target);
 const action=String(input.action||"status").toLowerCase();
 const channel=String(input.channel||"stable").trim().toLowerCase()||"stable";
 const branch=await releaseBranchState(target);
 const type=target==="base"?"base":"engine";
 if(action==="status"){
  const [published,latestBase]=await Promise.all([
   latestPublishedReleaseVersion(target,channel),
   target==="engine"?latestPublishedReleaseVersion("base",channel):Promise.resolve(null)
  ]);
  let inspection:any=null;
  if(branch.preparedCurrent)inspection=await inspectSourceCore({type,channel});
  const currentVersion=inspection?.baseline?.version||published?.version||null;
  const suggestedVersion=inspection?.initialUpdate
   ?String(inspection?.baseline?.initialReleaseVersion||"1.0.0")
   :inspection?.initialRelease?"1.0.0":nextPatchVersion(currentVersion);
  const migrations=branch.preparedCurrent&&inspection?await releaseDatabaseInspection(target,inspection):null;
  return {ok:true,target,channel,preparedCurrent:branch.preparedCurrent,commitsAhead:branch.commitsAhead,currentVersion,suggestedVersion,sourceSha:inspection?.head||branch.preparedSha||null,components:inspection?.detectedComponents||[],minimumBaseVersion:target==="engine"?(inspection?.baseBaseline?.version||latestBase?.version||null):null,database:migrations,message:branch.preparedCurrent?(target==="base"?"Base":"Update")+" release source is ready. Suggested version v"+suggestedVersion+".":"Prepare "+(target==="base"?"Base":"Engine")+" source first; "+branch.commitsAhead+" commit"+(branch.commitsAhead===1?" is":"s are")+" still ahead."};
 }
 if(!branch.preparedCurrent)throw new Error("Prepare "+(target==="base"?"Base":"Engine")+" source before "+action+". The release branch is "+branch.commitsAhead+" commit"+(branch.commitsAhead===1?"":"s")+" behind main.");
 const inspection=await inspectSourceCore({type,channel});
 const currentVersion=inspection?.baseline?.version||null;
 const suggestedVersion=inspection?.initialUpdate
  ?String(inspection?.baseline?.initialReleaseVersion||"1.0.0")
  :inspection?.initialRelease?"1.0.0":nextPatchVersion(currentVersion);
 const version=String(input.version||suggestedVersion).trim();
 const database=await releaseDatabaseInspection(target,inspection);
 const components=target==="engine"?(Array.isArray(inspection?.detectedComponents)?inspection.detectedComponents:[]):["base"];
 const minimumBaseVersion=target==="engine"?String(input.minimum_base_version||inspection?.baseBaseline?.version||"").trim():"";
 const protocol=target==="engine"?String(input.protocol||"1").trim():"";
 if(action==="inspect")return {ok:true,target,channel,currentVersion,suggestedVersion,selectedVersion:version,sourceSha:inspection.head,hasSourceChanges:inspection.hasSourceChanges===true,changeSummary:inspection.changeSummary||{},components,minimumBaseVersion:minimumBaseVersion||null,protocol:protocol||null,database,message:(target==="base"?"Base":"Update")+" inspected at "+String(inspection.head||"").slice(0,8)+". Next version v"+version+"."};
 if(action==="database")return {ok:database.ok,target,version,sourceSha:inspection.head,database,message:database.message};
 if(action!=="build")throw new Error("Unsupported release build action");
 const mutationSettings=await assertMutation(target);
 requireSetting(mutationSettings,"allow_prepare","Release building is disabled");
 if(!inspection.hasSourceChanges)throw new Error("No source changes exist since the published "+(target==="base"?"Base":"Update")+" baseline.");
 if(!database.ok)throw new Error(database.message);
 if(target==="engine"&&!components.length)throw new Error("No Update components were detected. Open Full Dev Panel to select the intended component targets before building.");
 if(target==="engine"&&!minimumBaseVersion)throw new Error("Minimum Base version could not be resolved.");
 const changelogDraft=releaseDocument(target,{inspection,version,components,minimumBaseVersion,protocol,database,notes:input.notes});
 const release=await startReleaseCore({
  type,
  version,
  channel,
  notes:String(input.notes||""),
  changelogDraft,
  files:inspection.files||[],
  components,
  minimumBaseVersion,
  protocol,
  changelogTemplate:target==="base"?"base_deployment_log":"update_changelog",
  inspectedSourceSha:String(inspection.head||""),
  inspectedPublishedBaselineSha:inspection.publishedBaselineSha??null,
 },actor||{id:"dev-mcp",email:"dev-mcp@orbitfs.local"});
 return {ok:true,target,version,channel,sourceSha:inspection.head,database:{changedMigrationCount:database.changedMigrationCount,latestMigration:database.latestMigration},runId:release.runId||null,runUrl:null,draftId:release.draftId,message:(target==="base"?"Base release ":"Update release ")+"v"+version+" build started"+(release.runId?" · run #"+release.runId:"")+"."};
}

export async function releaseCommand(input:{action:string;release_id?:string;other_release_id?:string;type?:string;channel?:string;target_channel?:string;reason?:string}){
 await assertTargetEnabled("license_manager");
 const action=String(input.action||"list").toLowerCase();
 const mutation=new Set(["approve","reject","publish","unpublish","withdraw","archive","deprecate","restore","promote","rollback","revert","pause"]);
 if(mutation.has(action)){
  const mutationSettings=await assertMutation("license_manager");
  if(["approve","reject"].includes(action))requireSetting(mutationSettings,"allow_release_review","Release approve/reject is disabled");
  else if(["rollback","revert"].includes(action))requireSetting(mutationSettings,"allow_release_rollback","Release rollback/revert is disabled");
  else requireSetting(mutationSettings,"allow_release_publish","Release publication/lifecycle changes are disabled");
 }
 if(action==="list"){
  const qs=new URLSearchParams();if(input.type)qs.set("type",input.type);if(input.channel)qs.set("channel",input.channel);qs.set("product","orbitfs_base");qs.set("include_archived","true");
  return licenseManagerRequest("/releases?"+qs.toString());
 }
 const id=String(input.release_id||"").trim();if(!id)throw new Error("release_id is required");
 if(action==="get"||action==="manifest"||action==="validate"||action==="failures"||action==="source"||action==="build"){
  const result=await licenseManagerRequest("/releases/"+encodeURIComponent(id)),release=result?.release||result;
  if(action==="manifest")return {releaseId:id,manifest:release?.manifest||null,checksum:release?.checksum||null};
  if(action==="source")return {releaseId:id,sourceRepo:release?.source_repo||null,sourceRef:release?.source_ref||null,sourceCommit:release?.source_sha||null};
  if(action==="build")return {releaseId:id,artifactName:release?.artifact_name||null,artifactUrl:release?.artifact_url||null,checksum:release?.checksum||null,manifest:release?.manifest||null};
  if(action==="failures")return {releaseId:id,validation:release?.manifest?.validation||null,status:release?.status,reviewStatus:release?.review_status};
  if(action==="validate")return {releaseId:id,checks:{checksumPresent:/^[a-f0-9]{64}$/i.test(String(release?.checksum||"")),manifestPresent:Boolean(release?.manifest),sourceCommitPresent:Boolean(release?.source_sha),components:Array.isArray(release?.manifest?.components)?release.manifest.components:[],reviewStatus:release?.review_status,status:release?.status},release};
  return result;
 }
 if(action==="compare"){
  const other=String(input.other_release_id||"").trim();if(!other)throw new Error("other_release_id is required");
  const [a,b]=await Promise.all([licenseManagerRequest("/releases/"+encodeURIComponent(id)),licenseManagerRequest("/releases/"+encodeURIComponent(other))]);
  return {left:a?.release||a,right:b?.release||b};
 }
 const mapped=action==="unpublish"?"withdraw":action==="deprecate"?"archive":action;
 return licenseManagerRequest("/releases/"+encodeURIComponent(id),{method:"POST",body:JSON.stringify({action:mapped,target_channel:input.target_channel,reason:input.reason})});
}

function semverParts(value:any){return String(value||"").replace(/^v/i,"").split(/[.+-]/).slice(0,3).map(x=>Number(x)||0)}
function compareVersions(a:any,b:any){const aa=semverParts(a),bb=semverParts(b);for(let i=0;i<3;i++){if(aa[i]>bb[i])return 1;if(aa[i]<bb[i])return -1}return 0}
async function chooseInstallation(snapshot:any,installationId?:string){
 const all=snapshot?.billing?.installations||[];
 if(installationId){const found=all.find((x:any)=>String(x.id)===installationId||String(x.installation_id)===installationId);if(found)return found;throw new Error("Installation not found for this customer");}
 if(all.length===1)return all[0];
 if(all.length>1)throw Object.assign(new Error("Multiple installations match; specify installation_id."),{installations:all.map((x:any)=>({id:x.id,installation_id:x.installation_id,state:x.state,release_version:x.release_version,vercel_project_name:x.vercel_project_name}))});
 throw new Error("No Billing Store installation is linked to this customer");
}
export async function updateCommand(input:{action:string;identity:string;installation_id?:string;release_id?:string;version?:string;channel?:string;reason?:string}){
 await assertTargetEnabled("billing_store");
 const action=String(input.action||"status").toLowerCase(),snapshot=await customerLicenseSnapshot(input.identity),license=selectLicense(snapshot),install=await chooseInstallation(snapshot,input.installation_id);
 if(["apply","retry","rollback"].includes(action)){
  const mutationSettings=await assertMutation("billing_store");
  if(action==="rollback")requireSetting(mutationSettings,"allow_update_rollback","Customer update rollback is disabled");
  else requireSetting(mutationSettings,"allow_update_apply","Customer update apply/retry is disabled");
 }
 const latest=await licenseManagerRequest("/updater",{method:"POST",body:JSON.stringify({product:"orbitfs_base",channel:input.channel||install.release_channel||"stable",type:"update",release_id:input.release_id})});
 const release=latest?.release||null,manifest=release?.manifest||{},components=Array.isArray(manifest.components)?manifest.components.map((x:any)=>String(x).toLowerCase()):[];
 const entitled=Object.entries(license.components||license?.metadata?.license_policy?.components||{}).filter(([,v])=>Boolean(v)).map(([k])=>k.replace(/^orbitfs_/,""));
 const execution=components.filter((x:string)=>entitled.includes(x)),minimumBase=manifest.minimumBaseVersion||manifest.minimum_version||null;
 const plan={release,installation:install,licenseId:lid(license),releaseComponents:components,entitledComponents:entitled,executionComponents:execution,skippedComponents:components.filter((x:string)=>!execution.includes(x)),minimumBaseVersion:minimumBase,currentBaseVersion:install.release_version||null,compatible:minimumBase?compareVersions(install.release_version,minimumBase)>=0:true,checkpointRequired:manifest.checkpointRequired!==false};
 if(["status","available","inspect","compatibility","plan","dry_run"].includes(action))return {ok:true,action,plan};
 if(action==="apply"||action==="retry")return billingStoreRequest("/api/internal/orbitfs/customer-operation",{method:"POST",body:JSON.stringify({action:"update",identity:input.identity,installation_id:install.id,release_id:input.release_id||release?.id,version:input.version,channel:input.channel||install.release_channel||"stable",reason:input.reason||"Dev MCP update"})});
 if(action==="rollback")return billingStoreRequest("/api/internal/orbitfs/customer-operation",{method:"POST",body:JSON.stringify({action:"rollback_update",identity:input.identity,installation_id:install.id,reason:input.reason||"Dev MCP update rollback"})});
 throw new Error("Unsupported update action");
}

export async function workflowDetail(input:{target:"base"|"engine"|"license_manager"|"billing_store";run_id?:number}){
 await assertTargetEnabled(input.target);
 const cfg:any=input.target==="base"||input.target==="engine"?await releaseCfg(input.target):await serviceCfg(input.target as ServiceTarget);
 let runId=Number(input.run_id||0);
 if(!runId){
  const workflows=input.target==="base"||input.target==="engine"?[cfg.workflow]:[cfg.scan,cfg.deploy,cfg.quick];
  const rows=(await Promise.all(workflows.map((w:string)=>github("/repos/"+cfg.repo+"/actions/workflows/"+encodeURIComponent(w)+"/runs?per_page=5").catch(()=>({workflow_runs:[]}))))).flatMap((x:any)=>x.workflow_runs||[]).sort((a:any,b:any)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime());
  runId=Number(rows[0]?.id||0);
 }
 if(!runId)throw new Error("No workflow run found");
 const [run,jobs]=await Promise.all([github("/repos/"+cfg.repo+"/actions/runs/"+runId),github("/repos/"+cfg.repo+"/actions/runs/"+runId+"/jobs?filter=latest&per_page=100")]);
 return {target:input.target,repo:cfg.repo,run:cleanRun(run),jobs:(jobs?.jobs||[]).map((j:any)=>({id:j.id,name:j.name,status:j.status,conclusion:j.conclusion,started_at:j.started_at,completed_at:j.completed_at,html_url:j.html_url,steps:(j.steps||[]).map((s:any)=>({number:s.number,name:s.name,status:s.status,conclusion:s.conclusion,started_at:s.started_at,completed_at:s.completed_at}))}))};
}
export async function diagnostics(identity?:string){
 const settings=await getMcpSettings();
 const [base,engine,lm,bs]=await Promise.all([
  settings.expose_base?releaseBranchState("base"):Promise.resolve({disabled:true}),
  settings.expose_engine?releaseBranchState("engine"):Promise.resolve({disabled:true}),
  settings.expose_license_manager?licenseManagerRequest("/license/health").catch((e:any)=>({ok:false,error:e.message})):Promise.resolve({disabled:true}),
  settings.expose_billing_store?serviceState("billing_store").catch((e:any)=>({ok:false,error:e.message})):Promise.resolve({disabled:true})
 ]);
 const customer=identity&&settings.expose_license_manager?await customerLicenseSnapshot(identity).catch((e:any)=>({identity,error:e.message})):null;
 return {checkedAt:new Date().toISOString(),base,engine,licenseManager:lm,billingStore:bs,customer};
}
export async function systemOverview(){
 const settings=await getMcpSettings();
 const [base,engine,licenseManager,billingStore]=await Promise.all([
  settings.expose_base?releaseBranchState("base"):Promise.resolve({target:"base",disabled:true}),
  settings.expose_engine?releaseBranchState("engine"):Promise.resolve({target:"engine",disabled:true}),
  settings.expose_license_manager?Promise.all([
   serviceState("license_manager").catch((e:any)=>({ok:false,error:e.message})),
   licenseManagerLockdownStatus().catch((e:any)=>({ok:false,locked:true,code:"LOCKDOWN_STATE_UNAVAILABLE",error:e.message}))
  ]).then(async([service,lockdown])=>{
   if(lockdown?.locked)return {service,lockdown,health:{ok:false,locked:true,code:lockdown.code||"AUTHORITY_LOCKDOWN",error:lockdown.message||"License Manager is locked down"}};
   const health=await licenseManagerRequest("/license/health").catch((e:any)=>({ok:false,error:e.message}));
   return {service,lockdown,health};
  }):Promise.resolve({disabled:true}),
  settings.expose_billing_store?serviceState("billing_store").catch((e:any)=>({ok:false,error:e.message})):Promise.resolve({disabled:true})
 ]);
 return {checkedAt:new Date().toISOString(),settings,base,engine,licenseManager,billingStore};
}
