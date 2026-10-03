import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import {activeGithubProfile,activeGithubProfileName,clearGithubProfileCache,githubProfileDefinitions,githubToken} from "@/lib/github-profile";

async function githubContext(){
 const profile=await activeGithubProfile();
 return {
  BASE_REPO:profile.base.repo,
  BASE_REF:profile.base.releaseRef,
  BASE_WORKER_REPO:profile.devPanel.repo,
  BASE_WORKER_REF:profile.devPanel.branch,
  ENGINE_REPO:profile.engine.repo,
  ENGINE_REF:profile.engine.releaseRef,
  ENGINE_BASELINE_REF:profile.engine.baselineRef,
  profile
 };
}
const BASE_WORKFLOW=process.env.BASE_RELEASE_WORKER_WORKFLOW||"package-base-release.yml";
const ENGINE_WORKFLOW=process.env.ENGINE_RELEASE_WORKFLOW||"publish-engine-release.yml";

const required=(name:string)=>{const v=process.env[name];if(!v)throw new Error(`Missing server environment variable: ${name}`);return v};
const TRUSTED_MASTER_BOOTSTRAP_URL="https://incendiarynetworks.cc/api/v1";
function normalizeOfficialMasterUrl(value:string){
 try{
  const u=new URL(String(value||"").trim());
  const host=u.hostname.toLowerCase(),path=u.pathname.replace(/\/+$/,"");
  if(u.protocol!=="https:"||(host!=="incendiarynetworks.cc"&&!host.endsWith(".incendiarynetworks.cc"))||path!=="/api/v1"||u.username||u.password||u.search||u.hash)return null;
  return u.origin+"/api/v1";
 }catch{return null}
}
let officialApiRegistryCache:{expires:number;connections:any[]}|null=null;
async function officialMasterConnections(force=false){
 if(!force&&officialApiRegistryCache&&officialApiRegistryCache.expires>Date.now())return officialApiRegistryCache.connections;
 let connections:any[]=[];
 try{
  const url=new URL(TRUSTED_MASTER_BOOTSTRAP_URL+"/api-connections");
  url.searchParams.set("client","dev_panel");url.searchParams.set("service","license_manager");
  const response=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(5000)});
  if(response.ok){
   const body=await response.json().catch(()=>({}));
   connections=(Array.isArray(body?.connections)?body.connections:[])
    .filter((row:any)=>row?.enabled!==false&&normalizeOfficialMasterUrl(String(row?.base_url||"")))
    .map((row:any)=>({...row,base_url:normalizeOfficialMasterUrl(String(row.base_url))}));
  }
 }catch{}
 if(!connections.length)connections=[{service_key:"license_manager",label:"Primary License Manager API",base_url:TRUSTED_MASTER_BOOTSTRAP_URL,enabled:true,priority:10,settings:{bootstrap:true}}];
 connections.sort((a:any,b:any)=>Number(a.priority||100)-Number(b.priority||100));
 officialApiRegistryCache={expires:Date.now()+30_000,connections};
 return connections;
}
async function configuredMasterUrl(){
 const official=await officialMasterConnections();
 const allowed=new Set(official.map((row:any)=>String(row.base_url)));
 let selected=allowed.has(TRUSTED_MASTER_BOOTSTRAP_URL)?TRUSTED_MASTER_BOOTSTRAP_URL:String(official[0]?.base_url||TRUSTED_MASTER_BOOTSTRAP_URL);
 try{
  const {data}=await authClient().from("panel_api_connections").select("selected_url").eq("service_key","license_manager").maybeSingle();
  const saved=normalizeOfficialMasterUrl(String(data?.selected_url||""));
  if(saved&&allowed.has(saved))selected=saved;
 }catch{}
 return selected;
}
const normalizeChannel=(value:string)=>String(value||"stable").trim().toLowerCase();
const ENGINE_BASE_COMPATIBILITY_CHANNEL=normalizeChannel(process.env.ENGINE_BASE_COMPATIBILITY_CHANNEL||"stable");
function parseSemVer(value:string){
 const match=String(value||"").trim().match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
 if(!match)return null;
 return {core:[Number(match[1]),Number(match[2]),Number(match[3])],pre:match[4]?match[4].split("."):[]};
}
function compareSemVer(left:string,right:string){
 const a=parseSemVer(left),b=parseSemVer(right);
 if(!a||!b)return null;
 for(let i=0;i<3;i++){if(a.core[i]!==b.core[i])return a.core[i]>b.core[i]?1:-1}
 if(!a.pre.length&&!b.pre.length)return 0;
 if(!a.pre.length)return 1;
 if(!b.pre.length)return -1;
 const length=Math.max(a.pre.length,b.pre.length);
 for(let i=0;i<length;i++){
  const av=a.pre[i],bv=b.pre[i];
  if(av===undefined)return -1;if(bv===undefined)return 1;if(av===bv)continue;
  const an=/^\d+$/.test(av),bn=/^\d+$/.test(bv);
  if(an&&bn)return Number(av)>Number(bv)?1:-1;
  if(an!==bn)return an?-1:1;
  return av>bv?1:-1;
 }
 return 0;
}

function detectUpdateComponents(files:any[]){
 const out:string[]=[];
 const add=(value:string)=>{if(["base","apex","mcp","studio"].includes(value)&&!out.includes(value))out.push(value)};
 for(const item of files||[]){
  const path=String(item?.filename||item?.file||"").toLowerCase().replaceAll("\\","/");
  const migration=path.match(/^supabase\/migrations\/(shared|base|apex|mcp|studio)\/\d{14}_[a-z0-9._-]+\.sql$/i);
  const sourcePath=path.startsWith("src/")||/^(package(-lock)?\.json|tsconfig\.json|vite\.config\.ts|\.npmrc)$/.test(path);
  if(path.startsWith("updates/base/overlay/")&&!path.endsWith("/.gitkeep")&&!path.endsWith(".gitkeep"))add("base");
  if(path==="updates/base/delete.txt"){
   const patch=String(item?.patch||"");
   const addsRealDeletion=patch.split("\n").some((line:string)=>line.startsWith("+")&&!line.startsWith("+++")&&Boolean(line.slice(1).trim())&&!line.slice(1).trim().startsWith("#"));
   // A complete tree diff can detect this file even when GitHub omits patch
   // metadata after its compare-file cap. In that case prefer a conservative
   // Base target rather than silently missing a deletion instruction.
   if(addsRealDeletion||(!patch&&String(item?.status||"").toLowerCase()!=="removed"))add("base");
  }
  if(migration&&migration[1]!=="shared")add(migration[1].toLowerCase());
  if(path.includes("/addons/apex/"))add("apex");
  if(path.includes("/addons/mcp/"))add("mcp");
  if(path.includes("/addons/studio/"))add("studio");
  if(!migration&&sourcePath&&!path.includes("/addons/apex/")&&!path.includes("/addons/mcp/")&&!path.includes("/addons/studio/")){
   add("apex");add("mcp");add("studio");
  }
 }
 return out;
}

type SourceFileChange={
 filename:string;
 status:string;
 additions:number;
 deletions:number;
 changes:number;
 patch?:string;
 previous_filename?:string|null;
 size?:number;
 lineStatsKnown?:boolean;
};

async function sourceTreeFiles(repo:string,commitSha:string){
 const commit=await github(`/repos/${repo}/git/commits/${encodeURIComponent(commitSha)}`);
 const treeSha=String(commit?.tree?.sha||"");
 if(!treeSha)throw new Error(`Could not resolve source tree for ${repo}@${commitSha.slice(0,8)}`);
 const walk=async(sha:string,prefix=""):Promise<any[]>=>{
  const tree=await github(`/repos/${repo}/git/trees/${encodeURIComponent(sha)}`);
  const groups=await Promise.all((tree?.tree||[]).map(async(item:any)=>{
   const path=prefix?prefix+"/"+String(item.path||""):String(item.path||"");
   if(item.type==="tree")return walk(String(item.sha),path);
   if(item.type==="blob"&&path)return [{path,sha:String(item.sha||""),mode:String(item.mode||""),size:Number(item.size||0)}];
   return [];
  }));
  return groups.flat();
 };
 return walk(treeSha);
}

function sourceChangeSummary(files:any[]){
 const summary={total:0,added:0,modified:0,deleted:0,renamed:0,copied:0,snapshot:0,other:0};
 for(const file of files||[]){
  summary.total++;
  const status=String(file?.status||"modified").toLowerCase();
  if(status==="added")summary.added++;
  else if(status==="modified"||status==="changed")summary.modified++;
  else if(status==="removed"||status==="deleted")summary.deleted++;
  else if(status==="renamed")summary.renamed++;
  else if(status==="copied")summary.copied++;
  else if(status==="snapshot")summary.snapshot++;
  else summary.other++;
 }
 return summary;
}

async function sourceSnapshotFiles(repo:string,head:string):Promise<SourceFileChange[]>{
 const tree=await sourceTreeFiles(repo,head);
 return tree
  .sort((a:any,b:any)=>String(a.path).localeCompare(String(b.path)))
  .map((entry:any)=>({filename:String(entry.path),status:"snapshot",additions:0,deletions:0,changes:0,size:Number(entry.size||0),lineStatsKnown:false}));
}

async function sourceCompareCommits(repo:string,from:string,head:string){
 const commits:any[]=[];
 for(let page=1;page<=100;page++){
  const cmp=await github(`/repos/${repo}/compare/${encodeURIComponent(from)}...${encodeURIComponent(head)}?per_page=100&page=${page}`);
  const rows=cmp?.commits||[];
  commits.push(...rows);
  if(rows.length<100)break;
 }
 return commits;
}

async function completeSourceDiff(repo:string,from:string,head:string){
 const [before,after,compareMeta,commits]=await Promise.all([
  sourceTreeFiles(repo,from),
  sourceTreeFiles(repo,head),
  github(`/repos/${repo}/compare/${encodeURIComponent(from)}...${encodeURIComponent(head)}?per_page=100&page=1`),
  sourceCompareCommits(repo,from,head),
 ]);
 const beforeMap=new Map(before.map((entry:any)=>[String(entry.path),entry]));
 const afterMap=new Map(after.map((entry:any)=>[String(entry.path),entry]));
 const changes=new Map<string,SourceFileChange>();

 for(const path of new Set([...beforeMap.keys(),...afterMap.keys()])){
  const oldFile:any=beforeMap.get(path),newFile:any=afterMap.get(path);
  if(!oldFile&&newFile)changes.set(path,{filename:path,status:"added",additions:0,deletions:0,changes:0,size:Number(newFile.size||0),lineStatsKnown:false});
  else if(oldFile&&!newFile)changes.set(path,{filename:path,status:"removed",additions:0,deletions:0,changes:0,size:Number(oldFile.size||0),lineStatsKnown:false});
  else if(oldFile&&newFile&&(oldFile.sha!==newFile.sha||oldFile.mode!==newFile.mode)){
   changes.set(path,{filename:path,status:"modified",additions:0,deletions:0,changes:0,size:Number(newFile.size||0),lineStatsKnown:false});
  }
 }

 const metadata=Array.isArray(compareMeta?.files)?compareMeta.files:[];
 for(const file of metadata){
  const filename=String(file?.filename||"");
  if(!filename)continue;
  const status=String(file?.status||"modified").toLowerCase();
  const previous=String(file?.previous_filename||"").trim();
  if(status==="renamed"&&previous){
   changes.delete(previous);
   changes.delete(filename);
  }
  const existing=changes.get(filename);
  changes.set(filename,{
   filename,
   status,
   additions:Number(file?.additions||0),
   deletions:Number(file?.deletions||0),
   changes:Number(file?.changes||0),
   patch:String(file?.patch||""),
   previous_filename:previous||null,
   size:Number((afterMap.get(filename) as any)?.size||(existing as any)?.size||0),
   lineStatsKnown:true,
  });
 }

 const files=[...changes.values()].sort((a,b)=>a.filename.localeCompare(b.filename));
 return {
  files,
  commits,
  summary:sourceChangeSummary(files),
  diffComplete:true,
  compareMetadataFiles:metadata.length,
  baselineFileCount:before.length,
  currentFileCount:after.length,
 };
}

async function initialEngineSourceBaseline(head:string){
 const {ENGINE_REPO,ENGINE_REF}=await githubContext();
 const config=await github(`/repos/${ENGINE_REPO}/contents/release/update-baseline.json?ref=${encodeURIComponent(ENGINE_REF)}`);
 const raw=String(config?.content||"").replace(/\n/g,"");
 let parsed:any={};
 try{parsed=JSON.parse(Buffer.from(raw,"base64").toString("utf8"))}catch{throw new Error("Engine update baseline declaration is invalid JSON");}
 const initialReleaseVersion=String(parsed?.initialReleaseVersion||"").trim();
 if(parsed?.locked!==true)throw new Error("Engine update baseline must be explicitly locked before the first Update release.");
 if(String(parsed?.mode||"")!=="snapshot")throw new Error("Engine first Update baseline must use snapshot mode.");
 if(String(parsed?.sourceRepository||"")!==ENGINE_REPO||String(parsed?.releaseBranch||"")!==ENGINE_REF)throw new Error("Engine update baseline declaration does not match the configured Update source.");
 if(!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(initialReleaseVersion))throw new Error("Engine update baseline declaration is missing a valid initialReleaseVersion");
 if(!/^[a-f0-9]{40}$/i.test(head))throw new Error("Could not resolve the exact UPDATE_RELEASE snapshot SHA.");
 return {sha:head,ref:"release/update-baseline.json",initialReleaseVersion,locked:true,mode:"snapshot",components:["apex","mcp","studio"]};
}

type PanelUser={id:string;email:string;display_name:string;role:string};
const sessionSecret=()=>required("APP_SESSION_SECRET");

function signSession(user:PanelUser){
 const payload=Buffer.from(JSON.stringify({...user,exp:Date.now()+7*86400000})).toString("base64url");
 const sig=crypto.createHmac("sha256",sessionSecret()).update(payload).digest("base64url");
 return `${payload}.${sig}`;
}
function readSession(token:string):PanelUser{
 const [payload,sig]=String(token||"").split(".");
 if(!payload||!sig)throw new Error("Not signed in");
 const expected=crypto.createHmac("sha256",sessionSecret()).update(payload).digest("base64url");
 if(sig.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))throw new Error("Your session is no longer valid");
 const user=JSON.parse(Buffer.from(payload,"base64url").toString()) as PanelUser & {exp:number};
 if(!user.id||!user.email||user.exp<Date.now())throw new Error("Your session is no longer valid");
 return user;
}

function authClient(){
 return createClient(required("SUPABASE_URL"),required("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false}});
}
function verifyPassword(password:string,hash:string,salt:string){
 const derived=crypto.scryptSync(password,salt,64);
 const stored=Buffer.from(hash,"hex");
 return derived.length===stored.length&&crypto.timingSafeEqual(derived,stored);
}

export function requireOwner(token:string){
 const user=readSession(token);
 if(String(user.role).toLowerCase()!=="owner")throw new Error("Owner access required");
 return user;
}

export const getDevPanelSettings=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string}})=>{
 requireOwner(data.token);
 const sb=authClient();
 const {data:row,error}=await sb.from("dev_panel_settings").select("github_profile,updated_at,updated_by").eq("id",true).maybeSingle();
 if(error)throw new Error("Unable to load Dev Panel settings: "+error.message);
 const profile=String(row?.github_profile||await activeGithubProfileName())==="fallback"?"fallback":"primary";
 return {github_profile:profile,updated_at:row?.updated_at||null,profiles:githubProfileDefinitions()};
});

