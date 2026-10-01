import {createFileRoute} from "@tanstack/react-router";
import crypto from "node:crypto";
import {
 getDevControlJobs,getDevControlSettings,getDevControlSystems,getDevMcpSettings,
 licenseManagerRecoveryRequest,licenseManagerRequest,preparePrimaryReleaseSource,
 recordDevControlAudit,runDevControlAction
} from "@/lib/dev-control.server";

const actor={id:null,email:"devmcp",display_name:"OrbitFS Dev MCP",role:"owner",service:true};
const allowedOrigins=new Set(
 String(process.env.DEV_MCP_ALLOWED_ORIGINS||"https://chatgpt.com,https://chat.openai.com,https://dev.incendiarynetworks.cc")
  .split(",").map(x=>x.trim()).filter(Boolean)
);

function authorized(request:Request){
 const expected=String(process.env.DEV_MCP_TOKEN||"").trim();
 if(!expected)return false;
 const supplied=String(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
 const a=Buffer.from(supplied),b=Buffer.from(expected);
 return Boolean(supplied&&a.length===b.length&&crypto.timingSafeEqual(a,b));
}
function originAllowed(request:Request){const origin=request.headers.get("origin");return !origin||allowedOrigins.has(origin)}
function rpc(id:any,result:any,status=200){return Response.json({jsonrpc:"2.0",id,result},{status,headers:{"cache-control":"no-store","access-control-allow-origin":"*"}})}
function rpcError(id:any,code:number,message:string,status=200){return Response.json({jsonrpc:"2.0",id,error:{code,message}},{status,headers:{"cache-control":"no-store","access-control-allow-origin":"*"}})}
function toolResult(data:any,message?:string){return {content:[{type:"text",text:message||JSON.stringify(data)}],structuredContent:data}}
function requireMutation(settings:any,mcp:any){if(settings.enabled===false||settings.read_only_mode||settings.emergency_kill_switch)throw new Error("Dev Control mutations are blocked");if(mcp.enabled===false||mcp.read_only_mode||mcp.allow_mutations===false)throw new Error("MCP mutations are blocked")}
const tools=[
 {name:"dev_control_status",title:"Dev Control status",description:"Read the OrbitFS Dev Control and MCP settings plus registered systems.",inputSchema:{type:"object",properties:{}},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},
 {name:"release_overview",title:"Base and Engine release overview",description:"Read V1-vercel-base and V1-vercel-engine source/release branch state.",inputSchema:{type:"object",properties:{}},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},
 {name:"prepare_release_source",title:"Prepare release source",description:"Validate latest main and promote it to base-release or UPDATE_RELEASE using the existing guarded GitHub workflow. Does not publish a release.",inputSchema:{type:"object",properties:{target:{type:"string",enum:["base","engine"]},confirm:{type:"boolean"}},required:["target","confirm"]},annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false}},
 {name:"recent_dev_jobs",title:"Recent Dev Control jobs",description:"Read recent Dev Control jobs and linked workflow state.",inputSchema:{type:"object",properties:{limit:{type:"number",minimum:1,maximum:50}}},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},
 {name:"service_action",title:"Secondary service operation",description:"Run an explicit Billing Store or License Manager service workflow through Dev Control.",inputSchema:{type:"object",properties:{target:{type:"string",enum:["license_manager","billing_store"]},action:{type:"string",enum:["prepare_latest_source","quick_deploy","production_deploy","redeploy"]},confirm:{type:"boolean"}},required:["target","action"]},annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:false}},
 {name:"license_manager_view",title:"License Manager view",description:"Read an explicit authoritative License Manager surface.",inputSchema:{type:"object",properties:{view:{type:"string",enum:["health","licenses","products","releases","channels","authority","lockdown"]}},required:["view"]},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},
 {name:"license_control",title:"License control",description:"Run an explicit authoritative licence action.",inputSchema:{type:"object",properties:{license_id:{type:"string"},action:{type:"string",enum:["suspend","activate","rotate","revoke","terminate","unlock-installation"]},installation_id:{type:"string"},confirm:{type:"boolean"}},required:["license_id","action","confirm"]},annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:false}},
 {name:"authority_lockdown",title:"License Manager emergency lockdown",description:"Enable or disable the global License Manager hard lockdown. This can lock customers out of OrbitFS websites/installations.",inputSchema:{type:"object",properties:{action:{type:"string",enum:["enable","disable"]},reason:{type:"string"},confirm:{type:"string",enum:["LOCKDOWN","UNLOCK"]}},required:["action","reason","confirm"]},annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:false}},
];

