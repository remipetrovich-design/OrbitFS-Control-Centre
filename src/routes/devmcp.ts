import {createFileRoute} from "@tanstack/react-router";
import {
 customerLicenseSnapshot,deployService,diagnostics,getMcpSettings,licenseChange,licenseView,
 prepareRelease,releaseBranchState,releaseCommand,systemOverview,updateCommand,workflowDetail
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
const metaSecurity=(security:any)=>({securitySchemes:security,ui:{visibility:["model","app"]}});

const tools:any[]=[
 {name:"show_dev",title:"Open Dev Panel",description:"Open the private mobile Dev Panel interface inside ChatGPT. Use when the user says show dev, open dev, open the dev panel, or asks for the developer interface.",inputSchema:{type:"object",properties:{}},securitySchemes:readSecurity,annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},_meta:{...metaSecurity(readSecurity),ui:{resourceUri:DEV_PANEL_UI_URI,visibility:["model","app"]},"openai/outputTemplate":DEV_PANEL_UI_URI}},
 {name:"status",title:"Dev status",description:"Read current Base, Engine, service, or customer state. Use for status, what is current, whether a release branch is behind, or a quick system overview.",inputSchema:{type:"object",properties:{scope:{type:"string",enum:["all","base","engine","license_manager","billing_store","customer"]},identity:{type:"string",description:"Customer email, customer number, licence id, or account id when scope=customer."}}},securitySchemes:readSecurity,annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},_meta:metaSecurity(readSecurity)},
 {name:"prepare",title:"Prepare Base or Engine",description:"Prepare base, engine, or both. Compares the release branch with current main, gathers the outstanding change set, then dispatches the repository's guarded workflow which scans current main and moves the release branch only if validation succeeds.",inputSchema:{type:"object",properties:{target:{type:"string",enum:["base","engine","both"]}},required:["target"]},securitySchemes:writeSecurity,annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false},_meta:metaSecurity(writeSecurity)},
 {name:"deploy",title:"Service deployment",description:"Control Dev Panel deployment workflows for Custom License Manager or V2 Billing Store. Supports status, Full Scan, normal deploy, Quick Deploy, safe redeploy, and workflow cancel/retry. Billing Store Quick Deploy can target an explicit branch.",inputSchema:{type:"object",properties:{target:{type:"string",enum:["license_manager","billing_store"]},action:{type:"string",enum:["status","scan","deploy","quick_deploy","redeploy","cancel","retry"]},branch:{type:"string"},run_id:{type:"number"}},required:["target","action"]},securitySchemes:writeSecurity,annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:false},_meta:metaSecurity(writeSecurity)},
 {name:"release",title:"Release management",description:"Read or control authoritative releases in Custom License Manager. Handles list/get/manifest/validation/source/build/failures/compare plus approve, reject, publish, unpublish, archive/deprecate, restore, promote, rollback, revert, and pause.",inputSchema:{type:"object",properties:{action:{type:"string"},release_id:{type:"string"},other_release_id:{type:"string"},type:{type:"string",enum:["base","update"]},channel:{type:"string"},target_channel:{type:"string"},reason:{type:"string"}},required:["action"]},securitySchemes:writeSecurity,annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:false},_meta:metaSecurity(writeSecurity)},
 {name:"update",title:"Customer update",description:"Inspect, plan, dry-run, apply, retry, or roll back an OrbitFS customer update. Resolve the customer by email when possible and use Billing Store only for customer/install execution while License Manager stays authoritative for release and licence state.",inputSchema:{type:"object",properties:{action:{type:"string",enum:["status","available","inspect","compatibility","plan","dry_run","apply","retry","rollback"]},identity:{type:"string"},installation_id:{type:"string"},release_id:{type:"string"},version:{type:"string"},channel:{type:"string"},reason:{type:"string"}},required:["action","identity"]},securitySchemes:writeSecurity,annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:false},_meta:metaSecurity(writeSecurity)},
 {name:"license",title:"Customer licence",description:"Read authoritative customer/licence information by email, customer number, licence id, or account id. Billing Store resolves customer linkage when needed; Custom License Manager supplies licence status, components, installations, runtime state, pulse and history.",inputSchema:{type:"object",properties:{identity:{type:"string"},view:{type:"string",enum:["summary","all","runtime","installations","entitlements","components","pulse","events","history","eligibility"]},license_id:{type:"string"}},required:["identity"]},securitySchemes:readSecurity,annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},_meta:metaSecurity(readSecurity)},
 {name:"license_change",title:"Change customer licence",description:"Owner-only licence control by customer email or other identity. Use directly for suspend, unsuspend, restore, revoke, rotate, component access, installation unlock, runtime revalidation, or linking a licence to a Billing Store customer. Normal customer licence actions do not require a second confirmation.",inputSchema:{type:"object",properties:{identity:{type:"string"},action:{type:"string",enum:["suspend","unsuspend","restore","activate","revoke","rotate","unlock_installation","force_revalidation","set_component","set_components","link"]},license_id:{type:"string"},installation_id:{type:"string"},component:{type:"string"},enabled:{type:"boolean"},components:{type:"object",additionalProperties:{type:"boolean"}},reason:{type:"string"}},required:["identity","action"]},securitySchemes:authoritySecurity,annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:false},_meta:metaSecurity(authoritySecurity)},
 {name:"diagnose",title:"Dev diagnostics",description:"Run a combined Dev Panel diagnostic snapshot for Base, Engine, License Manager, Billing Store, and optionally one customer identity.",inputSchema:{type:"object",properties:{identity:{type:"string"}}},securitySchemes:readSecurity,annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},_meta:metaSecurity(readSecurity)},
 {name:"logs",title:"Workflow details",description:"Read the latest or selected GitHub Actions run and job/step state for Base, Engine, License Manager, or Billing Store.",inputSchema:{type:"object",properties:{target:{type:"string",enum:["base","engine","license_manager","billing_store"]},run_id:{type:"number"}},required:["target"]},securitySchemes:readSecurity,annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},_meta:metaSecurity(readSecurity)}
];
const scopesByTool:Record<string,string[]>={
 show_dev:["dev.read"],status:["dev.read"],license:["dev.read"],diagnose:["dev.read"],logs:["dev.read"],
 prepare:["dev.write"],deploy:["dev.write"],release:["dev.write"],update:["dev.write"],
 license_change:["dev.write","authority.write"]
};

