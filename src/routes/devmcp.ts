import {createFileRoute} from "@tanstack/react-router";
import {
 customerLicenseSnapshot,deployService,diagnostics,getMcpSettings,licenseChange,licenseManagerLockdownControl,licenseView,
 prepareRelease,releaseBranchState,releaseBuildCommand,releaseCommand,systemOverview,updateCommand,workflowDetail
} from "@/lib/dev-mcp.server";
import {DEV_PANEL_UI_URI,devPanelUiResource} from "@/lib/dev-mcp-ui";
import {authenticateMcpOAuth,oauthChallenge} from "@/lib/dev-oauth.server";

const allowedOrigins=new Set(
 String(process.env.DEV_MCP_ALLOWED_ORIGINS||"https://chatgpt.com,https://chat.openai.com,https://dev.incendiarynetworks.cc")
  .split(",").map(x=>x.trim()).filter(Boolean)
);
function originAllowed(request:Request){const origin=request.headers.get("origin");return !origin||allowedOrigins.has(origin)}
function cors(){return {"cache-control":"no-store","access-control-allow-origin":"*"}}
function rpc(id:any,result:any,status=200){return Response.json({jsonrpc:"2.0",id,result},{status,headers:cors()})}
function rpcError(id:any,code:number,message:string,status=200){return Response.json({jsonrpc:"2.0",id,error:{code,message}},{status,headers:cors()})}
function safeStructured(value:any){return value&&typeof value==="object"?value:{value}}
function toolResult(data:any,message?:string){const structuredContent=safeStructured(data);const text=message||JSON.stringify(structuredContent);return {content:[{type:"text",text:text.length>12000?text.slice(0,12000)+"…":text}],structuredContent}}
function authToolError(scopes:string[]){return {content:[{type:"text",text:"Additional authorization is required for this tool."}],isError:true,_meta:{"mcp/www_authenticate":[oauthChallenge(scopes)+', error="insufficient_scope", error_description="Additional Dev Panel permission is required"']}}}
const readSecurity=[{type:"oauth2",scopes:["dev.read"]}];
const writeSecurity=[{type:"oauth2",scopes:["dev.write"]}];
const authoritySecurity=[{type:"oauth2",scopes:["dev.write","authority.write"]}];
const metaSecurity=(security:any,visibility:["model","app"]|["app"]=["model","app"])=>({securitySchemes:security,ui:{visibility}});

