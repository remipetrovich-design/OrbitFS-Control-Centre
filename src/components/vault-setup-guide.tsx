import {useState} from "react";
import {ArrowRight, RefreshCw, ShieldCheck} from "lucide-react";
import type {VaultRecord} from "@/lib/vault-crypto";
import {bestVaultConnection, usableConnectionValue} from "@/lib/vault-connections";
import {listVaultVercelProjects, inspectVaultVercelProduction} from "@/lib/vercel-vault.server";
import {SETUP_PROJECTS, summarizeSystemSetup, type SetupSide, type SetupSystem, type EnvPresence, type SetupStatus} from "@/lib/vault-setup-guide";
import {addBlankVercelVaultEntry} from "@/lib/vault-vercel-selection";

type Scan={envs:EnvPresence[]|null;error?:string};
type ScanState=Record<SetupSide,Partial<Record<SetupSystem,Scan>>>;
type Props={session:{token:string};records:VaultRecord[];onPersist:(updated:VaultRecord[])=>Promise<void>;onEdit:(row:VaultRecord)=>void};

const TEAM:Record<SetupSide,string>={
 main:"team_W3fS0X03YCjNkD2BoqRj6Uld",
 fallback:"team_0fWVaLb24pyeeCRqqYu5G47K"
};
const label:Record<SetupStatus,string>={
 present:"Present · value hidden",missing:"Missing from Vercel",review:"Check placeholder",unchecked:"Not checked"
};
const styling:Record<SetupStatus,string>={
 present:"text-emerald-400",missing:"text-amber-500",review:"text-amber-500",unchecked:"text-muted-foreground"
};
function sideName(side:SetupSide){return side==="main"?"Main":"Fallback"}