async function callTool(name:string,args:any,auth:any){
 const settings=await getMcpSettings();if(settings.enabled===false)throw new Error("Dev MCP is disabled");
 const required=scopesByTool[name]||["dev.read"];if(required.some(scope=>!auth.scopes.includes(scope)))return authToolError(required);
 if(name==="show_dev")return toolResult(await systemOverview(),"Dev Panel ready.");
 if(name==="status"){
  const scope=String(args?.scope||"all");
  if(scope==="all")return toolResult(await systemOverview());
  if(scope==="base"||scope==="engine")return toolResult(await releaseBranchState(scope));
  if(scope==="license_manager"||scope==="billing_store")return toolResult(await deployService(scope,"status"));
  if(scope==="customer"){if(!args?.identity)throw new Error("identity is required for customer status");return toolResult(await customerLicenseSnapshot(String(args.identity)))}
 }
 if(name==="prepare")return toolResult(await prepareRelease(String(args?.target||"") as any));
 if(name==="deploy")return toolResult(await deployService(String(args?.target||"") as any,String(args?.action||"") as any,{branch:args?.branch?String(args.branch):undefined,run_id:args?.run_id?Number(args.run_id):undefined}));
 if(name==="release")return toolResult(await releaseCommand(args||{}));
 if(name==="update")return toolResult(await updateCommand(args||{}));
 if(name==="license")return toolResult(await licenseView(String(args?.identity||""),String(args?.view||"summary"),args?.license_id?String(args.license_id):undefined));
 if(name==="license_change")return toolResult(await licenseChange({...args,identity:String(args?.identity||"")}));
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
 if(body.method==="initialize")return rpc(id,{protocolVersion:"2025-11-25",capabilities:{tools:{listChanged:false},resources:{subscribe:false,listChanged:false}},serverInfo:{name:"private-dev-panel",title:"Private Dev Panel",version:"1.0.0"},instructions:"Private owner-only developer controls. Use show_dev when the user asks to open the Dev Panel. Use prepare for base/engine release branch preparation. Customer licence commands should accept email identities when possible."});
 if(body.method==="notifications/initialized"||body.method==="notifications/cancelled")return new Response(null,{status:202,headers:cors()});
 if(body.method==="ping")return rpc(id,{});
 if(body.method==="tools/list")return rpc(id,{tools});
 if(body.method==="tools/call"){
  try{return rpc(id,await callTool(String(body.params?.name||""),body.params?.arguments||{},auth))}
  catch(error:any){const extra=error?.matches||error?.installations?{matches:error?.matches,installations:error?.installations}:undefined;return rpc(id,{content:[{type:"text",text:error instanceof Error?error.message:"Tool failed"}],structuredContent:extra?{error:error?.message||"Tool failed",...extra}:{error:error?.message||"Tool failed"},isError:true})}
 }
 if(body.method==="resources/list"){
  const resource=devPanelUiResource();return rpc(id,{resources:[{uri:resource.uri,name:resource.name,description:resource.description,mimeType:resource.mimeType}]});
 }
 if(body.method==="resources/read"){
  const uri=String(body.params?.uri||"");if(uri!==DEV_PANEL_UI_URI)return rpcError(id,-32002,"Resource not found");
  return rpc(id,{contents:[devPanelUiResource()]});
 }
 return rpcError(id,-32601,"Method not found");
}

export const Route=createFileRoute("/devmcp")({server:{handlers:{
 OPTIONS:async()=>new Response(null,{status:204,headers:{"access-control-allow-origin":"*","access-control-allow-methods":"POST,GET,DELETE,OPTIONS","access-control-allow-headers":"authorization,content-type,mcp-protocol-version","access-control-max-age":"86400"}}),
 GET:async({request})=>{
  if(!originAllowed(request))return Response.json({ok:false,error:"ORIGIN_NOT_ALLOWED"},{status:403});
  const auth=await authenticateMcpOAuth(request);if(!auth||auth.valid!==true)return new Response(JSON.stringify({ok:false,error:"OAUTH_REQUIRED"}),{status:401,headers:{"content-type":"application/json","www-authenticate":oauthChallenge(["dev.read"]),"cache-control":"no-store"}});
  return Response.json({ok:true,service:"private-dev-panel",endpoint:"/devmcp",transport:"streamable-http",authentication:"oauth2.1",ownerOnly:true,ui:DEV_PANEL_UI_URI},{headers:{"cache-control":"no-store"}});
 },
 POST:async({request})=>handlePost(request),
 DELETE:async()=>new Response(null,{status:204,headers:cors()})
}}});
