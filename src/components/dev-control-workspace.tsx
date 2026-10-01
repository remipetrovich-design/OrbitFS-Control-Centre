import {useCallback,useEffect,useState} from "react";
import {Activity,ArrowRight,CloudCog,Database,RefreshCw,Server,ShieldCheck,Terminal} from "lucide-react";

type DevControlHealth={
 ok:boolean;
 service:string;
 apiVersion:string;
 ownerOnly:boolean;
 enabled:boolean;
 authority:{
  licenseManager:string;
  devControl:string;
 };
 modules:{
  deployer:{status:string};
  updater:{status:string};
  licensingBridge:{status:string};
  jobs:{status:string};
 };
 targets:Array<{key:string;label:string;repo:string}>;
 checkedAt:string;
};

function Pill({text}:{text:string}){
 const value=String(text||"").toLowerCase();
 const tone=value.includes("ready")||value.includes("enabled")||value.includes("connected")?"success":value.includes("disabled")||value.includes("error")?"danger":"neutral";
 return <span className={`orbit-status-pill orbit-status-tone-${tone}`}>{text}</span>;
}

export function DevControlWorkspace({session,onOperations}:{session:any;onOperations?:()=>void}){
 const [state,setState]=useState<DevControlHealth|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");

 const load=useCallback(async()=>{
  setLoading(true);setError("");
  try{
   const response=await fetch("/api/dev-control/v1/health",{
    method:"GET",
    headers:{Authorization:`Bearer ${session.token}`},
    cache:"no-store",
   });
   const body=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(body?.error||"Dev Control API is unavailable.");
   setState(body);
  }catch(x:any){
   setError(x?.message||"Unable to connect to Dev Control API.");
  }finally{
   setLoading(false);
  }
 },[session.token]);

 useEffect(()=>{void load()},[load]);

 return <section className="space-y-4">
  <div className="orbit-page-hero">
   <div>
    <p className="orbit-eyebrow">ORBITFS / DEV CONTROL</p>
    <h1>Dev Control</h1>
    <p>Owner-only control plane foundation for ChatGPT/MCP, deployer, updater and protected OrbitFS service operations.</p>
   </div>
   <div className="flex flex-wrap items-center gap-2">
    <span className="orbit-status-chip"><span className={`orbit-dot ${state?.ok?"orbit-dot-good":""}`}/>{state?.ok?"API ONLINE":"API FOUNDATION"}</span>
    <button className="button-secondary" onClick={()=>void load()} disabled={loading}><RefreshCw size={14} className={loading?"animate-spin":""}/>Refresh</button>
   </div>
  </div>

  {error&&<div className="rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-2.5 text-xs text-red-100">{error}</div>}

  <section className="release-surface overflow-hidden">
   <div className="orbit-section-bar">
    <div className="orbit-section-head"><span className="orbit-section-icon"><ShieldCheck size={15}/></span><div><h2>Separate control API</h2><p>Dev Control is isolated from the License Manager API. License Manager remains technical authority; this API is an owner-only operations layer.</p></div></div>
    <Pill text={state?.ownerOnly?"OWNER ONLY":"OWNER GATE"}/>
   </div>
   <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
    <div className="orbit-tech-stat"><span>Service</span><strong>{state?.service||"orbitfs-dev-control"}</strong></div>
    <div className="orbit-tech-stat"><span>API version</span><strong>{state?.apiVersion||"v1"}</strong></div>
    <div className="orbit-tech-stat"><span>Control authority</span><strong>Dev Control</strong></div>
    <div className="orbit-tech-stat"><span>License authority</span><strong>License Manager</strong></div>
   </div>
  </section>

  <div className="grid gap-4 xl:grid-cols-[1.35fr_.65fr]">
   <section className="release-surface overflow-hidden">
    <div className="orbit-section-bar"><div className="orbit-section-head"><span className="orbit-section-icon"><CloudCog size={15}/></span><div><h2>Core modules</h2><p>Foundation only. Detailed commands and destructive actions will be added after the API boundary is proven.</p></div></div></div>
    <div className="grid gap-px bg-border sm:grid-cols-2">
     {[
      ["Deployer","Production deployment control",state?.modules?.deployer?.status||"foundation",Terminal],
      ["Updater","OrbitFS update execution/control",state?.modules?.updater?.status||"foundation",Activity],
      ["Job engine","Live jobs and console events",state?.modules?.jobs?.status||"foundation",Server],
      ["Licensing bridge","Scoped calls into License Manager",state?.modules?.licensingBridge?.status||"planned",Database],
     ].map(([label,detail,status,Icon]:any)=><div key={label} className="bg-card p-4">
      <div className="flex items-start justify-between gap-3"><span className="orbit-section-icon"><Icon size={15}/></span><Pill text={String(status).toUpperCase()}/></div>
      <p className="mt-3 text-xs font-semibold">{label}</p><p className="mt-1 text-[10px] leading-5 text-muted-foreground">{detail}</p>
     </div>)}
    </div>
   </section>

   <section className="release-surface overflow-hidden">
    <div className="orbit-section-bar"><div className="orbit-section-head"><span className="orbit-section-icon"><Server size={15}/></span><div><h2>Initial targets</h2><p>Services registered for the Dev Control boundary.</p></div></div></div>
    <div>{(state?.targets||[]).map(target=><div key={target.key} className="border-b p-3 last:border-b-0"><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold">{target.label}</p><Pill text="REGISTERED"/></div><code className="mt-1 block truncate text-[10px] text-muted-foreground">{target.repo}</code></div>)}
    {!loading&&!state?.targets?.length&&<div className="p-6 text-center text-xs text-muted-foreground">Targets will appear when the API responds.</div>}</div>
   </section>
  </div>

  <section className="release-surface p-4">
   <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div className="orbit-section-head"><span className="orbit-section-icon"><Terminal size={15}/></span><div><h2>Existing deployment operations remain active</h2><p>Quick Deploy and the live GitHub job consoles stay in Operations while Dev Control is being connected underneath them.</p></div></div>
    {onOperations&&<button className="button-primary" onClick={onOperations}>Open Operations <ArrowRight size={13}/></button>}
   </div>
  </section>
 </section>;
}
