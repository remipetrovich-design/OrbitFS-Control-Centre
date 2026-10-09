import { useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Cloud, RefreshCw, ShieldCheck } from "lucide-react";
import type { VaultRecord } from "@/lib/vault-crypto";
import { bestVaultConnection } from "@/lib/vault-connections";
import { systemForProject, recordIdentity } from "@/lib/vault-schema";
import { groupVaultItems, vaultSystemLabel } from "@/lib/vault-grouping";
import { assessVercelVaultEntry, attachVercelVaultEntry, suggestUnsavedVercelKeys, addBlankVercelVaultEntry } from "@/lib/vault-vercel-selection";
import { planProductionKey, type ProductionPlan, type VercelEnvMeta } from "@/lib/vercel-sync-policy";
import {
  listVaultVercelProjects, inspectVaultVercelProduction,
  writeVaultVercelProduction, importVaultVercelConfig
} from "@/lib/vercel-vault.server";

type Account = "main" | "fallback";
type Project = { id:string; name:string };
type Review = {id:string; source:string; key:string; plan:ProductionPlan};
const DEFAULT_TEAMS:Record<Account,string> = {
  main:"team_W3fS0X03YCjNkD2BoqRj6Uld",
  fallback:"team_0fWVaLb24pyeeCRqqYu5G47K"
};
function isConnectionKey(name:string) { return /^VERCEL_(TOKEN|TEAM_ID)_(MAIN|FALLBACK)$/.test(name); }
function findConnection(records:VaultRecord[], key:string) {
  return bestVaultConnection(records,key);
}

