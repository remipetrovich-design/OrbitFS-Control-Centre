import { useEffect, useMemo, useState } from "react";
import { KeyRound, Lock, Plus, Search, ShieldCheck, Trash2, Copy, Pencil, X, Eye, EyeOff, Upload, Download } from "lucide-react";
import { getVaultEnvelope, saveVaultEnvelope } from "@/lib/vault.server";
import { VaultVercelSync } from "@/components/vault-vercel-sync";
import { VaultGithubSync } from "@/components/vault-github-sync";
import { VaultInventorySection } from "@/components/vault-inventory-section";
import { VaultSetupGuide } from "@/components/vault-setup-guide";
import { VAULT_SYSTEMS, VAULT_SERVICES, normalizeVaultRecord, recordIdentity, type VaultMode } from "@/lib/vault-schema";
import { groupVaultItems } from "@/lib/vault-grouping";
import { createEnvelope, decryptEnvelope, type VaultEnvelope, type VaultRecord } from "@/lib/vault-crypto";
import { preserveVaultConnections, isVaultConnection, bestVaultConnection, usableConnectionValue } from "@/lib/vault-connections";

const SYSTEMS=[...VAULT_SYSTEMS];
const IMPORT_TEMPLATE={format:"orbitfs-vault-import-v2",entries:[{service:"Vercel",system:"Billing",keyName:"BILLING_API_TOKEN",keyValue:"change-me",usedIn:["main"],destinationSystem:"v2-billing-store"},{service:"GitHub",system:"Billing",keyName:"VERCEL_TOKEN",keyValue:"change-me",usedIn:["fallback"],destinationSystem:"remipetrovich-design/OrbitFS-Billing-Shopfront"}]};
const SERVICES=[...VAULT_SERVICES];