export const updateDevPanelSettings=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string;github_profile:"primary"|"fallback"}})=>{
 const actor=requireOwner(data.token);
 const profile=data.github_profile==="fallback"?"fallback":"primary";
 const {error}=await authClient().from("dev_panel_settings").upsert({
  id:true,github_profile:profile,updated_by:actor.id,updated_at:new Date().toISOString()
 },{onConflict:"id"});
 if(error)throw new Error("Unable to update Dev Panel settings: "+error.message);
 clearGithubProfileCache();
 return {github_profile:profile,profiles:githubProfileDefinitions()};
});
function hashPassword(password:string){
 if(password.length<10)throw new Error("Temporary password must be at least 10 characters");
 const salt=crypto.randomBytes(16).toString("hex");
 const hash=crypto.scryptSync(password,salt,64).toString("hex");
 return {hash,salt};
}
const GROUP_PERMISSIONS=[
 "release.read","release.create","release.monitor","release.lifecycle",
 "channels.read","portal.read","repositories.read","monitoring.read","audit.read"
] as const;

export async function authenticateOwnerCredentials(emailInput:string,passwordInput:string){
 const email=String(emailInput||"").trim().toLowerCase(),password=String(passwordInput||"");
 if(!email||!password)throw new Error("Email and password are required");
 const sb=authClient();
 const {data:user,error}=await sb.from("users").select("id,email,password_hash,password_salt,display_name,role,status").ilike("email",email).maybeSingle();
 if(error)throw new Error("Unable to connect to Dev Panel users");
 if(!user||user.status!=="active"||String(user.role).toLowerCase()!=="owner"||!verifyPassword(password,user.password_hash,user.password_salt))throw new Error("Invalid owner credentials");
 await sb.from("users").update({last_login_at:new Date().toISOString()}).eq("id",user.id);
 return {id:user.id,email:user.email,display_name:user.display_name,role:user.role};
}

export const login=createServerFn({method:"POST"}).handler(async({data}:{data:{email:string;password:string}})=>{
 const email=String(data.email||"").trim().toLowerCase(),password=String(data.password||"");
 if(!email||!password)throw new Error("Email and password are required");
 const sb=authClient();
 const {data:user,error}=await sb.from("users").select("id,email,password_hash,password_salt,display_name,role,status").ilike("email",email).maybeSingle();
 if(error)throw new Error("Unable to connect to License Master users");
 if(!user||user.status!=="active"||!verifyPassword(password,user.password_hash,user.password_salt))throw new Error("Invalid credentials");
 await sb.from("users").update({last_login_at:new Date().toISOString()}).eq("id",user.id);
 const safe={id:user.id,email:user.email,display_name:user.display_name,role:user.role};
 return {ok:true,token:signSession(safe),user:safe};
});


export const getAccessState=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string}})=>{
 const actor=readSession(data.token);
 const sb=authClient();
 if(String(actor.role).toLowerCase()!=="owner") return {users:[],groups:[],ownerOnly:true,permissions:GROUP_PERMISSIONS};
 const [{data:users,error:usersError},{data:groups,error:groupsError},{data:memberships,error:membershipError}]=await Promise.all([
  sb.from("users").select("id,email,display_name,role,status,last_login_at,created_at").order("created_at",{ascending:true}),
  sb.from("access_groups").select("id,name,description,permissions,created_at").order("name",{ascending:true}),
  sb.from("user_access_groups").select("user_id,group_id"),
 ]);
 if(usersError)throw new Error("Unable to load Dev Panel users");
 if(groupsError)throw new Error("Unable to load access groups. Apply the Dev Panel access migration first.");
 if(membershipError)throw new Error("Unable to load group memberships");
 return {users:users||[],groups:groups||[],memberships:memberships||[],ownerOnly:false,permissions:GROUP_PERMISSIONS};
});

export const createPanelUser=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string;email:string;displayName:string;role:"owner"|"admin";password:string;groupIds?:string[]}})=>{
 const actor=requireOwner(data.token);
 const email=String(data.email||"").trim().toLowerCase();
 const displayName=String(data.displayName||"").trim();
 const role=String(data.role||"admin").toLowerCase();
 if(!email||!email.includes("@"))throw new Error("Enter a valid email address");
 if(!displayName)throw new Error("Display name is required");
 if(!["owner","admin"].includes(role))throw new Error("Role must be Owner or Admin");
 const {hash,salt}=hashPassword(String(data.password||""));
 const sb=authClient();
 const {data:user,error}=await sb.from("users").insert({email,display_name:displayName,role,status:"active",password_hash:hash,password_salt:salt}).select("id,email,display_name,role,status,last_login_at,created_at").single();
 if(error)throw new Error(error.code==="23505"?"A user with that email already exists":"Unable to create user");
 const groupIds=[...new Set((data.groupIds||[]).map(String).filter(Boolean))];
 if(groupIds.length){
  const {error:membershipError}=await sb.from("user_access_groups").insert(groupIds.map(group_id=>({user_id:user.id,group_id})));
  if(membershipError)throw new Error("User created, but group assignment failed");
 }
 await sb.from("panel_access_audit").insert({actor_id:actor.id,action:"user.created",target_type:"user",target_id:user.id,detail:{email,role}});
 return {user};
});

export const updatePanelUser=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string;userId:string;role?:"owner"|"admin";status?:"active"|"disabled";displayName?:string;password?:string;groupIds?:string[]}})=>{
 const actor=requireOwner(data.token);
 const sb=authClient();
 const patch:any={updated_at:new Date().toISOString()};
 if(data.role){if(!["owner","admin"].includes(data.role))throw new Error("Invalid role");patch.role=data.role}
 if(data.status){if(!["active","disabled"].includes(data.status))throw new Error("Invalid status");patch.status=data.status}
 if(typeof data.displayName==="string"){const v=data.displayName.trim();if(!v)throw new Error("Display name is required");patch.display_name=v}
 if(data.password){const hp=hashPassword(data.password);patch.password_hash=hp.hash;patch.password_salt=hp.salt}
 if(String(data.userId)===actor.id&&patch.status==="disabled")throw new Error("You cannot disable your own Owner account");
 if(patch.role==="admin"||patch.status==="disabled"){
  const {data:target}=await sb.from("users").select("role,status").eq("id",data.userId).maybeSingle();
  if(target?.role==="owner"&&target?.status==="active"){
   const {count}=await sb.from("users").select("id",{count:"exact",head:true}).eq("role","owner").eq("status","active");
   if((count||0)<=1)throw new Error("At least one active Owner account is required");
  }
 }
 const {data:user,error}=await sb.from("users").update(patch).eq("id",data.userId).select("id,email,display_name,role,status,last_login_at,created_at").single();
 if(error)throw new Error("Unable to update user");
 if(Array.isArray(data.groupIds)){
  const {error:deleteError}=await sb.from("user_access_groups").delete().eq("user_id",data.userId);
  if(deleteError)throw new Error("User updated, but group memberships could not be reset");
  const ids=[...new Set(data.groupIds.map(String).filter(Boolean))];
  if(ids.length){
   const {error:insertError}=await sb.from("user_access_groups").insert(ids.map(group_id=>({user_id:data.userId,group_id})));
   if(insertError)throw new Error("User updated, but group membership assignment failed");
  }
 }
 await sb.from("panel_access_audit").insert({actor_id:actor.id,action:"user.updated",target_type:"user",target_id:data.userId,detail:{role:data.role,status:data.status}});
 return {user};
});

export const createAccessGroup=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string;name:string;description?:string;permissions?:string[]}})=>{
 const actor=requireOwner(data.token);
 const name=String(data.name||"").trim();
 if(!name)throw new Error("Group name is required");
 const permissions=[...new Set((data.permissions||[]).filter((x:string)=>GROUP_PERMISSIONS.includes(x as any)))];
 const sb=authClient();
 const {data:group,error}=await sb.from("access_groups").insert({name,description:String(data.description||"").trim(),permissions}).select("*").single();
 if(error)throw new Error(error.code==="23505"?"A group with that name already exists":"Unable to create group");
 await sb.from("panel_access_audit").insert({actor_id:actor.id,action:"group.created",target_type:"group",target_id:group.id,detail:{name,permissions}});
 return {group};
});

export const updateAccessGroup=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string;groupId:string;name?:string;description?:string;permissions?:string[]}})=>{
 const actor=requireOwner(data.token);
 const patch:any={updated_at:new Date().toISOString()};
 if(typeof data.name==="string"){const name=data.name.trim();if(!name)throw new Error("Group name is required");patch.name=name}
 if(typeof data.description==="string")patch.description=data.description.trim();
 if(Array.isArray(data.permissions))patch.permissions=[...new Set(data.permissions.filter((x:string)=>GROUP_PERMISSIONS.includes(x as any)))];
 const sb=authClient();
 const {data:group,error}=await sb.from("access_groups").update(patch).eq("id",data.groupId).select("*").single();
 if(error)throw new Error("Unable to update group");
 await sb.from("panel_access_audit").insert({actor_id:actor.id,action:"group.updated",target_type:"group",target_id:data.groupId,detail:patch});
 return {group};
});

export const getApiConnectionState=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string}})=>{
 readSession(data.token);
 const [official,selectedUrl]=await Promise.all([officialMasterConnections(true),configuredMasterUrl()]);
 let row:any=null;
 try{const result=await authClient().from("panel_api_connections").select("*").eq("service_key","license_manager").maybeSingle();row=result.data||null;}catch{}
 return {authority:"orbitfs-license-manager",bootstrapUrl:TRUSTED_MASTER_BOOTSTRAP_URL,selectedUrl,officialConnections:official,connection:row};
});

export const saveApiConnection=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string;url:string}})=>{
 const actor=readSession(data.token);
 if(!["owner","admin"].includes(String(actor.role||"").toLowerCase()))throw new Error("Admin access required");
 const requested=normalizeOfficialMasterUrl(data.url);
 if(!requested)throw new Error("API URL must be an official HTTPS /api/v1 endpoint.");
 const official=await officialMasterConnections(true);
 if(!official.some((row:any)=>String(row.base_url)===requested))throw new Error("That URL is not an enabled official OrbitFS API for Dev Panel.");
 const now=new Date().toISOString();
 const {error}=await authClient().from("panel_api_connections").upsert({service_key:"license_manager",selected_url:requested,updated_by:actor.email||actor.id,updated_at:now},{onConflict:"service_key"});
 if(error)throw new Error("Unable to save Dev Panel API connection: "+error.message);
 return {ok:true,selectedUrl:requested};
});

export const testApiConnection=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string;url?:string}})=>{
 readSession(data.token);
 const requested=data.url?normalizeOfficialMasterUrl(data.url):await configuredMasterUrl();
 if(!requested)throw new Error("API URL is invalid.");
 const official=await officialMasterConnections(true);
 if(!official.some((row:any)=>String(row.base_url)===requested))throw new Error("That URL is not an enabled official OrbitFS API for Dev Panel.");
 const started=Date.now();
 const health=await requestJson(requested+"/license/health",{headers:{authorization:`Bearer ${required("LICENSE_MASTER_API_TOKEN")}`},cache:"no-store"});
 return {ok:true,url:requested,latencyMs:Date.now()-started,health};
});

export const getPanelState=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string;type:"base"|"engine";channel?:string}})=>{
 const {BASE_REPO,BASE_REF,BASE_WORKER_REPO,BASE_WORKER_REF,ENGINE_REPO,ENGINE_REF}=await githubContext();
 readSession(data.token);
 const releaseType=data.type==="base"?"base":"update",channel=normalizeChannel(data.channel),product="orbitfs_base";
 const [releases,channels]=await Promise.all([
  licenseMaster(`/releases?product=${product}&channel=${encodeURIComponent(channel)}&type=${releaseType}&include_archived=true`),
  licenseMaster(`/release-channels?include_disabled=false`)
 ]);
 const sb=authClient();
 const {data:drafts,error:draftError}=await sb.from("panel_release_drafts").select("*").eq("release_type",releaseType).eq("channel",channel).order("updated_at",{ascending:false});
 if(draftError)throw new Error("Unable to load release drafts: "+draftError.message);
 const ids=(drafts||[]).map((x:any)=>x.id);
 let attempts:any[]=[];
 if(ids.length){
  const {data:rows,error:attemptError}=await sb.from("panel_release_attempts").select("*").in("draft_id",ids).order("attempt_number",{ascending:false});
  if(attemptError)throw new Error("Unable to load release attempts: "+attemptError.message);
  attempts=rows||[];
 }
 const grouped=new Map<string,any[]>();
 for(const attempt of attempts){const list=grouped.get(attempt.draft_id)||[];list.push(attempt);grouped.set(attempt.draft_id,list)}
 // A handed-off Stage 1 snapshot is not authoritative. When its License Manager
 // record has been cleared, do not display it as a current release or draft.
 // An explicit new build reconciles and removes the orphan after checking its run.
 const authoritativeRows=(Array.isArray(releases?.releases)?releases.releases.filter((row:any)=>row&&typeof row==="object"):[]);
 const authoritativeKeys=new Set(authoritativeRows.filter((r:any)=>!r.archived_at).map((r:any)=>String(r.version||"")+"|"+String(r.channel||"").toLowerCase()));
 // Published state belongs to License Manager; never present that version/channel
 // as an editable Stage 1 draft even when GitHub completion polling was missed.
 const publishedKeys=new Set(authoritativeRows.filter((r:any)=>String(r.status||"").toLowerCase()==="published"&&!r.archived_at).map((r:any)=>String(r.version||"")+"|"+String(r.channel||"").toLowerCase()));
 const visibleDrafts=(drafts||[]).filter((d:any)=>Boolean(d?.inputs?.repackage)||!publishedKeys.has(String(d.version||"")+"|"+String(d.channel||"").toLowerCase()));
 // Refresh persisted in-flight attempts from GitHub, rather than assuming
 // that the browser stayed open long enough to save the completion event.
 for(const draft of visibleDrafts){
  const draftKey=String(draft.version||"")+"|"+String(draft.channel||"").toLowerCase();
  const repackageSourceId=String(draft?.inputs?.repackageReleaseId||"").trim();
  const repackageSourceRevision=Number(draft?.inputs?.repackageRevision||0);
  const authoritativeReceipt=repackageSourceId
   ? authoritativeRows.some((r:any)=>!r.archived_at&&String(r.version||"")===String(draft.version||"")&&String(r.channel||"").toLowerCase()===String(draft.channel||"").toLowerCase()&&String(r.id||"")!==repackageSourceId&&(String(r.supersedes_release_id||"")===repackageSourceId||Number(r.revision||0)>repackageSourceRevision))
   : authoritativeKeys.has(draftKey);
  // Keep the persisted status inside the existing database constraint.
  // "awaiting_receipt" is a read-only display state derived from a successful
  // recorded GitHub attempt until License Manager returns the actual release.
  const completedAttempt=(grouped.get(draft.id)||[]).find((a:any)=>
   String(a.run_id||"")===String(draft.last_run_id||"")&&a.status==="success");
  if(draft.status==="building"&&completedAttempt){
   if(authoritativeReceipt){
    const {error:receiptError}=await sb.from("panel_release_drafts").update({status:"handed_off",last_error:null,updated_at:new Date().toISOString()}).eq("id",draft.id).eq("status","building");
    if(receiptError)throw new Error("Unable to reconcile License Manager receipt: "+receiptError.message);
    draft.status="handed_off";
   }else draft.status="awaiting_receipt";
   continue;
  }
  if(draft.status!=="building"||!draft.last_run_id)continue;
  const workerRepo=draft.release_type==="base"?BASE_WORKER_REPO:ENGINE_REPO;
  try{
   const run=await github("/repos/"+workerRepo+"/actions/runs/"+Number(draft.last_run_id));
   const outcome=String(run?.conclusion||"").toLowerCase();
   if(!["success","failure","cancelled","skipped"].includes(outcome))continue;
   const nextStatus=outcome==="success"?(authoritativeReceipt?"handed_off":"building"):"draft";
   const displayStatus=outcome==="success"&&!authoritativeKeys.has(draftKey)?"awaiting_receipt":nextStatus;
   const err=outcome==="success"?null:"GitHub workflow ended with "+outcome+". Inspect the run before retrying.";
   const {error:attemptError}=await sb.from("panel_release_attempts").update({status:outcome,completed_at:run.updated_at||new Date().toISOString(),run_url:run.html_url||null,error_summary:err}).eq("draft_id",draft.id).eq("run_id",draft.last_run_id);
   if(attemptError)throw attemptError;
   const {error:draftError}=await sb.from("panel_release_drafts").update({status:nextStatus,last_error:err,last_run_url:run.html_url||null,updated_at:new Date().toISOString()}).eq("id",draft.id).eq("status","building").eq("last_run_id",draft.last_run_id);
   if(draftError)throw draftError;
   draft.status=displayStatus;draft.last_error=err;draft.last_run_url=run.html_url||null;
   for(const attempt of grouped.get(draft.id)||[]){if(String(attempt.run_id)===String(draft.last_run_id)){attempt.status=outcome;attempt.error_summary=err;attempt.run_url=run.html_url||null}}
  }catch(error){console.error("Unable to reconcile saved release run",draft.id,error)}
 }
 const releaseDrafts=visibleDrafts.filter((draft:any)=>String(draft.status||"")!=="handed_off"||authoritativeKeys.has(String(draft.version||"")+"|"+String(draft.channel||"").toLowerCase())||Boolean((grouped.get(draft.id)||[]).some((a:any)=>a.status==="success"&&a.run_id))).map((draft:any)=>({...draft,attempts:grouped.get(draft.id)||[]}));
 const availableChannels=Array.isArray(channels?.channels)?channels.channels.filter((x:any)=>x?.enabled===true).map((x:any)=>String(x.channel).trim().toLowerCase()).filter(Boolean):[];
 return {releases:authoritativeRows,drafts:Array.isArray(releaseDrafts)?releaseDrafts:[],channels:availableChannels,selectedChannel:channel,masterUrl:await configuredMasterUrl(),product,repositories:{base:{repo:BASE_REPO,ref:BASE_REF,workerRepo:BASE_WORKER_REPO,workerRef:BASE_WORKER_REF,workflow:BASE_WORKFLOW},engine:{repo:ENGINE_REPO,ref:ENGINE_REF,workflow:ENGINE_WORKFLOW}}};
});