async function callTool(name:string,args:any){
 const [settings,mcp]=await Promise.all([getDevControlSettings(),getDevMcpSettings()]);
 if(!mcp.enabled)throw new Error("Dev MCP is disabled");
 if(name==="dev_control_status")return toolResult({devControl:settings,mcp,targets:(await getDevControlSystems()).systems});
 if(name==="release_overview"){
  const systems=(await getDevControlSystems()).systems.filter((x:any)=>x.key==="base"||x.key==="engine");
  return toolResult({systems});
 }
 if(name==="recent_dev_jobs")return toolResult(await getDevControlJobs(Number(args?.limit||20)));
 if(name==="prepare_release_source"){
  requireMutation(settings,mcp);
  if((args.target==="base"&&!mcp.expose_base)||(args.target==="engine"&&!mcp.expose_engine))throw new Error("Requested release target is disabled in MCP Controls");
  return toolResult(await preparePrimaryReleaseSource(actor,args.target,args.confirm===true));
 }
 if(name==="service_action"){
  requireMutation(settings,mcp);
  if((args.target==="license_manager"&&!mcp.expose_license_manager)||(args.target==="billing_store"&&!mcp.expose_billing_store))throw new Error("Requested service is disabled in MCP Controls");
  return toolResult(await runDevControlAction(actor,{target:args.target,action:args.action,confirm:args.confirm===true}));
 }
 if(name==="license_manager_view"){
  if(!mcp.expose_license_manager)throw new Error("License Manager tools are disabled");
  const map:any={health:"/license/health",licenses:"/license",products:"/products",releases:"/releases",channels:"/release-channels?include_disabled=true",authority:"/authority-control",lockdown:"/lockdown/status"};
  return toolResult(await licenseManagerRequest(map[args.view]));
 }
 if(name==="license_control"){
  requireMutation(settings,mcp);
  if(!mcp.expose_license_manager)throw new Error("License Manager tools are disabled");
  if(mcp.require_critical_confirmation&&args.confirm!==true)throw new Error("Explicit confirmation is required");
  const payload:any={action:args.action};if(args.installation_id)payload.installation_id=args.installation_id;
  const result=await licenseManagerRequest("/license/"+encodeURIComponent(String(args.license_id))+"/control",{method:"POST",body:JSON.stringify(payload)});
  await recordDevControlAudit(actor,"mcp.license."+args.action,"license_manager",{license_id:args.license_id});
  return toolResult(result);
 }
 if(name==="authority_lockdown"){
  requireMutation(settings,mcp);
  if(!mcp.expose_authority_controls)throw new Error("Authority controls are disabled in MCP Controls");
  if(args.action==="enable"&&args.confirm!=="LOCKDOWN")throw new Error("LOCKDOWN confirmation required");
  if(args.action==="disable"&&args.confirm!=="UNLOCK")throw new Error("UNLOCK confirmation required");
  const result=args.action==="enable"
   ?await licenseManagerRequest("/lockdown",{method:"POST",body:JSON.stringify({confirm:"LOCKDOWN",reason:String(args.reason||"")})})
   :await licenseManagerRecoveryRequest({method:"POST",body:JSON.stringify({confirm:"UNLOCK",reason:String(args.reason||"")})});
  await recordDevControlAudit(actor,"mcp.authority_lockdown."+args.action,"license_manager",{reason:String(args.reason||"")});
  return toolResult(result);
 }
 throw new Error("Unknown MCP tool");
}

async function handlePost(request:Request){
 if(!originAllowed(request))return rpcError(null,-32000,"Origin not allowed",403);
 if(!authorized(request))return new Response(JSON.stringify({jsonrpc:"2.0",id:null,error:{code:-32001,message:"Unauthorized"}}),{status:401,headers:{"content-type":"application/json","www-authenticate":"Bearer","cache-control":"no-store"}});
 const body=await request.json().catch(()=>null);
 if(!body||body.jsonrpc!=="2.0"||typeof body.method!=="string")return rpcError(body?.id??null,-32600,"Invalid Request",400);
 const id=body.id??null;
 if(body.method==="initialize")return rpc(id,{protocolVersion:"2025-11-25",capabilities:{tools:{listChanged:false}},serverInfo:{name:"orbitfs-dev-mcp",version:"0.1.0"}});
 if(body.method==="notifications/initialized"||body.method==="notifications/cancelled")return new Response(null,{status:202});
 if(body.method==="ping")return rpc(id,{});
 if(body.method==="tools/list")return rpc(id,{tools});
 if(body.method==="tools/call"){
  try{return rpc(id,await callTool(String(body.params?.name||""),body.params?.arguments||{}))}
  catch(error){return rpc(id,{content:[{type:"text",text:error instanceof Error?error.message:"Tool failed"}],isError:true})}
 }
 return rpcError(id,-32601,"Method not found");
}

export const Route=createFileRoute("/devmcp")({server:{handlers:{
 OPTIONS:async()=>new Response(null,{status:204,headers:{"access-control-allow-origin":"*","access-control-allow-methods":"POST,GET,OPTIONS","access-control-allow-headers":"authorization,content-type,mcp-protocol-version","access-control-max-age":"86400"}}),
 GET:async({request})=>originAllowed(request)?Response.json({ok:true,service:"orbitfs-dev-mcp",endpoint:"/devmcp",transport:"streamable-http",authentication:"bearer",ownerOnly:true},{headers:{"cache-control":"no-store"}}):Response.json({ok:false,error:"ORIGIN_NOT_ALLOWED"},{status:403}),
 POST:async({request})=>handlePost(request),
 DELETE:async()=>new Response(null,{status:204}),
}}});