export function VaultSetupGuide({session,records,onPersist,onEdit}:Props) {
 const [scans,setScans]=useState<ScanState>({main:{},fallback:{}});
 const [checked,setChecked]=useState(false);
 const [busy,setBusy]=useState(false);
 const [actionBusy,setActionBusy]=useState("");
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");

 async function checkAll(){
   setBusy(true);setChecked(false);setError("");setMessage("");
   const next:ScanState={main:{},fallback:{}};
   await Promise.all((["main","fallback"] as const).map(async side=>{
     const token=bestVaultConnection(records,"VERCEL_TOKEN_"+side.toUpperCase())?.secret;
     const team=bestVaultConnection(records,"VERCEL_TEAM_ID_"+side.toUpperCase())?.secret||TEAM[side];
     if(!usableConnectionValue(token)){
       for(const config of SETUP_PROJECTS)next[side][config.system]={envs:null,error:sideName(side)+" Vercel account token is missing or still a placeholder in Vault."};
       return;
     }
     try{
       const projects=await listVaultVercelProjects({data:{token:session.token,vercelToken:token!,teamId:team}});
       await Promise.all(SETUP_PROJECTS.map(async config=>{
         const projectName=config[side],project=projects.projects.find(p=>p.name===projectName);
         if(!project){next[side][config.system]={envs:null,error:"Vercel project "+projectName+" was not returned for this account."};return}
         try{
           const result=await inspectVaultVercelProduction({data:{token:session.token,vercelToken:token!,teamId:team,projectId:project.id}});
           next[side][config.system]={envs:result.envs.map(e=>({key:e.key,placeholderNote:e.placeholderNote}))};
         }catch(e:any){
           next[side][config.system]={envs:null,error:String(e?.message||"Could not read this Production project.")};
         }
       }));
     }catch(e:any){
       const reason=String(e?.message||"Cannot list the Vercel projects.");
       for(const config of SETUP_PROJECTS)next[side][config.system]={envs:null,error:reason};
     }
   }));
   setScans(next);setChecked(true);setBusy(false);
   setMessage("Check complete. This compares Vercel Production names only; protected values and runtime behavior cannot be verified here.");
 }
 async function addToVault(system:SetupSystem,side:SetupSide,name:string,projectName:string){
   const already=records.find(row=>row.service==="Vercel"&&row.destinationSystem?.toLowerCase()===projectName.toLowerCase()&&row.usedIn?.includes(side)&&row.keyName===name);
   if(already){onEdit(already);return}
   setActionBusy(system+side+name);setError("");setMessage("");
   try{
     const next=addBlankVercelVaultEntry(records,name,projectName,side,crypto.randomUUID());
     await onPersist(next);
     const added=next[0]!;
     onEdit(added);
     setMessage(name+" added to encrypted Vault as a blank "+sideName(side)+" entry. Supply its real value, then review a separate Vercel sync. Production has not changed.");
   }catch(e:any){setError(String(e?.message||"Couldn't add this Vault entry."))}
   finally{setActionBusy("")}
 }

 return <section className="orbit-panel p-4 space-y-3" aria-label="Vercel setup check">
   <div className="flex flex-wrap items-start justify-between gap-3">
     <div className="space-y-1">
       <h2 className="text-base font-semibold">Where does everything go?</h2>
       <p className="text-xs text-muted-foreground">See what Main and Fallback already have in Vercel, and which important key names need attention.</p>
     </div>
     <button className="button-secondary shrink-0" type="button" disabled={busy||!!actionBusy} onClick={()=>void checkAll()}>
       <RefreshCw size={14}/>{busy?"Checking both accounts…":checked?"Check again":"Check both Vercel accounts"}
     </button>
   </div>
   <div className="grid gap-2 md:grid-cols-3 text-xs text-muted-foreground">
     <p><strong className="text-foreground">Present</strong> means the variable name exists in Vercel Production, not that its value is working.</p>
     <p><strong className="text-foreground">Missing</strong> means that name is not in the destination Vercel project.</p>
     <p><strong className="text-foreground">Check placeholder</strong> means the Vercel description flags a dummy value; verify before switching.</p>
   </div>
   {error&&<p role="alert" className="text-xs text-red-300">{error}</p>}
   {message&&<p role="status" className="text-xs text-muted-foreground">{message}</p>}
   {SETUP_PROJECTS.map((config,index)=>{
     const main:Scan=scans.main[config.system]||{envs:null};
     const fallback:Scan=scans.fallback[config.system]||{envs:null};
     const view=summarizeSystemSetup(config.system,main.envs,fallback.envs);
     const needing=view.rows.filter(r=>r.fallback.status==="missing"||r.fallback.status==="review").length;
     return <details className="rounded-lg border" key={config.system} defaultOpen={index===0}>
       <summary className="flex cursor-pointer items-center justify-between gap-2 p-3">
         <span className="text-sm font-semibold">{config.system==="License"?"License Manager":config.system==="Billing"?"Billing Store":"Dev Panel"}</span>
         <span className="text-xs text-muted-foreground">{checked?`${view.mainCount??"—"} Main · ${view.fallbackCount??"—"} Fallback`:"Open to see keys"}
           {checked&&needing>0?` · ${needing} Fallback keys to check`:""}</span>
       </summary>
       <div className="border-t p-3 space-y-3">
         <div className="grid grid-cols-2 gap-2 text-xs">
           <div className="rounded-md border p-2">
             <strong>Main · Vercel</strong>
             <p className="break-all text-muted-foreground mt-1">{config.main}</p>
             <p className="mt-1">{main.envs===null?"Not checked":main.envs.length+" Production variables found"}</p>
             {main.error&&<p className="mt-1 text-amber-500">{main.error}</p>}
           </div>
           <div className="rounded-md border p-2">
             <strong>Fallback · Vercel</strong>
             <p className="break-all text-muted-foreground mt-1">{config.fallback}</p>
             <p className="mt-1">{fallback.envs===null?"Not checked":fallback.envs.length+" Production variables found"}</p>
             {fallback.error&&<p className="mt-1 text-amber-500">{fallback.error}</p>}
           </div>
         </div>
         <div className="space-y-2">
           <p className="text-xs font-semibold">Important keys and their purpose</p>
           {view.rows.map(row=>{
             const needs=row.main.status==="missing"||row.fallback.status==="missing";
             const target=row.fallback.status==="missing"?"fallback":row.main.status==="missing"?"main":null;
             const dest=target?config[target]:null;
             return <div key={row.key} className="rounded-md border p-3 space-y-2 text-xs">
               <div className="flex flex-wrap justify-between items-start gap-2">
                 <div className="min-w-0"><p className="font-mono font-semibold break-all">{row.key}</p>
                   <p className="mt-1 text-muted-foreground">{row.what}</p>
                 </div>
                 {row.priority==="feature"&&<span className="text-muted-foreground">Feature / optional setting</span>}
               </div>
               <div className="grid grid-cols-2 gap-2">
                 <div><p className="text-muted-foreground">Main</p><p className={styling[row.main.status]}>{label[row.main.status]}</p></div>
                 <div><p className="text-muted-foreground">Fallback</p><p className={styling[row.fallback.status]}>{label[row.fallback.status]}</p></div>
               </div>
               {(needs||row.main.status==="review"||row.fallback.status==="review")&&
                 <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
                   <p className="text-muted-foreground flex-1 min-w-44">{row.origin}</p>
                   {needs&&target&&dest?<button type="button" className="button-secondary" disabled={!!actionBusy||busy}
                     onClick={()=>void addToVault(config.system,target,row.key,dest)}>Prepare {sideName(target)} Vault key <ArrowRight size={12}/></button>:
                     <span className="text-amber-500">Verify the stored Vercel value</span>}
                 </div>}
             </div>;
           })}
         </div>
         {checked&&<details className="rounded border p-3 text-xs">
           <summary className="cursor-pointer font-medium">Other configured variables · don't copy automatically</summary>
           <p className="mt-2 text-muted-foreground">These are real Production names outside the main setup checklist. Some are optional, legacy or account-specific.</p>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
             <div><strong>Main ({view.mainExtra.length})</strong><p className="font-mono break-words mt-1 text-muted-foreground">{view.mainExtra.join(", ")||"None"}</p></div>
             <div><strong>Fallback ({view.fallbackExtra.length})</strong><p className="font-mono break-words mt-1 text-muted-foreground">{view.fallbackExtra.join(", ")||"None"}</p></div>
           </div>
           <p className="mt-2 text-muted-foreground">Main-only names: {view.mainOnly.join(", ")||"None"}. Fallback-only names: {view.fallbackOnly.join(", ")||"None"}.</p>
         </details>}
       </div>
     </details>
   })}
   <p className="flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck size={14} className="shrink-0 mt-0.5"/>This panel only reads live Vercel names and marks blank Vault references. It never copies, creates or replaces Vercel secrets. Use the existing Vercel sync controls for a separate reviewed change.</p>
 </section>;
}
