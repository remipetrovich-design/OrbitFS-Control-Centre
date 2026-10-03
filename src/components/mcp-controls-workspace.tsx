import {useCallback,useEffect,useState} from "react";
import {
 Activity,AppWindow,Boxes,ChevronDown,Copy,KeyRound,Link2,LockKeyhole,Play,RefreshCw,
 Server,ShieldAlert,ShieldCheck,SlidersHorizontal,Square,Trash2,Unplug,Workflow
} from "lucide-react";
import {
 getLicenseManagerLockdownForPanel,getMcpConnectionsForPanel,getMcpSettingsForPanel,manageMcpConnectionForPanel,setLicenseManagerLockdownForPanel,updateMcpSettingsForPanel
} from "@/lib/dev-mcp.server";

type SettingItem=readonly [string,string,string];

const GENERAL:SettingItem[]=[
 ["read_only_mode","Read-only mode","Keep lookups, status and diagnostics available while blocking mutations."],
 ["allow_mutations","Allow UI write controls","Global write gate for Dev Panel UI prepare, deployment, update, release and licence changes. Chat/model access remains read-only."],
];
const SYSTEMS:SettingItem[]=[
 ["expose_base","V1 Base","Base release status, preparation and workflows."],
 ["expose_engine","V1 Engine","Engine/update release status, preparation and workflows."],
 ["expose_license_manager","Custom Licence Manager","Authoritative licence, release, runtime and updater data."],
 ["expose_billing_store","V2 Billing Store","Customer/email resolution, installation context and customer deployment."],
];
const TOOLS:SettingItem[]=[
 ["tool_show_dev","show_dev","Embedded ChatGPT Dev Panel interface."],
 ["tool_status","status","System, release branch, service and customer status."],
 ["tool_prepare","prepare","UI-only: Prepare Base, Engine or both release branches."],
 ["tool_deploy","deploy","UI-only: Service scan, deploy, Quick Deploy, redeploy and workflow controls."],
 ["tool_release","release","UI-only control surface for release inspection and lifecycle actions."],
 ["tool_update","update","UI-only control surface for customer update inspect, plan, apply, retry and rollback."],
 ["tool_license","license","Customer/licence lookup, runtime, components, pulse and history."],
 ["tool_license_change","license_change","UI-only: Licence state, component access, linking and installation controls."],
 ["tool_diagnose","diagnose","Combined system/customer diagnostics."],
 ["tool_logs","logs","GitHub Actions run, job and step state."],
];
const MUTATIONS:SettingItem[]=[
 ["allow_prepare","Prepare release branches","Guarded Base/Engine release-branch preparation."],
 ["allow_service_scan","Service Full Scan","Controlled Full Scan workflow dispatch."],
 ["allow_service_deploy","Service deploy/redeploy","Normal production deploy and safe redeploy workflows."],
 ["allow_quick_deploy","Quick Deploy","Explicit Quick Deploy workflows."],
 ["allow_workflow_control","Cancel / retry workflows","Cancellation or rerun of explicit workflow run IDs."],
 ["allow_release_review","Approve / reject releases","License Manager review decisions."],
 ["allow_release_publish","Release lifecycle","Publish, unpublish, archive, restore, promote and pause actions."],
 ["allow_release_rollback","Release rollback / revert","Release rollback or revert actions."],
 ["allow_update_apply","Apply customer updates","Customer update apply and retry."],
 ["allow_update_rollback","Rollback customer updates","Customer update rollback where supported."],
 ["allow_license_state_changes","Licence state/runtime","Suspend, restore, revoke, rotate and runtime revalidation."],
 ["allow_license_entitlement_changes","Licence components","Component/entitlement access changes."],
 ["allow_installation_unlock","Installation unlock","Unlock a matching licence installation."],
 ["allow_license_linking","Customer licence linking","Link customer/email records to an authoritative licence."],
];
const UI:SettingItem[]=[
 ["ui_enabled","Embedded ChatGPT UI","Expose the MCP App resource and show_dev tool."],
 ["ui_fullscreen_enabled","Fullscreen mode","Allow the embedded Dev Panel to expand fullscreen."],
 ["ui_pip_enabled","Live PiP mode","Allow workflow state to remain pinned while chatting."],
];
const OAUTH:SettingItem[]=[
 ["oauth_cimd_enabled","CIMD","Preferred Client ID Metadata Document flow."],
 ["oauth_dcr_enabled","DCR fallback","Dynamic Client Registration fallback for compatibility."],
 ["oauth_refresh_tokens_enabled","Refresh tokens","Keep linked ChatGPT/Codex sessions connected."],
];

