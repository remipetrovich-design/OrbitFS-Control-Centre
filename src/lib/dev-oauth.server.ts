import {createClient} from "@supabase/supabase-js";
import crypto from "node:crypto";
import {authenticateOwnerCredentials} from "@/lib/panel.server";

const DEFAULT_ORIGIN="https://dev.incendiarynetworks.cc";
const SUPPORTED_SCOPES=["dev.read","dev.write","authority.write"] as const;
const ACCESS_TTL_SECONDS=60*60;
const REFRESH_TTL_SECONDS=60*60*24*30;
const CODE_TTL_SECONDS=5*60;

async function oauthPolicy(){
 const defaults={oauth_dcr_enabled:true,oauth_cimd_enabled:true,oauth_refresh_tokens_enabled:true};
 const {data,error}=await db().from("dev_mcp_settings").select("*").eq("id",true).maybeSingle();
 if(error||!data)return defaults;
 return {
  oauth_dcr_enabled:data.oauth_dcr_enabled!==false,
  oauth_cimd_enabled:data.oauth_cimd_enabled!==false,
  oauth_refresh_tokens_enabled:data.oauth_refresh_tokens_enabled!==false
 };
}

function required(name:string){const value=process.env[name];if(!value)throw new Error("Missing server environment variable: "+name);return value}
function db(){return createClient(required("SUPABASE_URL"),required("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false}})}
function origin(){return String(process.env.DEV_MCP_PUBLIC_ORIGIN||process.env.APP_URL||DEFAULT_ORIGIN).replace(/\/+$/,"")}
export function oauthIssuer(){return origin()}
export function mcpResource(){return String(process.env.DEV_MCP_RESOURCE||origin()+"/devmcp").replace(/\/+$/,"")}
export function oauthResourceMetadataUrl(){return origin()+"/.well-known/oauth-protected-resource"}
export function oauthChallenge(scopes:string[]=["dev.read"]){return `Bearer resource_metadata="${oauthResourceMetadataUrl()}", scope="${scopes.join(" ")}"`}
function hash(value:string){return crypto.createHash("sha256").update(value).digest("hex")}
function randomToken(prefix:string){return prefix+crypto.randomBytes(32).toString("base64url")}
function pkceChallenge(verifier:string){return crypto.createHash("sha256").update(verifier).digest("base64url")}
function parseScopes(value:any){
 const raw=Array.isArray(value)?value.map(String):String(value||"").split(/\s+/);
 const scopes=[...new Set(raw.map(x=>x.trim()).filter(Boolean))];
 for(const scope of scopes)if(!SUPPORTED_SCOPES.includes(scope as any))throw new Error("Unsupported OAuth scope: "+scope);
 return scopes.length?scopes:["dev.read"];
}
function allowedRedirect(uri:string){
 try{
  const u=new URL(uri);
  if(u.protocol!=="https:"){
   if(String(process.env.DEV_MCP_OAUTH_ALLOW_LOCALHOST||"false").toLowerCase()==="true"&&["localhost","127.0.0.1"].includes(u.hostname))return true;
   return false;
  }
  const hosts=String(process.env.DEV_MCP_OAUTH_REDIRECT_HOSTS||"chatgpt.com,chat.openai.com,openai.com")
   .split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
  return hosts.some(host=>u.hostname===host||u.hostname.endsWith("."+host));
 }catch{return false}
}
function safeEqual(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&crypto.timingSafeEqual(x,y)}

export function protectedResourceMetadata(){
 return {
  resource:mcpResource(),
  authorization_servers:[oauthIssuer()],
  scopes_supported:[...SUPPORTED_SCOPES],
  resource_documentation:origin()+"/docs/dev-mcp",
 };
}
export async function authorizationServerMetadata(){
 const policy=await oauthPolicy();
 return {
  issuer:oauthIssuer(),
  authorization_endpoint:origin()+"/oauth/authorize",
  token_endpoint:origin()+"/oauth/token",
  ...(policy.oauth_dcr_enabled?{registration_endpoint:origin()+"/oauth/register"}:{}),
  client_id_metadata_document_supported:policy.oauth_cimd_enabled,
  authorization_response_iss_parameter_supported:true,
  token_endpoint_auth_methods_supported:["none"],
  grant_types_supported:policy.oauth_refresh_tokens_enabled?["authorization_code","refresh_token"]:["authorization_code"],
  response_types_supported:["code"],
  code_challenge_methods_supported:["S256"],
  scopes_supported:[...SUPPORTED_SCOPES],
 };
}

export async function registerOAuthClient(body:any){
 const policy=await oauthPolicy();
 if(!policy.oauth_dcr_enabled)throw new Error("Dynamic Client Registration is disabled");
 const redirectUris=Array.isArray(body?.redirect_uris)?body.redirect_uris.map(String):[];
 if(!redirectUris.length||redirectUris.some(uri=>!allowedRedirect(uri)))throw new Error("Invalid or unsupported redirect_uri");
 const authMethod=String(body?.token_endpoint_auth_method||"none");
 if(authMethod!=="none")throw new Error("Only public OAuth clients are supported");
 const defaultGrants=policy.oauth_refresh_tokens_enabled?["authorization_code","refresh_token"]:["authorization_code"];
 const grantTypes=Array.isArray(body?.grant_types)?body.grant_types.map(String):defaultGrants;
 const allowedGrants=policy.oauth_refresh_tokens_enabled?["authorization_code","refresh_token"]:["authorization_code"];
 if(grantTypes.some(x=>!allowedGrants.includes(x)))throw new Error("Unsupported grant type");
 const responseTypes=Array.isArray(body?.response_types)?body.response_types.map(String):["code"];
 if(responseTypes.some(x=>x!=="code"))throw new Error("Unsupported response type");
 const clientId=randomToken("odmcp_");
 const row={
  client_id:clientId,
  client_name:String(body?.client_name||"OpenAI MCP Client").slice(0,160),
  redirect_uris:redirectUris,
  token_endpoint_auth_method:"none",
  grant_types:grantTypes,
  response_types:responseTypes,
  registration_method:"dcr",
 };
 const {error}=await db().from("dev_oauth_clients").insert(row);
 if(error)throw new Error("Unable to register OAuth client");
 return {...row,client_id_issued_at:Math.floor(Date.now()/1000)};
}
function cimdUrlAllowed(value:string){
 try{
  const u=new URL(value);
  if(u.protocol!=="https:"||u.username||u.password||u.hash||u.search||u.pathname==="/"||!u.pathname)return false;
  const hosts=String(process.env.DEV_MCP_OAUTH_CIMD_HOSTS||"chatgpt.com,openai.com").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
  return hosts.some(host=>u.hostname===host||u.hostname.endsWith("."+host));
 }catch{return false}
}
async function resolveCimdClient(clientId:string){
 const policy=await oauthPolicy();
 if(!policy.oauth_cimd_enabled)throw new Error("Client ID Metadata Documents are disabled");
 if(!cimdUrlAllowed(clientId))throw new Error("Unsupported CIMD client_id");
 const response=await fetch(clientId,{headers:{accept:"application/json"},redirect:"error",cache:"no-store",signal:AbortSignal.timeout(5000)});
 if(!response.ok)throw new Error("Unable to fetch CIMD client metadata");
 const doc:any=await response.json().catch(()=>null);
 if(!doc||String(doc.client_id||"")!==clientId)throw new Error("CIMD client_id does not match metadata URL");
 const redirectUris=Array.isArray(doc.redirect_uris)?doc.redirect_uris.map(String):[];
 if(!redirectUris.length||redirectUris.some(uri=>!allowedRedirect(uri)))throw new Error("CIMD redirect_uris are not allowed");
 const grantTypes=Array.isArray(doc.grant_types)?doc.grant_types.map(String):["authorization_code"];
 if(!grantTypes.includes("authorization_code"))throw new Error("CIMD client must support authorization_code");
 const responseTypes=Array.isArray(doc.response_types)?doc.response_types.map(String):["code"];
 if(!responseTypes.includes("code"))throw new Error("CIMD client must support code response type");
 const methods=Array.isArray(doc.token_endpoint_auth_methods_supported)?doc.token_endpoint_auth_methods_supported.map(String):[String(doc.token_endpoint_auth_method||"none")];
 if(!methods.includes("none"))throw new Error("This Dev MCP currently requires CIMD public-client token exchange");
 const row={
  client_id:clientId,
  client_name:String(doc.client_name||"OpenAI MCP Client").slice(0,160),
  redirect_uris:redirectUris,
  token_endpoint_auth_method:"none",
  grant_types:grantTypes,
  response_types:responseTypes,
  registration_method:"cimd"
 };
 const {error}=await db().from("dev_oauth_clients").upsert(row,{onConflict:"client_id"});
 if(error)throw new Error("Unable to cache CIMD client");
 return row;
}
export async function getOAuthClient(clientId:string){
 if(/^https:\/\//i.test(clientId))return resolveCimdClient(clientId);
 const {data,error}=await db().from("dev_oauth_clients").select("*").eq("client_id",clientId).maybeSingle();
 if(error||!data)throw new Error("Unknown OAuth client");
 return data;
}

export async function validateAuthorizationRequest(input:Record<string,string>){
 if(String(input.response_type||"")!=="code")throw new Error("response_type must be code");
 const clientId=String(input.client_id||"").trim();
 const redirectUri=String(input.redirect_uri||"").trim();
 const client=await getOAuthClient(clientId);
 if(!Array.isArray(client.redirect_uris)||!client.redirect_uris.includes(redirectUri))throw new Error("redirect_uri is not registered");
 if(String(input.code_challenge_method||"")!=="S256")throw new Error("PKCE S256 is required");
 const challenge=String(input.code_challenge||"").trim();
 if(challenge.length<43)throw new Error("A valid PKCE code_challenge is required");
 const resource=String(input.resource||"").replace(/\/+$/,"");
 if(resource!==mcpResource())throw new Error("Invalid OAuth resource");
 const scopes=parseScopes(input.scope);
 return {clientId,redirectUri,challenge,resource,scopes,state:String(input.state||""),client};
}

export async function authorizeOwner(input:Record<string,string>,email:string,password:string){
 const request=await validateAuthorizationRequest(input);
 const owner=await authenticateOwnerCredentials(email,password);
 const code=randomToken("odc_");
 const expiresAt=new Date(Date.now()+CODE_TTL_SECONDS*1000).toISOString();
 const {error}=await db().from("dev_oauth_codes").insert({
  code_hash:hash(code),client_id:request.clientId,user_id:owner.id,redirect_uri:request.redirectUri,
  scopes:request.scopes,resource:request.resource,code_challenge:request.challenge,expires_at:expiresAt,
 });
 if(error)throw new Error("Unable to issue OAuth authorization code");

 return {code,owner,...request};
}

async function issueTokens(clientId:string,userId:string,scopes:string[],resource:string){
 const policy=await oauthPolicy();
 const access=randomToken("oda_"),refresh=policy.oauth_refresh_tokens_enabled?randomToken("odr_"):"";
 const now=Date.now();
 const rows:any[]=[
  {token_hash:hash(access),token_type:"access",client_id:clientId,user_id:userId,scopes,resource,expires_at:new Date(now+ACCESS_TTL_SECONDS*1000).toISOString()},
 ];
 if(refresh)rows.push({token_hash:hash(refresh),token_type:"refresh",client_id:clientId,user_id:userId,scopes,resource,expires_at:new Date(now+REFRESH_TTL_SECONDS*1000).toISOString()});
 const {error}=await db().from("dev_oauth_tokens").insert(rows);
 if(error)throw new Error("Unable to issue OAuth tokens");
 return {access_token:access,token_type:"Bearer",expires_in:ACCESS_TTL_SECONDS,...(refresh?{refresh_token:refresh}:{}),scope:scopes.join(" ")};
}

export async function exchangeOAuthToken(form:Record<string,string>){
 const grant=String(form.grant_type||"");
 const clientId=String(form.client_id||"").trim();
 await getOAuthClient(clientId);
 const resource=String(form.resource||"").replace(/\/+$/,"");
 if(resource!==mcpResource())throw new Error("Invalid OAuth resource");

 if(grant==="authorization_code"){
  const code=String(form.code||""),redirectUri=String(form.redirect_uri||""),verifier=String(form.code_verifier||"");
  if(!code||!redirectUri||!verifier)throw new Error("Missing authorization_code grant fields");
  const tokenHash=hash(code);
  const {data:row,error}=await db().from("dev_oauth_codes").select("*").eq("code_hash",tokenHash).maybeSingle();
  if(error||!row||row.used_at||new Date(row.expires_at).getTime()<=Date.now())throw new Error("Invalid or expired authorization code");
  if(row.client_id!==clientId||row.redirect_uri!==redirectUri||row.resource!==resource)throw new Error("Authorization code binding mismatch");
  if(!safeEqual(pkceChallenge(verifier),String(row.code_challenge)))throw new Error("PKCE verification failed");
  const {data:claimed,error:claimError}=await db().from("dev_oauth_codes").update({used_at:new Date().toISOString()}).eq("code_hash",tokenHash).is("used_at",null).select("code_hash").maybeSingle();
  if(claimError||!claimed)throw new Error("Authorization code already used");
  return issueTokens(clientId,row.user_id,Array.isArray(row.scopes)?row.scopes.map(String):[],resource);
 }

 if(grant==="refresh_token"){
  const policy=await oauthPolicy();if(!policy.oauth_refresh_tokens_enabled)throw new Error("Refresh tokens are disabled");
  const refresh=String(form.refresh_token||"");
  if(!refresh)throw new Error("refresh_token is required");
  const refreshHash=hash(refresh);
  const {data:row,error}=await db().from("dev_oauth_tokens").select("*").eq("token_hash",refreshHash).eq("token_type","refresh").maybeSingle();
  if(error||!row||row.revoked_at||new Date(row.expires_at).getTime()<=Date.now())throw new Error("Invalid or expired refresh token");
  if(row.client_id!==clientId||row.resource!==resource)throw new Error("Refresh token binding mismatch");
  await db().from("dev_oauth_tokens").update({revoked_at:new Date().toISOString()}).eq("token_hash",refreshHash);
  return issueTokens(clientId,row.user_id,Array.isArray(row.scopes)?row.scopes.map(String):[],resource);
 }
 throw new Error("Unsupported grant_type");
}

export async function authenticateMcpOAuth(request:Request,requiredScopes:string[]=[]){
 const raw=String(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
 if(!raw)return null;
 const {data:token,error}=await db().from("dev_oauth_tokens").select("*").eq("token_hash",hash(raw)).eq("token_type","access").maybeSingle();
 if(error||!token||token.revoked_at||new Date(token.expires_at).getTime()<=Date.now()||token.resource!==mcpResource())return null;
 const scopes=Array.isArray(token.scopes)?token.scopes.map(String):[];
 if(requiredScopes.some(scope=>!scopes.includes(scope)))return {valid:false,scopes,clientId:token.client_id,user:null};
 const {data:user,error:userError}=await db().from("users").select("id,email,display_name,role,status").eq("id",token.user_id).maybeSingle();
 if(userError||!user||user.status!=="active"||String(user.role).toLowerCase()!=="owner")return null;
 return {valid:true,scopes,clientId:token.client_id,user:{id:user.id,email:user.email,display_name:user.display_name,role:user.role}};
}

export async function oauthAdminState(){
 const [{data:clients,error:clientError},{data:tokens,error:tokenError}]=await Promise.all([
  db().from("dev_oauth_clients").select("*").order("created_at",{ascending:false}),
  db().from("dev_oauth_tokens").select("client_id,token_type,scopes,expires_at,revoked_at,created_at").order("created_at",{ascending:false}).limit(500)
 ]);
 if(clientError||tokenError)throw new Error("Unable to load OAuth connections");
 const now=Date.now(),rows=clients||[],all=tokens||[];
 return {
  clients:rows.map((client:any)=>{
   const mine=all.filter((t:any)=>t.client_id===client.client_id);
   const active=mine.filter((t:any)=>!t.revoked_at&&new Date(t.expires_at).getTime()>now);
   return {...client,activeAccess:active.filter((t:any)=>t.token_type==="access").length,activeRefresh:active.filter((t:any)=>t.token_type==="refresh").length,lastIssuedAt:mine[0]?.created_at||null,lastExpiresAt:active.map((t:any)=>t.expires_at).sort().at(-1)||null};
  }),
  activeTokens:all.filter((t:any)=>!t.revoked_at&&new Date(t.expires_at).getTime()>now).length
 };
}
export async function revokeOAuthConnection(input:{clientId?:string;removeClient?:boolean;all?:boolean}){
 const now=new Date().toISOString();
 if(input.all){
  const {error}=await db().from("dev_oauth_tokens").update({revoked_at:now}).is("revoked_at",null);
  if(error)throw new Error("Unable to revoke OAuth sessions");
  return {ok:true,all:true};
 }
 const clientId=String(input.clientId||"").trim();if(!clientId)throw new Error("clientId is required");
 const {error}=await db().from("dev_oauth_tokens").update({revoked_at:now}).eq("client_id",clientId).is("revoked_at",null);
 if(error)throw new Error("Unable to revoke OAuth sessions");
 if(input.removeClient){
  const {error:deleteError}=await db().from("dev_oauth_clients").delete().eq("client_id",clientId);
  if(deleteError)throw new Error("Unable to remove OAuth client");
 }
 return {ok:true,clientId,removed:Boolean(input.removeClient)};
}

export function oauthAuthorizeHtml(input:Record<string,string>,clientName:string,errorMessage=""){
 const hidden=Object.entries(input).map(([k,v])=>`<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}">`).join("");
 const scopes=escapeHtml(String(input.scope||"dev.read"));
 const error=errorMessage?`<div class="error">${escapeHtml(errorMessage)}</div>`:"";
 return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Authorize Private Dev Panel</title><style>
 body{margin:0;background:#080b10;color:#eef2f7;font:14px system-ui,sans-serif;min-height:100vh;display:grid;place-items:center;padding:24px}.card{width:min(460px,100%);background:#10151d;border:1px solid #273140;border-radius:18px;padding:24px;box-sizing:border-box}.eyebrow{font-size:10px;letter-spacing:.18em;color:#8ba0b8;text-transform:uppercase}h1{font-size:24px;margin:8px 0}.muted{color:#95a3b4;line-height:1.55}.scope{margin:16px 0;padding:12px;border:1px solid #273140;border-radius:10px;background:#0b1016;font-family:monospace;font-size:12px}label{display:block;margin-top:14px;font-size:12px;color:#b8c3d1}input[type=email],input[type=password]{width:100%;margin-top:6px;padding:11px 12px;border-radius:9px;border:1px solid #303b4b;background:#090e14;color:#fff;box-sizing:border-box}button{width:100%;margin-top:18px;padding:11px 14px;border:0;border-radius:9px;background:#6487ff;color:white;font-weight:700;cursor:pointer}.error{margin-top:14px;padding:10px;border-radius:9px;background:#471b21;color:#ffbec6}.warn{margin-top:16px;color:#e6c27a;font-size:12px;line-height:1.5}</style></head><body><form class="card" method="post">
 <div class="eyebrow">PRIVATE DEVELOPER MCP</div><h1>Authorize Dev MCP</h1>
 <p class="muted"><b>${escapeHtml(clientName||"OpenAI MCP Client")}</b> is requesting access to your private Dev Panel.</p>
 <div class="scope">Scopes: ${scopes}</div>${error}${hidden}
 <label>Owner email<input name="owner_email" type="email" autocomplete="username" required></label>
 <label>Owner password<input name="owner_password" type="password" autocomplete="current-password" required></label>
 <div class="warn">This MCP can control Base, Engine/updater, licensing and service operations according to MCP settings. Only authorize your own ChatGPT/Codex connection.</div>
 <button type="submit">Authorize Private Dev Panel</button>
 </form></body></html>`;
}
function escapeHtml(value:any){return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]||ch))}
