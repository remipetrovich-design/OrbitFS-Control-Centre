import {useMemo,useState} from "react";
import {RefreshCw,ShieldCheck,Upload} from "lucide-react";
import type {VaultRecord} from "@/lib/vault-crypto";
import {bestVaultConnection,usableConnectionValue} from "@/lib/vault-connections";
import {vaultDestinations,type VaultMode} from "@/lib/vault-schema";
import {assessVercelVaultEntry} from "@/lib/vault-vercel-selection";
import {planProductionKey,type ProductionPlan} from "@/lib/vercel-sync-policy";
import {listVaultVercelProjects,inspectVaultVercelProduction,writeVaultVercelProduction} from "@/lib/vercel-vault.server";

type Account=VaultMode;
type Candidate={
  id:string;mode:Account;projectId:string;projectName:string;rowId:string;key:string;
  action:"create"|"replace"|"blocked";reason?:string;plan?:ProductionPlan;
  previousSent?:string;
};
type Summary={completed:number;total:number;added:number;replaced:number;warnings:string[];step:string};
const TEAMS:Record<Account,string>={
  main:"team_W3fS0X03YCjNkD2BoqRj6Uld",
  fallback:"team_0fWVaLb24pyeeCRqqYu5G47K"
};
const MODES:Account[]=["main","fallback"];
const isLive=(record:VaultRecord,mode:Account,project:string)=>
  record.service==="Vercel" && record.usedIn?.includes(mode) &&
  vaultDestinations(record).some(dest=>dest.toLowerCase()===project.toLowerCase());