export const saveReleaseDraft=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string;draftId?:string|null;type:"base"|"engine";version:string;channel:string;notes?:string;components?:string[];minimumBaseVersion?:string;protocol?:string;changelogTemplate?:string;changelogDraft?:string;sourceSha?:string|null}})=>{
 const {BASE_REPO,BASE_REF,ENGINE_REPO,ENGINE_REF}=await githubContext();
 const actor=readSession(data.token);
 const version=String(data.version||"").trim();
 if(!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version))throw new Error("Version must be valid SemVer, e.g. 1.2.3");
 const channel=normalizeChannel(data.channel||"stable");
 const releaseType=data.type==="base"?"base":"update";
 const repo=data.type==="base"?BASE_REPO:ENGINE_REPO;
 const ref=data.type==="base"?BASE_REF:ENGINE_REF;
 const components=data.type==="base"?["base"]:[...new Set((data.components||[]).map(x=>String(x).trim().toLowerCase()).filter(x=>["base","apex","mcp","studio"].includes(x)))];
 if(data.type==="engine"&&!components.length)throw new Error("Select at least one Update component before saving.");
 const expectedTemplate=data.type==="base"?"base_deployment_log":"update_changelog";
 const template=String(data.changelogTemplate||expectedTemplate);
 if(template!==expectedTemplate)throw new Error("Invalid release document template for this release type.");
 const inputs={
   notes:String(data.notes||"").trim(),
   components,
   minimumBaseVersion:data.type==="engine"?String(data.minimumBaseVersion||"").trim():null,
   protocol:data.type==="engine"?String(data.protocol||"").trim():null,
   changelogTemplate:template,
   changelogDraft:String(data.changelogDraft||""),
 };
 const sb=authClient();
 if(data.draftId){
   const {data:existing,error:readError}=await sb.from("panel_release_drafts").select("*").eq("id",data.draftId).single();
   if(readError||!existing)throw new Error("Release draft was not found.");
   if(["building","handed_off","awaiting_receipt"].includes(String(existing.status)))throw new Error("This Stage 1 draft is locked because it is building or has already been handed off.");
   if(existing.archived_at)throw new Error("Restore the draft before editing it.");
   const {data:draft,error}=await sb.from("panel_release_drafts").update({
     version,channel,source_repo:repo,source_ref:ref,source_sha:data.sourceSha||existing.source_sha||null,
     status:"draft",inputs:{...(existing.inputs||{}),...inputs},updated_at:new Date().toISOString()
   }).eq("id",data.draftId).select("*").single();
   if(error)throw new Error(error.code==="23505"?"A Stage 1 draft already exists for this type, version and channel.":"Unable to update release draft: "+error.message);
   return {draft,created:false};
 }
 const {data:draft,error}=await sb.from("panel_release_drafts").insert({
   release_type:releaseType,version,channel,source_repo:repo,source_ref:ref,source_sha:data.sourceSha||null,
   status:"draft",inputs,created_by:actor.email||actor.id
 }).select("*").single();
 if(error)throw new Error(error.code==="23505"?"A Stage 1 draft already exists for this type, version and channel.":"Unable to create release draft: "+error.message);
 return {draft,created:true};
});

export const prepareReleaseRepackage=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string;releaseId:string}})=>{
 const {BASE_REPO,BASE_REF,ENGINE_REPO,ENGINE_REF}=await githubContext();
 const actor=readSession(data.token);
 const releaseId=String(data.releaseId||"").trim();
 if(!releaseId)throw new Error("Release ID is required.");
 const result=await licenseMaster(`/releases/${encodeURIComponent(releaseId)}`);
 const release=result?.release||result;
 if(!release?.id)throw new Error("Release was not found in License Manager.");
 if(String(release.status||"").toLowerCase()!=="published"||release.archived_at)throw new Error("Only the current published release can be repackaged.");
 if(String(release.review_status||"").toLowerCase()!=="approved"||String(release?.manifest?.validation?.status||"").toLowerCase()!=="passed")throw new Error("Only an approved, validated published release can be repackaged.");
 const releaseType=String(release.release_type||"").toLowerCase()==="update"?"update":"base";
 const version=String(release.version||"").trim();
 const channel=normalizeChannel(String(release.channel||"stable"));
 if(!version)throw new Error("Published release version is missing.");
 const registry=await licenseMaster(`/releases?product=orbitfs_base&channel=${encodeURIComponent(channel)}&type=${releaseType}&include_archived=false`);
 const current=(Array.isArray(registry?.releases)?registry.releases:[]).filter((r:any)=>String(r.status||"").toLowerCase()==="published"&&!r.archived_at&&String(r.review_status||"").toLowerCase()==="approved").sort((a:any,b:any)=>new Date(b.published_at||b.created_at||0).getTime()-new Date(a.published_at||a.created_at||0).getTime())[0]||null;
 if(String(current?.id||"")!==releaseId)throw new Error("Only the current published release baseline can be repackaged. Refresh the release list and use Repackage on the current release.");

 // Reuse the single Stage 1 draft as the permanent build-attempt ledger for
 // this semantic version. License Manager owns immutable package revisions.
 const sb=authClient();
 const {data:existing,error:readError}=await sb.from("panel_release_drafts").select("*").eq("release_type",releaseType).eq("version",version).eq("channel",channel).maybeSingle();
 if(readError)throw new Error("Unable to resolve Stage 1 release history: "+readError.message);
 if(existing&&["building","awaiting_receipt"].includes(String(existing.status||"").toLowerCase()))throw new Error("This release already has a package build awaiting completion or License Manager receipt.");

 const manifest=release.manifest&&typeof release.manifest==="object"?release.manifest:{};
 const oldInputs=existing?.inputs&&typeof existing.inputs==="object"?existing.inputs:{};
 const inputs={
  ...oldInputs,
  repackage:true,
  repackageReleaseId:String(release.id),
  repackageRevision:Number(release.revision||1),
  notes:String(oldInputs.notes||release.notes||manifest.customer_notes||""),
  components:Array.isArray(oldInputs.components)&&oldInputs.components.length?oldInputs.components:(Array.isArray(manifest.components)?manifest.components:(releaseType==="base"?["base"]:[])),
  minimumBaseVersion:releaseType==="update"?String(oldInputs.minimumBaseVersion||manifest.minimumBaseVersion||""):null,
  protocol:releaseType==="update"?String(oldInputs.protocol||manifest.minimumEngineDeployerProtocol||"1"):null,
  changelogTemplate:releaseType==="base"?"base_deployment_log":"update_changelog",
  changelogDraft:String(oldInputs.changelogDraft||release.notes||manifest.customer_changelog||"")
 };

 if(existing){
  const {data:draft,error}=await sb.from("panel_release_drafts").update({
   status:"draft",archived_at:null,last_error:null,source_repo:release.source_repo||existing.source_repo,source_ref:release.source_ref||existing.source_ref,source_sha:release.source_sha||existing.source_sha||null,inputs,updated_at:new Date().toISOString()
  }).eq("id",existing.id).select("*").single();
  if(error)throw new Error("Unable to reopen Stage 1 history for repackaging: "+error.message);
  return {draft,release,created:false};
 }
 const {data:draft,error}=await sb.from("panel_release_drafts").insert({
  release_type:releaseType,version,channel,source_repo:release.source_repo||(releaseType==="base"?BASE_REPO:ENGINE_REPO),source_ref:release.source_ref||(releaseType==="base"?BASE_REF:ENGINE_REF),source_sha:release.source_sha||null,
  status:"draft",inputs,created_by:actor.email||actor.id
 }).select("*").single();
 if(error)throw new Error("Unable to create Stage 1 repackage history: "+error.message);
 return {draft,release,created:true};
});

export const setReleaseDraftArchived=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string;draftId:string;archived:boolean}})=>{
 readSession(data.token);
 const sb=authClient();
 const {data:existing,error:readError}=await sb.from("panel_release_drafts").select("*").eq("id",data.draftId).single();
 if(readError||!existing)throw new Error("Release draft was not found.");
 if(["building","awaiting_receipt"].includes(String(existing.status)))throw new Error("A build awaiting License Manager receipt cannot be archived.");
 if(existing.status==="handed_off")throw new Error("A handed-off Stage 1 draft is retained as immutable workflow history.");
 const archived=Boolean(data.archived);
 const {data:draft,error}=await sb.from("panel_release_drafts").update({
   status:archived?"archived":"draft",
   archived_at:archived?new Date().toISOString():null,
   updated_at:new Date().toISOString()
 }).eq("id",data.draftId).select("*").single();
 if(error)throw new Error("Unable to "+(archived?"archive":"restore")+" release draft: "+error.message);
 return {draft};
});

export const deleteReleaseDraft=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string;draftId:string}})=>{
 const {BASE_WORKER_REPO,ENGINE_REPO}=await githubContext();
 const actor=readSession(data.token);
 if(!["owner","admin"].includes(String(actor.role||"").toLowerCase()))throw new Error("Admin access required to permanently delete a Stage 1 draft.");
 const sb=authClient();
 const {data:existing,error:readError}=await sb.from("panel_release_drafts").select("*").eq("id",data.draftId).single();
 if(readError||!existing)throw new Error("Release draft was not found.");
 // Only local orphan cleanup: never delete a draft backed by a
 // License Manager release, and never delete any unfinished GitHub run.
 const releaseType=String(existing.release_type||"")==="base"?"base":"update";
 const authoritative=await licenseMaster(`/releases?product=orbitfs_base&channel=${encodeURIComponent(String(existing.channel||"stable"))}&type=${releaseType}&include_archived=true`);
 const matches=(Array.isArray(authoritative?.releases)?authoritative.releases:[]).filter((r:any)=>
  String(r.version||"")===String(existing.version||"")&&
  String(r.channel||"").toLowerCase()===String(existing.channel||"").toLowerCase()&&
  String(r.release_type||releaseType).toLowerCase()===releaseType);
 if(matches.length)throw new Error("License Manager already has this release. Local draft deletion is blocked; open the authoritative release record instead.");
 const {data:attempts,error:attemptError}=await sb.from("panel_release_attempts").select("run_id,status").eq("draft_id",existing.id);
 if(attemptError)throw new Error("Unable to verify release attempts: "+attemptError.message);
 const workerRepo=releaseType==="base"?BASE_WORKER_REPO:ENGINE_REPO;
 for(const attempt of attempts||[]){
  if(!attempt.run_id){
   if(["queued","in_progress"].includes(String(attempt.status||"").toLowerCase()))
    throw new Error("A release attempt has no GitHub run ID yet. Wait for it to resolve before deleting.");
   continue;
  }
  const run=await github(`/repos/${workerRepo}/actions/runs/${Number(attempt.run_id)}`);
  if(String(run?.status||"").toLowerCase()!=="completed")
   throw new Error("GitHub run #"+attempt.run_id+" is still active. Local draft deletion is blocked.");
  // Give a successful handoff time to appear in the authoritative registry.
  // Never mistake a brief ingestion delay for an orphaned local draft.
  if(String(run?.conclusion||"").toLowerCase()==="success"){
   const finishedAt=Date.parse(String(run.updated_at||run.run_started_at||""));
   if(!Number.isFinite(finishedAt)||Date.now()-finishedAt<10*60*1000)
    throw new Error("GitHub succeeded recently. Wait 10 minutes for License Manager intake, refresh, then retry local orphan cleanup if the release still has not appeared.");
  }
 }
 const {error}=await sb.from("panel_release_drafts").delete().eq("id",data.draftId);
 if(error)throw new Error("Unable to delete release draft: "+error.message);
 return {ok:true,id:data.draftId};
});

