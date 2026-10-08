import { useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Cloud, RefreshCw, ShieldCheck } from "lucide-react";
import type { VaultRecord } from "@/lib/vault-crypto";
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
const PLACEHOLDER = /^(REPLACE_WITH_SECRET|YOUR_|replace-with|your-|placeholder|todo\b)/i;
const labelOf = (record:VaultRecord) => record.systems.join(" / ") + " · " + record.service;
function isConnectionKey(name:string) { return /^VERCEL_(TOKEN|TEAM_ID)_(MAIN|FALLBACK)$/.test(name); }
function findConnection(records:VaultRecord[], key:string) {
  return records.find(record => record.systems.includes("Vercel") && record.service === "Deployment" && record.keyName === key);
}
function suggestedDestination(row:VaultRecord, project:Project) {
  const scope = project.name.toLowerCase();
  const prefix = scope.includes("licen") ? "LM_" : scope.includes("billing") ? "BILLING_" : scope.includes("dev-panel") || scope.includes("deploy-panel") ? "DEV_" : "";
  // BILLING_API_TOKEN is already its real environment name, not API_TOKEN.
  if (prefix === "BILLING_" && row.keyName === "BILLING_API_TOKEN") return row.keyName;
  return prefix && row.keyName.startsWith(prefix) ? row.keyName.slice(prefix.length) : row.keyName;
}
function friendlySource(row:VaultRecord) {
  const origin = row.systems.join(" / ") || "Other";
  const target = row.vercelTargets?.map(item => item.connection + " / " + item.projectName).join(", ");
  return origin + " · " + row.service + (target ? " · Linked to: " + target : "");
}
export function VaultVercelSync({session,records,onPersist}:{
  session:any; records:VaultRecord[]; onPersist:(rows:VaultRecord[])=>Promise<void>;
}) {
  const [account,setAccount] = useState<Account>("main");
  const [teamInput,setTeamInput] = useState("");
  const [tokenInput,setTokenInput] = useState("");
  const [projects,setProjects] = useState<Project[]>([]);
  const [projectId,setProjectId] = useState("");
  const [envs,setEnvs] = useState<VercelEnvMeta[]>([]);
  const [inspected,setInspected] = useState(false);
  const [selected,setSelected] = useState<string[]>([]);
  const [keyOverrides,setKeyOverrides] = useState<Record<string,string>>({});
  const [review,setReview] = useState<Review[]>([]);
  const [ack,setAck] = useState("");
  const [busy,setBusy] = useState("");
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const tokenRow = findConnection(records,"VERCEL_TOKEN_"+account.toUpperCase());
  const teamRow = findConnection(records,"VERCEL_TEAM_ID_"+account.toUpperCase());
  const teamId = teamRow?.secret || DEFAULT_TEAMS[account];
  const project = projects.find(p=>p.id===projectId) || null;
  const eligible = useMemo(()=>records.filter(row=>Boolean(row.secret?.trim()) && !PLACEHOLDER.test(row.secret.trim()) && !isConnectionKey(row.keyName)),[records]);
  const availableConfigs = inspected ? envs.filter(row=>row.type !== "sensitive" && row.visibility === "config" && planProductionKey(envs,row.key).action==="replace") : [];
  const connectionStatus = tokenRow?.secret ? "Token saved in Vault · not yet verified" : "Not connected · add an account API token";
  function clearReview() {setReview([]);setAck("");}
  function switchAccount(next:Account) {
    setAccount(next);setTeamInput("");setTokenInput("");setProjects([]);setProjectId("");setEnvs([]);
    setInspected(false);setSelected([]);setKeyOverrides({});clearReview();setError("");setNotice("");
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
        if (row.systems.includes("Vercel") && row.service==="Deployment" && changes.has(row.keyName)) {
          seen.add(row.keyName);return {...row,secret:changes.get(row.keyName)!};
        }
        return row;
      });
      for (const [keyName,secret] of changes) if (!seen.has(keyName)) next.unshift({
        id:crypto.randomUUID(),systems:["Vercel"],otherSystem:"",service:"Deployment",customService:"",keyName,secret
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
      const key=(keyOverrides[row.id] ?? suggestedDestination(row,project)).trim();
      return {id:row.id,source:friendlySource(row),key,plan:planProductionKey(envs,key)};
    });
    if (!rows.length) {setError("Choose at least one Vault entry.");return;}
    const duplicateKeys=new Set<string>();
    for(const item of rows) {
      if (duplicateKeys.has(item.key)) {setError("Two selected Vault entries target "+item.key+". Choose one source for this Production variable, or give them different destination names.");return;}
      duplicateKeys.add(item.key);
    }
    setError("");setNotice("");setReview(rows);setAck("");
  }
  async function applyReviewed() {
    if (!project || ack!=="PRODUCTION" || !review.length || review.some(row=>row.plan.action==="blocked")) return;
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
  async function importConfig(row:VercelEnvMeta) {
    if (!project) return;
    const target=project;
    await run("import-"+row.id,async()=>{
      const fetched=await importVaultVercelConfig({data:{
        ...connectionData(),projectId:target.id,envId:row.id,expectedUpdatedAt:row.updatedAt
      }});
      const added:VaultRecord={
        id:crypto.randomUUID(),systems:["Vercel"],otherSystem:"",
        service:"Environment · "+target.name+" · "+account,customService:"",
        keyName:fetched.key,secret:fetched.value,
        vercelTargets:[{connection:account,projectId:target.id,projectName:target.name,keyName:fetched.key}]
      };
      // Never deduplicate by variable name: the same name may exist in Billing, License Manager and multiple projects.
      await onPersist([added,...records]);
      clearReview();
      setNotice(fetched.key+" imported from "+target.name+" Production as a separate encrypted Vault entry.");
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
    {projects.length>0&&<div className="flex flex-wrap items-end gap-2">
      <label className="block text-xs font-medium flex-1 min-w-48">Project<select className="control mt-1" value={projectId}
        onChange={e=>{setProjectId(e.target.value);setInspected(false);setEnvs([]);setSelected([]);clearReview();}}>
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
      <div className="max-h-72 overflow-auto space-y-2">{eligible.map(row=>{
        const key=keyOverrides[row.id] ?? suggestedDestination(row,project);
        const plan=planProductionKey(envs,key.trim());
        return <div key={row.id} className="border rounded p-2">
          <label className="flex gap-2 items-start text-xs">
            <input type="checkbox" checked={selected.includes(row.id)} onChange={e=>{
              setSelected(prev=>e.target.checked?[...prev,row.id]:prev.filter(id=>id!==row.id));clearReview();
            }}/>
            <span><strong className="font-mono">{row.keyName}</strong><span className="block text-muted-foreground">From: {friendlySource(row)}</span></span>
          </label>
          {selected.includes(row.id)&&<div className="ml-5 mt-2 flex flex-wrap items-center gap-2 text-xs">
            <label className="flex-1">Destination key<input className="control mt-1 font-mono" value={key}
              onChange={e=>{setKeyOverrides(prev=>({...prev,[row.id]:e.target.value}));clearReview();}}/></label>
            <span className="text-muted-foreground">{plan.action==="create"?"New Production key":plan.action==="replace"?"Exists in Production":"Blocked: "+plan.reason}</span>
          </div>}</div>;
      })}</div>
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
        <label className="block text-xs font-medium">Type PRODUCTION to approve<input className="control mt-1" value={ack}
          onChange={e=>setAck(e.target.value)} autoComplete="off"/></label>
        <button type="button" className="button-primary" disabled={!!busy || ack!=="PRODUCTION" || review.some(r=>r.plan.action==="blocked")}
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
