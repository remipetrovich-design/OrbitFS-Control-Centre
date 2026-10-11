import { useEffect, useMemo, useState } from "react";
import { KeyRound, Lock, Plus, Search, ShieldCheck, Trash2, Copy, Pencil, X, Eye, EyeOff, Upload, Download } from "lucide-react";
import { getVaultEnvelope, saveVaultEnvelope, clearVaultEnvelope } from "@/lib/vault.server";
import { VaultVercelSync } from "@/components/vault-vercel-sync";
import { VaultVercelSyncAll } from "@/components/vault-vercel-sync-all";
import { VaultGithubSync } from "@/components/vault-github-sync";
import { VaultProviderRecovery } from "@/components/vault-provider-recovery";
import { VaultInventorySection } from "@/components/vault-inventory-section";
import { VaultSetupGuide } from "@/components/vault-setup-guide";
import { VAULT_SYSTEMS, VAULT_SERVICES, normalizeVaultRecord, recordIdentity, vaultDestinations, type VaultMode } from "@/lib/vault-schema";
import { groupVaultItems } from "@/lib/vault-grouping";
import { createEnvelope, decryptEnvelope, type VaultEnvelope, type VaultRecord } from "@/lib/vault-crypto";
import { preserveVaultConnections, isVaultConnection, bestVaultConnection, usableConnectionValue } from "@/lib/vault-connections";

const SYSTEMS=[...VAULT_SYSTEMS];
const VAULT_DESTINATIONS = [
  {mode:"main",system:"License",service:"GitHub",value:"lucaskerim123/Custom-licence-manager"},
  {mode:"main",system:"Billing",service:"GitHub",value:"lucaskerim123/V2_Billing_Store"},
  {mode:"main",system:"Dev",service:"GitHub",value:"lucaskerim123/Dev-panel"},
  {mode:"fallback",system:"License",service:"GitHub",value:"remipetrovich-design/OrbitFS-License-Administration"},
  {mode:"fallback",system:"Billing",service:"GitHub",value:"remipetrovich-design/OrbitFS-Billing-Shopfront"},
  {mode:"fallback",system:"Dev",service:"GitHub",value:"remipetrovich-design/OrbitFS-Control-Centre"},
  {mode:"fallback",system:"AI Repair Centre",service:"GitHub",value:"remipetrovich-design/AI-Repair-Centre"},
  {mode:"main",system:"License",service:"Vercel",value:"custom-licence-manager"},
  {mode:"main",system:"Billing",service:"Vercel",value:"v2-billing-store"},
  {mode:"main",system:"Dev",service:"Vercel",value:"base-deploy-panel"},
  {mode:"fallback",system:"License",service:"Vercel",value:"orbitfs-license-fallback"},
  {mode:"fallback",system:"Billing",service:"Vercel",value:"orbitfs-billing-fallback"},
  {mode:"fallback",system:"Dev",service:"Vercel",value:"orbitfs-dev-panel-fallback"}
] as const;
const destinationsFor = (_system:string,service:string,_modes:VaultMode[]) =>
  VAULT_DESTINATIONS.filter(item=>item.service===service);

const IMPORT_TEMPLATE={format:"orbitfs-vault-import-v2",entries:[{service:"Vercel",system:"Billing",keyName:"BILLING_API_TOKEN",keyValue:"change-me",usedIn:["main"],destinationSystem:"v2-billing-store"},{service:"GitHub",system:"Billing",keyName:"VERCEL_TOKEN",keyValue:"change-me",usedIn:["fallback"],destinationSystem:"remipetrovich-design/OrbitFS-Billing-Shopfront"}]};
const SERVICES=[...VAULT_SERVICES];
const VAULT_TABS = ["License","Billing","Dev","Base System","Shared Engine","AI Repair Centre","Database","Other"] as const;
type VaultTab = typeof VAULT_TABS[number];
const vaultTabLabel=(tab:VaultTab)=>tab==="Base System"?"Base":tab==="Shared Engine"?"Engine":tab;
function vaultMatchesTab(row:VaultRecord,tab:VaultTab):boolean {
  const original=row.systems.some(x=>x.toLowerCase()===tab.toLowerCase() || (tab==="Database"&&/database/i.test(x)));
  const destinations=vaultDestinations(row);
  const mapped=destinations.some(value=>{
    const matches=VAULT_DESTINATIONS.some(target=>target.value.toLowerCase()===value.toLowerCase()&&target.system===tab);
    if(matches)return true;
    if(tab==="Base System")return /(?:base-system|vercel-base|base-deploy)/i.test(value);
    if(tab==="Shared Engine")return /(?:engine|updater)/i.test(value);
    if(tab==="Database")return /(?:database|supabase)/i.test(value);
    return false;
  });
  return original||mapped;
}
function vaultMatchesMode(row:VaultRecord,mode:VaultMode):boolean {
  const selected=vaultDestinations(row);
  const catalog=VAULT_DESTINATIONS.filter(target=>selected.some(value=>target.value.toLowerCase()===value.toLowerCase()));
  const explicit=catalog.length>0?catalog.some(target=>target.mode===mode):false;
  return explicit||(row.usedIn||[]).includes(mode);
}