const tools:any[]=[
 {name:"show_dev",title:"Open Dev Panel",description:"Open the private Dev Panel. This is the only model-visible entry point for an explicitly selected @Dev mutation request. It may stage an intended action in the UI, but it never executes that action. Ordinary language such as deploy this, prepare it, sync branches, fix code, or release this must not be treated as a Dev mutation unless the user explicitly selected @Dev.",inputSchema:{type:"object",properties:{intent:{type:"string",enum:["open","prepare","deploy","release","release_build","update","license_change","lockdown"],description:"Optional explicit @Dev intent to stage in the UI only."},target:{type:"string",description:"Optional staged target such as base, engine, both, license_manager, or billing_store."},action:{type:"string",description:"Optional staged action such as deploy, quick_deploy, build, publish, rollback, suspend, lock, or unlock."},identity:{type:"string",description:"Optional customer identity for a staged customer action. Staging never executes it."}},additionalProperties:false},securitySchemes:readSecurity,annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},_meta:{...metaSecurity(readSecurity),ui:{resourceUri:DEV_PANEL_UI_URI,visibility:["model","app"]},"openai/outputTemplate":DEV_PANEL_UI_URI}},
 {name:"status",title:"Dev status",description:"Read current Base, Engine, service, or customer state. Use for status, what is current, whether a release branch is behind, or a quick system overview.",inputSchema:{type:"object",properties:{scope:{type:"string",enum:["all","base","engine","license_manager","billing_store","customer"]},identity:{type:"string",description:"Customer email, customer number, licence id, or account id when scope=customer."}}},securitySchemes:readSecurity,annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},_meta:metaSecurity(readSecurity)},
 {name:"prepare",title:"Prepare Base or Engine",description:"Prepare base, engine, or both. Compares the release branch with current main, gathers the outstanding change set, then dispatches the repository's guarded workflow which scans current main and moves the release branch only if validation succeeds.",inputSchema:{type:"object",properties:{target:{type:"string",enum:["base","engine","both"]}},required:["target"]},securitySchemes:writeSecurity,annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false},_meta:metaSecurity(writeSecurity,["app"])},
 {name:"deploy",title:"Service deployment",description:"Control Dev Panel deployment workflows for Custom License Manager or V2 Billing Store. Supports status, Full Scan, normal deploy, Quick Deploy, safe redeploy, and workflow cancel/retry. Service deployments always target main.",inputSchema:{type:"object",properties:{target:{type:"string",enum:["license_manager","billing_store"]},action:{type:"string",enum:["status","scan","deploy","quick_deploy","redeploy","cancel","retry"]},run_id:{type:"number"}},required:["target","action"]},securitySchemes:writeSecurity,annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:false},_meta:metaSecurity(writeSecurity,["app"])},
 {name:"release",title:"Release management",description:"Read or control authoritative releases in Custom License Manager. Handles list/get/manifest/validation/source/build/failures/compare plus approve, reject, publish, unpublish, archive/deprecate, restore, promote, rollback, revert, and pause.",inputSchema:{type:"object",properties:{action:{type:"string"},release_id:{type:"string"},other_release_id:{type:"string"},type:{type:"string",enum:["base","update"]},channel:{type:"string"},target_channel:{type:"string"},reason:{type:"string"}},required:["action"]},securitySchemes:writeSecurity,annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:false},_meta:metaSecurity(writeSecurity,["app"])},
 {name:"release_build",title:"Build Base or Update release",description:"Preflight and build Base/Engine releases from the prepared release branches. Use for inspect release, check database migrations, show current/next version, build base release, build update release, or run the packaging worker. Database migrations are validated as immutable forward migrations and new migration SHA-256 values are recorded before the worker can start.",inputSchema:{type:"object",properties:{action:{type:"string",enum:["status","inspect","database","build"]},target:{type:"string",enum:["base","engine"]},channel:{type:"string"},version:{type:"string"},minimum_base_version:{type:"string"},protocol:{type:"string"},notes:{type:"string"}},required:["action","target"]},securitySchemes:writeSecurity,annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false},_meta:metaSecurity(writeSecurity,["app"])},
 {name:"update",title:"Customer update",description:"Inspect, plan, dry-run, apply, retry, or roll back an OrbitFS customer update. Resolve the customer by email when possible and use Billing Store only for customer/install execution while License Manager stays authoritative for release and licence state.",inputSchema:{type:"object",properties:{action:{type:"string",enum:["status","available","inspect","compatibility","plan","dry_run","apply","retry","rollback"]},identity:{type:"string"},installation_id:{type:"string"},release_id:{type:"string"},version:{type:"string"},channel:{type:"string"},reason:{type:"string"}},required:["action","identity"]},securitySchemes:writeSecurity,annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:false},_meta:metaSecurity(writeSecurity,["app"])},
 {name:"license",title:"Customer licence",description:"Read authoritative customer/licence information by email, customer number, licence id, or account id. Billing Store resolves customer linkage when needed; Custom License Manager supplies licence status, components, installations, runtime state, pulse and history.",inputSchema:{type:"object",properties:{identity:{type:"string"},view:{type:"string",enum:["summary","all","runtime","installations","entitlements","components","pulse","events","history","eligibility"]},license_id:{type:"string"}},required:["identity"]},securitySchemes:readSecurity,annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},_meta:metaSecurity(readSecurity)},
 {name:"license_change",title:"Change customer licence",description:"App-only owner licence control by customer email or other identity. Suspend, restore, revoke, rotate, component access, installation unlock, runtime revalidation, and customer linking must be initiated from the embedded Dev Panel UI and confirmed there.",inputSchema:{type:"object",properties:{identity:{type:"string"},action:{type:"string",enum:["suspend","unsuspend","restore","activate","revoke","rotate","unlock_installation","force_revalidation","set_component","set_components","link"]},license_id:{type:"string"},installation_id:{type:"string"},component:{type:"string"},enabled:{type:"boolean"},components:{type:"object",additionalProperties:{type:"boolean"}},reason:{type:"string"}},required:["identity","action"]},securitySchemes:authoritySecurity,annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:false},_meta:metaSecurity(authoritySecurity,["app"])},
 {name:"lockdown",title:"Licence Manager emergency lockdown",description:"Emergency kill switch for the Custom Licence Manager API. Use for lockdown, kill/shut down the licence manager API, lockdown status, or owner recovery/unlock. Lockdown leaves only the dedicated status/recovery path available; unlock uses the separate recovery credential.",inputSchema:{type:"object",properties:{action:{type:"string",enum:["status","lock","unlock"]},reason:{type:"string"},message:{type:"string"}},required:["action"]},securitySchemes:authoritySecurity,annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:false},_meta:metaSecurity(authoritySecurity,["app"])},
 {name:"diagnose",title:"Dev diagnostics",description:"Run a combined Dev Panel diagnostic snapshot for Base, Engine, License Manager, Billing Store, and optionally one customer identity.",inputSchema:{type:"object",properties:{identity:{type:"string"}}},securitySchemes:readSecurity,annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},_meta:metaSecurity(readSecurity)},
 {name:"logs",title:"Workflow details",description:"Read the latest or selected GitHub Actions run and job/step state for Base, Engine, License Manager, or Billing Store.",inputSchema:{type:"object",properties:{target:{type:"string",enum:["base","engine","license_manager","billing_store"]},run_id:{type:"number"}},required:["target"]},securitySchemes:readSecurity,annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},_meta:metaSecurity(readSecurity)}
];
const scopesByTool:Record<string,string[]>={
 show_dev:["dev.read"],status:["dev.read"],license:["dev.read"],diagnose:["dev.read"],logs:["dev.read"],
 prepare:["dev.write"],deploy:["dev.write"],release:["dev.write"],release_build:["dev.write"],update:["dev.write"],
 license_change:["dev.write","authority.write"],lockdown:["dev.write","authority.write"]
};