export const deleteReleaseAttempt=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string;attemptId:string}})=>{
 const {BASE_WORKER_REPO,ENGINE_REPO}=await githubContext();
 const actor=readSession(data.token);
 if(!["owner","admin"].includes(String(actor.role||"").toLowerCase()))throw new Error("Admin access required to delete release attempts.");
 const id=String(data.attemptId||"").trim();
 if(!id)throw new Error("Attempt ID is required.");
 const sb=authClient();
 const {data:attempt,error:attemptReadError}=await sb.from("panel_release_attempts").select("*").eq("id",id).single();
 if(attemptReadError||!attempt)throw new Error("Release attempt was not found.");
 const {data:draft,error:draftReadError}=await sb.from("panel_release_drafts").select("*").eq("id",attempt.draft_id).single();
 if(draftReadError||!draft)throw new Error("Release draft for this attempt was not found.");

 let status=String(attempt.status||"").toLowerCase();
 if(["queued","in_progress"].includes(status)&&attempt.run_id){
  const workerRepo=String(draft.release_type)==="base"?BASE_WORKER_REPO:ENGINE_REPO;
  const run=await github(`/repos/${workerRepo}/actions/runs/${Number(attempt.run_id)}`);
  if(String(run?.status||"").toLowerCase()!=="completed")throw new Error("A running release attempt cannot be deleted.");
  status=String(run?.conclusion||"failure").toLowerCase();
  await sb.from("panel_release_attempts").update({
   status,
   run_url:run?.html_url||attempt.run_url||null,
   completed_at:attempt.completed_at||new Date().toISOString()
  }).eq("id",id);
 }
 if(["queued","in_progress"].includes(status))throw new Error("A running release attempt cannot be deleted.");
 if(status==="success"||String(draft.status||"").toLowerCase()==="handed_off")throw new Error("The successful handoff attempt is retained. Delete only stale failed, cancelled or skipped attempts.");

 const {error:deleteError}=await sb.from("panel_release_attempts").delete().eq("id",id);
 if(deleteError)throw new Error("Unable to delete release attempt: "+deleteError.message);

 const {data:remaining,error:remainingError}=await sb.from("panel_release_attempts").select("*").eq("draft_id",draft.id).order("attempt_number",{ascending:false});
 if(remainingError)throw new Error("Attempt was deleted, but the draft summary could not be refreshed: "+remainingError.message);
 const latest=(remaining||[])[0]||null;
 const latestStatus=String(latest?.status||"").toLowerCase();
 const lastError=["failure","cancelled","skipped"].includes(latestStatus)?String(latest?.error_output||latest?.error_summary||"").trim()||null:null;
 const nextStatus=draft.archived_at?"archived":"draft";
 const {error:updateError}=await sb.from("panel_release_drafts").update({
  status:nextStatus,
  latest_attempt:Number(latest?.attempt_number||0),
  last_error:lastError,
  last_run_id:latest?.run_id||null,
  last_run_url:latest?.run_url||null,
  updated_at:new Date().toISOString()
 }).eq("id",draft.id);
 if(updateError)throw new Error("Attempt was deleted, but the draft summary could not be updated: "+updateError.message);
 return {ok:true,id,draftId:draft.id,remaining:(remaining||[]).length};
});

export const clearStaleReleaseAttempts=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string;draftId:string}})=>{
 const actor=readSession(data.token);
 if(!["owner","admin"].includes(String(actor.role||"").toLowerCase()))throw new Error("Admin access required to clear release attempts.");
 const draftId=String(data.draftId||"").trim();
 if(!draftId)throw new Error("Draft ID is required.");
 const sb=authClient();
 const {data:draft,error:draftReadError}=await sb.from("panel_release_drafts").select("*").eq("id",draftId).single();
 if(draftReadError||!draft)throw new Error("Release draft was not found.");
 const {data:attempts,error:attemptReadError}=await sb.from("panel_release_attempts").select("*").eq("draft_id",draftId).order("attempt_number",{ascending:false});
 if(attemptReadError)throw new Error("Unable to load release attempts: "+attemptReadError.message);
 const stale=(attempts||[]).filter((row:any)=>["failure","cancelled","skipped"].includes(String(row.status||"").toLowerCase()));
 if(!stale.length)return {ok:true,draftId,deleted:0,remaining:(attempts||[]).length};
 const ids=stale.map((row:any)=>String(row.id));
 const {error:deleteError}=await sb.from("panel_release_attempts").delete().in("id",ids);
 if(deleteError)throw new Error("Unable to clear stale release attempts: "+deleteError.message);
 const remaining=(attempts||[]).filter((row:any)=>!ids.includes(String(row.id)));
 const latest=remaining[0]||null;
 const currentStatus=String(draft.status||"").toLowerCase();
 const patch:any={
  latest_attempt:Number(latest?.attempt_number||0),
  last_run_id:latest?.run_id||null,
  last_run_url:latest?.run_url||null,
  last_error:null,
  updated_at:new Date().toISOString()
 };
 if(!["building","awaiting_receipt","handed_off","archived"].includes(currentStatus))patch.status="draft";
 const {error:updateError}=await sb.from("panel_release_drafts").update(patch).eq("id",draftId);
 if(updateError)throw new Error("Stale attempts were deleted, but the draft summary could not be updated: "+updateError.message);
 return {ok:true,draftId,deleted:ids.length,remaining:remaining.length};
});

export const getReleaseLifecycleEvents=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string;limit?:number}})=>{
 readSession(data.token);
 const limit=Math.min(500,Math.max(1,Number(data.limit||200)));
 const sb=authClient();
 const {data:events,error}=await sb.from("panel_release_events").select("*").order("occurred_at",{ascending:false}).limit(limit);
 if(error)throw new Error(error.message||"Unable to load Dev Panel release lifecycle history");
 return {events:events||[]};
});

export async function inspectSourceCore(data:{type:"base"|"engine";channel?:string}){
 const {BASE_REPO,BASE_REF,ENGINE_REPO,ENGINE_REF}=await githubContext();
 const repo=data.type==="base"?BASE_REPO:ENGINE_REPO,ref=data.type==="base"?BASE_REF:ENGINE_REF;
 const releaseType=data.type==="base"?"base":"update";
 const channel=normalizeChannel(data.channel||"stable");
 const branch=await github(`/repos/${repo}/git/ref/heads/${encodeURIComponent(ref)}`);
 const head=branch?.object?.sha;if(!head)throw new Error(`Could not resolve ${repo}@${ref}`);
 let baseline:any=null;
 let baseBaseline:any=null;
 try {
   const baseResult = await licenseMaster(`/releases?product=orbitfs_base&channel=${encodeURIComponent(ENGINE_BASE_COMPATIBILITY_CHANNEL)}&type=base&include_archived=false`);
   baseBaseline=(baseResult?.releases||[])
     .filter((r:any)=>r.review_status==="approved"&&r.status==="published"&&!r.archived_at)
     .sort((a:any,b:any)=>{
      const compared=compareSemVer(String(b.version||""),String(a.version||""));
      return compared??(new Date(b.published_at||b.created_at||0).getTime()-new Date(a.published_at||a.created_at||0).getTime());
     })[0]||null;
 } catch {}
 try {
   const result=await licenseMaster(`/releases?product=orbitfs_base&channel=${encodeURIComponent(channel)}&type=${releaseType}&include_archived=false`);
   baseline=(result?.releases||[])
     .filter((r:any)=>r.review_status==="approved"&&r.status==="published"&&r.source_sha)
     .sort((a:any,b:any)=>new Date(b.published_at||b.created_at||0).getTime()-new Date(a.published_at||a.created_at||0).getTime())[0]||null;
 } catch {}

 const inspectedAt=new Date().toISOString();
 const baseBaselineInfo=baseBaseline?{id:baseBaseline.id,version:baseBaseline.version,sourceSha:baseBaseline.source_sha||null,channel:ENGINE_BASE_COMPATIBILITY_CHANNEL}:null;
 const from=String(baseline?.source_sha||"");
 const baselineInfo:any=baseline?{id:baseline.id,version:baseline.version,sourceSha:baseline.source_sha,kind:data.type==="base"?"published_base":"published_update",channel}:null;

 if(!from&&data.type==="engine"){
   const initial=await initialEngineSourceBaseline(head);
   const files=await sourceSnapshotFiles(repo,head);
   const summary=sourceChangeSummary(files);
   const info={id:null,version:initial.initialReleaseVersion,sourceSha:head,kind:"initial_snapshot",ref:initial.ref,locked:initial.locked,initialReleaseVersion:initial.initialReleaseVersion,channel};
   return {
    repo,ref,head,baseline:info,baseBaseline:baseBaselineInfo,initialRelease:false,initialUpdate:true,
    inspectionMode:"initial_snapshot",detectedComponents:initial.components,files,commits:[],
    changeSummary:summary,diffComplete:true,baselineFileCount:0,currentFileCount:files.length,hasSourceChanges:files.length>0,inspectedAt,publishedBaselineSha:from||null
   };
 }
 if(!from){
   const files=await sourceSnapshotFiles(repo,head);
   const summary=sourceChangeSummary(files);
   return {
    repo,ref,head,baseline:null,baseBaseline:baseBaselineInfo,initialRelease:true,initialUpdate:false,
    inspectionMode:"full_snapshot",detectedComponents:[],files,commits:[],
    changeSummary:summary,diffComplete:true,baselineFileCount:0,currentFileCount:files.length,hasSourceChanges:files.length>0,inspectedAt,publishedBaselineSha:from||null
   };
 }

 if(from===head)return {
  repo,ref,head,baseline:baselineInfo,baseBaseline:baseBaselineInfo,initialRelease:false,initialUpdate:false,
  inspectionMode:"compare",detectedComponents:[],files:[],commits:[],
  changeSummary:sourceChangeSummary([]),diffComplete:true,baselineFileCount:null,currentFileCount:null,hasSourceChanges:false,inspectedAt,publishedBaselineSha:from||null
 };

 const diff=await completeSourceDiff(repo,from,head);
 return {
  repo,ref,head,baseline:baselineInfo,baseBaseline:baseBaselineInfo,initialRelease:false,initialUpdate:false,
  inspectionMode:"compare",
  detectedComponents:data.type==="engine"?detectUpdateComponents(diff.files):[],
  files:diff.files,commits:diff.commits,changeSummary:diff.summary,diffComplete:diff.diffComplete,
  baselineFileCount:diff.baselineFileCount,currentFileCount:diff.currentFileCount,
  compareMetadataFiles:diff.compareMetadataFiles,hasSourceChanges:diff.files.length>0,inspectedAt,publishedBaselineSha:from||null
 };
}
export const inspectSource=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string;type:"base"|"engine";channel?:string}})=>{
 readSession(data.token);
 return inspectSourceCore(data);
});

export const getReleaseHandoff=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string;type:"base"|"engine";version:string;channel:string}})=>{  readSession(data.token);  const product="orbitfs_base";  const releaseType=data.type==="base"?"base":"update";  const channel=normalizeChannel(data.channel);  const result=await licenseMaster(`/releases?product=${product}&channel=${encodeURIComponent(channel)}&type=${releaseType}&include_archived=false`);  const release=(result?.releases||[]).filter((r:any)=>String(r.version)===String(data.version)&&!r.archived_at).sort((a:any,b:any)=>Number(b.revision||1)-Number(a.revision||1)||new Date(b.created_at||0).getTime()-new Date(a.created_at||0).getTime())[0]||null;  return {release,product,releaseType,channel};});export const getReleaseRun=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string;repo:string;runId?:number}})=>{
  readSession(data.token);
  const repo=String(data.repo||"").trim();
  const profile=await activeGithubProfile();
  const allowedRepos=new Set([profile.base.repo,profile.devPanel.repo,profile.engine.repo]);
  if(!allowedRepos.has(repo))throw new Error("Release repository is not allowed");
  if(data.runId){
    const run=await github("/repos/"+repo+"/actions/runs/"+data.runId);
    const jobsResult=await github("/repos/"+repo+"/actions/runs/"+data.runId+"/jobs?per_page=100");
    const jobs=await Promise.all((jobsResult?.jobs||[]).map(async(job:any)=>{
      let failure:any=null;
      let logTail="";
      let logError="";
      try {
        // Logs may not be exposed while running; job/step status remains visible.
        const logs=await operationsGithubText("/repos/"+repo+"/actions/jobs/"+job.id+"/logs");
        logTail=String(logs||"").split(/\r?\n/).slice(-160).join("\n").slice(-24000);
        if(job.conclusion==="failure") failure=extractOperationFailure(logs)||fallbackOperationFailure(job,logs);
      } catch(error:any) {
        logError=error?.message||"GitHub job logs are temporarily unavailable.";
        if(job.conclusion==="failure") failure={error:logError,preceding:[],lines:["Unable to retrieve GitHub job logs.",logError]};
      }
      return {...job,failure,logTail,logError};
    }));
    const failedJob=jobs.find((job:any)=>job.conclusion==="failure");
    const failure=failedJob?.failure||null;
    const completed=["success","failure","cancelled","skipped"].includes(String(run?.conclusion||""));
    if(completed){
      const sb=authClient();
      const outcome=String(run.conclusion||"failure");
      const errorText=failure?.lines?.join("\n")||failure?.error||null;
      const {data:attemptRow}=await sb.from("panel_release_attempts").select("id,draft_id").eq("run_id",data.runId).maybeSingle();
      await sb.from("panel_release_attempts").update({status:outcome,error_summary:failure?.error||null,error_output:errorText,completed_at:new Date().toISOString(),run_url:run.html_url||null}).eq("run_id",data.runId);
      await sb.from("panel_release_drafts").update({status:outcome==="success"?"building":"draft",last_error:outcome==="success"?null:errorText,last_run_url:run.html_url||null,updated_at:new Date().toISOString()}).eq("last_run_id",data.runId).eq("status","building");
      if(outcome==="success"&&attemptRow?.draft_id){
       await sb.from("panel_release_attempts").delete().eq("draft_id",attemptRow.draft_id).in("status",["failure","cancelled","skipped"]).neq("id",attemptRow.id);
      }
    }else{
      const sb=authClient();
      await sb.from("panel_release_attempts").update({status:"in_progress",run_url:run.html_url||null}).eq("run_id",data.runId);
      await sb.from("panel_release_drafts").update({status:"building",last_run_url:run.html_url||null,updated_at:new Date().toISOString()}).eq("last_run_id",data.runId).eq("status","building");
    }
    return {run,jobs,failure};
  }
  throw new Error("Release workflow run is not available yet");
});

