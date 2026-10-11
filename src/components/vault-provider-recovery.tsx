import {useState} from "react";
import {Download, RefreshCw, ShieldCheck} from "lucide-react";
import type {VaultRecord} from "@/lib/vault-crypto";
import {bestVaultConnection,usableConnectionValue} from "@/lib/vault-connections";
import {systemForProject,type VaultMode} from "@/lib/vault-schema";
import {listVaultGithubRepositories,inspectVaultGithubActions} from "@/lib/github-vault.server";
import {listVaultVercelProjects,inspectVaultVercelProduction,importVaultVercelConfig} from "@/lib/vercel-vault.server";
import type {GithubKind,GithubScope} from "@/lib/github-sync-policy";

type Provider="GitHub"|"Vercel";
type Source={provider:Provider;mode:VaultMode};
type State={step:string;done:number;total:number;imported:number;readable:number;warnings:string[];finished:boolean};
const TARGETS:Record<VaultMode,{teamId:string;github:string[];vercel:string[]}>={
  main:{
    teamId:"team_W3fS0X03YCjNkD2BoqRj6Uld",
    github:["lucaskerim123/Custom-licence-manager","lucaskerim123/V2_Billing_Store","lucaskerim123/Dev-panel","lucaskerim123/Master-Database-System"],
    vercel:["custom-licence-manager","v2-billing-store","base-deploy-panel"]
  },
  fallback:{
    teamId:"team_0fWVaLb24pyeeCRqqYu5G47K",
    github:["remipetrovich-design/OrbitFS-License-Administration","remipetrovich-design/OrbitFS-Billing-Shopfront","remipetrovich-design/OrbitFS-Control-Centre","remipetrovich-design/AI-Repair-Centre"],
    vercel:["orbitfs-license-fallback","orbitfs-billing-fallback","orbitfs-dev-panel-fallback"]
  }
};
const SOURCES:Source[]=[
  {provider:"GitHub",mode:"main"},{provider:"GitHub",mode:"fallback"},
  {provider:"Vercel",mode:"main"},{provider:"Vercel",mode:"fallback"}
];
const keyFor=(provider:Provider,mode:VaultMode)=>provider==="GitHub"?"GITHUB_TOKEN_"+mode.toUpperCase():"VERCEL_TOKEN_"+mode.toUpperCase();
const teamKey=(mode:VaultMode)=>"VERCEL_TEAM_ID_"+mode.toUpperCase();
const validName=(name:string)=>/^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
const reservedConnection=(key:string)=>/^(GITHUB_TOKEN_(MAIN|FALLBACK)|VERCEL_(TOKEN|TEAM_ID)_(MAIN|FALLBACK))$/.test(key);
function exactMatch(row:VaultRecord,provider:Provider,mode:VaultMode,dest:string,name:string,scope?:GithubScope,kind?:GithubKind){
  if(row.service!==provider || row.keyName!==name || !(row.usedIn||[]).includes(mode))return false;
  if(provider==="GitHub"){
    return (row.githubTargets||[]).some(t=>t.account===mode&&t.repo===dest&&t.keyName===name&&t.scope===scope&&t.kind===kind);
  }
  return (row.vercelTargets||[]).some(t=>t.connection===mode&&t.projectName===dest&&t.keyName===name);
}
export function VaultProviderRecovery({session,records,onPersist}:{
  session:any;records:VaultRecord[];onPersist:(next:VaultRecord[])=>Promise<void>
}){
  const [tokens,setTokens]=useState<Record<string,string>>({});
  const [teams,setTeams]=useState<Record<VaultMode,string>>({main:TARGETS.main.teamId,fallback:TARGETS.fallback.teamId});
  const [selected,setSelected]=useState<Record<string,boolean>>({
    "GitHub-main":true,"GitHub-fallback":true,"Vercel-main":true,"Vercel-fallback":true
  });
  const [running,setRunning]=useState(false);
  const [progress,setProgress]=useState<State|null>(null);
  const [showCredentials,setShowCredentials]=useState(false);
  function credentials(source:Source){
    const key=keyFor(source.provider,source.mode);
    const typed=tokens[key]?.trim()||"";
    const saved=bestVaultConnection(records,key)?.secret||"";
    return typed|| (usableConnectionValue(saved)?saved:"");
  }
  function addRecord(all:VaultRecord[],entry:VaultRecord){
    const target=(entry.service==="GitHub"?entry.githubTargets?.[0]?.repo:entry.vercelTargets?.[0]?.projectName)||"";
    const mode=entry.usedIn?.[0]||"main";
    const gh=entry.githubTargets?.[0];
    const previous=all.find(row=>exactMatch(row,entry.service as Provider,mode,target,entry.keyName,gh?.scope,gh?.kind));
    if(previous){
      // Restore readable values into blanks only: never discard an existing Vault credential.
      if(!previous.secret.trim()&&entry.secret.trim()){
        const at=all.indexOf(previous);
        all[at]={...previous,secret:entry.secret,valueSource:"Provider read-only pull"};
        return "restored";
      }
      return "existing";
    }
    all.push(entry);
    return "created";
  }
  function accountConnection(all:VaultRecord[],key:string,value:string,mode:VaultMode,provider:Provider){
    if(!value)return;
    const current=bestVaultConnection(all,key);
    if(current){
      if(current.secret===value)return;
      const index=all.findIndex(row=>row.id===current.id);
      if(index>=0)all[index]={...current,secret:value};
      return;
    }
    all.push({id:crypto.randomUUID(),systems:["Dev"],otherSystem:"",service:provider,
      customService:"",keyName:key,secret:value,usedIn:[mode],destinationSystem:"Vault connection",needsReview:false});
  }
  async function pullAll(){
    if(running)return;
    setRunning(true);
    const errors:string[]=[];
    const all=[...records];
    let done=0,imported=0,readable=0;
    const chosen=SOURCES.filter(src=>selected[src.provider+"-"+src.mode]);
    const total=chosen.reduce((n,src)=>n+(src.provider==="GitHub"?TARGETS[src.mode].github.length*4:TARGETS[src.mode].vercel.length),0);
    let step="Connecting to providers";
    const update=(isDone=false)=>setProgress({step,done,total,imported,readable,warnings:[...errors],finished:isDone});
    update();
    const add=(row:VaultRecord)=>{const result=addRecord(all,row);if(result==="created")imported++;if(result==="created"||result==="restored"){if(row.secret)readable++}};
    const warning=(label:string,e:unknown)=>{
      const message=String(e instanceof Error?e.message:e||"Unknown provider error");
      errors.push(label+": "+message.slice(0,220));
      update();
    };
    try{
      for(const src of chosen){
        const {provider,mode}=src;
        const token=credentials(src);
        const name=provider+" "+(mode==="main"?"Main":"Fallback");
        if(!token){
          warning(name,"Not connected. Enter or restore its account token, then retry.");
          done+=provider==="GitHub"?TARGETS[mode].github.length*4:TARGETS[mode].vercel.length;
          update();continue;
        }
        if(provider==="GitHub"){
          let available:string[]=[];
          step=name+" · verifying GitHub repositories";update();
          try{
            const res=await listVaultGithubRepositories({data:{token:session.token,githubToken:token,account:mode}});
            available=res.repositories.map(x=>x.fullName);
            accountConnection(all,keyFor(provider,mode),token,mode,provider);
          }catch(e){
            warning(name,e);done+=TARGETS[mode].github.length*4;update();continue;
          }
          for(const repo of TARGETS[mode].github){
            const permitted=available.includes(repo);
            for(const scope of ["repository","production"] as GithubScope[]){
              for(const kind of ["secret","variable"] as GithubKind[]){
                step=name+" · "+repo+" · "+scope+" "+kind+"s";update();
                if(!permitted){done++;update();continue;}
                try{
                  const result=await inspectVaultGithubActions({data:{token:session.token,githubToken:token,account:mode,repo,scope,kind}});
                  for(const item of result.items){
                    if(!validName(item.name)||reservedConnection(item.name))continue;
                    const visible=kind==="variable"?(item.value??""):"";
                    add({id:crypto.randomUUID(),systems:[systemForProject(repo)],otherSystem:"",
                      service:"GitHub",customService:"",keyName:item.name,secret:visible,
                      purpose:kind==="secret"?"GitHub Actions secret · value unavailable":"GitHub Actions variable",
                      valueSource:visible?"GitHub Actions variable pull":"GitHub Actions inventory",
                      usedIn:[mode],destinationSystem:repo,needsReview:false,
                      githubTargets:[{account:mode,repo,scope,kind,keyName:item.name}]});
                  }
                }catch(e){
                  // Production environments may not exist. A missing environment is not a missing secret.
                  const message=String(e instanceof Error?e.message:e);
                  if(!(scope==="production"&&/exactly one Production environment/i.test(message)))warning(step,e);
                }
                done++;update();
              }
            }
          }
        }else{
          const teamId=teams[mode].trim()||TARGETS[mode].teamId;
          let available:Array<{id:string;name:string}>=[];
          step=name+" · verifying Vercel team and projects";update();
          try{
            const res=await listVaultVercelProjects({data:{token:session.token,vercelToken:token,teamId}});
            available=res.projects;
            accountConnection(all,keyFor(provider,mode),token,mode,provider);
            accountConnection(all,teamKey(mode),teamId,mode,"Vercel");
          }catch(e){
            warning(name,e);done+=TARGETS[mode].vercel.length;update();continue;
          }
          for(const projectName of TARGETS[mode].vercel){
            step=name+" · "+projectName+" · reading Production";update();
            const project=available.find(p=>p.name===projectName);
            if(!project){warning(step,"Project not visible to this token/team.");done++;update();continue;}
            try{
              const args={token:session.token,vercelToken:token,teamId,projectId:project.id};
              const res=await inspectVaultVercelProduction({data:args});
              for(const item of res.envs){
                if(!validName(item.key)||reservedConnection(item.key))continue;
                let value="";
                if(item.visibility==="config"&&item.type!=="sensitive"){
                  try{
                    const found=await importVaultVercelConfig({data:{...args,envId:item.id,expectedUpdatedAt:item.updatedAt}});
                    value=found.value;
                  }catch{
                    // Vercel can withhold encrypted/sensitive values; never invent them.
                  }
                }
                add({id:crypto.randomUUID(),systems:[systemForProject(projectName)],otherSystem:"",
                  service:"Vercel",customService:"",keyName:item.key,secret:value,
                  purpose:value?"Readable Vercel Production Config":"Vercel Production variable · value unavailable",
                  valueSource:value?"Vercel read-only pull":"Vercel Production inventory",
                  usedIn:[mode],destinationSystem:projectName,needsReview:false,
                  vercelTargets:[{connection:mode,projectId:project.id,projectName,keyName:item.key}]});
              }
            }catch(e){warning(step,e)}
            done++;update();
          }
        }
      }
      step="Encrypting and saving recovered Vault inventory";update();
      await onPersist(all);
      setTokens({});
      step="Pull finished · providers were not modified";update(true);
    }catch(e){warning("Unable to save recovered Vault data",e);step="Pull stopped before confirmation";update(true)}
    finally{setRunning(false)}
  }
  return <section className="rounded-lg border border-border p-3 sm:p-4 space-y-4" aria-label="Pull provider inventory">
    <div>
      <h3 className="text-sm font-semibold">Pull all 4 provider accounts into Vault</h3>
      <p className="mt-1 text-xs text-muted-foreground">Scan approved OrbitFS repositories and all six Main/Fallback Vercel projects. GitHub secrets and Vercel Sensitive values come back as names only. Readable GitHub variables and permitted Vercel Config values can be restored. Existing Vault values are preserved. Nothing is sent, overwritten or deleted at either provider.</p>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {SOURCES.map(source=>{
        const id=source.provider+"-"+source.mode;
        const connected=Boolean(credentials(source));
        return <label key={id} className="flex items-center gap-2 rounded-md border p-3 text-xs">
          <input type="checkbox" checked={selected[id]!==false} disabled={running} onChange={e=>setSelected(prev=>({...prev,[id]:e.target.checked}))}/>
          <span className="min-w-0 flex-1"><strong>{source.provider} · {source.mode==="main"?"Main":"Fallback"}</strong><span className="block text-muted-foreground">{connected?"Account token ready":"Account token required"}</span></span>
        </label>;
      })}
    </div>
    <details open={showCredentials} onToggle={e=>setShowCredentials(e.currentTarget.open)} className="rounded-md border p-3">
      <summary className="cursor-pointer text-xs font-semibold">Account connections · enter missing tokens after Vault reset</summary>
      <p className="my-2 text-xs text-muted-foreground">Saved encrypted Vault connections are used automatically. After clearing the Vault, enter a GitHub token for each GitHub account and a Vercel token for each Vercel account. New tokens are saved encrypted in the Vault during Pull. Tokens are never copied into provider environment variables.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {SOURCES.map(source=>{
          const key=keyFor(source.provider,source.mode);
          return <label key={key} className="block text-xs font-medium">{source.provider} · {source.mode} API token
            <input type="password" className="control mt-1 w-full" disabled={running}
              value={tokens[key]||""} onChange={e=>setTokens(prev=>({...prev,[key]:e.target.value}))}
              placeholder={credentials(source)?"Saved connection available · leave blank to keep":"Paste account token"} autoComplete="off"/>
          </label>;
        })}
        {(["main","fallback"] as VaultMode[]).map(mode=><label key={mode} className="block text-xs font-medium">Vercel {mode} team ID
          <input className="control mt-1 w-full font-mono" disabled={running} value={teams[mode]}
            onChange={e=>setTeams(prev=>({...prev,[mode]:e.target.value}))}/>
        </label>)}
      </div>
    </details>
    <button type="button" className="button-primary inline-flex items-center gap-2" disabled={running||!SOURCES.some(s=>selected[s.provider+"-"+s.mode])}
      onClick={()=>void pullAll()}><Download size={15}/> {running?"Pulling accounts…":"Pull / Sync all selected accounts"}</button>
    {progress&&<div className="rounded-md border p-3 space-y-2" role="status" aria-live="polite">
      <p className="flex items-center gap-2 text-xs font-semibold">{running?<RefreshCw size={14} className="animate-spin"/>:<ShieldCheck size={14}/>}
        {progress.finished?"Recovery inventory scan complete": "Loading provider inventory…"}</p>
      <div className="h-2 w-full overflow-hidden rounded bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={Math.max(1,progress.total)}
        aria-valuenow={progress.done}><div className="h-full bg-primary transition-all duration-300" style={{width:(progress.total?progress.done/progress.total*100:0)+"%"}}/></div>
      <p className="break-words text-xs">{progress.step}</p>
      <p className="text-xs text-muted-foreground">{progress.done}/{progress.total} checks completed · {progress.imported} entries added · {progress.readable} readable values restored</p>
      {progress.warnings.length>0&&<details className="rounded border p-2"><summary className="cursor-pointer text-xs">{progress.warnings.length} warnings / skipped checks</summary>
        <div className="mt-2 max-h-40 overflow-y-auto space-y-1">{progress.warnings.map((w,i)=><p key={i} className="text-xs break-words">{w}</p>)}</div>
      </details>}
    </div>}
    <p className="text-xs text-muted-foreground">A pull is always read-only against GitHub and Vercel. Use the separate Send workflow for manually approved creations or overrides. Provider deletion is not supported.</p>
  </section>;
}