export function VaultVercelSyncAll({session,records,onPersist}:{
  session:any;records:VaultRecord[];onPersist:(rows:VaultRecord[])=>Promise<void>
}){
 const [modes,setModes]=useState<Record<Account,boolean>>({main:true,fallback:true});
 const [busy,setBusy]=useState(false);
 const [step,setStep]=useState("");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [issues,setIssues]=useState<string[]>([]);
 const [candidates,setCandidates]=useState<Candidate[]>([]);
 const [checked,setChecked]=useState<string[]>([]);
 const [approved,setApproved]=useState(false);
 const [summary,setSummary]=useState<Summary|null>(null);
 const [sourceFingerprint,setSourceFingerprint]=useState("");
 const token=(mode:Account)=>bestVaultConnection(records,"VERCEL_TOKEN_"+mode.toUpperCase())?.secret||"";
 const team=(mode:Account)=>bestVaultConnection(records,"VERCEL_TEAM_ID_"+mode.toUpperCase())?.secret||TEAMS[mode];
 const fp=()=>JSON.stringify(records.map(r=>[r.id,r.service,r.keyName,r.secret,r.usedIn,r.destinationSystems,r.destinationSystem,r.vercelTargets]));
 const targetRecords=useMemo(()=>records.filter(r=>r.service==="Vercel"&&r.usedIn?.some(m=>modes[m])&&
   vaultDestinations(r).length>0&&!/^(VERCEL_(TOKEN|TEAM_ID)|GITHUB_TOKEN)_(MAIN|FALLBACK)$/.test(r.keyName)),
   [records,modes]);
 const groups=useMemo(()=>candidates.reduce<Record<string,Candidate[]>>((result,item)=>{
   const key=item.mode+" / "+item.projectName;
   (result[key]??=[]).push(item);return result;
 },{}),[candidates]);
 function reset(){setCandidates([]);setChecked([]);setApproved(false);setSourceFingerprint("");setSummary(null)}
 async function compare(){
   if(busy)return;
   const enabled=MODES.filter(m=>modes[m]);
   if(!enabled.length){setError("Select Main or Fallback Vercel.");return}
   setBusy(true);setError("");setNotice("");setIssues([]);reset();
   const found:Candidate[]=[],warnings:string[]=[];
   try{
     for(const mode of enabled){
       const cred=token(mode),teamId=team(mode);
       if(!usableConnectionValue(cred)||!/^team_[A-Za-z0-9]{8,64}$/.test(teamId)){
         warnings.push(mode+" Vercel connection is missing or invalid. Restore it in the Vault first.");continue;
       }
       setStep("Loading "+mode+" Vercel project list…");
       let projects:Array<{id:string;name:string}>=[];
       try{
         projects=(await listVaultVercelProjects({data:{token:session.token,vercelToken:cred,teamId}})).projects;
       }catch(e:any){warnings.push(mode+" Vercel project list: "+String(e?.message||e));continue}
       const assignedNames=[...new Set(records.filter(r=>r.service==="Vercel"&&r.usedIn?.includes(mode)&&!r.needsReview)
         .flatMap(r=>vaultDestinations(r)))].filter(x=>x!=="Vault connection");
       for(const name of assignedNames){
         const project=projects.find(p=>p.name.toLowerCase()===name.toLowerCase());
         if(!project){warnings.push(mode+" / "+name+": project not visible with saved team credentials.");continue}
         setStep("Inspecting "+mode+" / "+project.name+" Production…");
         try{
           const envs=(await inspectVaultVercelProduction({data:{token:session.token,vercelToken:cred,teamId,projectId:project.id}})).envs;
           const matching=records.filter(r=>isLive(r,mode,project.name)&&!r.needsReview);
           const duplicates=new Map<string,number>();
           for(const row of matching)duplicates.set(row.keyName,(duplicates.get(row.keyName)||0)+1);
           for(const row of matching){
             const assessment=assessVercelVaultEntry(row,project.name,mode);
             const plan=planProductionKey(envs,row.keyName);
             const reason=duplicates.get(row.keyName)!>1?"Multiple Vault entries target this same Production key.":
               assessment.status!=="ready"?assessment.reason:
               plan.action==="blocked"?plan.reason:
               envs.some(x=>x.key===row.keyName && x.type==="system")?"System-owned Vercel variable cannot be overridden.":"";
             const action=reason?"blocked":plan.action;
             const receipt=(row.syncReceipts||[]).filter(x=>x.provider==="Vercel"&&x.account===mode&&x.destination===project.name&&x.keyName===row.keyName)
               .sort((a,b)=>b.at.localeCompare(a.at))[0];
             found.push({id:mode+"|"+project.id+"|"+row.id,mode,projectId:project.id,projectName:project.name,rowId:row.id,
               key:row.keyName,action,reason:reason||undefined,plan,previousSent:receipt?.at});
           }
         }catch(e:any){warnings.push(mode+" / "+project.name+": "+String(e?.message||e))}
       }
     }
     setCandidates(found);setIssues(warnings);setSourceFingerprint(fp());
     if(!found.length) setNotice("No mapped Vault records could be compared. Check exact destinations, account tokens and warnings.");
     else setNotice("Compared "+found.length+" mapped entries. Review and select creates/replacements. Existing value equality cannot be proven from hidden Vercel values.");
   }catch(e:any){setError(String(e?.message||e))}
   finally{setStep("");setBusy(false)}
 }
 const actionable=candidates.filter(x=>x.action!=="blocked");
 const selected=actionable.filter(x=>checked.includes(x.id));
 function toggleAll(on:boolean){setChecked(on?actionable.map(x=>x.id):[]);setApproved(false)}
 async function apply(){
   if(busy||!approved||!selected.length)return;
   if(fp()!==sourceFingerprint){setError("Vault changed since comparison. Compare again before syncing.");reset();return}
   const explicitlyChosen=[...selected];
   setBusy(true);setError("");setNotice("");
   let successes:Candidate[]=[],warnings:string[]=[];
   let completed=0,added=0,replaced=0;
   setSummary({completed:0,total:explicitlyChosen.length,added:0,replaced:0,warnings:[],step:"Starting approved Vercel sync"});
   for(const item of explicitlyChosen){
     setStep("Syncing "+item.mode+" / "+item.projectName+" / "+item.key+"…");
     const row=records.find(r=>r.id===item.rowId);
     const cred=token(item.mode),teamId=team(item.mode);
     if(!row||!row.secret.trim()||!usableConnectionValue(cred)||!item.plan||item.plan.action==="blocked"){
       warnings.push(item.mode+" / "+item.projectName+" / "+item.key+": source or connection unavailable.");break;
     }
     try{
       await writeVaultVercelProduction({data:{
         token:session.token,vercelToken:cred,teamId,projectId:item.projectId,
         key:item.key,value:row.secret,action:item.action as "create"|"replace",
         expectedId:item.plan.expectedId,expectedUpdatedAt:item.plan.expectedUpdatedAt
       }});
       successes.push(item);
       if(item.action==="create")added++;else replaced++;
     }catch(e:any){
       warnings.push(item.mode+" / "+item.projectName+" / "+item.key+": "+String(e?.message||e)+". STOPPED; compare again before retrying.");
       break;
     }
     completed++;
     setSummary({completed,total:explicitlyChosen.length,added,replaced,warnings:[...warnings],step:"Verifying accepted writes"});
   }
   if(successes.length){
     const time=new Date().toISOString();
     const updates=records.map(row=>{
       const applied=successes.filter(x=>x.rowId===row.id);
       if(!applied.length)return row;
       const receipts=[...(row.syncReceipts||[])];
       const targets=[...(row.vercelTargets||[])];
       for(const item of applied){
         const match=(x:{provider:string;account:string;destination:string;keyName:string})=>
           x.provider==="Vercel"&&x.account===item.mode&&x.destination===item.projectName&&x.keyName===item.key;
         const idx=receipts.findIndex(match);
         if(idx>=0)receipts.splice(idx,1);
         receipts.push({provider:"Vercel" as const,account:item.mode,destination:item.projectName,keyName:item.key,at:time});
         if(!targets.some(t=>t.connection===item.mode&&t.projectId===item.projectId&&t.keyName===item.key))
           targets.push({connection:item.mode,projectId:item.projectId,projectName:item.projectName,keyName:item.key});
       }
       return {...row,syncReceipts:receipts,vercelTargets:targets};
     });
     try{await onPersist(updates)}
     catch{warnings.push("Vercel accepted "+successes.length+" writes but Vault receipts could not be saved. Do not retry without re-comparing.")}
   }
   setSummary({completed,total:explicitlyChosen.length,added,replaced,warnings,step:"Sync finished"});
   setNotice("Vercel accepted "+successes.length+" of "+explicitlyChosen.length+" selected updates. No provider variables were deleted or deployment triggered.");
   reset();setSummary({completed,total:explicitlyChosen.length,added,replaced,warnings,step:"Sync finished"});
   setStep("");setBusy(false);
 }
 return <section className="orbit-panel min-w-0 space-y-3 p-4" aria-label="Vercel Sync All">
   <h2 className="text-base font-semibold">Vercel Sync All · Main and Fallback</h2>
   <p className="text-xs text-muted-foreground">Checks each Vercel Production project explicitly assigned in your Vault. GitHub has a separate sync. No automatic propagation, provider deletion or deployment. Vercel hides many values, so an existing value is not assumed to match the Vault.</p>
   <div className="flex flex-wrap gap-3">{MODES.map(m=><label key={m} className="flex items-center gap-2 text-xs"><input type="checkbox" disabled={busy} checked={modes[m]} onChange={e=>{setModes(p=>({...p,[m]:e.target.checked}));reset()}}/>{m==="main"?"Main Vercel":"Fallback Vercel"} · {usableConnectionValue(token(m))?"token saved":"token missing"}</label>)}</div>
   <button type="button" className="button-secondary" disabled={busy} onClick={()=>void compare()}><RefreshCw size={14} className={busy?"animate-spin":""}/>{busy?"Working…":"Compare all mapped Vercel Production keys"}</button>
   {step&&<p className="text-xs" role="status">{step}</p>}
   {error&&<p className="text-xs text-destructive" role="alert">{error}</p>}
   {notice&&<p className="text-xs text-muted-foreground">{notice}</p>}
   {issues.length>0&&<details className="rounded-md border p-2"><summary className="cursor-pointer text-xs">{issues.length} unavailable accounts/projects or warnings</summary>{issues.map((x,i)=><p key={i} className="mt-1 break-all text-xs">{x}</p>)}</details>}
   {candidates.length>0&&<div className="space-y-3">
     <div className="flex flex-wrap gap-2 text-xs"><span>{actionable.filter(x=>x.action==="create").length} missing</span><span>{actionable.filter(x=>x.action==="replace").length} existing (replacement offered)</span><span>{candidates.length-actionable.length} blocked</span></div>
     <div className="flex gap-2"><button type="button" className="button-secondary" disabled={busy} onClick={()=>toggleAll(true)}>Select all eligible</button><button type="button" className="button-secondary" disabled={busy} onClick={()=>toggleAll(false)}>Deselect all</button></div>
     {Object.entries(groups).map(([target,items])=><div key={target} className="rounded-md border p-3 space-y-2">
       <h3 className="text-xs font-semibold">{target} · {items.length} keys</h3>
       <div className="max-h-72 overflow-y-auto space-y-2">{items.map(item=><label key={item.id} className="flex gap-2 text-xs items-start border-t pt-2">
         <input type="checkbox" className="mt-0.5" disabled={busy||item.action==="blocked"} checked={checked.includes(item.id)} onChange={e=>{setChecked(old=>e.target.checked?[...old,item.id]:old.filter(x=>x!==item.id));setApproved(false)}}/>
         <span className="min-w-0"><strong className="font-mono break-all">{item.key}</strong><span className="block text-muted-foreground">{item.action==="create"?"CREATE · currently missing":item.action==="replace"?"REPLACE · currently exists":"BLOCKED · "+item.reason}{item.previousSent?" · Last Vault write: "+new Date(item.previousSent).toLocaleString():""}</span></span>
       </label>)}</div>
     </div>)}
     <div className="rounded-md border p-3 space-y-2">
       <p className="text-xs font-semibold">Review {selected.length} selected Production changes</p>
       <p className="text-xs text-muted-foreground">This selection may overwrite existing Production values. Their plaintext may not be retrievable, and the previous value may not be recoverable. Back up where possible. No GitHub entries are affected.</p>
       <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={approved} disabled={!selected.length||busy} onChange={e=>setApproved(e.target.checked)}/> I checked the Main/Fallback destinations and approve creating or replacing these {selected.length} Vercel Production values.</label>
       <button type="button" className="button-primary" disabled={!approved||!selected.length||busy} onClick={()=>void apply()}><ShieldCheck size={14}/> Sync {selected.length} approved Vercel keys</button>
     </div>
   </div>}
   {summary&&<div className="rounded-md border p-3 space-y-2" role="status"><p className="text-xs font-semibold">{summary.step}</p><p className="text-xs">{summary.completed}/{summary.total} reviewed operations completed · {summary.added} created · {summary.replaced} replaced</p>{summary.warnings.map((w,i)=><p key={i} className="text-xs text-destructive">{w}</p>)}</div>}
   <p className="text-xs text-muted-foreground">Provider values are only written after individual selection and confirmation; each write rechecks the Production inventory for changes. Saved Vault values remain the desired source for the next manual comparison.</p>
 </section>
}