export const getReleaseBranchSyncState=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string;type:"base"|"engine"}})=>{
 const {BASE_REPO,BASE_REF,ENGINE_REPO,ENGINE_REF}=await githubContext();
 const actor=readSession(data.token);
 if(!["owner","admin"].includes(String(actor.role||"").toLowerCase()))throw new Error("Admin access required to inspect release branch state.");
 const repo=data.type==="base"?BASE_REPO:ENGINE_REPO;
 const releaseRef=data.type==="base"?BASE_REF:ENGINE_REF;
 const sourceRef="main";
 const workflow="sync-release-branch.yml";
 const [sourceBranch,releaseBranch,runs]=await Promise.all([
  github(`/repos/${repo}/git/ref/heads/${encodeURIComponent(sourceRef)}`),
  github(`/repos/${repo}/git/ref/heads/${encodeURIComponent(releaseRef)}`).catch(()=>null),
  github(`/repos/${repo}/actions/workflows/${encodeURIComponent(workflow)}/runs?event=workflow_dispatch&branch=${encodeURIComponent(sourceRef)}&per_page=10`).catch(()=>({workflow_runs:[]}))
 ]);
 const sourceSha=String(sourceBranch?.object?.sha||"");
 const releaseSha=String(releaseBranch?.object?.sha||"");
 if(!/^[a-f0-9]{40}$/i.test(sourceSha))throw new Error(`Could not resolve ${repo}@main.`);
 const allRuns=Array.isArray(runs?.workflow_runs)?runs.workflow_runs:[];
 const activeRun=allRuns
  .filter((run:any)=>["queued","in_progress","waiting","requested","pending"].includes(String(run?.status||"").toLowerCase()))
  .sort((a:any,b:any)=>new Date(b.created_at||0).getTime()-new Date(a.created_at||0).getTime())[0]||null;
 const latestRun=[...allRuns].sort((a:any,b:any)=>new Date(b.created_at||0).getTime()-new Date(a.created_at||0).getTime())[0]||null;
 return {
  ok:true,repo,sourceRef,releaseRef,sourceSha,releaseSha,
  upToDate:Boolean(releaseSha&&releaseSha===sourceSha),
  active:Boolean(activeRun),
  activeRun:activeRun?{id:activeRun.id||null,url:activeRun.html_url||null,status:activeRun.status||"in_progress",headSha:activeRun.head_sha||null}:null,
  latestRun:latestRun?{id:latestRun.id||null,url:latestRun.html_url||null,status:latestRun.status||null,conclusion:latestRun.conclusion||null,headSha:latestRun.head_sha||null,updatedAt:latestRun.updated_at||latestRun.created_at||null}:null
 };
});

export const getPromotionRunStatus=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string;type:"base"|"engine";runId?:number|string|null;sourceSha?:string}})=>{
 const {BASE_REPO,BASE_REF,ENGINE_REPO,ENGINE_REF}=await githubContext();
 const actor=readSession(data.token);
 if(!["owner","admin"].includes(String(actor.role||"").toLowerCase()))throw new Error("Admin access required to inspect a release branch promotion.");
 const repo=data.type==="base"?BASE_REPO:ENGINE_REPO;
 const releaseRef=data.type==="base"?BASE_REF:ENGINE_REF;
 const sourceSha=String(data.sourceSha||"").trim();
 let run:any=null;
 if(data.runId){
  run=await github(`/repos/${repo}/actions/runs/${encodeURIComponent(String(data.runId))}`);
 }else{
  const result=await github(`/repos/${repo}/actions/workflows/sync-release-branch.yml/runs?event=workflow_dispatch&branch=main&per_page=20`);
  run=(result?.workflow_runs||[]).find((candidate:any)=>!sourceSha||String(candidate?.head_sha||"")===sourceSha)||null;
  if(!run)return {ok:true,repo,releaseRef,runId:null,runUrl:null,status:"dispatched",conclusion:null,completed:false,releaseSha:null,branchMatches:false};
 }
 const conclusion=String(run?.conclusion||"").toLowerCase();
 const status=String(run?.status||"").toLowerCase();
 const completed=status==="completed"||["success","failure","cancelled","skipped","timed_out","action_required","neutral","stale"].includes(conclusion);
 let releaseSha:string|null=null;
 let branchMatches=false;
 if(completed&&conclusion==="success"){
  const ref=await github(`/repos/${repo}/git/ref/heads/${encodeURIComponent(releaseRef)}`).catch(()=>null);
  releaseSha=String(ref?.object?.sha||"")||null;
  const expected=sourceSha||String(run?.head_sha||"").trim();
  branchMatches=Boolean(expected&&releaseSha===expected);
 }
 return {ok:true,repo,releaseRef,runId:run?.id||null,runUrl:run?.html_url||null,status:status||"unknown",conclusion:conclusion||null,completed,releaseSha,branchMatches,sourceSha:sourceSha||String(run?.head_sha||"")||null};
});