function toolEnabled(settings:any,name:string){
 if(settings?.["tool_"+name]===false)return false;
 if(name==="show_dev"&&settings?.ui_enabled===false)return false;
 return true;
}
function visibleTools(settings:any){return settings?.enabled===false?[]:tools.filter(tool=>toolEnabled(settings,tool.name))}
async function callTool(name:string,args:any,auth:any){
 const settings=await getMcpSettings();if(settings.enabled===false)throw new Error("Dev MCP is disabled");
 if(!toolEnabled(settings,name))throw new Error(name+" tool is disabled");
 const required=scopesByTool[name]||["dev.read"];if(required.some(scope=>!auth.scopes.includes(scope)))return authToolError(required);
 if(name==="show_dev"){const overview=await systemOverview();const requestedIntent={intent:String(args?.intent||"open"),target:args?.target?String(args.target):null,action:args?.action?String(args.action):null,identity:args?.identity?String(args.identity):null,staged:true,executed:false};return toolResult({...overview,requestedIntent},"Dev Panel ready. Requested action is staged only; nothing has been executed.");}
 if(name==="status"){
  const scope=String(args?.scope||"all");
  if(scope==="all")return toolResult(await systemOverview());
  if(scope==="base"||scope==="engine")return toolResult(await releaseBranchState(scope));
  if(scope==="license_manager"||scope==="billing_store")return toolResult(await deployService(scope,"status"));
  if(scope==="customer"){if(!args?.identity)throw new Error("identity is required for customer status");return toolResult(await customerLicenseSnapshot(String(args.identity)))}
 }
 if(name==="prepare")return toolResult(await prepareRelease(String(args?.target||"") as any));
 if(name==="deploy")return toolResult(await deployService(String(args?.target||"") as any,String(args?.action||"") as any,{run_id:args?.run_id?Number(args.run_id):undefined}));
 if(name==="release")return toolResult(await releaseCommand(args||{}));
 if(name==="release_build"){const result=await releaseBuildCommand(args||{},auth.user);return toolResult(result,result?.message);}
 if(name==="update")return toolResult(await updateCommand(args||{}));
 if(name==="license")return toolResult(await licenseView(String(args?.identity||""),String(args?.view||"summary"),args?.license_id?String(args.license_id):undefined));
 if(name==="license_change")return toolResult(await licenseChange({...args,identity:String(args?.identity||"")}));
 if(name==="lockdown")return toolResult(await licenseManagerLockdownControl({action:String(args?.action||"status") as any,reason:args?.reason?String(args.reason):undefined,message:args?.message?String(args.message):undefined}));
 if(name==="diagnose")return toolResult(await diagnostics(args?.identity?String(args.identity):undefined));
 if(name==="logs")return toolResult(await workflowDetail({target:String(args?.target||"") as any,run_id:args?.run_id?Number(args.run_id):undefined}));
 throw new Error("Unknown MCP tool");
}
function unauthorized(){return new Response(JSON.stringify({jsonrpc:"2.0",id:null,error:{code:-32001,message:"OAuth authorization required"}}),{status:401,headers:{"content-type":"application/json","www-authenticate":oauthChallenge(["dev.read"]),"cache-control":"no-store","access-control-allow-origin":"*"}})}
async function handlePost(request:Request){
 if(!originAllowed(request))return rpcError(null,-32000,"Origin not allowed",403);
 const auth=await authenticateMcpOAuth(request);if(!auth||auth.valid!==true)return unauthorized();
 const body=await request.json().catch(()=>null);if(!body||body.jsonrpc!=="2.0"||typeof body.method!=="string")return rpcError(body?.id??null,-32600,"Invalid Request",400);
 const id=body.id??null;
 if(body.method==="initialize")return rpc(id,{protocolVersion:"2025-11-25",capabilities:{tools:{listChanged:false},resources:{subscribe:false,listChanged:false}},serverInfo:{name:"private-dev-panel",title:"Private Dev Panel",version:"1.0.0"},instructions:"Private owner-only developer controls. Chat/model access is read-only. Ordinary natural-language requests must never invoke Dev mutation tools. Normal repository work belongs on normal GitHub tools. Only when the user explicitly selects @Dev may show_dev stage a requested prepare/deploy/release/build/update/licence/lockdown intent in the embedded UI. Staging never executes it. Every state-changing tool is app-only and still requires an owner button press plus confirmation in the Dev UI."});
 if(body.method==="notifications/initialized"||body.method==="notifications/cancelled")return new Response(null,{status:202,headers:cors()});
 if(body.method==="ping")return rpc(id,{});
 if(body.method==="tools/list"){const settings=await getMcpSettings();return rpc(id,{tools:visibleTools(settings)});}
 if(body.method==="tools/call"){
  try{return rpc(id,await callTool(String(body.params?.name||""),body.params?.arguments||{},auth))}
  catch(error:any){const extra=error?.matches||error?.installations?{matches:error?.matches,installations:error?.installations}:undefined;return rpc(id,{content:[{type:"text",text:error instanceof Error?error.message:"Tool failed"}],structuredContent:extra?{error:error?.message||"Tool failed",...extra}:{error:error?.message||"Tool failed"},isError:true})}
 }
 if(body.method==="resources/list"){
  const settings=await getMcpSettings();if(settings.enabled===false||settings.ui_enabled===false)return rpc(id,{resources:[]});
  const resource=devPanelUiResource(settings);return rpc(id,{resources:[{uri:resource.uri,name:resource.name,description:resource.description,mimeType:resource.mimeType}]});
 }
 if(body.method==="resources/read"){
  const settings=await getMcpSettings(),uri=String(body.params?.uri||"");
  if(settings.enabled===false||settings.ui_enabled===false||uri!==DEV_PANEL_UI_URI)return rpcError(id,-32002,"Resource not found");
  return rpc(id,{contents:[devPanelUiResource(settings)]});
 }
 return rpcError(id,-32601,"Method not found");
}