function ToggleRow({item,value,busy,onToggle}:{item:SettingItem;value:boolean;busy:boolean;onToggle:(key:string,value:boolean)=>void}){
 const [key,label,detail]=item;
 return <div className="flex items-center justify-between gap-4 border-b border-border/60 px-4 py-3 last:border-b-0">
  <div className="min-w-0"><div className="text-xs font-semibold">{label}</div><p className="mt-1 text-[11px] leading-4 text-muted-foreground">{detail}</p></div>
  <button disabled={busy} onClick={()=>onToggle(key,!value)} className={"min-w-[68px] rounded-full border px-3 py-1.5 text-[10px] font-bold "+(value?"border-emerald-400/40 bg-emerald-400/10 text-emerald-300":"border-border bg-muted text-muted-foreground")}>{value?"ON":"OFF"}</button>
 </div>;
}
function Collapse({id,title,description,icon:Icon,open,setOpen,children,aside}:{id:string;title:string;description:string;icon:any;open:boolean;setOpen:(id:string)=>void;children:any;aside?:any}){
 return <section className="release-surface overflow-hidden">
  <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
   <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={()=>setOpen(id)}>
    <span className="orbit-section-icon"><Icon size={15}/></span>
    <div className="min-w-0 flex-1"><h2 className="text-xs font-semibold">{title}</h2><p className="mt-0.5 truncate text-[10px] text-muted-foreground">{description}</p></div>
    <ChevronDown size={15} className={"shrink-0 transition-transform "+(open?"rotate-180":"")}/>
   </button>
   {aside}
  </div>
  {open&&<div>{children}</div>}
 </section>;
}
function SettingsGroup(props:{id:string;title:string;description:string;icon:any;items:readonly SettingItem[];settings:any;busy:string;open:boolean;setOpen:(id:string)=>void;onToggle:(key:string,value:boolean)=>void}){
 return <Collapse id={props.id} title={props.title} description={props.description} icon={props.icon} open={props.open} setOpen={props.setOpen}>
  {props.items.map(item=><ToggleRow key={item[0]} item={item} value={Boolean(props.settings?.[item[0]])} busy={props.busy===item[0]} onToggle={props.onToggle}/>)}
 </Collapse>;
}