export const promoteReleaseBranch=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string;type:"base"|"engine"}})=>{
 const {BASE_REPO,BASE_REF,ENGINE_REPO,ENGINE_REF}=await githubContext();
 const actor=readSession(data.token);
 if(!["owner","admin"].includes(String(actor.role||"").toLowerCase()))throw new Error("Admin access required to promote a release branch.");
 const repo=data.type==="base"?BASE_REPO:ENGINE_REPO;
 const releaseRef=data.type==="base"?BASE_REF:ENGINE_REF;
 const workflow="sync-release-branch.yml";
 const sourceRef="main";

 const [sourceBranch,releaseBranch,runs]=await Promise.all([
  github(`/repos/${repo}/git/ref/heads/${encodeURIComponent(sourceRef)}`),
  github(`/repos/${repo}/git/ref/heads/${encodeURIComponent(releaseRef)}`).catch(()=>null),
  github(`/repos/${repo}/actions/workflows/${encodeURIComponent(workflow)}/runs?event=workflow_dispatch&branch=${encodeURIComponent(sourceRef)}&per_page=10`).catch(()=>({workflow_runs:[]})),
 ]);
 const sourceSha=String(sourceBranch?.object?.sha||"");
 const releaseSha=String(releaseBranch?.object?.sha||"");
 if(!/^[a-f0-9]{40}$/i.test(sourceSha))throw new Error(`Could not resolve ${repo}@main.`);

 const active=(runs?.workflow_runs||[])
  .filter((run:any)=>["queued","in_progress","waiting","requested","pending"].includes(String(run?.status||"").toLowerCase()))
  .sort((a:any,b:any)=>new Date(b.created_at||0).getTime()-new Date(a.created_at||0).getTime())[0];
 if(active){
  return {ok:true,alreadyRunning:true,repo,sourceRef,releaseRef,sourceSha:String(active.head_sha||sourceSha),releaseSha,runId:active.id||null,runUrl:active.html_url||null,status:active.status||"in_progress"};
 }

 const dispatchedAt=Date.now();
 await github(`/repos/${repo}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,{
  method:"POST",
  body:JSON.stringify({ref:sourceRef,inputs:{confirmation:"PROMOTE"}})
 });

 let run:any=null;
 for(let attempt=0;attempt<8&&!run;attempt++){
  await new Promise(resolve=>setTimeout(resolve,700));
  try{
   const result=await github(`/repos/${repo}/actions/workflows/${encodeURIComponent(workflow)}/runs?event=workflow_dispatch&branch=${encodeURIComponent(sourceRef)}&per_page=10`);
   run=(result?.workflow_runs||[])
    .filter((candidate:any)=>new Date(candidate.created_at||0).getTime()>=dispatchedAt-5000)
    .sort((a:any,b:any)=>new Date(b.created_at||0).getTime()-new Date(a.created_at||0).getTime())[0]||null;
  }catch{}
 }
 return {
  ok:true,
  alreadyRunning:false,
  repo,
  sourceRef,
  releaseRef,
  sourceSha,
  releaseSha,
  runId:run?.id||null,
  runUrl:run?.html_url||null,
  status:run?.status||"dispatched"
 };
});

export async function startReleaseCore(data:{type:"base"|"engine";version:string;channel:string;notes:string;changelogDraft:string;files:any[];components:string[];minimumBaseVersion:string;protocol:string;changelogTemplate:string;inspectedSourceSha?:string;inspectedPublishedBaselineSha?:string|null;repackage?:boolean;repackageReleaseId?:string|null},actor:any){
 const {BASE_REPO,BASE_REF,BASE_WORKER_REPO,BASE_WORKER_REF,ENGINE_REPO,ENGINE_REF}=await githubContext();
 const version=data.version.trim();
 if(!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version))throw new Error("Version must be valid SemVer, e.g. 1.2.3");
 if(data.type==="engine"&&!data.components.length)throw new Error("Select at least one update target (Base, Apex, MCP, or Studio).");
 const channel=normalizeChannel(data.channel);
 const repackage=Boolean(data.repackage);
 const repackageReleaseId=String(data.repackageReleaseId||"").trim();
 let repackageRelease:any=null;
 if(repackage){
  if(!repackageReleaseId)throw new Error("Repackage requires the published License Manager release id.");
  const current=await licenseMaster(`/releases/${encodeURIComponent(repackageReleaseId)}`);
  repackageRelease=current?.release||current;
  const expectedType=data.type==="base"?"base":"update";
  if(!repackageRelease?.id||String(repackageRelease.release_type||"").toLowerCase()!==expectedType||String(repackageRelease.version||"")!==version||normalizeChannel(String(repackageRelease.channel||"stable"))!==channel)throw new Error("Repackage target does not match this release type, version and channel.");
  if(String(repackageRelease.status||"").toLowerCase()!=="published"||repackageRelease.archived_at)throw new Error("Only a currently published release can be repackaged.");
  if(String(repackageRelease.review_status||"").toLowerCase()!=="approved"||String(repackageRelease?.manifest?.validation?.status||"").toLowerCase()!=="passed")throw new Error("Repackage target must be approved and validated.");
 }
 const expectedTemplate = data.type === "base" ? "base_deployment_log" : "update_changelog";
 if (data.changelogTemplate !== expectedTemplate) throw new Error(`Use the ${expectedTemplate === "base_deployment_log" ? "Base Deployment Log" : "Update Changelog"} template for this release type.`);
 const changelogText=String(data.changelogDraft||"").trim();
 const expectedHeading=`# OrbitFS ${data.type==="base"?"Base Deployment":"Update"} — v${version}`;
 const firstChangelogLine=changelogText.split(/\r?\n/,1)[0]?.trim()||"";
 if(firstChangelogLine!==expectedHeading)throw new Error(`Release document version is stale. Expected "${expectedHeading}". Re-inspect or update the release document before building.`);
 const channels=await licenseMaster(`/release-channels?include_disabled=false`);
 const channelEnabled=Array.isArray(channels?.channels)&&channels.channels.some((x:any)=>String(x.channel).trim().toLowerCase()===channel&&x.enabled===true);
 if(!channelEnabled)throw new Error("Release channel is not configured or is disabled in License Master: "+channel);
 const repo=data.type==="base"?BASE_REPO:ENGINE_REPO;
 const ref=data.type==="base"?BASE_REF:ENGINE_REF;
 const workerRepo=data.type==="base"?BASE_WORKER_REPO:ENGINE_REPO;
 const workerRef=data.type==="base"?BASE_WORKER_REF:ENGINE_REF;
 const workflow=data.type==="base"?BASE_WORKFLOW:ENGINE_WORKFLOW;
 if (data.type === "engine") {
  const minimumBaseVersion=String(data.minimumBaseVersion||"").trim();
  const protocol=Number(data.protocol||"");
  if(!parseSemVer(minimumBaseVersion))throw new Error("Minimum Base version must be valid SemVer.");
  if(!Number.isInteger(protocol)||protocol<1||protocol>100)throw new Error("Minimum deployer protocol must be an integer from 1 to 100.");
  const baseChannel=ENGINE_BASE_COMPATIBILITY_CHANNEL;
  const baseResult=await licenseMaster(`/releases?product=orbitfs_base&channel=${encodeURIComponent(baseChannel)}&type=base&include_archived=false`);
  const publishedBases=(baseResult?.releases||[]).filter((r:any)=>{
   const comparison=compareSemVer(String(r.version||""),minimumBaseVersion);
   return r.status==="published"&&r.review_status==="approved"&&!r.archived_at&&String(r.channel||"stable").toLowerCase()===baseChannel&&comparison!==null&&comparison>=0;
  }).sort((a:any,b:any)=>compareSemVer(String(b.version||""),String(a.version||""))??0);
  if(!publishedBases.length){
   const available=(baseResult?.releases||[]).filter((r:any)=>r.status==="published"&&r.review_status==="approved"&&!r.archived_at).map((r:any)=>String(r.version||"")).filter(Boolean);
   throw new Error(`Minimum Base ${minimumBaseVersion} requires an approved published Base at or above that version in ${baseChannel}.${available.length?` Available: ${available.join(", ")}.`:""}`);
  }
 }
 const previousResult = data.type === "base"
  ? await licenseMaster(`/releases?product=orbitfs_base&channel=${encodeURIComponent(channel)}&type=base&include_archived=false`)
  : await licenseMaster(`/releases?product=orbitfs_base&channel=${encodeURIComponent(channel)}&type=update&include_archived=false`);
 const previousRelease = (previousResult?.releases || [])
  .filter((r:any) => r.review_status === "approved" && r.status === "published" && r.source_sha)
  .sort((a:any,b:any) => new Date(b.published_at || b.created_at || 0).getTime() - new Date(a.published_at || a.created_at || 0).getTime())[0];
 if(previousRelease&&String(previousRelease.version||"")===version&&!repackage)throw new Error(`v${version} is already published in ${channel}. Use Repackage to build another immutable package revision of the same version.`);
 if(repackage&&String(previousRelease?.id||"")!==repackageReleaseId)throw new Error("Only the authoritative current published baseline can be repackaged. Refresh the release list and re-open Repackage.");

 // Stage 1 is authoritative about the source snapshot sent to the worker.
 // Do not trust stale browser state for changed files or the previous commit.
 const branch = await github(`/repos/${repo}/git/ref/heads/${encodeURIComponent(ref)}`);
 const head=String(branch?.object?.sha||"");
 if(!head)throw new Error(`Could not resolve ${repo}@${ref}`);
 const inspectedSourceSha=String(data.inspectedSourceSha||"").trim();
 if(!/^[a-f0-9]{40}$/i.test(inspectedSourceSha))throw new Error("Inspect the source before starting a release.");
 if(inspectedSourceSha!==head)throw new Error(`The ${data.type==="base"?"Base":"Update"} source changed after inspection (${inspectedSourceSha.slice(0,8)} → ${head.slice(0,8)}). Re-inspect before building so the reviewed file list matches the package.`);
 let previousSourceCommit=String(previousRelease?.source_sha||"");
 const inspectedPublishedBaselineSha=String(data.inspectedPublishedBaselineSha||"").trim();
 if(inspectedPublishedBaselineSha!==previousSourceCommit){
  throw new Error(`The authoritative published ${data.type==="base"?"Base":"Update"} baseline changed after inspection. Re-inspect before building so the source diff is recalculated.`);
 }
 const initialRelease = data.type === "base" && !previousSourceCommit;
 const initialUpdate = data.type === "engine" && !previousSourceCommit;
 let initialUpdateConfig:any=null;
 let sourceBaselineKind = previousSourceCommit ? "published_update" : initialRelease ? "full_snapshot" : "";
 if(initialUpdate){
   initialUpdateConfig=await initialEngineSourceBaseline(head);
   if(version!==initialUpdateConfig.initialReleaseVersion)throw new Error(`The first published Update is locked to v${initialUpdateConfig.initialReleaseVersion}. Set the Update version to ${initialUpdateConfig.initialReleaseVersion}; later releases can use any advancing SemVer.`);
   sourceBaselineKind="initial_snapshot";
 }
 let detectedFiles:any[]=[];
 let sourceDiffMeta:any={summary:null,diffComplete:true,baselineFileCount:0,currentFileCount:0,compareMetadataFiles:0};
 if(initialRelease||initialUpdate){
  detectedFiles=await sourceSnapshotFiles(repo,head);
  sourceDiffMeta={summary:sourceChangeSummary(detectedFiles),diffComplete:true,baselineFileCount:0,currentFileCount:detectedFiles.length,compareMetadataFiles:0};
 }else if(previousSourceCommit&&previousSourceCommit!==head){
  const diff=await completeSourceDiff(repo,previousSourceCommit,head);
  detectedFiles=diff.files;
  sourceDiffMeta=diff;
 }

 if(!initialRelease&&!initialUpdate&&previousSourceCommit===head&&!repackage){
  throw new Error(`No ${data.type==="base"?"Base":"Update"} source changes detected since the authoritative published baseline. There is nothing new to release.`);
 }
 if(!initialRelease&&!initialUpdate&&!detectedFiles.length&&!repackage){
  throw new Error(`No ${data.type==="base"?"Base":"Update"} file changes were detected against the authoritative published baseline. There is nothing new to release.`);
 }

 const selectedComponents = data.type === "engine"
   ? [...new Set((data.components || []).map((x:string)=>String(x).trim().toLowerCase()).filter((x:string)=>["base","apex","mcp","studio"].includes(x)))]
   : ["base"];
 const detectedComponents=data.type==="engine"?(initialUpdate?(initialUpdateConfig?.components||["apex","mcp","studio"]):detectUpdateComponents(detectedFiles)):[];
 const missingDetectedComponents=detectedComponents.filter((component:string)=>!selectedComponents.includes(component));
 if(missingDetectedComponents.length)throw new Error(`Stage 1 targets do not cover detected Update changes: ${missingDetectedComponents.join(", ")}. Re-inspect the Update source before building.`);
 if(initialUpdate&&selectedComponents.includes("base"))throw new Error("The v1.0.0 bootstrap is an Engine snapshot baseline only. Base is released separately and must not be selected for the bootstrap Update.");

 const compactDispatchFile=(file:any)=>({
  filename:String(file?.filename||""),
  status:String(file?.status||"modified"),
  additions:Number(file?.additions||0),
  deletions:Number(file?.deletions||0),
  changes:Number(file?.changes||0),
 });
 const dispatchFileLimit = data.type === "base" ? 100 : detectedFiles.length;
 const dispatchFiles = (initialRelease||initialUpdate) ? [] : detectedFiles.slice(0, dispatchFileLimit).map(compactDispatchFile);
 const releaseRecord = {
  format: "orbitfs-release-record-v1",
  releaseType: data.type === "base" ? "base" : "update",
  product: "orbitfs_base",
  version,
  channel,
  sourceRepository: repo,
  sourceRef: ref,
  previousSourceCommit: previousSourceCommit || null,
  detectedSourceChanges: detectedFiles.length,
  changeSummary: sourceDiffMeta.summary||sourceChangeSummary(detectedFiles),
  sourceDiffComplete: sourceDiffMeta.diffComplete===true,
  baselineFileCount: Number(sourceDiffMeta.baselineFileCount||0),
  currentFileCount: Number(sourceDiffMeta.currentFileCount||0),
  compareMetadataFiles: Number(sourceDiffMeta.compareMetadataFiles||0),
  inspectionMode: initialRelease ? "full_snapshot" : initialUpdate ? "initial_snapshot" : "compare",
  initialRelease,
  initialUpdate,
  sourceBaselineKind,
  detectedComponents,
  changedFiles: dispatchFiles,
  changedFilesTruncated: detectedFiles.length > dispatchFiles.length,
  components: selectedComponents,
  minimumBaseVersion: data.type === "engine" ? (data.minimumBaseVersion || "1.0.0") : null,
  baseCompatibilityChannel: data.type === "engine" ? ENGINE_BASE_COMPATIBILITY_CHANNEL : null,
  minimumDeployerProtocol: data.type === "engine" ? (data.protocol || "1") : null,
  notes: data.notes.trim(),
  changelogTemplate: data.changelogTemplate,
  generatedAt: new Date().toISOString(),
 };
 const generatedChangelog=String(data.changelogDraft||"").trim();
 if(!generatedChangelog)throw new Error("Review the generated changelog before sending the release.");
 const inputs:any={
  version,
  channel,
  notes:generatedChangelog,
  changed_files:JSON.stringify(dispatchFiles),
  previous_source_commit:previousSourceCommit,
 };
 if(data.type==="base") Object.assign(inputs,{release_record:JSON.stringify(releaseRecord),source_repo:repo,source_ref:ref,source_sha:head});
 if(data.type==="engine")Object.assign(inputs,{source_sha:head,apex:String(selectedComponents.includes("apex")),mcp:String(selectedComponents.includes("mcp")),studio:String(selectedComponents.includes("studio")),minimum_base_version:data.minimumBaseVersion||"1.0.0",base_channel:ENGINE_BASE_COMPATIBILITY_CHANNEL,minimum_deployer_protocol:data.protocol||"1"});
 const dispatchPayload=JSON.stringify({ref:workerRef,inputs});
 const dispatchBytes=Buffer.byteLength(dispatchPayload,"utf8");
 if(dispatchBytes>50000){
  const fieldBytes=Object.fromEntries(Object.entries(inputs).map(([key,value])=>[key,Buffer.byteLength(String(value??""),"utf8")]));
  const largest=Object.entries(fieldBytes).sort((a:any,b:any)=>Number(b[1])-Number(a[1])).slice(0,3).map(([key,size])=>`${key}=${size}B`).join(", ");
  throw new Error(`Release control payload is too large for GitHub Actions (${dispatchBytes} bytes; largest inputs: ${largest}). Re-inspect so Dev Panel can regenerate a compact control payload.`);
 }
 const releaseType=data.type==="base"?"base":"update";
 const sb=authClient();
 const {data:existing,error:existingError}=await sb.from("panel_release_drafts").select("*").eq("release_type",releaseType).eq("version",version).eq("channel",channel).maybeSingle();
 if(existingError)throw new Error("Unable to resolve release draft: "+existingError.message);
 if(existing&&["archived","rejected"].includes(String(existing.status)))throw new Error("This release draft is closed. Use Start Fresh or a new version before creating another attempt.");
 if(existing&&["building","awaiting_receipt"].includes(String(existing.status)))throw new Error("This release has a build awaiting completion or License Manager receipt.");
 let reuseHandedOff=false;
 if(existing&&String(existing.status)==="handed_off"){
  // The authoritative release may have been cleared since the previous successful handoff.
  // Reconcile only on an explicit new build, never while merely reading the release list.
  const authoritative=await licenseMaster(`/releases?product=orbitfs_base&channel=${encodeURIComponent(channel)}&type=${releaseType}&include_archived=true`);
  const matching=(Array.isArray(authoritative?.releases)?authoritative.releases:[]).filter((r:any)=>String(r.version||"")===version);
  if(matching.length){
   if(!repackage)throw new Error("This release still exists in License Manager. Open its authoritative record or use Repackage for another package revision.");
   if(!matching.some((r:any)=>String(r.id)===repackageReleaseId&&String(r.status||"").toLowerCase()==="published"))throw new Error("The selected published release is no longer the active repackage target. Refresh and try again.");
   reuseHandedOff=true;
  }else{
   if(existing.last_run_id){
    const previousRun=await github(`/repos/${workerRepo}/actions/runs/${Number(existing.last_run_id)}`);
    if(previousRun?.status!=="completed")throw new Error("The previous release workflow is still active. Wait for it to finish before starting fresh.");
   }
   const {error:staleDeleteError}=await sb.from("panel_release_drafts").delete().eq("id",existing.id).eq("status","handed_off");
   if(staleDeleteError)throw new Error("License Manager has no release, but the old Stage 1 draft could not be cleared: "+staleDeleteError.message);
  }
 }

 const inputSnapshot={type:data.type,version,channel,notes:data.notes.trim(),changelogDraft:generatedChangelog,components:selectedComponents,minimumBaseVersion:data.minimumBaseVersion||null,baseCompatibilityChannel:data.type==="engine"?ENGINE_BASE_COMPATIBILITY_CHANNEL:null,protocol:data.protocol||null,changelogTemplate:data.changelogTemplate,sourceSha:head,changedFiles:detectedFiles.map(compactDispatchFile),detectedSourceChanges:detectedFiles.length,changeSummary:sourceDiffMeta.summary||sourceChangeSummary(detectedFiles),sourceDiffComplete:sourceDiffMeta.diffComplete===true,detectedComponents,repackage,repackageReleaseId:repackage?repackageReleaseId:null,repackageRevision:repackage?Number(repackageRelease?.revision||1):null};
 let draft:any=existing?.status==="handed_off"?(reuseHandedOff?existing:null):existing;
 if(!draft){
   const {data:created,error:createError}=await sb.from("panel_release_drafts").insert({release_type:releaseType,version,channel,source_repo:repo,source_ref:ref,source_sha:head,status:"draft",inputs:inputSnapshot,created_by:actor.email||actor.id}).select("*").single();
   if(createError)throw new Error("Unable to create release draft: "+createError.message);
   draft=created;
 }
 await sb.from("panel_release_attempts").delete().eq("draft_id",draft.id).in("status",["failure","cancelled","skipped"]);
 const {data:remainingAttempts,error:remainingAttemptsError}=await sb.from("panel_release_attempts").select("attempt_number").eq("draft_id",draft.id).order("attempt_number",{ascending:false}).limit(1);
 if(remainingAttemptsError)throw new Error("Unable to clean stale release attempts: "+remainingAttemptsError.message);
 const attemptNumber=Number(remainingAttempts?.[0]?.attempt_number||0)+1;
 const {error:draftUpdateError}=await sb.from("panel_release_drafts").update({status:"building",latest_attempt:attemptNumber,last_error:null,last_run_id:null,last_run_url:null,source_sha:head,inputs:inputSnapshot,updated_at:new Date().toISOString()}).eq("id",draft.id);
 if(draftUpdateError)throw new Error("Unable to prepare release attempt: "+draftUpdateError.message);
 const {data:attemptRow,error:attemptCreateError}=await sb.from("panel_release_attempts").insert({draft_id:draft.id,attempt_number:attemptNumber,status:"queued"}).select("*").single();
 if(attemptCreateError)throw new Error("Unable to create release attempt: "+attemptCreateError.message);

 const dispatchedAt=Date.now();
 let runId:number|undefined;
 let runUrl:string|undefined;
 try{
   await github(`/repos/${workerRepo}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,{method:"POST",body:JSON.stringify({ref:workerRef,inputs})});
   for(let attempt=0;attempt<5&&!runId;attempt++){
     await new Promise(r=>setTimeout(r,700));
     try{
       const runs=await github(`/repos/${workerRepo}/actions/workflows/${encodeURIComponent(workflow)}/runs?event=workflow_dispatch&branch=${encodeURIComponent(workerRef)}&per_page=10`);
       const candidate=(runs?.workflow_runs||[]).filter((r:any)=>r.head_branch===workerRef&&new Date(r.created_at||0).getTime()>=dispatchedAt-5000).sort((a:any,b:any)=>new Date(b.created_at||0).getTime()-new Date(a.created_at||0).getTime())[0];
       runId=candidate?.id;
       runUrl=candidate?.html_url;
     }catch{}
   }
 }catch(error:any){
   const message=error?.message||"Unable to dispatch release workflow.";
   await sb.from("panel_release_attempts").update({status:"failure",error_summary:message,error_output:message,completed_at:new Date().toISOString()}).eq("id",attemptRow.id);
   await sb.from("panel_release_drafts").update({status:"draft",last_error:message,updated_at:new Date().toISOString()}).eq("id",draft.id);
   throw error;
 }
 if(runId){
   await sb.from("panel_release_attempts").update({run_id:runId,run_url:runUrl||null,status:"queued"}).eq("id",attemptRow.id);
   await sb.from("panel_release_drafts").update({last_run_id:runId,last_run_url:runUrl||null,status:"building",updated_at:new Date().toISOString()}).eq("id",draft.id);
 }
 return {ok:true,repo:workerRepo,ref:workerRef,sourceRepo:repo,sourceRef:ref,sourceSha:head,workflow,channel,runId:runId||null,draftId:draft.id,attemptNumber};
}
export const startRelease=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string}&{type:"base"|"engine";version:string;channel:string;notes:string;changelogDraft:string;files:any[];components:string[];minimumBaseVersion:string;protocol:string;changelogTemplate:string;inspectedSourceSha?:string;inspectedPublishedBaselineSha?:string|null;repackage?:boolean;repackageReleaseId?:string|null}})=>{
 const actor=readSession(data.token);
 return startReleaseCore(data,actor);
});


export const getControlState=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string}})=>{
 const {BASE_REPO,BASE_REF,BASE_WORKER_REPO,BASE_WORKER_REF,ENGINE_REPO,ENGINE_REF}=await githubContext();
 readSession(data.token);
 const [base,updates,channels,audit]=await Promise.all([
  licenseMaster('/releases?product=orbitfs_base&type=base&include_archived=true'),
  licenseMaster('/releases?product=orbitfs_base&type=update&include_archived=true'),
  licenseMaster('/release-channels?include_disabled=true'),
  licenseMaster('/audit-events?limit=100')
 ]);
 return {
  releases:[...(base?.releases||[]),...(updates?.releases||[])].sort((a:any,b:any)=>new Date(b.created_at||0).getTime()-new Date(a.created_at||0).getTime()),
  channels:channels?.channels||[],
  audit:audit?.events||[],
  repositories:{base:{repo:BASE_REPO,ref:BASE_REF,workerRepo:BASE_WORKER_REPO,workerRef:BASE_WORKER_REF,workflow:BASE_WORKFLOW},engine:{repo:ENGINE_REPO,ref:ENGINE_REF,workflow:ENGINE_WORKFLOW}},
  masterUrl:await configuredMasterUrl()
 };
});

export const deleteAuthoritativeRelease=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string;releaseId:string}})=>{
 const actor=readSession(data.token);
 if(!["owner","admin"].includes(String(actor.role).toLowerCase()))throw new Error("Admin access required");
 const id=String(data.releaseId||"").trim();
 if(!id)throw new Error("Release ID is required");
 const current=await licenseMaster(`/releases/${encodeURIComponent(id)}`);
 const release=current?.release;
 if(!release)throw new Error("Release was not found in License Manager");
 let status=String(release.status||"").toLowerCase();
 const everPublished=status==="published"||Boolean(release.published_at);
 if(everPublished)throw new Error("Published release history cannot be permanently deleted.");
 if(!release.published_at&&status!=="draft"&&!release.archived_at){
  await licenseMaster(`/releases/${encodeURIComponent(id)}`,{method:"POST",body:JSON.stringify({action:"archive",reason:"Archived automatically before permanent deletion by Dev Panel"})});
  status="archived";
 }
 const expected=`DELETE_RELEASE:${id}:${release.version}`;

 let billingWarning="";
 try{
  await billingStoreReset({
   releaseIds:[id],
   version:String(release.version||""),
   releaseType:String(release.release_type||"").toLowerCase()==="update"?"update":"base",
   channel:String(release.channel||"stable").toLowerCase()
  });
 }catch(error:any){
  billingWarning="Billing presentation cleanup could not be confirmed: "+String(error?.message||"unknown error")+".";
 }

 const result=await licenseMaster(`/releases/${encodeURIComponent(id)}`,{method:"POST",body:JSON.stringify({action:"delete",permanent:true,confirmation:expected})});
 return {ok:true,deleted:result?.deleted===true,id,warning:billingWarning||null};
});

export const startFreshRelease=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string;type:"base"|"engine";version:string;channel:string}})=>{
 const {BASE_WORKER_REPO,ENGINE_REPO}=await githubContext();
 const actor=readSession(data.token);
 if(!["owner","admin"].includes(String(actor.role||"").toLowerCase()))throw new Error("Admin access required to start a release fresh.");
 const version=String(data.version||"").trim();
 if(!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version))throw new Error("A valid release version is required.");
 const channel=normalizeChannel(data.channel||"stable");
 const releaseType=data.type==="base"?"base":"update";
 const workerRepo=data.type==="base"?BASE_WORKER_REPO:ENGINE_REPO;
 const result=await licenseMaster(`/releases?product=orbitfs_base&channel=${encodeURIComponent(channel)}&type=${releaseType}&include_archived=true`);
 const releases=(Array.isArray(result?.releases)?result.releases:[]).filter((r:any)=>String(r.version||"")===version&&String(r.channel||"stable").toLowerCase()===channel&&String(r.release_type||"").toLowerCase()===releaseType);
 const published=releases.find((r:any)=>String(r.status||"").toLowerCase()==="published"&&!r.archived_at);
 if(published)throw new Error(`v${version} is currently published. Unpublish it first, then use Start Fresh. The published history will be preserved.`);
 const sb=authClient();
 const {data:drafts,error:draftReadError}=await sb.from("panel_release_drafts").select("id,status,last_run_id").eq("release_type",releaseType).eq("version",version).eq("channel",channel);
 if(draftReadError)throw new Error("Unable to inspect Stage 1 draft state: "+draftReadError.message);
 for(const draft of drafts||[]){
  const runId=Number(draft.last_run_id||0);
  if(String(draft.status)==="building"&&runId){
   try{
    const run=await github(`/repos/${workerRepo}/actions/runs/${runId}`);
    if(run?.status!=="completed")await github(`/repos/${workerRepo}/actions/runs/${runId}/cancel`,{method:"POST"});
   }catch{}
  }
 }
 const disposable=releases.filter((release:any)=>!release.published_at);
 const historical=releases.filter((release:any)=>Boolean(release.published_at));
 const reusableHistorical=historical.filter((release:any)=>String(release.status||"").toLowerCase()!=="published"&&!release.archived_at);
 let billingWarning="";
 try{
  await billingStoreReset({releaseIds:disposable.map((r:any)=>String(r.id)),version,releaseType,channel});
 }catch(error:any){
  billingWarning="Billing presentation cleanup could not be confirmed: "+String(error?.message||"unknown error")+".";
 }
 for(const release of reusableHistorical){
  await licenseMaster(`/releases/${encodeURIComponent(String(release.id))}`,{method:"POST",body:JSON.stringify({action:"archive",reason:"Preserved published history archived by Dev Panel Start Fresh so the version can be reused"})});
 }
 for(const release of disposable){
  const id=String(release.id);
  const status=String(release.status||"").toLowerCase();
  if(status!=="draft"&&!release.archived_at){
   await licenseMaster(`/releases/${encodeURIComponent(id)}`,{method:"POST",body:JSON.stringify({action:"archive",reason:"Archived automatically before Dev Panel Start Fresh cleanup"})});
  }
  const confirmation=`DELETE_RELEASE:${id}:${release.version}`;
  await licenseMaster(`/releases/${encodeURIComponent(id)}`,{method:"POST",body:JSON.stringify({action:"delete",permanent:true,confirmation})});
 }
 const {error:eventDeleteError}=await sb.from("panel_release_events").delete().eq("release_version",version).eq("release_type",releaseType).eq("channel",channel);
 if(eventDeleteError)throw new Error("Release records were cleared, but Dev Panel lifecycle history could not be reset: "+eventDeleteError.message);
 const {error:draftDeleteError}=await sb.from("panel_release_drafts").delete().eq("release_type",releaseType).eq("version",version).eq("channel",channel);
 if(draftDeleteError)throw new Error("Release records were cleared, but the Stage 1 draft could not be reset: "+draftDeleteError.message);
 return {ok:true,version,channel,releaseType,deletedReleases:disposable.length,preservedHistoricalReleases:historical.length,archivedHistoricalReleases:reusableHistorical.length,deletedDrafts:(drafts||[]).length,warning:billingWarning||null};
});

export const controlRelease=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string;releaseId:string;action:"withdraw"}})=>{
 const actor=readSession(data.token);
 if(!["owner","admin"].includes(String(actor.role).toLowerCase()))throw new Error("Admin access required");
 const id=String(data.releaseId||"").trim();
 if(!id)throw new Error("Release ID is required");
 if(String(data.action||"").trim().toLowerCase()!=="withdraw")throw new Error("Dev Panel only supports unpublishing releases. Use Billing Store for release control.");
 const configured=String(process.env.BILLING_STORE_URL||process.env.CUSTOMER_PORTAL_URL||"").trim();
 if(!configured)throw new Error("Billing Store URL is not configured.");
 const base=new URL(configured);
 if(base.protocol!=="https:")throw new Error("Billing Store URL must use HTTPS.");
 base.pathname="";base.search="";base.hash="";
 return requestJson(base.origin+"/api/internal/orbitfs/release-control",{
  method:"POST",
  headers:{authorization:"Bearer "+required("DEV_PANEL_EVENT_SECRET")},
  body:JSON.stringify({action:"withdraw",releaseId:id})
 });
});

export const getChannelsState=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string}})=>{
 readSession(data.token);
 const channels=await licenseMaster('/release-channels?include_disabled=true');
 return {channels:channels?.channels||[],warnings:[]};
});

export const getAuditState=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string;limit?:number}})=>{
 readSession(data.token);
 const limit=Math.min(200,Math.max(1,Number(data.limit||100)));
 const result=await licenseMaster(`/audit-events?limit=${limit}`);
 return {events:result?.events||[]};
});

export const getRepositoryStatus=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string}})=>{
 const {BASE_REPO,BASE_REF,ENGINE_REPO,ENGINE_REF}=await githubContext();
 readSession(data.token);
 const configs=[
  {key:"base",repo:BASE_REPO,ref:BASE_REF,workflow:BASE_WORKFLOW},
  {key:"engine",repo:ENGINE_REPO,ref:ENGINE_REF,workflow:ENGINE_WORKFLOW},
 ];
 const rows:any[]=[];
 for(const cfg of configs){
  let head:any=null,run:any=null;
  try{const branch=await github(`/repos/${cfg.repo}/git/ref/heads/${encodeURIComponent(cfg.ref)}`);head=branch?.object?.sha||null;}catch{}
  try{
   const runs=await github(`/repos/${cfg.repo}/actions/workflows/${encodeURIComponent(cfg.workflow)}/runs?branch=${encodeURIComponent(cfg.ref)}&per_page=1`);
   run=(runs?.workflow_runs||[])[0]||null;
  }catch{}
  rows.push({...cfg,head,run});
 }
 return {repositories:rows};
});

export const getPortalMonitor=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string}})=>{
 readSession(data.token);
 const [base,updates,channels]=await Promise.all([
  licenseMaster('/releases?product=orbitfs_base&type=base&include_archived=true'),
  licenseMaster('/releases?product=orbitfs_base&type=update&include_archived=true'),
  licenseMaster('/release-channels?include_disabled=true')
 ]);
 const releases=[...(base?.releases||[]),...(updates?.releases||[])];
 return {
  releases,
  published:releases.filter((r:any)=>r.status==="published"&&!r.archived_at),
  channels:channels?.channels||[],
  portalUrl:(process.env.CUSTOMER_PORTAL_URL||process.env.BILLING_STORE_URL||"").replace(/\/+$/,"")
 };
});

async function requestJson(url:string,init:RequestInit={}){
 let r:Response;
 try {
   r=await fetch(url,{...init,cache:"no-store",headers:{accept:"application/json",...(init.body?{"content-type":"application/json"}:{}),...(init.headers||{})}});
 } catch (error:any) {
   throw new Error(`Network request failed: ${url} · ${error?.message || "fetch failed"}`);
 }
 const text=await r.text();
 const contentType=(r.headers.get("content-type")||"").toLowerCase();
 let body:any=null;
 if(text){
   try{ body=JSON.parse(text); }
   catch{
     const looksHtml=contentType.includes("text/html")||/^\\s*<!doctype html/i.test(text)||/^\\s*<html/i.test(text);
     body={error:looksHtml?null:text.trim().slice(0,500)};
   }
 }
 if(!r.ok){
   if(contentType.includes("text/html")||/^\\s*<!doctype html/i.test(text)||/^\\s*<html/i.test(text)){
     throw new Error(`License Master API returned HTTP ${r.status} for ${new URL(url).pathname}. The configured LICENSE_MASTER_URL may point at a deployment that does not expose this API route.`);
   }
   throw new Error(body?.error||body?.message||`Request failed (${r.status}) at ${url}`);
 }
 if(text&&!body){
   throw new Error(`Expected JSON from ${url}, but the response could not be parsed.`);
 }
 return body;
}
const githubReadCache=new Map<string,{value:any;expires:number;staleUntil:number}>();
let githubRateLimitedUntil=0;
async function github(path:string,init:RequestInit={}){
 const method=String(init.method||"GET").toUpperCase();
 const key=method==="GET"?path:"";
 const cached=key?githubReadCache.get(key):null;
 if(cached&&cached.expires>Date.now())return cached.value;
 if(method==="GET"&&githubRateLimitedUntil>Date.now()){
  if(cached&&cached.staleUntil>Date.now())return cached.value;
  throw new Error("GitHub API rate limit is cooling down; live status will resume automatically.");
 }
 try{
  const value=await requestJson(`https://api.github.com${path}`,{...init,headers:{authorization:`Bearer ${githubToken()}`,"x-github-api-version":"2022-11-28",...(init.headers||{})}});
  if(key)githubReadCache.set(key,{value,expires:Date.now()+15000,staleUntil:Date.now()+5*60*1000});
  else githubReadCache.clear();
  return value;
 }catch(error:any){
  if(/rate limit/i.test(String(error?.message||error)))githubRateLimitedUntil=Math.max(githubRateLimitedUntil,Date.now()+60000);
  if(cached&&cached.staleUntil>Date.now())return cached.value;
  throw error;
 }
}
async function licenseMaster(path:string,init:RequestInit={}){
 const base=await configuredMasterUrl();
 return requestJson(`${base}${path}`,{...init,headers:{authorization:`Bearer ${required("LICENSE_MASTER_API_TOKEN")}`,...(init.headers||{})}});
}

async function billingStoreReset(input:{releaseIds:string[];version:string;releaseType:"base"|"update";channel:string}){
 const configured=String(process.env.BILLING_STORE_URL||process.env.CUSTOMER_PORTAL_URL||"").trim();
 if(!configured)throw new Error("Billing Store URL is not configured for Start Fresh.");
 const base=new URL(configured);
 if(base.protocol!=="https:")throw new Error("Billing Store URL must use HTTPS.");
 base.pathname="";
 base.search="";
 base.hash="";
 const secret=required("DEV_PANEL_EVENT_SECRET");
 return requestJson(base.origin+"/api/internal/orbitfs/release-reset",{
  method:"POST",
  headers:{authorization:"Bearer "+secret},
  body:JSON.stringify(input)
 });
}


const OPERATIONS_CI_WORKFLOW=process.env.OPERATIONS_CI_WORKFLOW||"ci.yml";
const OPERATIONS_DEPLOY_WORKFLOW=process.env.OPERATIONS_DEPLOY_WORKFLOW||"production-deploy.yml";
const LICENSE_MANAGER_QUICK_DEPLOY_WORKFLOW=process.env.LICENSE_MANAGER_QUICK_DEPLOY_WORKFLOW||"quick-deploy.yml";
const BILLING_STORE_QUICK_DEPLOY_WORKFLOW=process.env.BILLING_STORE_QUICK_DEPLOY_WORKFLOW||"quick-redesign-deploy.yml";
type OperationsSystem="baseSource"|"engineSource"|"licenseManager"|"billingStore";

async function operationsRepos(){
 const profile=await activeGithubProfile();
 return {
  baseSource:{repo:profile.base.repo,branch:profile.base.releaseRef,label:"V1 Vercel Base",ci:"ci.yml",deploy:"base-release-ci.yml",quickDeploy:"base-release-ci.yml"},
  engineSource:{repo:profile.engine.repo,branch:profile.engine.releaseRef,label:"V1 Vercel Engine",ci:"ci.yml",deploy:"publish-engine-release.yml",quickDeploy:"publish-engine-release.yml"},
  licenseManager:{repo:profile.licenseManager.repo,branch:profile.licenseManager.branch,label:"Custom License Manager",ci:OPERATIONS_CI_WORKFLOW,deploy:OPERATIONS_DEPLOY_WORKFLOW,quickDeploy:LICENSE_MANAGER_QUICK_DEPLOY_WORKFLOW},
  billingStore:{repo:profile.billingStore.repo,branch:profile.billingStore.branch,label:"V2 Billing Store",ci:OPERATIONS_CI_WORKFLOW,deploy:OPERATIONS_DEPLOY_WORKFLOW,quickDeploy:BILLING_STORE_QUICK_DEPLOY_WORKFLOW},
 } as const;
}

function requireOperationsUser(token:string){
 const user=readSession(token);
 if(!["owner","admin","operator"].includes(String(user.role||"").toLowerCase()))throw new Error("Operations access required");
 return user;
}
async function operationsConfig(system:string){
 const configs=await operationsRepos();
 const cfg=configs[system as OperationsSystem];
 if(!cfg)throw new Error("Unknown Operations system");
 return cfg;
}
function cleanOperationsRun(run:any){
 return run?{id:run.id,status:run.status,conclusion:run.conclusion,run_number:run.run_number,head_sha:run.head_sha,created_at:run.created_at,updated_at:run.updated_at,html_url:run.html_url,name:run.name}:null;
}
const operationsGithubTextCache=new Map<string,{value:string;expires:number;staleUntil:number}>();
async function operationsGithubText(path:string){
 const cached=operationsGithubTextCache.get(path);
 if(cached&&cached.expires>Date.now())return cached.value;
 const token=await githubToken();
 const response=await fetch("https://api.github.com"+path,{headers:{accept:"application/vnd.github+json",authorization:"Bearer "+token,"x-github-api-version":process.env.GITHUB_API_VERSION||"2022-11-28"},cache:"no-store",redirect:"follow"});
 const text=await response.text();
 if(response.ok)operationsGithubTextCache.set(path,{value:text,expires:Date.now()+60000,staleUntil:Date.now()+5*60*1000});
 if(response.status===404&&/\/actions\/jobs\/\d+\/logs(?:\?|$)/.test(path))return "";
 if(!response.ok){
  if(response.status===403||response.status===429){
   const reset=Number(response.headers.get("x-ratelimit-reset")||0)*1000;
   githubRateLimitedUntil=Math.max(githubRateLimitedUntil,reset>Date.now()?reset:Date.now()+60000);
  }
  if(cached&&cached.staleUntil>Date.now())return cached.value;
  let detail="";
  try{const body=JSON.parse(text);detail=String(body?.message||"")}catch{}
  throw new Error("GitHub API returned HTTP "+response.status+(detail?" · "+detail:"")+" for "+path+".");
 }
 return text;
}
function cleanOperationLogLine(line:string){
 return line.replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\s*/,"").replace(/^.*?##\[error\]\s*/,"").trim();
}
function extractOperationFailure(log:string){
 const lines=String(log||"").split(/\r?\n/).map(x=>x.trimEnd()).filter(Boolean);
 const pattern=/##\[error\]|(?:npm ERR!|pnpm ERR!|yarn error|Error:|error TS\d+|Type error|Build failed|failed with|Process completed with exit code|ELIFECYCLE|Expected .+ got|SyntaxError|ReferenceError|Module not found|Cannot find module|ENOENT|EADDRINUSE|ERR_[A-Z_]+|fatal:|FATAL|ERROR)/i;
 const hits:number[]=[];
 for(let i=0;i<lines.length;i++)if(pattern.test(lines[i]))hits.push(i);
 if(!hits.length)return null;
 const selected:string[]=[];const seen=new Set<string>();
 for(const i of hits)for(const line of lines.slice(Math.max(0,i-8),Math.min(lines.length,i+4))){const clean=cleanOperationLogLine(line);if(clean&&!seen.has(clean)){seen.add(clean);selected.push(clean)}}
 return {error:selected[selected.length-1]||"Workflow job failed.",preceding:[],lines:selected.slice(-120)};
}
function fallbackOperationFailure(job:any,logTail:string){
 if(job.conclusion!=="failure")return null;
 const lines:string[]=[];
 for(const step of job.steps||[])if(step.conclusion==="failure")lines.push("Failed step: "+step.name);
 lines.push(...String(logTail||"").split(/\r?\n/).map(cleanOperationLogLine).filter(Boolean).slice(-80));
 const unique=[...new Set(lines)].slice(-120);
 if(!unique.length)unique.push("GitHub reported this job as failed, but no console log text was available yet.");
 return {error:unique[unique.length-1],preceding:[],lines:unique};
}
async function operationsRunDetail(cfg:any){
 const [ciRows,deployRows,quickDeployRows,ref]=await Promise.all([
  github("/repos/"+cfg.repo+"/actions/workflows/"+cfg.ci+"/runs?branch="+encodeURIComponent(cfg.branch)+"&per_page=10"),
  github("/repos/"+cfg.repo+"/actions/workflows/"+cfg.deploy+"/runs?branch="+encodeURIComponent(cfg.branch)+"&per_page=10"),
  github("/repos/"+cfg.repo+"/actions/workflows/"+cfg.quickDeploy+"/runs?branch="+encodeURIComponent(cfg.branch)+"&per_page=10"),
  github("/repos/"+cfg.repo+"/git/ref/heads/"+encodeURIComponent(cfg.branch)),
 ]);
 const ciRuns=Array.isArray(ciRows?.workflow_runs)?ciRows.workflow_runs:[];
 const deployRuns=Array.isArray(deployRows?.workflow_runs)?deployRows.workflow_runs:[];
 const quickDeployRuns=Array.isArray(quickDeployRows?.workflow_runs)?quickDeployRows.workflow_runs:[];
 const ciRun=ciRuns[0]||null;
 const deployRun=deployRuns[0]||null;
 const quickDeployRun=quickDeployRuns[0]||null;
 const successfulDeployments=[...deployRuns,...quickDeployRuns].filter((run:any)=>run?.status==="completed"&&run?.conclusion==="success").sort((a:any,b:any)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime());
 const deployedRun=successfulDeployments[0]||null;
 const candidates=[ciRun,deployRun,quickDeployRun].filter(Boolean).sort((a:any,b:any)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime());
 const run=candidates.find((x:any)=>x.status!=="completed")||candidates[0]||null;
 const currentSha=String(ref?.object?.sha||"");
 const deployedSha=String(deployedRun?.head_sha||"");
 const productionCurrent=!!currentSha&&!!deployedSha&&currentSha===deployedSha;
 if(!run)return {repo:cfg.repo,label:cfg.label,currentSha,deployedSha,productionCurrent,run:null,latestDeployment:cleanOperationsRun(deployedRun),latestDeploymentAttempt:null,jobs:[],failure:null,chatPrompt:null,monitoring:"Workflow"};
 const jobsResult=await github("/repos/"+cfg.repo+"/actions/runs/"+run.id+"/jobs?per_page=100");
 const jobs=await Promise.all((jobsResult?.jobs||[]).map(async(job:any)=>{
  let failure:any=null,logTail="",logError="";
  if(job.status==="completed"){
   try{
    const logs=await operationsGithubText("/repos/"+cfg.repo+"/actions/jobs/"+job.id+"/logs");
    if(logs){
     const lines=logs.split(/\r?\n/).filter(Boolean);
     logTail=lines.slice(-250).join("\n");
     if(job.conclusion==="failure")failure=extractOperationFailure(logs);
    }else{
     logError="GitHub has not exposed the final job log yet.";
    }
   }catch(error:any){logError=error?.message||"Unable to retrieve GitHub job logs."}
  }else{
   logTail=(job.steps||[]).map((s:any)=>`${s.status==="completed"?(s.conclusion==="success"?"✓":s.conclusion==="failure"?"✕":"•"):"…"} ${s.name} · ${s.status}${s.conclusion?" · "+s.conclusion:""}`).join("\n");
  }
  if(job.conclusion==="failure"&&!failure)failure=fallbackOperationFailure(job,logTail);
  return {id:job.id,name:job.name,status:job.status,conclusion:job.conclusion,started_at:job.started_at,completed_at:job.completed_at,html_url:job.html_url,steps:(job.steps||[]).map((s:any)=>({name:s.name,status:s.status,conclusion:s.conclusion,started_at:s.started_at,completed_at:s.completed_at})),failure,logTail,logError};
 }));
 const failedJob=jobs.find((j:any)=>j.conclusion==="failure");
 const failure=failedJob?.failure||null;
 const chatPrompt=failure?[
  "Fix this failed GitHub Actions job.","",
  "Repository: https://github.com/"+cfg.repo,
  "Branch: main",
  "Commit: "+run.head_sha,
  "Workflow: "+(run.name||"Unknown"),
  "Run: "+(failedJob?.html_url||run.html_url),
  "Failed job: "+(failedJob?.name||"Unknown"),"",
  "Captured error/output:",...failure.lines,"",
  "Trace the root cause in the repository, fix the implementation rather than masking the failure, and run the relevant validation/build checks. Do not deploy automatically.",
 ].join("\n"):null;
 const latestAttempt=[deployRun,quickDeployRun].filter(Boolean).sort((a:any,b:any)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime())[0]||null;
 return {repo:cfg.repo,label:cfg.label,currentSha,deployedSha,productionCurrent,run:cleanOperationsRun(run),ciRun:cleanOperationsRun(ciRun),deployRun:cleanOperationsRun(deployRun),quickDeployRun:cleanOperationsRun(quickDeployRun),latestDeployment:cleanOperationsRun(deployedRun),latestDeploymentAttempt:cleanOperationsRun(latestAttempt),jobs,failure,chatPrompt,monitoring:run.name||"Workflow"};
}

let operationsStateCache:{value:any;expires:number}|null=null;

export const getOperationsState=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string}})=>{
 requireOperationsUser(data.token);
 if(operationsStateCache&&operationsStateCache.expires>Date.now())return operationsStateCache.value;
 const keys:OperationsSystem[]=["licenseManager","billingStore"];
 try{
  const configs=await operationsRepos();
   const entries=await Promise.all(keys.map(async key=>[key,await operationsRunDetail(configs[key])] as const));
  const value={checkedAt:new Date().toISOString(),systems:Object.fromEntries(entries),stale:false};
  operationsStateCache={value,expires:Date.now()+12000};
  return value;
 }catch(error:any){
  if(operationsStateCache){
   return {...operationsStateCache.value,stale:true,warning:"GitHub API is temporarily unavailable or rate-limited; showing the last known Operations state.",checkedAt:new Date().toISOString()};
  }
  throw error;
 }
});

