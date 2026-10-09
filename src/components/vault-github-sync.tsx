import { useEffect, useMemo, useState } from "react";
import { ArrowUpFromLine, Github, RefreshCw, ShieldCheck } from "lucide-react";
import type { VaultRecord } from "@/lib/vault-crypto";
import { bestVaultConnection } from "@/lib/vault-connections";
import { allowedForGithubRepo, systemForProject, recordIdentity } from "@/lib/vault-schema";
import {
  allowedVaultValue, planGithubKey, type GithubAccount, type GithubItem, type GithubKind,
  type GithubPlan, type GithubScope,
} from "@/lib/github-sync-policy";
import { listVaultGithubRepositories, inspectVaultGithubActions, writeVaultGithubAction } from "@/lib/github-vault.server";

type Repository = {fullName:string;name:string;isPrivate:boolean};
type Review = { id:string; key:string; kind:GithubKind; source:string; plan:GithubPlan };
const TOKEN_KEYS:Record<GithubAccount,string>={main:"GITHUB_TOKEN_MAIN",fallback:"GITHUB_TOKEN_FALLBACK"};
function connectionRow(records:VaultRecord[],account:GithubAccount){
  return bestVaultConnection(records,TOKEN_KEYS[account]);
}
function suggestedDestination(row:VaultRecord,_repo:Repository|null){return row.keyName;}