export function VaultWorkspace({session}:{session:any}){
  const [phase,setPhase]=useState<"loading"|"setup"|"locked"|"open">("loading");
  const [envelope,setEnvelope]=useState<VaultEnvelope|null>(null);
  const [password,setPassword]=useState("");
  const [confirm,setConfirm]=useState("");
  const [activePassword,setActivePassword]=useState("");
  const [records,setRecords]=useState<VaultRecord[]>([]);
  const [query,setQuery]=useState("");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const [visible,setVisible]=useState<string[]>([]);
  const [draftVisible,setDraftVisible]=useState(false);
  const [importRows,setImportRows]=useState<VaultRecord[]>([]);
  const [importMode,setImportMode]=useState<"skip"|"override"|"replace-all">("skip");
  const [replaceApproved,setReplaceApproved]=useState(false);
  const [editing,setEditing]=useState<VaultRecord|null>(null);
  const [pendingMigration,setPendingMigration]=useState<VaultRecord[]|null>(null);
  const [draft,setDraft]=useState({system:"Billing",otherSystem:"",service:"Vercel",customService:"",keyName:"",secret:"",purpose:"",usedIn:["main"] as VaultMode[],destinationSystem:""});
  const blankDraft=()=>({system:"Billing",otherSystem:"",service:"Vercel",customService:"",keyName:"",secret:"",purpose:"",usedIn:["main"] as VaultMode[],destinationSystem:""});

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
      if(!draft.destinationSystem.trim())throw new Error("Choose the exact destination project or repository before saving.");
      if(!draft.usedIn.length)throw new Error("Select Main and/or Fallback.");
      if(!system||!service||!keyName)throw new Error("System, service and key name are required.");
      const record:VaultRecord={id:editing?.id||crypto.randomUUID(),systems:[system],otherSystem:system==="Other"?draft.otherSystem.trim():"",service,customService:service==="Other"?draft.customService.trim():"",keyName,secret:draft.secret,purpose:draft.purpose,usedIn:draft.usedIn,destinationSystem:draft.destinationSystem.trim(),needsReview:false,legacyKeyName:editing?.legacyKeyName,vercelTargets:editing?.vercelTargets,githubTargets:editing?.githubTargets};
      const next=editing?records.map(row=>row.id===editing.id?record:row):[record,...records];
      await persist(next);setPendingMigration(null);setEditing(null);setDraft(blankDraft());setNotice(editing?"Vault entry updated.":"Vault entry saved.");
    }catch(x:any){setError(x.message||"Unable to save Vault entry.")}
    finally{setBusy(false)}
  }

  function downloadEncryptedBackup(){
    if(!envelope){setError("Encrypted Vault is unavailable.");return;}
    const blob=new Blob([JSON.stringify({format:"orbitfs-vault-encrypted-backup-v1",envelope},null,2)+"\n"],{type:"application/json"});
    const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="orbitfs-vault-encrypted-backup.json";a.click();URL.revokeObjectURL(url);
  }

  function downloadTemplate(){
    const blob=new Blob([JSON.stringify(IMPORT_TEMPLATE,null,2)+"\n"],{type:"application/json"});
    const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download="orbitfs-vault-import-template.json";link.click();URL.revokeObjectURL(url);
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
    setError("");setNotice("");setImportRows([]);setReplaceApproved(false);
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
          destinationSystem:modern?String(item.destinationSystem||""):""
        };
        return normalizeVaultRecord(record);
      });
      const seen=new Set<string>();
      for(const row of rows){
        const id=recordIdentity(row);
        if(seen.has(id))throw new Error("Duplicate same-system destination in import: "+row.keyName);
        seen.add(id);
      }
      setImportRows(rows);
    }catch(x:any){setError(x.message||"Unable to read import file.")}
  }

  async function confirmImport(){
    if(importMode==="replace-all"&&!replaceApproved){setError("Export the old Vault as a backup and confirm the full replacement before proceeding.");return;}
    setBusy(true);setError("");
    try{
      const existing=new Map(records.map(row=>[recordIdentity(row),row]));
      const additions=importRows.filter(row=>!existing.has(recordIdentity(row)));
      const overrides=importMode==="override"?importRows.filter(row=>existing.has(recordIdentity(row))):[];
      const replacements=new Map(overrides.map(row=>[recordIdentity(row),row]));
      if(importMode!=="replace-all"&&!additions.length&&!overrides.length)throw new Error("Nothing new to import.");
      const next=records.map(row=>{
        const replacement=replacements.get(recordIdentity(row));
        return replacement?{...replacement,id:row.id,vercelTargets:row.vercelTargets,githubTargets:row.githubTargets}:row;
      });
      const replacement=preserveVaultConnections(records,importMode==="replace-all"?importRows:[...additions,...next]);
      await persist(replacement);setPendingMigration(null);setImportRows([]);setReplaceApproved(false);
      setNotice(importMode==="replace-all"?"Other keys replaced; saved GitHub/Vercel account connections protected. "+importRows.length+" imported entries processed.":"Added "+additions.length+", replaced "+overrides.length+", skipped "+(importRows.length-additions.length-overrides.length)+".");
    }catch(x:any){setError(x.message||"Import failed.")}finally{setBusy(false)}
  }

  async function remove(id:string){
    if(!window.confirm("Remove this Vault entry?"))return;
    setBusy(true);setError("");
    try{await persist(records.filter(row=>row.id!==id));setNotice("Vault entry removed.")}
    catch(x:any){setError(x.message||"Unable to remove Vault entry.")}
    finally{setBusy(false)}
  }

  function edit(row:VaultRecord){
    const normalized=normalizeVaultRecord(row);
    setEditing(row);setDraft({
      system:normalized.systems[0]||"Other",otherSystem:normalized.otherSystem||"",
      service:normalized.service,customService:normalized.customService||"",
      keyName:normalized.keyName,secret:normalized.secret,purpose:normalized.purpose||"",
      usedIn:normalized.usedIn||[],destinationSystem:normalized.destinationSystem||""
    });
    requestAnimationFrame(()=>document.getElementById("vault-entry-editor")?.scrollIntoView({behavior:"smooth",block:"start"}));
  }

  const filtered=useMemo(()=>{
    const q=query.trim().toLowerCase();
    return records.filter(row=>!q||[row.systems[0],row.service,row.keyName,row.destinationSystem,...(row.usedIn||[])].some(v=>String(v||"").toLowerCase().includes(q)));
  },[records,query]);
  const groupedEntries=groupVaultItems(filtered,row=>row);
  const needingReview=records.filter(row=>row.needsReview||!row.destinationSystem||!row.usedIn?.length);

  if(phase!=="open")return <section className="space-y-4">
    <div className="orbit-reference-page-head"><p>SECURE OPERATIONS</p><h1>Vault</h1><span>Persistent encrypted credentials with a separate Vault unlock.</span></div>
    <div className="orbit-panel p-4"><div className="orbit-section-head"><span className="orbit-section-icon"><ShieldCheck size={15}/></span><div><h2>Vercel Production connections</h2><p>Main and Fallback account sync is available after you unlock the Vault. No Vercel variables change until you review and approve them.</p></div></div></div>
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
    <div className="orbit-reference-head"><div><p className="orbit-reference-kicker">SECURE OPERATIONS</p><h1>Vault</h1><span>Central encrypted credentials · {records.length} {records.length===1?"entry":"entries"}</span></div><div className="orbit-reference-actions"><button className="button-secondary" onClick={lock}><Lock size={14}/> Lock Vault</button></div></div>
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
    <VaultSetupGuide session={session} records={records} onPersist={persist} onEdit={edit}/>
    <section className="orbit-panel overflow-hidden">
      <div className="border-b p-4"><h2 className="text-sm font-semibold mb-1">Saved keys · by system and account</h2><p className="text-xs text-muted-foreground mb-3">Open a system, then Main or Fallback. Entries used in both accounts appear in both groups. Search expands matching groups.</p><div className="relative"><Search size={14} className="absolute left-3 top-3 text-muted-foreground"/><input className="control pl-9" placeholder="Search system, service or key name…" value={query} onChange={e=>setQuery(e.target.value)}/></div></div>
      <div className="p-3 space-y-3">
        {groupedEntries.map(group=><details key={group.system+"-"+(query.trim()?"search":"browse")} open={Boolean(query.trim())||group.system==="Billing"} className="rounded-lg border">
          <summary className="cursor-pointer flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm font-semibold">
            <span>{group.label}</span><span className="text-xs text-muted-foreground">{group.count} saved keys</span>
          </summary>
          <div className="border-t p-3 space-y-2">
            {group.sections.map(section=><details key={group.system+"-"+section.mode+"-"+(query.trim()?"search":"browse")} open={Boolean(query.trim())||section.mode==="main"} className="rounded-md border">
              <summary className="cursor-pointer flex justify-between items-center gap-2 px-3 py-2 text-xs font-semibold">
                <span>{section.label}</span><span className="text-muted-foreground">{section.items.length} keys</span>
              </summary>
              <div className="border-t">{section.items.map(row=><div key={row.id} className="border-b p-4 last:border-b-0"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="font-mono text-xs font-semibold break-all">{row.keyName}</p><p className="mt-1 text-[10px] text-muted-foreground">From: {row.systems.join(" / ")} · {row.service}{row.vercelTargets?.length?` · Linked to: ${row.vercelTargets.map(target=>target.connection+" / "+target.projectName).join(", ")}`:""}</p>{row.purpose&&<p className="mt-1 text-xs text-muted-foreground">{row.purpose}</p>}<p className="mt-1 text-xs"><strong>Used in:</strong> {(row.usedIn||[]).map(m=>m==="main"?"Main":"Fallback").join(" / ")||"Needs review"} · <strong>Destination:</strong> {row.destinationSystem||"Not assigned"} {row.legacyKeyName&&<span className="block text-amber-500">Legacy key: {row.legacyKeyName} → {row.keyName}</span>}{row.needsReview&&<span className="block text-amber-500">Unverified legacy key/destination · edit before syncing</span>}</p><p className="mt-2 font-mono text-xs break-all text-muted-foreground">{visible.includes(row.id)?(row.secret||"(blank)"):(row.secret?"••••••••••••":"(blank)")}</p></div><div className="flex gap-1"><button type="button" className="icon-button" title={visible.includes(row.id)?"Hide secret":"Show secret"} aria-label={visible.includes(row.id)?"Hide secret":"Show secret"} onClick={()=>setVisible(current=>current.includes(row.id)?current.filter(id=>id!==row.id):[...current,row.id])}>{visible.includes(row.id)?<EyeOff size={14}/>:<Eye size={14}/>}</button><button type="button" className="icon-button" title="Copy secret" onClick={()=>void navigator.clipboard.writeText(row.secret)}><Copy size={14}/></button><button className="icon-button" title="Edit" onClick={()=>edit(row)}><Pencil size={14}/></button><button className="icon-button" title="Remove" onClick={()=>void remove(row.id)}><Trash2 size={14}/></button></div></div></div>)}</div>
            </details>)}
          </div>
        </details>)}
        {!groupedEntries.length&&<div className="p-8 text-center text-xs text-muted-foreground">{records.length?"No Vault entries match your search.":"No Vault entries yet."}</div>}
      </div>
    </section>
    <form id="vault-entry-editor" onSubmit={save} className="orbit-panel p-4">
      <div className="orbit-section-head"><span className="orbit-section-icon"><Plus size={15}/></span><div><h2>{editing?"Edit saved key":"Add a missing key"}</h2><p>Values are encrypted before saving. A blank value is allowed as an inventory reminder and cannot be pushed to Production.</p></div></div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="block text-xs font-medium">Service<select className="control mt-1" value={draft.service} onChange={e=>setDraft({...draft,service:e.target.value})}>{SERVICES.map(x=><option key={x}>{x}</option>)}</select></label>
        <label className="block text-xs font-medium">System<select className="control mt-1" value={draft.system} onChange={e=>setDraft({...draft,system:e.target.value})}>{SYSTEMS.map(x=><option key={x}>{x}</option>)}</select></label>
        {draft.service==="Other"&&<label className="block text-xs font-medium">Other service<input className="control mt-1" value={draft.customService} onChange={e=>setDraft({...draft,customService:e.target.value})}/></label>}
        {draft.system==="Other"&&<label className="block text-xs font-medium">Other system<input className="control mt-1" value={draft.otherSystem} onChange={e=>setDraft({...draft,otherSystem:e.target.value})}/></label>}
        <label className="block text-xs font-medium">Key name · exact<input className="control mt-1 font-mono" autoComplete="off" value={draft.keyName} onChange={e=>setDraft({...draft,keyName:e.target.value})} placeholder="e.g. BILLING_API_TOKEN"/></label>
        <label className="block text-xs font-medium">Key value<input className="control mt-1 font-mono" type={draftVisible?"text":"password"} autoComplete="off" value={draft.secret} onChange={e=>setDraft({...draft,secret:e.target.value})}/><button type="button" className="button-secondary mt-1" onClick={()=>setDraftVisible(v=>!v)}>{draftVisible?"Hide value":"Show value"}</button></label>
        <label className="block text-xs font-medium md:col-span-2">What this key is for<input className="control mt-1" value={draft.purpose} onChange={e=>setDraft({...draft,purpose:e.target.value})} placeholder="e.g. Billing API access to License Manager"/></label>
        <fieldset className="text-xs font-medium"><legend>Used in</legend><div className="flex gap-4 mt-2">{(["main","fallback"] as VaultMode[]).map(mode=><label className="flex gap-2 items-center" key={mode}><input type="checkbox" checked={draft.usedIn.includes(mode)} onChange={e=>setDraft({...draft,usedIn:e.target.checked?[...draft.usedIn,mode]:draft.usedIn.filter(x=>x!==mode)})}/>{mode==="main"?"Main":"Fallback"}</label>)}</div></fieldset>
        <label className="block text-xs font-medium">Destination system · exact Vercel project or GitHub repository
          <input className="control mt-1 font-mono" list="vault-destination-suggestions" autoComplete="off" value={draft.destinationSystem} onChange={e=>setDraft({...draft,destinationSystem:e.target.value})} placeholder="e.g. v2-billing-store"/>
          <datalist id="vault-destination-suggestions">
            {["custom-licence-manager","v2-billing-store","base-deploy-panel","orbitfs-license-fallback","orbitfs-billing-fallback","orbitfs-dev-panel-fallback",
              "lucaskerim123/V2_Billing_Store","remipetrovich-design/OrbitFS-Billing-Shopfront","lucaskerim123/V1-vercel-base","lucaskerim123/V1-vercel-engine",
              "remipetrovich-design/OrbitFS-Base-System","remipetrovich-design/OrbitFS_Engine"].map(x=><option key={x} value={x}/>)}
          </datalist>
        </label>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Key name is the actual environment variable name, not a Vault label. A key may exist more than once if its System, mode or destination differs. Sync never automatically adds/removes a prefix.</p>
      <div className="mt-4 flex gap-2"><button className="button-primary" disabled={busy}>{busy?"Saving…":editing?"Save changes":"Add to Vault"}</button>{editing&&<button type="button" className="button-secondary" onClick={()=>{setEditing(null);setDraft(blankDraft())}}><X size={14}/> Cancel</button>}</div>
    </form>
    <section className="orbit-panel p-4 space-y-3">
      <div className="orbit-section-head"><span className="orbit-section-icon"><Upload size={15}/></span><div><h2>Import your JSON file</h2><p>Accepts old v1 and new v2 JSON. Matching is by Service + System + exact key + mode + destination, not just the key name. Credentials remain encrypted.</p></div></div>
      <div className="flex flex-wrap gap-2"><button type="button" className="button-secondary" onClick={downloadTemplate}><Download size={14}/> Download JSON template</button><label className="button-secondary cursor-pointer"><Upload size={14}/> Choose JSON file<input className="sr-only" type="file" accept=".json,application/json" onChange={e=>void prepareImport(e)}/></label></div>
      {importRows.length>0&&<div className="space-y-2"><p className="text-xs">{importRows.length} entries ready to import. Review names below; secret values stay hidden.</p><div className="max-h-40 overflow-auto text-xs">{importRows.map(row=><p key={row.id} className="border-b py-1 font-mono">{row.service} / {row.systems[0]} / {row.keyName} → {row.destinationSystem||"Unassigned"}</p>)}</div><fieldset className="space-y-2 text-xs"><legend className="font-semibold">When an entry already exists</legend><label className="flex items-center gap-2"><input type="radio" name="vault-import-mode" checked={importMode==="skip"} onChange={()=>setImportMode("skip")}/> Skip existing (keep saved secrets)</label><label className="flex items-center gap-2"><input type="radio" name="vault-import-mode" checked={importMode==="override"} onChange={()=>setImportMode("override")}/> Override existing (replace saved secrets)</label><label className="flex items-center gap-2"><input type="radio" name="vault-import-mode" checked={importMode==="replace-all"} onChange={()=>{setImportMode("replace-all");setReplaceApproved(false)}}/> Replace old keys with this JSON (keep GitHub/Vercel account connections)</label></fieldset><p className="text-xs text-muted-foreground">{importMode==="replace-all"?`All existing non-connection Vault entries will be replaced with ${importRows.length} imported entries. Existing GitHub/Vercel account connections are preserved.`:`${importRows.filter(row=>records.some(saved=>recordIdentity(saved)===recordIdentity(row))).length} matching entries will be ${importMode==="skip"?"skipped":"overwritten"}.`}</p>{importMode==="replace-all"&&<div className="space-y-2 rounded border p-3"><p className="text-xs">Back up before replacing. GitHub/Vercel connections are preserved, but other keys may be replaced and provider secrets generally cannot be read back.</p><button className="button-secondary" type="button" onClick={downloadEncryptedBackup}><Download size={14}/> Export encrypted old Vault backup</button><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={replaceApproved} onChange={e=>setReplaceApproved(e.target.checked)}/> I approve replacing old non-connection entries. My GitHub and Vercel account connections must remain intact.</label></div>}<div className="flex gap-2"><button type="button" className="button-primary" disabled={busy||(importMode==="replace-all"&&!replaceApproved)} onClick={()=>void confirmImport()}>{importMode==="replace-all"?"Replace non-connection keys":"Import entries"}</button><button type="button" className="button-secondary" onClick={()=>setImportRows([])}>Cancel</button></div></div>}
    </section>
    <details className="orbit-panel p-4" aria-label="Vercel Production sync">
      <summary className="cursor-pointer font-semibold">2 · Vercel — send keys to Production projects (open only when needed)</summary>
      <p className="mt-2 text-xs text-muted-foreground">Use one Vercel account at a time. Main and Fallback have separate projects. Select the relevant service, compare before writing, and skip unrelated keys.</p>
      <div className="mt-3"><VaultVercelSync session={session} records={records} onPersist={persist} onEdit={edit}/></div>
    </details>
    <details className="orbit-panel p-4" aria-label="GitHub Actions sync">
      <summary className="cursor-pointer font-semibold">3 · GitHub — send release/deployment settings to repositories (open only when needed)</summary>
      <p className="mt-2 text-xs text-muted-foreground">One GitHub token per account. Select repository secrets for release workflows or Production environment secrets for service deployment workflows. Do not copy the GitHub account connection token into a workflow.</p>
      <div className="mt-3"><VaultGithubSync session={session} records={records} onPersist={persist}/></div>
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