async function findOperationsRun(cfg:any,workflow:string,startedAt:number){
 for(let attempt=0;attempt<8;attempt++){
  const runs=await github("/repos/"+cfg.repo+"/actions/workflows/"+workflow+"/runs?branch=main&per_page=5");
  const run=(runs?.workflow_runs||[]).find((x:any)=>new Date(x.created_at).getTime()>=startedAt-2000);
  if(run)return cleanOperationsRun(run);
  await new Promise(resolve=>setTimeout(resolve,750));
 }
 return null;
}

export const runOperation=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string;system:OperationsSystem;action:"ci"|"deploy"|"override-deploy"}})=>{
 requireOperationsUser(data.token);
 const cfg=await operationsConfig(data.system);
 const action=String(data.action||"");
 if(!["ci","deploy","override-deploy"].includes(action))throw new Error("Unknown Operations action");
 const workflow=action==="ci"?cfg.ci:action==="override-deploy"?cfg.quickDeploy:cfg.deploy;
 if(action==="deploy"){
  const [scanRows,latestDeploy,latestQuickDeploy,ref]=await Promise.all([
   github("/repos/"+cfg.repo+"/actions/workflows/"+cfg.ci+"/runs?branch="+encodeURIComponent(cfg.branch)+"&event=workflow_dispatch&per_page=50"),
   github("/repos/"+cfg.repo+"/actions/workflows/"+cfg.deploy+"/runs?branch="+encodeURIComponent(cfg.branch)+"&status=success&per_page=1"),
   github("/repos/"+cfg.repo+"/actions/workflows/"+cfg.quickDeploy+"/runs?branch="+encodeURIComponent(cfg.branch)+"&status=success&per_page=1"),
   github("/repos/"+cfg.repo+"/git/ref/heads/"+encodeURIComponent(cfg.branch)),
  ]);
  const mainSha=String(ref?.object?.sha||"");
  const latestScan=(scanRows?.workflow_runs||[]).filter((run:any)=>run.head_sha===mainSha).sort((a:any,b:any)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime())[0]||null;
  const deployedRun=[latestDeploy?.workflow_runs?.[0],latestQuickDeploy?.workflow_runs?.[0]].filter(Boolean).sort((a:any,b:any)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime())[0]||null;
  if(deployedRun?.head_sha===mainSha)throw new Error("No deployment needed. The latest main commit is already deployed to production.");
  if(!latestScan||latestScan.status!=="completed"||latestScan.conclusion!=="success")throw new Error("Deploy is blocked until the exact current main commit has a successful Full Scan. A scan for an older commit cannot be reused.");
 }
 const startedAt=Date.now();
 await github("/repos/"+cfg.repo+"/actions/workflows/"+workflow+"/dispatches",{method:"POST",body:JSON.stringify({ref:"main"})});
 operationsStateCache=null;
 const run=await findOperationsRun(cfg,workflow,startedAt);
 return {ok:true,run,action,system:data.system,message:cfg.label+" "+(action==="ci"?"Full Scan":action==="override-deploy"?"OVERRIDE DEPLOY":"production deployment")+" queued."};
});