export function McpControlsWorkspace({session}:{session:any}){
 const [settings,setSettings]=useState<any>(null);
 const [runtime,setRuntime]=useState<any>(null);
 const [connections,setConnections]=useState<any>({clients:[],activeTokens:0});
 const [lockdown,setLockdown]=useState<any>(null);
 const [lockdownError,setLockdownError]=useState("");
 const [oauthError,setOauthError]=useState("");
 const [busy,setBusy]=useState("");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [open,setOpenState]=useState<Record<string,boolean>>({general:true,systems:false,tools:false,mutations:false,ui:false,oauth:false,security:false,clients:false});
 const setOpen=(id:string)=>setOpenState(x=>({...x,[id]:!x[id]}));

 const load=useCallback(async()=>{
  setError("");setOauthError("");
  try{
   const config=await getMcpSettingsForPanel({data:{token:session.token}});
   setSettings(config.settings);setRuntime(config.runtime);
  }catch(x:any){setError(x?.message||"Unable to load MCP settings")}
  try{
   setConnections(await getMcpConnectionsForPanel({data:{token:session.token}}));
  }catch(x:any){setOauthError(x?.message||"OAuth connection details unavailable")}
  try{
   setLockdown(await getLicenseManagerLockdownForPanel({data:{token:session.token}}));setLockdownError("");
  }catch(x:any){setLockdownError(x?.message||"Lockdown state unavailable")}
 },[session.token]);
 useEffect(()=>{void load()},[load]);

 async function toggle(key:string,value:boolean){
  setBusy(key);setError("");setNotice("");
  try{
   const r=await updateMcpSettingsForPanel({data:{token:session.token,patch:{[key]:value}}});
   setSettings(r.settings);setNotice(key==="enabled"?(value?"MCP started.":"MCP stopped."):"MCP setting saved.");
  }catch(x:any){setError(x?.message||"Unable to save MCP setting")}finally{setBusy("")}
 }
 async function copy(value:string,label:string){try{await navigator.clipboard.writeText(value);setNotice(label+" copied.")}catch{}}
 async function refreshConnections(){try{setConnections(await getMcpConnectionsForPanel({data:{token:session.token}}));setOauthError("")}catch(x:any){setOauthError(x?.message||"OAuth connection details unavailable")}}
 async function connectionAction(clientId:string,removeClient=false){
  setBusy("connection:"+clientId);
  try{await manageMcpConnectionForPanel({data:{token:session.token,clientId,removeClient}});await refreshConnections();setNotice(removeClient?"Client removed.":"Client sessions revoked.")}
  catch(x:any){setOauthError(x?.message||"Unable to update OAuth connection")}finally{setBusy("")}
 }
 async function revokeAll(){
  setBusy("revoke-all");
  try{await manageMcpConnectionForPanel({data:{token:session.token,all:true}});await refreshConnections();setNotice("All MCP OAuth sessions revoked.")}
  catch(x:any){setOauthError(x?.message||"Unable to revoke sessions")}finally{setBusy("")}
 }
 async function lockdownAction(action:"lock"|"unlock"){
  setBusy("lockdown:"+action);setError("");setNotice("");
  try{
   const result=await setLicenseManagerLockdownForPanel({data:{token:session.token,action,reason:action==="lock"?"Emergency lockdown from Dev Panel":"Owner recovery from Dev Panel"}});
   setLockdown(result);setNotice(action==="lock"?"Licence Manager API locked down.":"Licence Manager API unlocked.");
  }catch(x:any){setLockdownError(x?.message||"Unable to change lockdown state")}finally{setBusy("")}
 }

 const endpoint=runtime?.endpoint||"https://dev.incendiarynetworks.cc/devmcp";
 const running=settings?.enabled!==false;
 const clients=connections?.clients||[];

 return <section className="space-y-4">
  <div className="orbit-page-hero">
   <div><p className="orbit-eyebrow">NETWORKING / MCP</p><h1>MCP Controls</h1><p>Private ChatGPT/Codex interface into the existing Dev Panel and OrbitFS control paths.</p></div>
   <button className="button-secondary" onClick={()=>void load()}><RefreshCw size={14}/>Refresh</button>
  </div>

  {error&&<div className="rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-2.5 text-xs text-red-100">{error}</div>}
  {notice&&<div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2.5 text-xs text-emerald-100">{notice}</div>}

  <section className="release-surface p-4">
   <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
    <div className="min-w-0">
     <div className="flex items-center gap-2"><span className={"h-2.5 w-2.5 rounded-full "+(running?"bg-emerald-400":"bg-zinc-500")}/><strong className="text-sm">Private Developer MCP</strong></div>
     <div className="mt-2 flex min-w-0 items-center gap-2"><code className="truncate text-xs text-muted-foreground">{endpoint}</code><button className="button-secondary !px-2 !py-1" onClick={()=>void copy(endpoint,"MCP endpoint")}><Copy size={12}/></button></div>
     <p className="mt-2 text-[11px] text-muted-foreground">{running?"MCP is accepting authenticated ChatGPT/Codex tool traffic.":"MCP is stopped. OAuth/admin configuration remains available from Dev Panel."}</p>
    </div>
    <div className="flex items-center gap-2">
     <span className={"orbit-status-pill "+(running?"orbit-status-tone-success":"orbit-status-tone-warning")}>{running?"RUNNING":"STOPPED"}</span>
     <button disabled={busy==="enabled"||!settings} onClick={()=>void toggle("enabled",!running)} className={running?"button-secondary":"button-primary"}>
      {running?<><Square size={13}/>Stop MCP</>:<><Play size={13}/>Start MCP</>}
     </button>
    </div>
   </div>
  </section>

  <section className={"release-surface border "+(lockdown?.locked?"border-red-400/50 bg-red-400/5":"border-border")}>
   <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
    <div className="flex items-start gap-3">
     <span className={"orbit-section-icon "+(lockdown?.locked?"text-red-300":"")}><ShieldAlert size={15}/></span>
     <div>
      <div className="flex flex-wrap items-center gap-2"><strong className="text-sm">Licence Manager Emergency Lockdown</strong><span className={"orbit-status-pill "+(lockdown?.locked?"border-red-400/40 bg-red-400/10 text-red-200":"orbit-status-tone-success")}>{lockdown?.locked?"LOCKED":"AVAILABLE"}</span></div>
      <p className="mt-1 max-w-2xl text-[11px] leading-5 text-muted-foreground">Lockdown fails closed: normal Licence Manager API/panel traffic is blocked. Only the dedicated lockdown status and recovery route remain available.</p>
      {lockdownError&&<p className="mt-2 text-[11px] text-red-300">{lockdownError}</p>}
     </div>
    </div>
    <div className="flex shrink-0 gap-2">
     {lockdown?.locked?
      <button disabled={busy==="lockdown:unlock"} className="button-primary" onClick={()=>void lockdownAction("unlock")}><Play size={13}/>Unlock API</button>:
      <button disabled={busy==="lockdown:lock"} className="inline-flex items-center gap-2 rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-2 text-xs font-semibold text-red-200" onClick={()=>void lockdownAction("lock")}><Square size={13}/>Lock Down API</button>}
    </div>
   </div>
  </section>

  <SettingsGroup id="general" title="General" description="Read/write posture." icon={Activity} items={GENERAL} settings={settings} busy={busy} open={open.general} setOpen={setOpen} onToggle={toggle}/>
  <SettingsGroup id="systems" title="Systems" description="Base, Engine and service access." icon={Boxes} items={SYSTEMS} settings={settings} busy={busy} open={open.systems} setOpen={setOpen} onToggle={toggle}/>
  <SettingsGroup id="tools" title="Tool Access" description="Which commands ChatGPT can discover." icon={SlidersHorizontal} items={TOOLS} settings={settings} busy={busy} open={open.tools} setOpen={setOpen} onToggle={toggle}/>
  <SettingsGroup id="mutations" title="Mutation Permissions" description="Fine-grained write gates." icon={Workflow} items={MUTATIONS} settings={settings} busy={busy} open={open.mutations} setOpen={setOpen} onToggle={toggle}/>
  <SettingsGroup id="ui" title="ChatGPT UI" description="Embedded interface display modes." icon={AppWindow} items={UI} settings={settings} busy={busy} open={open.ui} setOpen={setOpen} onToggle={toggle}/>
  <SettingsGroup id="oauth" title="OAuth Registration" description="CIMD, DCR and refresh-token policy." icon={KeyRound} items={OAUTH} settings={settings} busy={busy} open={open.oauth} setOpen={setOpen} onToggle={toggle}/>

  <Collapse id="security" title="OAuth Security" description="Fixed security requirements." icon={LockKeyhole} open={open.security} setOpen={setOpen}>
   <div className="grid gap-px bg-border/50 sm:grid-cols-2 xl:grid-cols-4">
    {[["Owner only","Dev Panel owner account"],["PKCE","S256 required"],["Resource binding","/devmcp required"],["Token auth","Public client / none"]].map(([a,b])=><div key={a} className="bg-background/80 p-4"><div className="flex items-center gap-2 text-xs font-semibold"><ShieldCheck size={13}/>{a}</div><p className="mt-1 text-[11px] text-muted-foreground">{b}</p></div>)}
   </div>
   <div className="grid gap-2 border-t border-border/60 p-4 text-[11px] md:grid-cols-2">
    <button className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-left" onClick={()=>void copy(runtime?.protectedResourceMetadata||"","Protected resource metadata URL")}><span className="truncate">{runtime?.protectedResourceMetadata||"Protected resource metadata"}</span><Copy size={12}/></button>
    <button className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-left" onClick={()=>void copy(runtime?.authorizationMetadata||"","Authorization metadata URL")}><span className="truncate">{runtime?.authorizationMetadata||"Authorization metadata"}</span><Copy size={12}/></button>
   </div>
  </Collapse>

  <Collapse id="clients" title="Connected OAuth Clients" description={oauthError||((clients.length+" registered · "+Number(connections?.activeTokens||0)+" active tokens"))} icon={Link2} open={open.clients} setOpen={setOpen}
   aside={<button disabled={busy==="revoke-all"} className="button-secondary !px-2 !py-1" onClick={e=>{e.stopPropagation();void revokeAll()}}><Unplug size={12}/>Revoke all</button>}>
   {oauthError&&<div className="border-b border-amber-400/20 bg-amber-400/5 px-4 py-3 text-[11px] text-amber-200">{oauthError}. MCP settings remain available.</div>}
   {!oauthError&&clients.length===0?<div className="p-6 text-center text-xs text-muted-foreground">No OAuth clients have connected yet.</div>:
    <div>{clients.map((client:any)=>{
     const id=String(client.client_id||""),active=Number(client.activeAccess||0)+Number(client.activeRefresh||0);
     return <div key={id} className="border-b border-border/60 p-4 last:border-b-0">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
       <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="text-xs">{client.client_name||"OAuth client"}</strong><span className="orbit-status-pill">{String(client.registration_method||"dcr").toUpperCase()}</span><span className={"orbit-status-pill "+(active?"orbit-status-tone-success":"")}>{active} ACTIVE</span></div><code className="mt-2 block truncate text-[10px] text-muted-foreground">{id}</code></div>
       <div className="flex gap-2"><button disabled={busy==="connection:"+id} className="button-secondary" onClick={()=>void connectionAction(id,false)}><Unplug size={13}/>Revoke</button><button disabled={busy==="connection:"+id} className="button-secondary" onClick={()=>void connectionAction(id,true)}><Trash2 size={13}/>Remove</button></div>
      </div>
     </div>
    })}</div>}
  </Collapse>

  <section className="release-surface p-4"><div className="flex items-start gap-3"><Server size={16}/><div><strong className="text-sm">No separate MCP engine</strong><p className="mt-1 text-[11px] leading-5 text-muted-foreground">The /devmcp server is the MCP service. Start/Stop above controls whether it exposes tools/resources and accepts tool execution. V1 Engine remains an OrbitFS update target, not something the MCP needs in order to run.</p></div></div></section>
 </section>;
}