export function VaultWorkspace({session}:{session:any}){
  const [phase,setPhase]=useState<"loading"|"setup"|"locked"|"open">("loading");
  const [envelope,setEnvelope]=useState<VaultEnvelope|null>(null);
  const [password,setPassword]=useState("");
  const [confirm,setConfirm]=useState("");
  const [activePassword,setActivePassword]=useState("");
  const [records,setRecords]=useState<VaultRecord[]>([]);
  const [query,setQuery]=useState("");
  const [browseMode,setBrowseMode]=useState<Record<"Vercel"|"GitHub",VaultMode>>({Vercel:"main",GitHub:"main"});
  const [browseTab,setBrowseTab]=useState<Record<"Vercel"|"GitHub",VaultTab>>({Vercel:"License",GitHub:"License"});
  const [syncProvider,setSyncProvider]=useState<"Vercel"|"GitHub">("Vercel");
  const [providerSyncOpen,setProviderSyncOpen]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const [visible,setVisible]=useState<string[]>([]);
  const [draftVisible,setDraftVisible]=useState(false);
  const [importRows,setImportRows]=useState<VaultRecord[]>([]);
  const [importConflicts,setImportConflicts]=useState<Array<{identity:string;keyName:string;options:Array<{row:VaultRecord;line:number}>}>>([]);
  const [importConflictChoices,setImportConflictChoices]=useState<Record<string,string>>({});
  const [importMergedCount,setImportMergedCount]=useState(0);
  const [importMode,setImportMode]=useState<"skip"|"override"|"replace-all">("skip");
  const [replaceApproved,setReplaceApproved]=useState(false);
  const [showClearVault,setShowClearVault]=useState(false);
  const [clearConfirmation,setClearConfirmation]=useState("");
  const [editing,setEditing]=useState<VaultRecord|null>(null);
  const [customDestination,setCustomDestination]=useState(false);
  const [pendingMigration,setPendingMigration]=useState<VaultRecord[]|null>(null);
  const [draft,setDraft]=useState({system:"Billing",otherSystem:"",service:"Vercel",customService:"",keyName:"",secret:"",purpose:"",usedIn:["main"] as VaultMode[],destinationSystem:"",destinationSystems:[] as string[]});
  const blankDraft=()=>({system:"Billing",otherSystem:"",service:"Vercel",customService:"",keyName:"",secret:"",purpose:"",usedIn:["main"] as VaultMode[],destinationSystem:"",destinationSystems:[] as string[]});

  useEffect(()=>{void loadEnvelope()},[session?.token]);

  async function loadEnvelope(){
    setPhase("loading");setError("");
    try{
      const result=await getVaultEnvelope({data:{token:session.token}});
      if(result.exists&&result.envelope){setEnvelope(result.envelope as VaultEnvelope);setPhase("locked")}
      else {setEnvelope(null);setPhase("setup")}
    }catch(x:any){setError(x.message||"Unable to load Vault.");setPhase("locked")}
  }

  async function persist(next:VaultRecord[],passwordOverride=activePassword){
    const nextEnvelope=await createEnvelope(passwordOverride,next);
    const saved=await saveVaultEnvelope({data:{token:session.token,envelope:nextEnvelope}});
    setEnvelope({...nextEnvelope,updatedAt:saved.updatedAt});
    setRecords(next);
  }

  async function unlock(event:React.FormEvent){
    event.preventDefault();setError("");setBusy(true);
    try{
      if(phase==="setup"){
        if(!/^[0-9]{6,}$/.test(password))throw new Error("Vault PIN must contain at least 6 digits (numbers only).");
        if(password!==confirm)throw new Error("Vault PINs do not match.");
        await persist([],password);setActivePassword(password);setRecords([]);setPhase("open");
      }else{
        if(!envelope)throw new Error("Encrypted Vault is unavailable.");
        const original=await decryptEnvelope(password,envelope);
        const normalized=original.map(normalizeVaultRecord);
        setPendingMigration(JSON.stringify(original)===JSON.stringify(normalized)?null:normalized);
        setRecords(normalized);setActivePassword(password);setPhase("open");
      }
      setPassword("");setConfirm("");
    }catch(x:any){setError(phase==="setup"?(x.message||"Unable to create Vault."):"Wrong Vault PIN/password or unreadable Vault.")}
    finally{setBusy(false)}
  }

  function lock(){setVisible([]);setDraftVisible(false);setImportRows([]);setRecords([]);setActivePassword("");setPassword("");setConfirm("");setEditing(null);setPendingMigration(null);setPhase("locked");setNotice("")}

  async function save(event:React.FormEvent){
    event.preventDefault();setError("");setBusy(true);
    try{
      const system=draft.system.trim(),service=draft.service.trim(),keyName=draft.keyName.trim();
      if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(keyName))throw new Error("Use the exact environment key name (letters, numbers and underscores). No guessed prefixes.");
      if(!draft.destinationSystems.length)throw new Error("Choose at least one exact destination project or repository before saving.");
      // Explicit destination selection controls targeting; usedIn is a display label only.
      if(!system||!service||!keyName)throw new Error("System, service and key name are required.");
      const record:VaultRecord={id:editing?.id||crypto.randomUUID(),systems:[system],otherSystem:system==="Other"?draft.otherSystem.trim():"",service,customService:service==="Other"?draft.customService.trim():"",keyName,secret:draft.secret,purpose:draft.purpose,usedIn:Array.from(new Set(draft.destinationSystems.flatMap(value=>VAULT_DESTINATIONS.filter(item=>item.value===value).map(item=>item.mode)).concat(draft.usedIn))) as VaultMode[],destinationSystem:draft.destinationSystems[0]||"",destinationSystems:draft.destinationSystems,needsReview:false,legacyKeyName:editing?.legacyKeyName,vercelTargets:editing?.vercelTargets,githubTargets:editing?.githubTargets,syncReceipts:editing?.keyName===keyName&&editing?.secret===draft.secret?editing?.syncReceipts:[]};
      const next=editing?records.map(row=>row.id===editing.id?record:row):[record,...records];
      await persist(next);setPendingMigration(null);setEditing(null);setDraft(blankDraft());setCustomDestination(false);setNotice(editing?"Vault entry updated.":"Vault entry saved.");
    }catch(x:any){setError(x.message||"Unable to save Vault entry.")}
    finally{setBusy(false)}
  }

  async function clearVault(){
    if(clearConfirmation!=="CLEAR VAULT"||!envelope?.updatedAt||busy)return;
    setBusy(true);setError("");setNotice("");
    try{
      await clearVaultEnvelope({data:{token:session.token,confirmation:clearConfirmation,expectedUpdatedAt:envelope.updatedAt}});
      setRecords([]);setEnvelope(null);setActivePassword("");setPassword("");setConfirm("");
      setVisible([]);setDraftVisible(false);setImportRows([]);setEditing(null);
      setDraft(blankDraft());setPendingMigration(null);setCustomDestination(false);
      setShowClearVault(false);setClearConfirmation("");
      setPhase("setup");
      setNotice("The encrypted Vault has been cleared. GitHub, Vercel and all other databases were not changed.");
    }catch(e:any){setError(e?.message||"Could not clear the Vault. No reset was confirmed.")}
    finally{setBusy(false)}
  }

  async function downloadEncryptedBackup(){
    setError("");setNotice("");
    try {
      // Fetch the latest persisted ciphertext, not an unsaved UI draft.
      const current=await getVaultEnvelope({data:{token:session.token}});
      if(!current.exists||!current.envelope)throw new Error("Encrypted Vault is unavailable.");
      const latest=current.envelope as VaultEnvelope;
      const savedRecords=await decryptEnvelope(activePassword,latest);
      if(!Array.isArray(savedRecords))throw new Error("Vault backup validation failed.");
      const backup={format:"orbitfs-vault-encrypted-backup-v1",envelope:latest};
      const blob=new Blob([JSON.stringify(backup,null,2)+"\n"],{type:"application/json"});
      const url=URL.createObjectURL(blob);
      const link=document.createElement("a");
      link.href=url;
      link.download="orbitfs-vault-encrypted-backup-"+new Date().toISOString().slice(0,10)+".json";
      link.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
      setNotice("Encrypted backup prepared from the latest saved Vault ("+savedRecords.length+" entries). Keep the downloaded file and your Vault PIN safe; no secret values are written in plaintext.");
    }catch(e:any){setError("Unable to export a verified Vault backup: "+String(e?.message||"unknown error"));}
  }

  function downloadTemplate(){
    const blob=new Blob([JSON.stringify(IMPORT_TEMPLATE,null,2)+"\n"],{type:"application/json"});
    const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download="orbitfs-vault-import-template.json";link.click();URL.revokeObjectURL(url);
  }

  function downloadCurrentValuesJson(){
    setError("");setNotice("");
    if(!records.length){setError("The Vault has no saved entries to export.");return;}
    const populated=records.filter(row=>Boolean(row.secret)).length;
    if(!window.confirm("Export "+records.length+" Vault entries, including "+populated+" saved plaintext values? The downloaded JSON is NOT encrypted and anyone with the file can read its secrets. Store it securely and delete copies after use."))return;
    const payload={
      format:"orbitfs-vault-import-v2",
      exportedAt:new Date().toISOString(),
      warning:"UNENCRYPTED FILE: contains any stored Vault secret values. Protect this file.",
      entries:records.map(row=>({
        service:row.service,
        system:row.systems[0]||"Other",
        keyName:row.keyName,
        keyValue:row.secret||"",
        purpose:row.purpose||"",
        usedIn:row.usedIn||[],
        destinationSystem:row.destinationSystem||"",
        destinationSystems:row.destinationSystems?.length?row.destinationSystems: vaultDestinations(row),
        valueSource:row.valueSource||"Vault saved value"
      }))
    };
    const blob=new Blob([JSON.stringify(payload,null,2)+"\\n"],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const link=document.createElement("a");
    link.href=url;
    link.download="orbitfs-vault-with-values-"+new Date().toISOString().slice(0,10)+".json";
    link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    setNotice("Exported "+records.length+" entries ("+populated+" saved values) as UNENCRYPTED JSON. The existing JSON import accepts this format. Protect the file.");
  }

  async function restoreConnectionsFromBackup(event:React.ChangeEvent<HTMLInputElement>){
    const file=event.target.files?.[0];event.target.value="";if(!file)return;
    setError("");setNotice("");setBusy(true);
    try{
      if(file.size>1024*1024*3)throw new Error("Encrypted backup must be under 3 MB.");
      const payload=JSON.parse(await file.text());
      if(payload?.format!=="orbitfs-vault-encrypted-backup-v1"||!payload.envelope)
        throw new Error("Select an encrypted Vault backup, not a plain import JSON.");
      const previous=await decryptEnvelope(activePassword,payload.envelope as VaultEnvelope);
      const restored=previous.filter(isVaultConnection).map(normalizeVaultRecord);
      const valid=restored.filter(row=>usableConnectionValue(row.secret));
      if(!valid.length)throw new Error("This backup contains no usable GitHub or Vercel account connections.");
      const before=new Map(valid.map(x=>[x.keyName,bestVaultConnection(records,x.keyName)?.secret||""]));
      const merged=preserveVaultConnections(records,[...restored,...records.filter(row=>!isVaultConnection(row))]);
      const improved=valid.filter(x=>!usableConnectionValue(before.get(x.keyName)) && usableConnectionValue(bestVaultConnection(merged,x.keyName)?.secret));
      if(!improved.length)throw new Error("The current Vault already has these connections. Nothing was overwritten.");
      await persist(merged);
      setPendingMigration(null);
      setNotice("Restored "+improved.length+" account connection(s) from your encrypted backup. Existing non-connection keys were kept.");
    }catch(e:any){setError(e?.message||"Could not restore encrypted Vault connections.");}
    finally{setBusy(false)}
  }

  async function prepareImport(event:React.ChangeEvent<HTMLInputElement>){
    setError("");setNotice("");setImportRows([]);setImportConflicts([]);setImportConflictChoices({});setImportMergedCount(0);setReplaceApproved(false);
    const file=event.target.files?.[0];event.target.value="";if(!file)return;
    try{
      if(file.size>1024*1024)throw new Error("Import file must be 1 MB or smaller.");
      const data=JSON.parse(await file.text());
      if(!["orbitfs-vault-import-v1","orbitfs-vault-import-v2"].includes(data?.format)||!Array.isArray(data.entries))
        throw new Error("Use OrbitFS Vault JSON v1 or v2.");
      if(!data.entries.length||data.entries.length>500)throw new Error("Import must have 1–500 entries.");
      const rows:VaultRecord[]=data.entries.map((item:any,index:number)=>{
        if(!item||typeof item!=="object")throw new Error("Invalid entry at row "+(index+1));
        const rawName=String(item.keyName||"").trim();
        const rawSecret=item.keyValue??item.secret;
        if(!rawName||typeof rawSecret!=="string"||rawName.length>256||rawSecret.length>10000)
          throw new Error("Invalid key name or value at row "+(index+1));
        const modern=data.format==="orbitfs-vault-import-v2";
        const record:VaultRecord={
          id:crypto.randomUUID(),systems:[String(item.system||"Other")],
          otherSystem:"",service:String(item.service||"Other"),customService:"",
          keyName:rawName,secret:rawSecret,purpose:String(item.purpose||""),valueSource:String(item.valueSource||""),
          usedIn:modern?(Array.isArray(item.usedIn)?item.usedIn:[]):undefined,
          destinationSystem:modern?String(item.destinationSystem||""):"",
          destinationSystems:modern&&Array.isArray(item.destinationSystems)?item.destinationSystems.map(String):undefined
        };
        return normalizeVaultRecord(record);
      });
      // Import exports often contain multiple records for an identical exact
      // service/system/mode/destination/key. Collapse identical/blank duplicates,
      // but never silently choose between two different nonblank credentials.
      const groups=new Map<string,Array<{row:VaultRecord;line:number}>>();
      rows.forEach((row,index)=>{
        const identity=recordIdentity(row);
        const entries=groups.get(identity)||[];
        entries.push({row,line:index+1});groups.set(identity,entries);
      });
      const merged:VaultRecord[]=[];
      const conflicts:Array<{identity:string;keyName:string;options:Array<{row:VaultRecord;line:number}>}>=[];
      let duplicates=0;
      for(const [identity,entries] of groups){
        duplicates+=entries.length-1;
        const values=[...new Set(entries.map(x=>x.row.secret).filter(v=>v.trim()))];
        // Prefer the populated entry over an empty placeholder, regardless of row order.
        const preferred=entries.find(x=>x.row.secret===values[0])||entries[0]!;
        merged.push(preferred.row);
        if(values.length>1){
          conflicts.push({identity,keyName:preferred.row.keyName,
            options:entries.filter(x=>x.row.secret.trim() && values.includes(x.row.secret))});
        }
      }
      setImportRows(merged);
      setImportConflicts(conflicts);
      setImportConflictChoices({});
      setImportMergedCount(duplicates);
      setNotice(merged.length+" unique entries loaded from "+rows.length+" JSON rows. "+
        (conflicts.length?conflicts.length+" conflicting values need a selection below before import.":"Duplicate blanks and matching values were safely consolidated."));
    }catch(x:any){setError(x.message||"Unable to read import file.")}
  }

  async function confirmImport(){
    if(importConflicts.some(group=>!importConflictChoices[group.identity])){
      setError("Choose which value to keep for all "+importConflicts.length+" conflicting JSON entries before importing.");
      return;
    }
    if(importMode==="replace-all"&&!replaceApproved){setError("Export the old Vault as a backup and confirm the full replacement before proceeding.");return;}
    setBusy(true);setError("");
    try{
      const existing=new Map(records.map(row=>[recordIdentity(row),row]));
      const additions=importRows.filter(row=>!existing.has(recordIdentity(row)));
      const overrides=importMode==="override"?importRows.filter(row=>existing.has(recordIdentity(row)) && (Boolean(row.secret.trim()) || !existing.get(recordIdentity(row))?.secret?.trim())):[];
      const replacements=new Map(overrides.map(row=>[recordIdentity(row),row]));
      if(importMode!=="replace-all"&&!additions.length&&!overrides.length)throw new Error("Nothing new to import.");
      const next=records.map(row=>{
        const replacement=replacements.get(recordIdentity(row));
        return replacement?{...replacement,id:row.id,vercelTargets:row.vercelTargets,githubTargets:row.githubTargets}:row;
      });
      const replacement=preserveVaultConnections(records,importMode==="replace-all"?importRows:[...additions,...next]);
      await persist(replacement);setPendingMigration(null);setImportRows([]);setImportConflicts([]);setImportConflictChoices({});setImportMergedCount(0);setReplaceApproved(false);
      setNotice(importMode==="replace-all"?"Other keys replaced; saved GitHub/Vercel account connections protected. "+importRows.length+" imported entries processed.":"Added "+additions.length+", replaced "+overrides.length+", skipped "+(importRows.length-additions.length-overrides.length)+".");
    }catch(x:any){setError(x.message||"Import failed.")}finally{setBusy(false)}
  }

  async function remove(id:string){
    if(!window.confirm("Remove this entry from the encrypted Vault only? GitHub Actions secrets/variables and Vercel environment variables will NOT be deleted."))return;
    setBusy(true);setError("");
    try{await persist(records.filter(row=>row.id!==id));setNotice("Vault entry removed locally. GitHub and Vercel were not changed.")}
    catch(x:any){setError(x.message||"Unable to remove Vault entry.")}
    finally{setBusy(false)}
  }

  function edit(row:VaultRecord){
    const normalized=normalizeVaultRecord(row);
    setCustomDestination(false);
    setEditing(row);setDraft({
      system:normalized.systems[0]||"Other",otherSystem:normalized.otherSystem||"",
      service:normalized.service,customService:normalized.customService||"",
      keyName:normalized.keyName,secret:normalized.secret,purpose:normalized.purpose||"",
      usedIn:normalized.usedIn||[],destinationSystem:normalized.destinationSystem||"",destinationSystems:vaultDestinations(normalized)
    });
    requestAnimationFrame(()=>document.getElementById("vault-entry-editor")?.scrollIntoView({behavior:"smooth",block:"start"}));
  }

  const filtered=useMemo(()=>{
    const q=query.trim().toLowerCase();
    return records.filter(row=>!q||[row.systems[0],row.service,row.keyName,...vaultDestinations(row),...(row.usedIn||[])].some(v=>String(v||"").toLowerCase().includes(q)));
  },[records,query]);
  function openOutboundSync(provider:"GitHub"|"Vercel"){
    setSyncProvider(provider);
    setProviderSyncOpen(true);
    requestAnimationFrame(()=>document.getElementById("vault-provider-sync")?.scrollIntoView({behavior:"smooth",block:"start"}));
  }
  const syncCounts={
    GitHub:records.filter(row=>row.service==="GitHub"&&!isVaultConnection(row)&&vaultDestinations(row).length>0).length,
    Vercel:records.filter(row=>row.service==="Vercel"&&!isVaultConnection(row)&&vaultDestinations(row).length>0).length
  };
  const groupedEntries=groupVaultItems(filtered,row=>row);
  const needingReview=records.filter(row=>row.needsReview||!vaultDestinations(row).length);

  if(phase!=="open")return <section className="min-w-0 w-full max-w-full space-y-4 overflow-x-hidden">
    <div className="orbit-reference-page-head"><p>SECURE OPERATIONS</p><h1>Vault</h1><span>Persistent encrypted credentials with a separate Vault unlock.</span></div>
    <div className="orbit-panel min-w-0 max-w-full p-4"><div className="orbit-section-head"><span className="orbit-section-icon"><ShieldCheck size={15}/></span><div><h2>Vercel Production connections</h2><p>Main and Fallback account sync is available after you unlock the Vault. No Vercel variables change until you review and approve them.</p></div></div></div>
    <div className="mx-auto max-w-lg orbit-panel p-5">
      <div className="orbit-section-head"><span className="orbit-section-icon"><Lock size={15}/></span><div><h2>{phase==="setup"?"Create Vault":"Unlock Vault"}</h2><p>{phase==="setup"?"Create a numeric PIN of at least 6 digits to encrypt this Vault.":"Your Dev Panel session is active. Unlock the encrypted Vault separately."}</p></div></div>
      {error&&<div className="mt-4 rounded-lg border border-red-400/40 bg-red-400/10 p-3 text-xs text-red-100">{error}</div>}
      {phase==="loading"?<p className="mt-5 text-xs text-muted-foreground">Loading encrypted Vault…</p>:<form className="mt-5 space-y-4" onSubmit={unlock}>
        <label className="block text-xs font-medium">Vault PIN<input className="control mt-1" type="password" inputMode="numeric" pattern={phase==="setup"?"[0-9]{6,}":undefined} minLength={phase==="setup"?6:undefined} autoComplete="off" value={password} onChange={e=>setPassword(e.target.value)} required/></label>
        {phase==="setup"&&<label className="block text-xs font-medium">Confirm Vault PIN<input className="control mt-1" type="password" inputMode="numeric" pattern="[0-9]{6,}" minLength={6} autoComplete="off" value={confirm} onChange={e=>setConfirm(e.target.value)} required/></label>}
        <button className="button-primary w-full" disabled={busy}>{busy?"Working…":phase==="setup"?"Create encrypted Vault":"Unlock Vault"}</button>
      </form>}
      <div className="mt-4 flex items-start gap-2 text-[10px] leading-5 text-muted-foreground"><ShieldCheck size={14} className="mt-0.5 shrink-0"/><span>The server stores encrypted ciphertext only. The Vault PIN is not saved and cannot be recovered.</span></div>
    </div>
  </section>;

  return <section className="space-y-4">
    <div className="orbit-reference-head"><div><p className="orbit-reference-kicker">SECURE OPERATIONS</p><h1>Vault</h1><span>Central encrypted credentials · {records.length} {records.length===1?"entry":"entries"}</span></div><div className="orbit-reference-actions"><button className="button-secondary" type="button" onClick={lock}><Lock size={14}/> Lock Vault</button></div></div>
    <section className="orbit-panel min-w-0 w-full max-w-full p-4 space-y-3" aria-label="Sync Vault to providers">
      <h2 className="text-sm font-semibold">Sync from Vault → GitHub / Vercel</h2>
      <p className="text-xs text-muted-foreground">Your saved Vault entries are the desired values for these destinations. Sync compares the exact assigned target, then lets you review and confirm creating or overriding values. Nothing deletes remote secrets or variables.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="button-primary" onClick={()=>openOutboundSync("GitHub")}><Upload size={14}/> Sync Vault → GitHub ({syncCounts.GitHub})</button>
        <button type="button" className="button-primary" onClick={()=>openOutboundSync("Vercel")}><Upload size={14}/> Sync Vault → Vercel ({syncCounts.Vercel})</button>
      </div>
      <p className="text-xs text-muted-foreground">Syncing needs an unlocked Vault, valid account credentials, a selected repository or project, and explicit approval for each write. GitHub secret values cannot be compared remotely, so no automatic secret drift verdict is implied. Runtime services still use provider-side variables; they do not read directly from this browser-encrypted Vault.</p>
    </section>
    <VaultVercelSyncAll session={session} records={records} onPersist={persist}/>
    <section className="orbit-panel min-w-0 w-full max-w-full p-4 space-y-2" aria-label="Vault encrypted backup">
      <h2 className="text-sm font-semibold">Backup your current Vault</h2>
      <p className="text-xs text-muted-foreground">Download the latest saved encrypted entries before redesigning. Your saved keys are not changed.</p>
      <button type="button" className="button-primary flex w-full items-center justify-center gap-2 sm:w-auto" onClick={()=>void downloadEncryptedBackup()}><Download size={16}/> Download encrypted Vault backup</button>
    </section>
    {error&&<div className="rounded-lg border border-red-400/40 bg-red-400/10 p-3 text-xs text-red-100">{error}</div>}
    {notice&&<div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-3 text-xs text-emerald-100">{notice}</div>}
    <div className="orbit-panel p-4 space-y-2">
      <h2 className="text-base font-semibold">Vault · organised by system</h2>
      <p className="text-xs text-muted-foreground">Service is the provider. System is the OrbitFS product. Every key is tied to an explicit account mode and exact destination; prefixes are never guessed during sync.</p>
      <p className="text-xs text-muted-foreground">{records.length} saved entries · {needingReview.length} need destination review. Verified Production names below come from real Main Vercel settings, not invented runtime requirements.</p>
      {pendingMigration&&<div className="rounded border p-3 space-y-2">
        <strong className="text-sm">Review legacy Vault conversion</strong>
        <p className="text-xs">The existing Vault was decrypted in your browser. Only key names verified against the actual Main Production inventory were normalised. Other names and all values were retained. Your previous encrypted Vault is unchanged until you save.</p>
        <p className="text-xs text-muted-foreground">{records.filter(r=>r.legacyKeyName).length} old prefixed names were mapped to exact verified names. {needingReview.length} entries still need explicit destinations.</p>
        <button type="button" className="button-secondary" disabled={busy} onClick={()=>void (async()=>{setBusy(true);setError("");try{await persist(records);setPendingMigration(null);setNotice("Corrected Vault names saved in encrypted storage. No Vercel or GitHub variables changed.");}catch(e:any){setError(e?.message||"Could not save migration")}finally{setBusy(false)}})()}>Save reviewed Vault migration</button>
      </div>}
    </div>
    {(["Vercel","GitHub"] as const).map(provider=>{
      const mode=browseMode[provider],tab=browseTab[provider];
      const current=records.filter(row=>row.service===provider&&vaultMatchesMode(row,mode)&&vaultMatchesTab(row,tab)&&
        (!query.trim()||[row.keyName,row.purpose||"",...vaultDestinations(row)].some(v=>v.toLowerCase().includes(query.trim().toLowerCase()))));
      return <details key={provider} className="orbit-panel min-w-0 max-w-full overflow-hidden" open={undefined}>
        <summary className="cursor-pointer px-4 py-4 font-semibold text-sm">{provider} · {records.filter(row=>row.service===provider).length} saved entries</summary>
        <div className="border-t p-3 sm:p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={provider+" account mode"}>
            {(["main","fallback"] as VaultMode[]).map(value=><button type="button" key={value} aria-pressed={mode===value} className={mode===value?"button-primary":"button-secondary"} onClick={()=>setBrowseMode(prev=>({...prev,[provider]:value}))}>{value==="main"?"Main":"Fallback"}</button>)}
          </div>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label={provider+" system selector"}>
            {VAULT_TABS.map(value=><button type="button" key={value} role="tab" aria-selected={tab===value} className={tab===value?"button-primary":"button-secondary"} onClick={()=>setBrowseTab(prev=>({...prev,[provider]:value}))}>{vaultTabLabel(value)}</button>)}
          </div>
          <div className="relative"><Search size={14} className="absolute left-3 top-3 text-muted-foreground"/><input aria-label={provider+" key search"} className="control w-full min-w-0 pl-9" placeholder="Search saved variables and destinations…" value={query} onChange={e=>setQuery(e.target.value)}/></div>
          <p className="text-xs text-muted-foreground">{current.length} entries · Tabs organise keys; they do not limit where they can be used.</p>
          <div className="space-y-2">
            {current.map(row=><article key={row.id} className="min-w-0 rounded-lg border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="break-all font-mono text-xs font-semibold">{row.keyName}</p>
                  {row.purpose&&<p className="mt-1 break-words text-xs text-muted-foreground">{row.purpose}</p>}
                  <div className="mt-2 space-y-1 text-xs">
                    {vaultDestinations(row).map(destination=>{
                      const receipt=(row.syncReceipts||[]).filter(item=>item.provider===provider&&item.destination.toLowerCase()===destination.toLowerCase()&&item.keyName===row.keyName).sort((a,b)=>b.at.localeCompare(a.at))[0];
                      return <p key={destination} className="break-all rounded border px-2 py-1">
                        <span className="font-medium">{destination}</span> · {receipt?"Sent / accepted":"Assigned · not confirmed sent"}
                        {receipt&&<span className="block text-muted-foreground">Last sent: {new Date(receipt.at).toLocaleString()} · {receipt.account==="main"?"Main":"Fallback"}{receipt.scope?" · "+receipt.scope:""}{receipt.kind?" · "+receipt.kind:""}</span>}
                      </p>;
                    })}
                    {!vaultDestinations(row).length&&<p className="text-muted-foreground">Not assigned · not sent</p>}
                    <p className="text-muted-foreground">Assigned means selected for this destination. Sent confirms a recorded provider write; actual application usage is not verified.</p>
                  </div>
                  {row.needsReview&&<p className="mt-1 text-xs text-amber-500">Review destination before syncing</p>}
                  <p className="mt-2 break-all font-mono text-xs">{visible.includes(row.id)?row.secret||"(blank)":row.secret?"••••••••••••":"(blank)"}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1">
                  <button type="button" className="icon-button" aria-label={visible.includes(row.id)?"Hide secret":"Show secret"} title={visible.includes(row.id)?"Hide secret":"Show secret"} onClick={()=>setVisible(old=>old.includes(row.id)?old.filter(id=>id!==row.id):[...old,row.id])}>{visible.includes(row.id)?<EyeOff size={14}/>:<Eye size={14}/>}</button>
                  <button type="button" className="icon-button" title="Copy secret" aria-label="Copy secret" onClick={()=>void navigator.clipboard.writeText(row.secret)}><Copy size={14}/></button>
                  <button type="button" className="icon-button" title="Edit variable" aria-label="Edit variable" onClick={()=>edit(row)}><Pencil size={14}/></button>
                  <button type="button" className="icon-button" title="Remove variable" aria-label="Remove variable" onClick={()=>void remove(row.id)}><Trash2 size={14}/></button>
                </div>
              </div>
            </article>)}
            {!current.length&&<p className="rounded border p-4 text-xs text-muted-foreground">No saved entries match this system and mode. A variable can appear under multiple system tabs when assigned to those destinations.</p>}
          </div>
        </div>
      </details>;
    })}
    <details className="orbit-panel min-w-0 max-w-full p-4" open={Boolean(editing)} key={editing?.id||"new-entry"}>
      <summary className="cursor-pointer text-sm font-semibold">{editing?"Edit saved variable":"Add environment variable"}</summary>
      <p className="mt-2 text-xs text-muted-foreground">Use the existing encrypted editor. One secret can have multiple destinations in Main and Fallback.</p>
    <form id="vault-entry-editor" onSubmit={save} className="orbit-panel p-4">
      <div className="orbit-section-head"><span className="orbit-section-icon"><Plus size={15}/></span><div><h2>{editing?"Edit saved key":"Add a missing key"}</h2><p>Values are encrypted before saving. A blank value is allowed as an inventory reminder and cannot be pushed to Production.</p></div></div>
      <div className="mt-4 grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
        <label className="block text-xs font-medium">Service<select className="control mt-1" value={draft.service} onChange={e=>setDraft({...draft,service:e.target.value})}>{SERVICES.map(x=><option key={x}>{x}</option>)}</select></label>
        <label className="block text-xs font-medium">System<select className="control mt-1" value={draft.system} onChange={e=>setDraft({...draft,system:e.target.value})}>{SYSTEMS.map(x=><option key={x}>{x}</option>)}</select></label>
        {draft.service==="Other"&&<label className="block text-xs font-medium">Other service<input className="control mt-1" value={draft.customService} onChange={e=>setDraft({...draft,customService:e.target.value})}/></label>}
        {draft.system==="Other"&&<label className="block text-xs font-medium">Other system<input className="control mt-1" value={draft.otherSystem} onChange={e=>setDraft({...draft,otherSystem:e.target.value})}/></label>}
        <label className="block text-xs font-medium">Key name · exact<input className="control mt-1 font-mono" autoComplete="off" value={draft.keyName} onChange={e=>setDraft({...draft,keyName:e.target.value})} placeholder="e.g. BILLING_API_TOKEN"/></label>
        <label className="block text-xs font-medium">Key value<input className="control mt-1 font-mono" type={draftVisible?"text":"password"} autoComplete="off" value={draft.secret} onChange={e=>setDraft({...draft,secret:e.target.value})}/><button type="button" className="button-secondary mt-1" onClick={()=>setDraftVisible(v=>!v)}>{draftVisible?"Hide value":"Show value"}</button></label>
        <label className="block text-xs font-medium md:col-span-2">What this key is for<input className="control mt-1" value={draft.purpose} onChange={e=>setDraft({...draft,purpose:e.target.value})} placeholder="e.g. Billing API access to License Manager"/></label>
        <p className="text-xs text-muted-foreground md:col-span-2">Choose Main and Fallback targets below. The system category is for organisation only; it does not restrict where a variable can be applied.</p>
        <fieldset className="min-w-0 max-w-full text-xs">
          <legend className="font-medium">Destinations · select every project or repository that needs this variable</legend>
          <div className="mt-2 max-h-52 space-y-2 overflow-y-auto rounded border p-3">
            {(["main","fallback"] as VaultMode[]).map(mode=><div key={mode} className="space-y-1">
              <p className="font-semibold">{mode==="main"?"Main":"Fallback"}</p>
              {destinationsFor(draft.system,draft.service,draft.usedIn).filter(item=>item.mode===mode).map(item=><label key={item.value} className="flex min-w-0 items-start gap-2 py-1">
                <input type="checkbox" className="mt-0.5 shrink-0" checked={draft.destinationSystems.includes(item.value)} onChange={e=>setDraft({...draft,destinationSystems:e.target.checked?[...draft.destinationSystems,item.value]:draft.destinationSystems.filter(value=>value!==item.value)})}/>
                <span className="min-w-0 break-all">{item.value}</span>
              </label>)}
            </div>)}
          </div>
          <label className="mt-3 flex items-center gap-2"><input type="checkbox" checked={customDestination} onChange={e=>setCustomDestination(e.target.checked)}/> Add another custom destination</label>
          {customDestination&&<div className="mt-2 flex min-w-0 flex-wrap gap-2">
            <input aria-label="Custom destination" className="control min-w-0 flex-1 font-mono" autoComplete="off" value={draft.destinationSystem} onChange={e=>setDraft({...draft,destinationSystem:e.target.value})} placeholder="Project name or owner/repository"/>
            <button type="button" className="button-secondary" onClick={()=>{const value=draft.destinationSystem.trim();if(value&&!draft.destinationSystems.includes(value))setDraft({...draft,destinationSystems:[...draft.destinationSystems,value],destinationSystem:""})}}>Add</button>
          </div>}
          {draft.destinationSystems.filter(value=>!VAULT_DESTINATIONS.some(item=>item.value===value)).map(value=><label key={value} className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked onChange={()=>setDraft({...draft,destinationSystems:draft.destinationSystems.filter(x=>x!==value)})}/><span className="break-all">{value}</span></label>)}
          <p className="mt-2 text-muted-foreground">The system category only organises this key. Every checked destination may use it after manual comparison and approval.</p>
        </fieldset>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Key name is the actual environment variable name, not a Vault label. A key may exist more than once if its System, mode or destination differs. Sync never automatically adds/removes a prefix.</p>
      <div className="mt-4 flex gap-2"><button className="button-primary" disabled={busy}>{busy?"Saving…":editing?"Save changes":"Add to Vault"}</button>{editing&&<button type="button" className="button-secondary" onClick={()=>{setEditing(null);setDraft(blankDraft());setCustomDestination(false)}}><X size={14}/> Cancel</button>}</div>
    </form>
    </details>
      <div className="mt-3 orbit-section-head"><span className="orbit-section-icon"><Upload size={15}/></span><div><h2>Import your JSON file</h2><p>Accepts old v1 and new v2 JSON. Matching is by Service + System + exact key + mode + destination, not just the key name. Credentials remain encrypted.</p></div></div>
      <section className="mt-3 rounded-lg border border-border p-3 space-y-3" aria-label="JSON import and conflict settings">
        <h3 className="text-sm font-semibold">Import JSON · choose how existing keys are handled</h3>
        <fieldset className="space-y-2 text-xs">
          <legend className="font-medium">When the imported key already exists in this Vault</legend>
          <label className="flex items-center gap-2"><input type="radio" name="vault-import-mode" checked={importMode==="skip"} disabled={busy} onChange={()=>setImportMode("skip")}/> Skip existing · keep the saved Vault value (default)</label>
          <label className="flex items-center gap-2"><input type="radio" name="vault-import-mode" checked={importMode==="override"} disabled={busy} onChange={()=>setImportMode("override")}/> Override existing · update from JSON (blank values never erase saved secrets)</label>
          <label className="flex items-center gap-2"><input type="radio" name="vault-import-mode" checked={importMode==="replace-all"} disabled={busy} onChange={()=>{setImportMode("replace-all");setReplaceApproved(false)}}/> Replace all non-connection Vault entries · destructive to local Vault only</label>
        </fieldset>
        <p className="text-xs text-muted-foreground">Import only edits encrypted Vault entries. GitHub Actions and Vercel variables are never changed or deleted by importing.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="button-secondary" onClick={downloadTemplate}><Download size={14}/> Download JSON template</button>
          <button type="button" className="button-secondary" disabled={busy||!records.length} onClick={downloadCurrentValuesJson}><Download size={14}/> Download JSON with saved values (unencrypted)</button>
          <label className="button-secondary cursor-pointer"><Upload size={14}/> Choose JSON file<input className="sr-only" type="file" accept=".json,application/json" disabled={busy} onChange={e=>void prepareImport(e)}/></label>
        </div>
        {importRows.length>0&&<div className="space-y-3 border-t pt-3">
          <p className="text-xs font-medium">{importRows.length} unique entries ready · {importMergedCount} duplicate rows consolidated. Values remain hidden.</p>
          {importConflicts.length>0&&<div className="space-y-3 rounded border p-3" aria-label="Resolve imported variable conflicts">
            <p className="text-xs font-semibold">{importConflicts.length} exact-destination keys have conflicting nonblank values. Choose one JSON row per key; nothing is sent to GitHub or Vercel.</p>
            {importConflicts.map(group=><fieldset className="space-y-2 rounded border p-2" key={group.identity}>
              <legend className="font-mono text-xs font-semibold break-all">{group.keyName}</legend>
              <p className="text-xs text-muted-foreground">Same service, system, mode and destination: {group.options[0]?.row.destinationSystem||"Unassigned"}</p>
              {group.options.map(option=><label key={option.row.id} className="flex items-center gap-2 text-xs">
                <input type="radio" name={"conflict-"+group.identity} checked={importConflictChoices[group.identity]===option.row.id} disabled={busy}
                  onChange={()=>{
                    setImportConflictChoices(prev=>({...prev,[group.identity]:option.row.id}));
                    setImportRows(prev=>prev.map(row=>recordIdentity(row)===group.identity?option.row:row));
                    setError("");
                  }}/>
                JSON row {option.line} · value supplied (hidden)
              </label>)}
            </fieldset>)}
          </div>}
          <div className="max-h-40 overflow-auto text-xs space-y-1">{importRows.map(row=><p key={row.id} className="border-b py-1 break-all font-mono">{row.service} / {row.systems[0]} / {row.keyName} → {row.destinationSystem||"Unassigned"} {row.secret?"· value supplied":"· blank value"}</p>)}</div>
          <p className="text-xs text-muted-foreground">Matching entries: {importRows.filter(row=>records.some(saved=>recordIdentity(saved)===recordIdentity(row))).length}. Selection: {importMode==="skip"?"Skip saved keys":importMode==="override"?"Override saved keys":"Replace all non-connection entries"}.</p>
          {importMode==="replace-all"&&<div className="rounded border p-3 space-y-2">
            <p className="text-xs">This removes existing non-connection Vault records not present in the JSON. It never changes GitHub or Vercel. Download an encrypted backup first.</p>
            <button type="button" className="button-secondary" onClick={downloadEncryptedBackup}><Download size={14}/> Download encrypted backup</button>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={replaceApproved} onChange={e=>setReplaceApproved(e.target.checked)}/> Confirm replacing local non-connection entries; keep saved provider connections</label>
          </div>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="button-primary" disabled={busy||importConflicts.some(group=>!importConflictChoices[group.identity])||(importMode==="replace-all"&&!replaceApproved)} onClick={()=>void confirmImport()}>{busy?"Importing…":importMode==="skip"?"Import · skip existing":importMode==="override"?"Import · override existing":"Replace local Vault entries"}</button>
            <button type="button" className="button-secondary" disabled={busy} onClick={()=>{setImportRows([]);setImportConflicts([]);setImportConflictChoices({});setImportMergedCount(0)}}>Cancel import</button>
          </div>
        </div>}
      </section>


    <details className="orbit-panel min-w-0 max-w-full p-4 space-y-3">
      <summary className="cursor-pointer text-sm font-semibold">Recovery / Configuration / Setup</summary>
      <div className="mt-4 rounded-lg border border-red-500/40 p-3 space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Clear encrypted Vault entries</h3>
          <p className="mt-1 text-xs text-muted-foreground">Deletes only the encrypted Vault copy, including saved provider connection tokens. It never removes or changes any GitHub Actions secrets, GitHub Actions variables, or Vercel environment variables. To restore the inventory, reconnect your provider accounts and use Pull / Sync from Providers.</p>
        </div>
        {!showClearVault?<button type="button" className="button-secondary" disabled={busy} onClick={()=>{setShowClearVault(true);setClearConfirmation("");}}><Trash2 size={14}/> Clear Vault…</button>:
        <div className="space-y-2">
          <label className="block text-xs font-medium" htmlFor="vault-clear-confirm">Type CLEAR VAULT to confirm deletion of all {records.length} saved entries</label>
          <input id="vault-clear-confirm" className="control w-full" autoComplete="off" spellCheck={false} value={clearConfirmation} onChange={e=>setClearConfirmation(e.target.value)} placeholder="CLEAR VAULT"/>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="button-secondary" disabled={busy||clearConfirmation!=="CLEAR VAULT"} onClick={()=>void clearVault()}>{busy?"Clearing…":"Delete all Vault entries"}</button>
            <button type="button" className="button-secondary" disabled={busy} onClick={()=>{setShowClearVault(false);setClearConfirmation("");}}>Cancel</button>
          </div>
        </div>}
      </div>


      <VaultSetupGuide session={session} records={records} onPersist={persist} onEdit={edit}/>
    </details>

    <VaultProviderRecovery session={session} records={records} onPersist={persist}/>
    <details id="vault-provider-sync" className="orbit-panel min-w-0 max-w-full p-4" open={providerSyncOpen} onToggle={e=>setProviderSyncOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer text-sm font-semibold">Sync Vault → Provider · compare / review / create / override</summary>
      <p className="mt-2 text-xs text-muted-foreground">Pull reads existing provider entries into the encrypted Vault without changing the provider. Send is a separate, manually reviewed create/override action. No provider deletion is available.</p>
      <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="Send variables provider">
        {(["Vercel","GitHub"] as const).map(provider=><button type="button" key={provider} role="tab" aria-selected={syncProvider===provider} className={syncProvider===provider?"button-primary":"button-secondary"} onClick={()=>setSyncProvider(provider)}>Send to {provider}</button>)}
      </div>
      <div className="mt-4">
        {syncProvider==="Vercel"?<VaultVercelSync session={session} records={records} onPersist={persist} onEdit={edit}/>:<VaultGithubSync session={session} records={records} onPersist={persist}/>}
      </div>
    </details>
    <details className="orbit-panel p-4">
      <summary className="cursor-pointer text-xs font-semibold">Advanced · Restore lost account connections</summary>
      <p className="mt-2 text-xs text-muted-foreground">Only needed if an older Vault import replaced the saved GitHub/Vercel account tokens. Normal imports now preserve them.</p>
      <label className="button-secondary cursor-pointer inline-flex items-center gap-2 mt-2"><Upload size={14}/> Restore account connections from encrypted backup
        <input type="file" className="sr-only" accept=".json,application/json" disabled={busy} onChange={e=>void restoreConnectionsFromBackup(e)}/></label>
    </details>
    <details className="orbit-panel p-3">
      <summary className="cursor-pointer text-xs font-semibold">Reference key library (optional — not saved credentials)</summary>
      <p className="mt-2 text-xs text-muted-foreground">These are examples from Vercel and GitHub. Expand only when you need a name that is not already in the saved keys above.</p>
      <VaultInventorySection records={records} onPersist={persist}/>
    </details>

  </section>;
}
