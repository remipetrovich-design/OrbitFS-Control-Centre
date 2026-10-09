import { useMemo, useState } from "react";
import { Database, Plus, ShieldCheck } from "lucide-react";
import type { VaultRecord } from "@/lib/vault-crypto";
import { MAIN_VERCEL_INVENTORY, GITHUB_WORKFLOW_REFERENCES, recordIdentity } from "@/lib/vault-schema";
type Props={records:VaultRecord[];onPersist:(next:VaultRecord[])=>Promise<void>};
export function VaultInventorySection({records,onPersist}:Props) {
 const [busy,setBusy]=useState("");
 const [message,setMessage]=useState("");
 const [showOnlyMissing,setShowOnlyMissing]=useState(true);
 const existing=useMemo(()=>new Set(records.map(recordIdentity)),[records]);
 const groups=Array.from(new Set(MAIN_VERCEL_INVENTORY.map(item=>item.system)));
 async function add(system:string,service:"Vercel"|"GitHub",name:string,destinationSystem:string,usedIn:"main"|"fallback") {
  const record:VaultRecord={id:crypto.randomUUID(),systems:[system],otherSystem:"",service,customService:"",
    keyName:name,secret:"",usedIn:[usedIn],destinationSystem,needsReview:false};
  if(existing.has(recordIdentity(record))){setMessage("That exact destination is already saved.");return}
  setBusy(system+name+destinationSystem);setMessage("");
  try{await onPersist([record,...records]);setMessage(name+" added with an empty value. No external settings were changed.");}
  catch(e:any){setMessage(String(e?.message||"Could not save Vault reference."));}
  finally{setBusy("")}
 }
 return <section className="orbit-panel p-4 space-y-3">
   <div className="orbit-section-head"><span className="orbit-section-icon"><Database size={15}/></span><div>
     <h2>Verified key names — not guessed requirements</h2>
     <p>Read from Main Vercel Production · exact key names · values are not retrievable for protected secrets</p>
   </div></div>
   <p className="text-xs text-muted-foreground">This inventory documents real keys; it does not add dozens of empty entries automatically. An existing name does not imply the setting is required or used by runtime. GitHub names below are confirmed workflow references, not proof a repository secret has been populated.</p>
   <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={showOnlyMissing} onChange={e=>setShowOnlyMissing(e.target.checked)}/> Show only names missing from this Vault</label>
   {groups.map(system=>{
     const all=MAIN_VERCEL_INVENTORY.filter(item=>item.system===system);
     const matching=all.filter(item=>!existing.has(recordIdentity({id:"",systems:[item.system],otherSystem:"",service:item.service,customService:"",keyName:item.name,secret:"",usedIn:[item.usedIn],destinationSystem:item.destinationSystem})));
     const display=showOnlyMissing?matching:all;
     return <details className="rounded border p-3" key={system}>
       <summary className="cursor-pointer text-sm font-semibold">{system} · {all.length} live Production names · {matching.length} not mapped in Vault</summary>
       <div className="max-h-64 overflow-auto mt-2 space-y-1">
         {display.map(item=>{
          const id=item.system+item.name;const isSaved=!matching.includes(item);
          return <div key={id} className="flex gap-2 items-center justify-between border-b py-2 text-xs">
           <span className="min-w-0"><strong className="font-mono break-all">{item.name}</strong>
             <span className="block text-muted-foreground">Main / {item.destinationSystem} · {item.purpose}</span></span>
           {isSaved?<span className="text-muted-foreground">In Vault</span>:<button type="button" className="button-secondary shrink-0" disabled={!!busy}
             onClick={()=>void add(item.system,"Vercel",item.name,item.destinationSystem,"main")}><Plus size={13}/> Add blank</button>}
          </div>;
         })}
         {!display.length&&<p className="text-xs text-muted-foreground">No missing names in this group.</p>}
       </div>
     </details>
   })}
   <details className="rounded border p-3">
     <summary className="cursor-pointer text-sm font-semibold">GitHub workflow references · {GITHUB_WORKFLOW_REFERENCES.length} verified references</summary>
     <p className="my-2 text-xs text-muted-foreground">This is a partial workflow-reference inventory. Use GitHub → Compare to retrieve every existing Actions name in the selected repository.</p>
     {GITHUB_WORKFLOW_REFERENCES.map((item,i)=><div key={i} className="flex items-center justify-between gap-2 border-b py-2 text-xs">
       <span className="min-w-0"><strong className="font-mono">{item.name}</strong><span className="block text-muted-foreground">{item.system} · {item.usedIn} / {item.repo}</span></span>
       <button type="button" className="button-secondary shrink-0" disabled={!!busy} onClick={()=>void add(item.system,"GitHub",item.name,item.repo,item.usedIn)}><Plus size={13}/> Add blank</button>
     </div>)}
   </details>
   {message&&<p role="status" className="text-xs text-muted-foreground">{message}</p>}
   <p className="flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck size={15}/> Syncing from this Vault is always separate, requires a destination comparison and explicit approval.</p>
 </section>;
}