async function operationsFullTree(repo:string,treeSha:string,prefix=""){
 const root=await github("/repos/"+repo+"/git/trees/"+treeSha);
 const files:any[]=[];
 for(const item of root?.tree||[]){const path=prefix?prefix+"/"+item.path:item.path;if(item.type==="tree")files.push(...await operationsFullTree(repo,item.sha,path));else files.push({...item,path})}
 return files;
}
async function operationsAllCompareCommits(repo:string,base:string,head:string){
 const all:any[]=[];
 for(let page=1;page<=100;page++){const rows=await github("/repos/"+repo+"/compare/"+base+"..."+head+"?per_page=100&page="+page);const commits=rows?.commits||[];all.push(...commits);if(commits.length<100)break}
 return all;
}
export const getOperationsScan=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string;system:OperationsSystem}})=>{
 requireOperationsUser(data.token);
 const cfg=await operationsConfig(data.system);
 const ref=await github("/repos/"+cfg.repo+"/git/ref/heads/"+encodeURIComponent(cfg.branch));
 const currentSha=String(ref?.object?.sha||"");
 if(!currentSha)throw new Error("Unable to resolve main branch for "+cfg.repo+".");
 const [deploySuccess,quickSuccess]=await Promise.all([
  github("/repos/"+cfg.repo+"/actions/workflows/"+cfg.deploy+"/runs?branch="+encodeURIComponent(cfg.branch)+"&status=success&per_page=1"),
  github("/repos/"+cfg.repo+"/actions/workflows/"+cfg.quickDeploy+"/runs?branch="+encodeURIComponent(cfg.branch)+"&status=success&per_page=1"),
 ]);
 const normalRun=deploySuccess?.workflow_runs?.[0]||null,quickRun=quickSuccess?.workflow_runs?.[0]||null;
 const deployedRun=[normalRun,quickRun].filter(Boolean).sort((a:any,b:any)=>new Date(b.created_at||0).getTime()-new Date(a.created_at||0).getTime())[0]||null;
 const baselineSha=deployedRun?.head_sha||null;
 const baselineSource=deployedRun===quickRun?"quick-deployment":deployedRun?"production-deployment":"no-production-deployment";
 let commits:any[]=[],changedFiles:any[]=[];
 if(baselineSha&&baselineSha!==currentSha){
  commits=await operationsAllCompareCommits(cfg.repo,baselineSha,currentSha);
  const [baseCommit,currentCommit]=await Promise.all([github("/repos/"+cfg.repo+"/commits/"+baselineSha),github("/repos/"+cfg.repo+"/commits/"+currentSha)]);
  const [baseFiles,currentFiles]=await Promise.all([operationsFullTree(cfg.repo,baseCommit.commit.tree.sha),operationsFullTree(cfg.repo,currentCommit.commit.tree.sha)]);
  const baseMap=new Map(baseFiles.map((x:any)=>[x.path,x])),currentMap=new Map(currentFiles.map((x:any)=>[x.path,x]));
  for(const path of new Set([...baseMap.keys(),...currentMap.keys()])){const before:any=baseMap.get(path),after:any=currentMap.get(path);if(!before)changedFiles.push({path,status:"added",sha:after.sha,size:after.size??null});else if(!after)changedFiles.push({path,status:"deleted",sha:null,size:null});else if(before.sha!==after.sha||before.mode!==after.mode)changedFiles.push({path,status:"modified",sha:after.sha,size:after.size??null})}
  changedFiles.sort((a,b)=>a.path.localeCompare(b.path));
 }else if(!baselineSha){
  const currentCommit=await github("/repos/"+cfg.repo+"/commits/"+currentSha);
  const currentFiles=await operationsFullTree(cfg.repo,currentCommit.commit.tree.sha);
  changedFiles=currentFiles.map((item:any)=>({path:item.path,status:"added",sha:item.sha,size:item.size??null})).sort((a:any,b:any)=>a.path.localeCompare(b.path));
 }
 return {key:data.system,label:cfg.label,repo:cfg.repo,branch:cfg.branch,currentSha,baselineSha,baselineSource,productionCurrent:!!deployedRun&&currentSha===deployedRun.head_sha,updateAvailable:!baselineSha||currentSha!==baselineSha,commits:commits.map((c:any)=>({sha:c.sha,html_url:c.html_url,message:String(c.commit?.message||"").split("\n")[0],author:c.commit?.author?.name||c.author?.login||"Unknown",date:c.commit?.author?.date||c.commit?.committer?.date||null})).reverse(),commitCount:commits.length,changedFiles,changedFileCount:changedFiles.length,completeFileScan:true,checkedAt:new Date().toISOString()};
});