function friendlySource(row:VaultRecord) {
  const origin = row.systems.join(" / ") || "Other";
  const target = row.vercelTargets?.map(item => item.connection + " / " + item.projectName).join(", ");
  return origin + " · " + row.service + (target ? " · Linked to: " + target : "");
}
export function VaultVercelSync({session,records,onPersist,onEdit}:{
  session:any; records:VaultRecord[]; onPersist:(rows:VaultRecord[])=>Promise<void>; onEdit:(row:VaultRecord)=>void;
}) {
  const [account,setAccount] = useState<Account>("main");
  const [teamInput,setTeamInput] = useState("");
  const [tokenInput,setTokenInput] = useState("");
  const [projects,setProjects] = useState<Project[]>([]);
  const [projectId,setProjectId] = useState("");
  const [envs,setEnvs] = useState<VercelEnvMeta[]>([]);
  const [inspected,setInspected] = useState(false);
  const [selected,setSelected] = useState<string[]>([]);
  const [keyQuery,setKeyQuery] = useState("");
  const [review,setReview] = useState<Review[]>([]);
  const [ack,setAck] = useState(false);
  const [busy,setBusy] = useState("");
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const tokenRow = findConnection(records,"VERCEL_TOKEN_"+account.toUpperCase());
  const teamRow = findConnection(records,"VERCEL_TEAM_ID_"+account.toUpperCase());
  const teamId = teamRow?.secret || DEFAULT_TEAMS[account];
  const project = projects.find(p=>p.id===projectId) || null;
  const entries=useMemo(()=>project?records.map(row=>({
    row,assessment:assessVercelVaultEntry(row,project.name,account)
  })).sort((a,b)=>{
    const priority={ready:0,attach:1,value:2,invalid:3,protected:4};
    return priority[a.assessment.status]-priority[b.assessment.status] || a.row.keyName.localeCompare(b.row.keyName);
  }):[],[records,project,account]);
  const visibleEntries=useMemo(()=>entries.filter(({row})=>{
    const term=keyQuery.trim().toLowerCase();
    return !term || [row.keyName,row.service,...row.systems,row.destinationSystem||"",row.purpose||""]
      .some(value=>value.toLowerCase().includes(term));
  }),[entries,keyQuery]);
  const groupedVisibleEntries=groupVaultItems(visibleEntries,item=>item.row);
  const eligible = useMemo(()=>entries.filter(entry=>entry.assessment.status==="ready").map(entry=>entry.row),[entries]);
  const missingReferences=useMemo(()=>project ? suggestUnsavedVercelKeys(records,project.name,inspected?envs.map(x=>x.key):[]) : [],[records,project,inspected,envs]);
  const availableConfigs = inspected ? envs.filter(row=>row.type !== "sensitive" && row.visibility === "config" && planProductionKey(envs,row.key).action==="replace") : [];
  const connectionStatus = tokenRow?.secret ? "Token saved in Vault · not yet verified" : "Not connected · add an account API token";
  function clearReview() {setReview([]);setAck(false);}
  function switchAccount(next:Account) {
    setAccount(next);setTeamInput("");setTokenInput("");setProjects([]);setProjectId("");setEnvs([]);
    setInspected(false);setSelected([]);setKeyQuery("");clearReview();setError("");setNotice("");
  }
  function connectionData() {
    if (!tokenRow?.secret || !teamId) throw new Error("Save this Vercel connection in the Vault first.");
    return {token:session.token,vercelToken:tokenRow.secret,teamId};
  }
  async function run(name:string, task:()=>Promise<void>) {
    setBusy(name);setError("");setNotice("");
    try {await task();}
    catch (err:any) {setError(String(err?.message||"Vercel operation failed."));}
    finally {setBusy("");}
  }
  async function saveConnection() {
    await run("save-connection",async()=>{
      const token = tokenInput.trim() || tokenRow?.secret || "";
      const team = teamInput.trim() || teamId;
      if (token.length<12) throw new Error("Enter a Vercel API token.");
      if (!/^team_[A-Za-z0-9]{8,64}$/.test(team)) throw new Error("Enter a valid Vercel team ID.");
      const changes = new Map([["VERCEL_TOKEN_"+account.toUpperCase(),token],["VERCEL_TEAM_ID_"+account.toUpperCase(),team]]);
      const seen = new Set<string>();
      const next = records.map(row=>{
        if (changes.has(row.keyName)) {
          seen.add(row.keyName);return {...row,secret:changes.get(row.keyName)!};
        }
        return row;
      });
      for (const [keyName,secret] of changes) if (!seen.has(keyName)) next.unshift({
        id:crypto.randomUUID(),systems:["Dev"],otherSystem:"",service:"Vercel",customService:"",keyName,secret,usedIn:[account],destinationSystem:"Vault connection",needsReview:false
      });
      await onPersist(next);setTokenInput("");setTeamInput("");setProjects([]);setProjectId("");setInspected(false);
      clearReview();setNotice("Connection saved encrypted in the Vault. No Vercel settings were changed.");
    });
  }
  async function loadProjects() {
    await run("projects",async()=>{
      const result = await listVaultVercelProjects({data:connectionData()});
      setProjects(result.projects);setProjectId("");setInspected(false);setEnvs([]);setSelected([]);clearReview();
      setNotice("Select a project to inspect its Production variables.");
    });
  }
  async function inspectProduction() {
    if (!project) return;
    await run("inspect",async()=>{
      const result=await inspectVaultVercelProduction({data:{...connectionData(),projectId:project.id}});
      setEnvs(result.envs);setInspected(true);clearReview();
      setNotice(result.envs.length+" Production environment variable records found. Values remain hidden.");
    });
  }
  function buildReview() {
    if (!project || !inspected) {setError("Inspect the selected project's Production variables first.");return;}
    const rows = eligible.filter(row=>selected.includes(row.id)).map(row=>{
      const key=row.keyName.trim();
      return {id:row.id,source:friendlySource(row),key,plan:planProductionKey(envs,key)};
    });
    if (!rows.length) {setError("Choose at least one Vault entry.");return;}
    if(rows.some(x=>records.find(r=>r.id===x.id)?.keyName!==x.key)) {setError("Destination name must exactly match the verified Vault name. Edit the entry itself first.");return;}
    const duplicateKeys=new Set<string>();
    for(const item of rows) {
      if (duplicateKeys.has(item.key)) {setError("Two selected Vault entries target "+item.key+". Choose one source for this Production variable, or give them different destination names.");return;}
      duplicateKeys.add(item.key);
    }
    setError("");setNotice("");setReview(rows);setAck(false);
  }
  async function applyReviewed() {
    if (!project || !ack || !review.length || review.some(row=>row.plan.action==="blocked")) return;
    const sameProject=project;
    await run("apply",async()=>{
      let applied=0;
      let failure="";
      for (const item of review) {
        const source=records.find(row=>row.id===item.id);
        if (!source || !source.secret || item.plan.action==="blocked") {failure="A reviewed Vault entry became unavailable.";break;}
        try {
          await writeVaultVercelProduction({data:{
            ...connectionData(),projectId:sameProject.id,key:item.key,value:source.secret,
            action:item.plan.action,expectedId:item.plan.expectedId,expectedUpdatedAt:item.plan.expectedUpdatedAt
          }});
          applied++;
        } catch(err:any) { failure=item.key+": "+String(err?.message||"Vercel rejected the update.");break; }
      }
      // Invalidate the snapshot regardless of success. Do not report partial writes as full success.
      setInspected(false);setEnvs([]);clearReview();setSelected([]);
      if (failure) throw new Error(applied+" of "+review.length+" variables accepted. Stopped on "+failure+" Check Vercel Production and compare again before retrying.");
      const updated=records.map(row=>{
        const appliedItem=review.find(item=>item.id===row.id);
        if(!appliedItem)return row;
        const existing=(row.vercelTargets||[]).filter(t=>!(t.connection===account && t.projectId===sameProject.id));
        return {...row,vercelTargets:[...existing,{connection:account,projectId:sameProject.id,projectName:sameProject.name,keyName:appliedItem.key}]};
      });
      try {await onPersist(updated);}
      catch {throw new Error("Vercel accepted "+applied+" changes, but saving Vault target labels failed. Review Production; do not repeat the sync until checked.");}
      setNotice(applied+" Production variables accepted and presence-verified in "+sameProject.name+". Secret values cannot be read back for equality verification. No deployment triggered.");
    });
  }
  async function attachEntry(row:VaultRecord) {
    if(!project)return;
    const dest=project.name;
    await run("attach-"+row.id,async()=>{
      const updated=attachVercelVaultEntry(records,row,dest,account,crypto.randomUUID());
      await onPersist(updated);
      setSelected([]);clearReview();
      setNotice(row.keyName+" attached to "+account+" / "+dest+" in the Vault. Original record and its value kept. No Vercel variables changed.");
    });
  }

  async function addReferenceKey(keyName:string) {
    if(!project)return;
    const destination=project.name;
    await run("reference-"+keyName,async()=>{
      const updated=addBlankVercelVaultEntry(records,keyName,destination,account,crypto.randomUUID());
      await onPersist(updated);
      setKeyQuery(keyName);
      setSelected([]);clearReview();
      setNotice(keyName+" added to Vault for "+destination+" with a blank value. Choose Edit key value to provide the real credential.");
    });
  }

  async function importConfig(row:VercelEnvMeta) {
    if (!project) return;
    const target=project;
    await run("import-"+row.id,async()=>{
      const fetched=await importVaultVercelConfig({data:{
        ...connectionData(),projectId:target.id,envId:row.id,expectedUpdatedAt:row.updatedAt
      }});
      const added:VaultRecord={
        id:crypto.randomUUID(),systems:[systemForProject(target.name)],otherSystem:"",
        service:"Vercel",customService:"",usedIn:[account],destinationSystem:target.name,needsReview:false,
        keyName:fetched.key,secret:fetched.value,
        vercelTargets:[{connection:account,projectId:target.id,projectName:target.name,keyName:fetched.key}]
      };
      // Never deduplicate by variable name: the same name may exist in Billing, License Manager and multiple projects.
      await onPersist([added,...records]);
      clearReview();
      setNotice(fetched.key+" imported from "+target.name+" Production as a separate encrypted Vault entry.");
    });
  }
  async function importNamesOnly(){
    if(!project || !inspected)throw new Error("Compare a Production project first.");
    await run("import-names",async()=>{
      const known=new Set(records.map(recordIdentity));
      const additions:VaultRecord[]=[];
      for(const item of envs){
        if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(item.key) || isConnectionKey(item.key))continue;
        const record:VaultRecord={
          id:crypto.randomUUID(),systems:[systemForProject(project.name)],otherSystem:"",
          service:"Vercel",customService:"",keyName:item.key,secret:"",usedIn:[account],
          destinationSystem:project.name,needsReview:false,
          vercelTargets:[{connection:account,projectId:project.id,projectName:project.name,keyName:item.key}]
        };
        if(!known.has(recordIdentity(record))){additions.push(record);known.add(recordIdentity(record));}
      }
      if(additions.length)await onPersist([...additions,...records]);
      setNotice(additions.length+" exact Production key names added as blank encrypted Vault records. Protected values were not accessed. No Vercel variables were changed.");
    });
  }
  return <section className="orbit-panel p-4 space-y-4">
    <div className="orbit-section-head"><span className="orbit-section-icon"><Cloud size={15}/></span><div>
      <h2>Vercel Production sync</h2><p>Connect Main or Fallback · compare first · manual approval · Production only</p>
    </div></div>
    <div className="flex gap-2 flex-wrap">{(["main","fallback"] as Account[]).map(value=>
      <button type="button" key={value} disabled={!!busy} className={account===value?"button-primary":"button-secondary"}
        onClick={()=>switchAccount(value)}>{value==="main"?"Main Vercel":"Fallback Vercel"}</button>)}</div>
    <div className="grid gap-3 md:grid-cols-2">
      <label className="block text-xs font-medium">Vercel team ID<input className="control mt-1 font-mono" value={teamInput}
        placeholder={teamId} onChange={e=>setTeamInput(e.target.value)} autoComplete="off"/></label>
      <label className="block text-xs font-medium">Vercel API token {tokenRow?"(saved in Vault)":"(required)"}
        <input type="password" className="control mt-1 font-mono" value={tokenInput}
          onChange={e=>setTokenInput(e.target.value)} placeholder={tokenRow?"Leave blank to keep saved token":"Paste account-scoped token"} autoComplete="off"/></label>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="button-secondary" disabled={!!busy} onClick={()=>void saveConnection()}>
        <ShieldCheck size={14}/> Save encrypted connection</button>
      <button type="button" className="button-secondary" disabled={!!busy || !tokenRow}
        onClick={()=>void loadProjects()}><RefreshCw size={14}/> Load projects</button>
      <span className="text-xs text-muted-foreground">{connectionStatus} · Production only</span>
    </div>
    {project&&<p className="text-xs text-muted-foreground">All saved Vault keys appear after Compare Production. Unassigned keys can be attached to this project without renaming them or altering the original.</p>}
    {projects.length>0&&<div className="flex flex-wrap items-end gap-2">
      <label className="block text-xs font-medium flex-1 min-w-48">Project<select className="control mt-1" value={projectId}
        onChange={e=>{setProjectId(e.target.value);setInspected(false);setEnvs([]);setSelected([]);setKeyQuery("");clearReview();}}>
        <option value="">Choose a Vercel project</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <button className="button-secondary" type="button" disabled={!project || !!busy}
        onClick={()=>void inspectProduction()}><RefreshCw size={14}/> Compare Production</button>
    </div>}
    {error&&<p role="alert" className="text-xs text-red-300">{error}</p>}
    {notice&&<p role="status" className="text-xs text-muted-foreground">{notice}</p>}
    {inspected&&project&&<div className="space-y-3">
      <div className="border-t pt-3 flex items-center justify-between">
        <div><p className="text-sm font-semibold">Vault → {project.name}</p>
          <p className="text-xs text-muted-foreground">{envs.length} existing Production variables · select exact Vault records below</p></div>
        <span className="text-xs rounded border px-2 py-1">Production only</span>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <button type="button" className="button-secondary" disabled={!!busy} onClick={()=>void importNamesOnly()}>
          <ArrowDownToLine size={14}/> Import exact names only (blank values)
        </button>
        <span className="text-xs text-muted-foreground">Reads project metadata, never secrets; also works for Sensitive variables.</span>
      </div>
      {missingReferences.length>0&&<details className="rounded border p-3 space-y-2">
        <summary className="cursor-pointer text-xs font-semibold">{vaultSystemLabel(systemForProject(project.name))} · {account==="main"?"Main":"Fallback"} · {missingReferences.length} reference names not yet saved (optional)</summary>
        <p className="text-xs text-muted-foreground mt-2">These names come from the Main Vercel inventory or this project's existing Production variables. They are references only, not saved credentials. Adding one creates a blank value in the encrypted Vault; it does not change Vercel.</p>
        <div className="max-h-52 overflow-auto mt-2 space-y-1">{missingReferences.map(name=>
          <div key={name} className="flex items-center justify-between gap-2 border-b py-2">
            <span className="font-mono text-xs break-all">{name}</span>
            <button type="button" className="button-secondary shrink-0" disabled={!!busy}
              onClick={()=>void addReferenceKey(name)}>Add to Vault</button>
          </div>
        )}</div>
      </details>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="text-xs font-medium flex-1 min-w-48">Find a saved key across all systems
          <input className="control mt-1" type="search" placeholder="Search key name, system or purpose…" value={keyQuery}
            onChange={e=>setKeyQuery(e.target.value)} />
        </label>
        <span className="text-xs text-muted-foreground">{entries.length} saved · {eligible.length} ready · {entries.filter(e=>e.assessment.status==="attach").length} need attaching · {entries.filter(e=>e.assessment.status==="value").length} need a real value</span>
      </div>
      <div className="max-h-[34rem] overflow-auto space-y-3">
        {groupedVisibleEntries.map(group=><details
          key={group.system+"-"+(keyQuery.trim()?"search":"browse")}
          open={Boolean(keyQuery.trim())||group.system===systemForProject(project.name)}
          className="rounded-lg border">
          <summary className="cursor-pointer flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-sm font-semibold">
            <span>{group.label}</span><span className="text-xs text-muted-foreground">{group.count} saved keys</span>
          </summary>
          <div className="border-t p-2 space-y-2">
            {group.sections.map(section=><details
              key={group.system+"-"+section.mode+"-"+(keyQuery.trim()?"search":"browse")}
              open={Boolean(keyQuery.trim())||group.system===systemForProject(project.name)}
              className="rounded-md border">
              <summary className="cursor-pointer flex items-center justify-between gap-2 px-3 py-2 text-xs font-semibold">
                <span>{section.label}</span><span className="text-muted-foreground">{section.items.length} keys</span>
              </summary>
              <div className="border-t p-2 space-y-2">{section.items.map(({row,assessment})=>{
        const plan=planProductionKey(envs,row.keyName.trim());
        const ready=assessment.status==="ready" && plan.action!=="blocked";
        const message=assessment.status==="ready"&&plan.action==="blocked"?"Vercel restriction: "+plan.reason:assessment.reason;
        return <div key={row.id} className="border rounded p-3 space-y-2">
          <div className="flex gap-3 items-start justify-between flex-wrap">
            <label className="flex gap-2 items-start text-xs min-w-0 flex-1">
              <input type="checkbox" disabled={!ready||!!busy} checked={selected.includes(row.id)}
                onChange={e=>{setSelected(prev=>e.target.checked?[...prev,row.id]:prev.filter(id=>id!==row.id));clearReview();}}/>
              <span className="min-w-0">
                <strong className="font-mono break-all">{row.keyName}</strong>
                <span className="block text-muted-foreground">Service: {row.service} · System: {row.systems.join(" / ")}</span>
                <span className="block text-muted-foreground">Used in: {(row.usedIn||[]).join(" / ")||"Not set"} · Destination: {row.destinationSystem||"Unassigned"}</span>
              </span>
            </label>
            {assessment.status==="attach"&&<button type="button" className="button-secondary" disabled={!!busy}
              onClick={()=>void attachEntry(row)}>Attach to this project</button>}
            {assessment.status==="value"&&<button type="button" className="button-secondary" disabled={!!busy}
              onClick={()=>onEdit(row)}>Edit key value</button>}
            {ready&&<span className="text-xs text-emerald-400">Ready to select</span>}
          </div>
          <p className="text-xs text-muted-foreground">{message}</p>
          {selected.includes(row.id)&&<div className="ml-5 flex items-center flex-wrap gap-2 text-xs">
            <span className="font-mono">Vercel key: {row.keyName}</span>
            <span className="text-muted-foreground">{plan.action==="create"?"New Production key":plan.action==="replace"?"Existing Production key":plan.reason}</span>
          </div>}
        </div>;
      })}</div>
            </details>)}
          </div>
        </details>)}
        {!groupedVisibleEntries.length&&<p className="p-3 text-xs text-muted-foreground">No saved keys match this search. Clear the search to see all systems, or add a reference name above.</p>}
      </div>
      <button type="button" className="button-secondary" disabled={!!busy || !selected.length}
        onClick={buildReview}><ArrowUpFromLine size={14}/> Review {selected.length} selected changes</button>
      {review.length>0&&<div className="border rounded p-3 space-y-2">
        <strong className="text-sm">Review Production changes</strong>
        {review.map(row=><p className="text-xs border-b pb-1" key={row.id}>
          <span className="font-mono">{row.key}</span> · {row.plan.action==="create"?"Create":row.plan.action==="replace"?"Replace existing":"BLOCKED"}
          <span className="block text-muted-foreground">Source: {row.source}</span>
          {row.plan.action==="blocked"&&<span className="block text-red-300">{row.plan.reason}</span>}
        </p>)}
        <p className="text-xs text-muted-foreground">Existing Production-only values will be replaced. No rollback is automatic and secrets cannot be verified by reading them back.</p>
        <label className="flex items-center gap-2 text-xs font-medium"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>
          I checked each destination key and approve the Production changes.</label>
        <button type="button" className="button-primary" disabled={!!busy || !ack || review.some(r=>r.plan.action==="blocked")}
          onClick={()=>void applyReviewed()}>Apply {review.length} reviewed Production changes</button>
      </div>}
      <div className="border-t pt-3 space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold"><ArrowDownToLine size={15}/> Vercel → Vault</div>
        <p className="text-xs text-muted-foreground">Import readable Config values as separate Vault records. Sensitive and Secret values cannot be retrieved from Vercel.</p>
        <div className="max-h-44 overflow-auto">{availableConfigs.map(row=>
          <div key={row.id} className="flex justify-between items-center gap-2 border-b py-2 text-xs">
            <div><strong className="font-mono">{row.key}</strong><span className="block text-muted-foreground">From: {account} / {project.name} / Production</span></div>
            <button type="button" className="button-secondary" disabled={!!busy} onClick={()=>void importConfig(row)}>Import separate entry</button>
          </div>)}
          {!availableConfigs.length&&<p className="text-xs text-muted-foreground">No readable Production-only Config values available to import.</p>}
        </div>
      </div>
    </div>}
  </section>;
}
