import {useCallback,useEffect,useState} from "react";
import {Copy,KeyRound,RefreshCw,Server,ShieldCheck} from "lucide-react";
import {getMcpSettingsForPanel,updateMcpSettingsForPanel} from "@/lib/dev-mcp.server";

const SWITCHES=[
 ["enabled","MCP enabled","Enable the private /devmcp endpoint."],
 ["read_only_mode","Read-only mode","Allow status, licence lookups and diagnostics while blocking changes."],
 ["allow_mutations","Allow controls","Allow release preparation, deployments, updates and licence changes."],
 ["expose_base","Base","Expose V1-vercel-base status and prepare controls."],
 ["expose_engine","Engine","Expose V1-vercel-engine status, prepare and update controls."],
 ["expose_license_manager","Licence Manager","Read and control authoritative licence/release/runtime data."],
 ["expose_billing_store","Billing Store","Use customer/account linkage and customer deployer operations when needed."],
] as const;

export function McpControlsWorkspace({session}:{session:any}){
 const [settings,setSettings]=useState<any>(null);
 const [busy,setBusy]=useState("");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [runtime,setRuntime]=useState<any>(null);
 const load=useCallback(async()=>{setError("");try{const r=await getMcpSettingsForPanel({data:{token:session.token}});setSettings(r.settings);setRuntime(r.runtime)}catch(x:any){setError(x?.message||"Unable to load MCP controls")}},[session.token]);
 useEffect(()=>{void load()},[load]);
 async function toggle(key:string,value:boolean){setBusy(key);setError("");setNotice("");try{const r=await updateMcpSettingsForPanel({data:{token:session.token,patch:{[key]:value}}});setSettings(r.settings);setNotice("Saved.")}catch(x:any){setError(x?.message||"Unable to save MCP setting")}finally{setBusy("")}}
 async function copy(){try{await navigator.clipboard.writeText(runtime?.endpoint||"");setNotice("MCP endpoint copied.")}catch{}}
 return <section className="space-y-4">
  <div className="orbit-page-hero"><div><p className="orbit-eyebrow">NETWORKING / MCP</p><h1>MCP Controls</h1><p>Private ChatGPT/Codex access to the existing Dev Panel logic. There is no separate Dev Control API.</p></div><button className="button-secondary" onClick={()=>void load()}><RefreshCw size={14}/>Refresh</button></div>
  {error&&<div className="rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-2.5 text-xs text-red-100">{error}</div>}
  {notice&&<div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2.5 text-xs text-emerald-100">{notice}</div>}
  <section className="release-surface p-4">
   <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
    <div><div className="flex items-center gap-2"><Server size={15}/><strong className="text-sm">Private Developer MCP</strong></div><code className="mt-2 block text-xs text-muted-foreground">{runtime?.endpoint||"https://dev.incendiarynetworks.cc/devmcp"}</code><p className="mt-2 text-[11px] text-muted-foreground">Owner-only OAuth 2.1 connection. ChatGPT UI buttons and chat commands call the same MCP tools.</p></div>
    <div className="flex gap-2"><span className={"orbit-status-pill "+(settings?.enabled?"orbit-status-tone-success":"orbit-status-tone-warning")}>{settings?.enabled?"ONLINE":"DISABLED"}</span><button className="button-secondary" onClick={()=>void copy()}><Copy size={13}/>Copy URL</button></div>
   </div>
  </section>
  <section className="release-surface overflow-hidden">
   <div className="orbit-section-bar"><div className="orbit-section-head"><span className="orbit-section-icon"><KeyRound size={15}/></span><div><h2>Access</h2><p>Keep this small: it only controls what the private MCP may expose.</p></div></div></div>
   <div>{SWITCHES.map(([key,label,detail])=>{const on=Boolean(settings?.[key]);return <div key={key} className="flex flex-col gap-3 border-b p-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"><div><strong className="text-sm">{label}</strong><p className="mt-1 text-[11px] text-muted-foreground">{detail}</p></div><button disabled={busy===key} onClick={()=>void toggle(key,!on)} className={"min-w-[78px] rounded-full border px-3 py-1.5 text-[10px] font-bold "+(on?"border-emerald-400/40 bg-emerald-400/10 text-emerald-300":"border-border bg-muted text-muted-foreground")}>{on?"ON":"OFF"}</button></div>})}</div>
  </section>
  <section className="release-surface p-4"><div className="flex items-start gap-3"><ShieldCheck size={16}/><div><strong className="text-sm">Single control path</strong><p className="mt-1 text-[11px] leading-5 text-muted-foreground">The MCP directly uses Dev Panel server logic, GitHub workflows, Custom License Manager and Billing Store customer/deployer APIs. It does not maintain a second release, licence or deployment authority.</p></div></div></section>
 </section>;
}
