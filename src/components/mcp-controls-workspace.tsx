import {useCallback,useEffect,useMemo,useState} from "react";
import {Copy,KeyRound,RefreshCw,Server,ShieldCheck} from "lucide-react";

const SWITCHES=[
 ["enabled","MCP enabled","Master switch for the Dev MCP endpoint."],
 ["read_only_mode","Read-only mode","Expose read tools only."],
 ["allow_mutations","Allow mutations","Allow owner-only write/control tools."],
 ["require_critical_confirmation","Critical confirmations","Require explicit confirmation for destructive operations."],
 ["expose_base","Base release tools","Expose V1-vercel-base release controls."],
 ["expose_engine","Engine / updater tools","Expose V1-vercel-engine update controls."],
 ["expose_license_manager","Licence Manager tools","Expose protected Licence Manager integration tools."],
 ["expose_billing_store","Billing Store tools","Expose Billing Store operational tools."],
 ["expose_authority_controls","Authority controls","Expose global authority settings and emergency lockdown tools."],
 ["audit_logging","MCP audit logging","Record MCP mutations through Dev Control audit."],
] as const;

export function McpControlsWorkspace({session}:{session:any}){
 const [settings,setSettings]=useState<any>(null);
 const [busy,setBusy]=useState("");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [endpoint,setEndpoint]=useState("/devmcp");
 const headers=useMemo(()=>({Authorization:`Bearer ${session.token}`,"Content-Type":"application/json"}),[session.token]);
 const load=useCallback(async()=>{setError("");try{const r=await fetch("/api/dev-control/v1/mcp-settings",{headers,cache:"no-store"});const b=await r.json();if(!r.ok)throw new Error(b?.error||"Unable to load MCP settings");setSettings(b.settings);if(typeof window!=="undefined")setEndpoint(window.location.origin+"/devmcp")}catch(x:any){setError(x?.message||"Unable to load MCP controls")}},[headers]);
 useEffect(()=>{void load()},[load]);
 async function toggle(key:string,value:boolean){setBusy(key);setError("");setNotice("");try{const r=await fetch("/api/dev-control/v1/mcp-settings",{method:"PATCH",headers,body:JSON.stringify({[key]:value})});const b=await r.json();if(!r.ok)throw new Error(b?.error||"Unable to save MCP setting");setSettings(b.settings);setNotice("Saved.")}catch(x:any){setError(x?.message||"Unable to save MCP setting")}finally{setBusy("")}}
 async function copy(){try{await navigator.clipboard.writeText(endpoint);setNotice("MCP endpoint copied.")}catch{}}
 return <section className="space-y-4">
  <div className="orbit-page-hero"><div><p className="orbit-eyebrow">NETWORKING / MCP</p><h1>MCP Controls</h1><p>Private developer MCP configuration for ChatGPT/Codex access to OrbitFS Dev Control.</p></div><button className="button-secondary" onClick={()=>void load()}><RefreshCw size={14}/>Refresh</button></div>
  {error&&<div className="rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-2.5 text-xs text-red-100">{error}</div>}
  {notice&&<div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2.5 text-xs text-emerald-100">{notice}</div>}
  <section className="release-surface p-4">
   <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex items-center gap-2"><Server size={15}/><strong className="text-sm">Dev MCP endpoint</strong></div><code className="mt-2 block text-xs text-muted-foreground">{endpoint}</code><p className="mt-2 text-[11px] text-muted-foreground">Owner/developer only. Credentials are server-side and are never displayed here.</p></div><div className="flex gap-2"><span className={`orbit-status-pill ${settings?.enabled?"orbit-status-tone-success":"orbit-status-tone-neutral"}`}>{settings?.enabled?"ENABLED":"DISABLED"}</span><button className="button-secondary" onClick={()=>void copy()}><Copy size={13}/>Copy URL</button></div></div>
  </section>
  <section className="release-surface overflow-hidden">
   <div className="orbit-section-bar"><div className="orbit-section-head"><span className="orbit-section-icon"><KeyRound size={15}/></span><div><h2>MCP access</h2><p>Base and Engine tools are first-class; secondary services can be enabled independently.</p></div></div></div>
   <div>{SWITCHES.map(([key,label,detail])=>{const on=Boolean(settings?.[key]);return <div key={key} className="flex flex-col gap-3 border-b p-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"><div><strong className="text-sm">{label}</strong><p className="mt-1 text-[11px] text-muted-foreground">{detail}</p></div><button disabled={busy===key} onClick={()=>void toggle(key,!on)} className={`min-w-[78px] rounded-full border px-3 py-1.5 text-[10px] font-bold ${on?"border-emerald-400/40 bg-emerald-400/10 text-emerald-300":"border-border bg-muted text-muted-foreground"}`}>{on?"ON":"OFF"}</button></div>})}</div>
  </section>
  <section className="release-surface p-4"><div className="flex items-start gap-3"><ShieldCheck size={16}/><div><strong className="text-sm">Owner-only control model</strong><p className="mt-1 text-[11px] leading-5 text-muted-foreground">The MCP can access Base releases, Engine updates, Operations, licensing and authority controls according to these switches. It does not expose a generic shell, generic SQL, or secret reader.</p></div></div></section>
 </section>;
}