export function VaultGithubSync({session,records,onPersist}:{
  session:any;records:VaultRecord[];onPersist:(records:VaultRecord[])=>Promise<void>;
}){
  const [account,setAccount]=useState<GithubAccount>("main");
  const [tokenInput,setTokenInput]=useState("");
  const [repositories,setRepositories]=useState<Repository[]>([]);
  const [repoName,setRepoName]=useState("");
  const [scope,setScope]=useState<GithubScope>("repository");
  const [kind,setKind]=useState<GithubKind>("secret");
  const [inventory,setInventory]=useState<GithubItem[]>([]);
  const [environmentName,setEnvironmentName]=useState<string|null>(null);
  const [inspected,setInspected]=useState(false);
  const [selected,setSelected]=useState<string[]>([]);
  const [keyOverrides,setKeyOverrides]=useState<Record<string,string>>({});
  const [review,setReview]=useState<Review[]>([]);
  const [approval,setApproval]=useState(false);
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const tokenRow=connectionRow(records,account);
  const repository=repositories.find(r=>r.fullName===repoName)||null;
  const eligible=useMemo(()=>records.filter(r=>Boolean(repository) &&
    allowedForGithubRepo(r,repository!.fullName,account) &&
    allowedVaultValue(r.secret) &&
    !/^(GITHUB_TOKEN_(MAIN|FALLBACK)|VERCEL_(TOKEN|TEAM_ID)_(MAIN|FALLBACK))$/.test(r.keyName)
  ),[records,account,repository]);

  function resetReview(){setReview([]);setApproval(false);}
  function resetComparison(){setInventory([]);setEnvironmentName(null);setInspected(false);setSelected([]);setKeyOverrides({});resetReview();}
  useEffect(()=>{resetReview()},[records]);
  function chooseAccount(next:GithubAccount){
    setAccount(next);setTokenInput("");setRepositories([]);setRepoName("");setScope("repository");setKind("secret");
    resetComparison();setError("");setNotice("");
  }
  function auth(){
    if(!tokenRow?.secret?.trim()) throw new Error("Save a usable GitHub Personal Access Token in the Vault first. Blank entries are reminders only.");
    return {token:session.token,githubToken:tokenRow.secret,account};
  }
  async function run(label:string,task:()=>Promise<void>){
    setBusy(label);setError("");setNotice("");
    try{await task()}catch(e:any){setError(String(e?.message||"GitHub Vault sync failed."))}
    finally{setBusy("")}
  }
  async function saveConnection(){
    await run("save",async()=>{
      const value=tokenInput.trim() || tokenRow?.secret || "";
      const existing=connectionRow(records,account);
      const next=existing
        ? records.map(r=>r.id===existing.id?{...r,secret:value}:r)
        : [{id:crypto.randomUUID(),systems:["Dev"],otherSystem:"",service:"GitHub",customService:"",keyName:TOKEN_KEYS[account],secret:value,usedIn:[account],destinationSystem:"Vault connection",needsReview:false},...records];
      await onPersist(next);
      setTokenInput("");setRepositories([]);setRepoName("");resetComparison();
      setNotice("Encrypted GitHub connection saved. No GitHub settings changed; verify by loading repositories.");
    });
  }
  async function loadRepos(){
    await run("repositories",async()=>{
      const result=await listVaultGithubRepositories({data:auth()});
      setRepositories(result.repositories);setRepoName("");resetComparison();
      setNotice("Verified "+result.owner+" · "+result.repositories.length+" owned repositories visible to this token.");
    });
  }
  async function inspect(){
    if(!repository){setError("Choose a GitHub repository.");return;}
    await run("inspect",async()=>{
      const result=await inspectVaultGithubActions({data:{...auth(),repo:repository.fullName,scope,kind}});
      setInventory(result.items);setEnvironmentName(result.environment);setInspected(true);resetReview();
      setNotice(result.items.length+" existing "+scope+" Actions "+kind+" records found. Values stay hidden.");
    });
  }
  function reviewChanges(){
    setError("");resetReview();
    if(!inspected || !repository){setError("Inspect the selected GitHub destination first.");return;}
    if(!selected.length || selected.length>50){setError("Select 1–50 Vault entries per review.");return;}
    const used=new Set<string>(),rows:Review[]=[];
    for(const id of selected){
      const source=eligible.find(r=>r.id===id);
      if(!source){setError("A selected Vault entry is unavailable.");return;}
      const key=(keyOverrides[id]??suggestedDestination(source,repository)).trim();
      if(used.has(key.toUpperCase())){setError("Multiple Vault entries target "+key+". Select just one source or rename the destination.");return;}
      used.add(key.toUpperCase());
      rows.push({id,key,kind,source:source.systems.join(" / ")+" · "+source.service,plan:planGithubKey(inventory,key)});
    }
    setReview(rows);
  }
  async function applyReviewed(){
    if(!repository || !inspected || !review.length || !approval || review.some(r=>r.plan.action==="blocked")){
      setError("Review changes and type PRODUCTION before applying.");return;
    }
    const reviewedRepo=repository,reviewedAccount=account,reviewedScope=scope,reviewedKind=kind;
    await run("apply",async()=>{
      let applied=0;
      const written:Review[]=[];
      for(const row of review){
        const source=records.find(r=>r.id===row.id);
        if(!source || !allowedVaultValue(source.secret) || row.kind!==reviewedKind){
          throw new Error("Selected Vault entry is no longer available. Nothing further was synced.");
        }
        try{
          await writeVaultGithubAction({data:{
            ...auth(),repo:reviewedRepo.fullName,scope:reviewedScope,kind:row.kind,
            key:row.key,value:source.secret,action:row.plan.action as "create"|"replace",
            expectedUpdatedAt:row.plan.expectedUpdatedAt??null,
          }});
        }catch(e:any){
          throw new Error(applied+" of "+review.length+" GitHub entries accepted. Stopped on "+row.key+": "+
            String(e?.message||"GitHub rejected the change.")+" Inspect again before retrying.");
        }
        applied++;written.push(row);
      }
      const next=records.map(record=>{
        const entry=written.find(w=>w.id===record.id);
        if(!entry)return record;
        const previous=(record.githubTargets||[]).filter(t=>!(t.account===reviewedAccount &&
          t.repo===reviewedRepo.fullName && t.scope===reviewedScope && t.kind===reviewedKind && t.keyName===entry.key));
        return {...record,githubTargets:[...previous,{account:reviewedAccount,repo:reviewedRepo.fullName,
          scope:reviewedScope,kind:reviewedKind,keyName:entry.key}]};
      });
      try{await onPersist(next)}catch{
        throw new Error("GitHub accepted "+applied+" entries, but saving Vault destination labels failed. Inspect GitHub before retrying.");
      }
      resetComparison();
      setNotice(applied+" "+reviewedScope+" Actions "+reviewedKind+" records accepted in "+reviewedRepo.fullName+
        ". Presence verified; secret values cannot be read back. No workflow or deployment triggered.");
    });
  }

  async function importActionsNames() {
    if(!repository || !inspected){setError("Compare the selected repository Actions first.");return;}
    const reviewedRepository=repository;
    await run("import-names",async()=>{
      const saved=new Set(records.map(recordIdentity));
      const additions:VaultRecord[]=[];
      for(const item of inventory){
        if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(item.name))continue;
        if(/^GITHUB_TOKEN_(MAIN|FALLBACK)$/.test(item.name))continue;
        const record:VaultRecord={
          id:crypto.randomUUID(),systems:[systemForProject(reviewedRepository.name)],
          otherSystem:"",service:"GitHub",customService:"",
          keyName:item.name,secret:"",usedIn:[account],
          destinationSystem:reviewedRepository.fullName,needsReview:false,
          githubTargets:[{account,repo:reviewedRepository.fullName,scope,kind,keyName:item.name}]
        };
        if(!saved.has(recordIdentity(record))){additions.push(record);saved.add(recordIdentity(record));}
      }
      if(additions.length)await onPersist([...additions,...records]);
      setNotice(additions.length+" exact GitHub Actions names added as blank Vault references. Protected secret values remain hidden; no GitHub settings changed.");
    });
  }
  return <section className="orbit-panel p-4 space-y-4">
    <div className="flex items-start gap-2"><Github size={20} className="mt-0.5"/>
      <div><h2 className="text-base font-semibold">GitHub Actions Vault sync</h2>
        <p className="text-xs text-muted-foreground">Main and Fallback · Repository or existing Production environment · manual review · no release triggered</p>
      </div>
    </div>
    {error&&<p className="rounded border border-red-400/40 p-2 text-xs text-red-300">{error}</p>}
    {notice&&<p className="rounded border p-2 text-xs">{notice}</p>}
    <div className="flex gap-2">{(["main","fallback"] as const).map(a=>
      <button type="button" key={a} className={account===a?"button-primary":"button-secondary"} disabled={!!busy} onClick={()=>chooseAccount(a)}>
        {a==="main"?"Main GitHub":"Fallback GitHub"}</button>)}</div>
    <p className="text-xs text-muted-foreground">Vault connection: {tokenRow?(tokenRow.secret.trim()?"Saved · not verified until repositories load":"Saved blank · add a real token to connect"):"Not configured"}.
      Use a token owned by {account==="main"?"lucaskerim123":"remipetrovich-design"} with access to all required repositories and Actions Secrets/Variables (read/write), Environments (read) and Metadata (read). Two shared connection slots are used, one per account, rather than one per repository. Actual permissions are controlled by GitHub. No tokens are written into GitHub Actions.</p>
    <div className="flex flex-wrap items-end gap-2">
      <label className="block text-xs font-medium flex-1 min-w-52">GitHub Personal Access Token
        <input type="password" autoComplete="off" className="control mt-1 font-mono" value={tokenInput}
          onChange={e=>setTokenInput(e.target.value)} placeholder={tokenRow?"Enter a replacement, change-me or leave blank":"Paste token or change-me"}/></label>
      <button type="button" className="button-secondary" disabled={!!busy} onClick={()=>void saveConnection()}>
        Save encrypted connection (blank allowed)</button>
      <button type="button" className="button-secondary" disabled={!!busy || !tokenRow} onClick={()=>void loadRepos()}>
        <RefreshCw size={14}/> Verify / load repositories</button>
    </div>
    {repositories.length>0&&<div className="space-y-3 border-t pt-3">
      <div className="grid gap-2 md:grid-cols-3">
        <label className="block text-xs font-medium">Repository
          <select className="control mt-1" value={repoName} onChange={e=>{setRepoName(e.target.value);resetComparison()}}>
            <option value="">Choose owned repository</option>
            {repositories.map(r=><option key={r.fullName} value={r.fullName}>{r.fullName}{r.isPrivate?" (private)":""}</option>)}
          </select></label>
        <label className="block text-xs font-medium">GitHub Actions location
          <select className="control mt-1" value={scope} onChange={e=>{setScope(e.target.value as GithubScope);resetComparison()}}>
            <option value="repository">Repository secrets / variables</option><option value="production">Production environment only</option>
          </select></label>
        <label className="block text-xs font-medium">Entry type
          <select className="control mt-1" value={kind} onChange={e=>{setKind(e.target.value as GithubKind);resetComparison()}}>
            <option value="secret">Secrets (encrypted)</option><option value="variable">Variables (readable in GitHub)</option>
          </select></label>
      </div>
      <button type="button" className="button-secondary" disabled={!!busy || !repository} onClick={()=>void inspect()}>
        <RefreshCw size={14}/> Compare GitHub {scope} {kind}s</button>
      {inspected&&repository&&<div className="space-y-3">
        <p className="text-xs text-muted-foreground">{inventory.length} existing entries in {repository.fullName} /
          {scope==="production"?(environmentName||"Production"):"Repository"} / {kind}s. No values retrieved.
          {kind==="variable"?" Warning: GitHub Actions variables are not secret and can be read by permitted users.":""}</p>
        <p className="text-xs text-muted-foreground">Only keys explicitly assigned to this account and exact repository are available for writing. Import verified names below or edit a Vault entry to assign it.</p>
        <button type="button" className="button-secondary" disabled={!!busy} onClick={()=>void importActionsNames()}>
          <RefreshCw size={14}/> Import exact Actions names (blank values)
        </button>
        <div className="max-h-72 overflow-auto space-y-1">{eligible.map(row=>{
          const key=keyOverrides[row.id]??suggestedDestination(row,repository);
          const plan=planGithubKey(inventory,key.trim());
          const checked=selected.includes(row.id);
          return <div key={row.id} className="rounded border p-2 space-y-1 text-xs">
            <label className="flex gap-2 items-start">
              <input className="mt-1" type="checkbox" checked={checked} onChange={e=>{
                setSelected(prev=>e.target.checked?[...prev,row.id]:prev.filter(id=>id!==row.id));resetReview();
              }}/>
              <span className="min-w-0"><strong className="font-mono break-all">{row.keyName}</strong>
                <span className="block text-muted-foreground">From: {row.systems.join(" / ")} · {row.service}</span></span>
            </label>
            {checked&&<div className="pl-5">
              <label className="block">Destination Actions name
                <input className="control mt-1 font-mono" value={key} onChange={e=>{
                  setKeyOverrides(prev=>({...prev,[row.id]:e.target.value}));resetReview();
                }}/></label>
              <span className={plan.action==="blocked"?"text-red-300":"text-muted-foreground"}>
                {plan.action==="create"?"New "+kind:plan.action==="replace"?"Existing "+kind+" will be replaced":"Blocked: "+plan.reason}
              </span>
            </div>}
          </div>;
        })}</div>
        <button type="button" className="button-secondary" disabled={!!busy || !selected.length} onClick={reviewChanges}>
          <ArrowUpFromLine size={14}/> Review {selected.length} selected entries</button>
        {review.length>0&&<div className="rounded border p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck size={15}/> Confirm GitHub Actions changes</div>
          <p className="text-xs">Target: {repository.fullName} · {scope==="production"?(environmentName||"Production"):"Repository"} · {kind}s</p>
          {review.map(r=><p className="border-b pb-2 text-xs" key={r.id}>
            <strong className="font-mono">{r.key}</strong> · {r.plan.action==="create"?"Create":r.plan.action==="replace"?"Replace existing":"BLOCKED"}
            <span className="block text-muted-foreground">From: {r.source}</span>
            {r.plan.action==="blocked"&&<span className="block text-red-300">{r.plan.reason}</span>}
          </p>)}
          <p className="text-xs text-muted-foreground">GitHub updates are not automatically reversible. Only metadata presence is verifiable for secrets; the original value is not readable from GitHub.</p>
          <label className="flex items-center gap-2 text-xs font-medium"><input type="checkbox" checked={approval} onChange={e=>setApproval(e.target.checked)}/>
            I checked the repository, environment and names. Approve these Production changes.</label>
          <button type="button" className="button-primary" disabled={!!busy || !approval || review.some(r=>r.plan.action==="blocked")}
            onClick={()=>void applyReviewed()}>Apply {review.length} reviewed GitHub entries</button>
        </div>}
      </div>}
    </div>}
  </section>;
}