export const Route=createFileRoute("/devmcp")({server:{handlers:{
 OPTIONS:async()=>new Response(null,{status:204,headers:{"access-control-allow-origin":"*","access-control-allow-methods":"POST,GET,DELETE,OPTIONS","access-control-allow-headers":"authorization,content-type,mcp-protocol-version","access-control-max-age":"86400"}}),
 GET:async({request})=>{
  if(!originAllowed(request))return Response.json({ok:false,error:"ORIGIN_NOT_ALLOWED"},{status:403});
  const auth=await authenticateMcpOAuth(request);if(!auth||auth.valid!==true)return new Response(JSON.stringify({ok:false,error:"OAUTH_REQUIRED"}),{status:401,headers:{"content-type":"application/json","www-authenticate":oauthChallenge(["dev.read"]),"cache-control":"no-store"}});
  const settings=await getMcpSettings();
  return Response.json({ok:true,service:"private-dev-panel",endpoint:"/devmcp",transport:"streamable-http",authentication:"oauth2.1",ownerOnly:true,ui:settings.ui_enabled===false?null:DEV_PANEL_UI_URI,tools:visibleTools(settings).map((x:any)=>x.name)},{headers:{"cache-control":"no-store"}});
 },
 POST:async({request})=>handlePost(request),
 DELETE:async()=>new Response(null,{status:204,headers:cors()})
}}});
