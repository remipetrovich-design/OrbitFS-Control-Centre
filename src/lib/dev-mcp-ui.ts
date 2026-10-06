export const DEV_PANEL_UI_URI="ui://dev-panel/v1.html";

export const DEV_PANEL_UI_HTML=String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Dev Panel</title>
<style>
:root{color-scheme:light dark;--bg:transparent;--surface:color-mix(in srgb,Canvas 94%,CanvasText 6%);--surface2:color-mix(in srgb,Canvas 88%,CanvasText 12%);--border:color-mix(in srgb,CanvasText 18%,transparent);--text:CanvasText;--muted:color-mix(in srgb,CanvasText 58%,transparent);--good:#22a06b;--info:#3b82f6;--ready:#f59e0b;--bad:#ef476f}
*{box-sizing:border-box}html{height:100%;overflow:hidden}body{height:100%;margin:0;background:var(--bg);color:var(--text);font:14px/1.45 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding:10px 10px calc(110px + env(safe-area-inset-bottom))}.shell{max-width:720px;margin:0 auto;min-height:0}.card{height:max-content;min-height:0;border:1px solid var(--border);background:var(--surface);border-radius:16px;overflow:hidden}.head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--border)}.mark{width:28px;height:28px;border-radius:9px;display:grid;place-items:center;background:var(--surface2);font-size:12px;font-weight:800}.grow{flex:1}.title{font-weight:800}.sub{font-size:11px;color:var(--muted)}.pill{font-size:9px;font-weight:800;border:1px solid var(--border);border-radius:999px;padding:4px 7px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:8px}.stat{border:1px solid var(--border);background:var(--surface2);border-radius:11px;padding:9px;min-height:68px;transition:border-color .18s,background .18s,box-shadow .18s}.stat b{display:block;margin-top:6px;font-size:13px}.stat.state-red{border-color:color-mix(in srgb,var(--bad) 58%,var(--border));background:color-mix(in srgb,var(--bad) 10%,var(--surface2));box-shadow:inset 3px 0 0 var(--bad)}.stat.state-blue{border-color:color-mix(in srgb,var(--info) 58%,var(--border));background:color-mix(in srgb,var(--info) 10%,var(--surface2));box-shadow:inset 3px 0 0 var(--info)}.stat.state-orange{border-color:color-mix(in srgb,var(--ready) 58%,var(--border));background:color-mix(in srgb,var(--ready) 10%,var(--surface2));box-shadow:inset 3px 0 0 var(--ready)}.stat.state-green{border-color:color-mix(in srgb,var(--good) 58%,var(--border));background:color-mix(in srgb,var(--good) 10%,var(--surface2));box-shadow:inset 3px 0 0 var(--good)}.miniState.state-red{color:var(--bad)}.miniState.state-blue{color:var(--info)}.miniState.state-orange{color:var(--ready)}.miniState.state-green{color:var(--good)}.dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--good);margin-right:5px}.dot.warn{background:var(--warn)}.dot.bad{background:var(--bad)}
.legend{display:flex;gap:8px;flex-wrap:wrap;padding:0 9px 8px;font-size:8px;color:var(--muted);font-weight:700}.legend span{display:flex;align-items:center;gap:5px}.legend i{width:7px;height:7px;border-radius:50%;display:inline-block}.legend .red{background:var(--bad)}.legend .blue{background:var(--info)}.legend .orange{background:var(--ready)}.legend .green{background:var(--good)}.section{border-top:1px solid var(--border);padding:9px}.section h2{font-size:11px;margin:0 0 7px}.sectionLead{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px}.sectionLead h2{margin:0}.miniState{font-size:9px;color:var(--muted);font-weight:800;text-transform:uppercase;letter-spacing:.08em}.row{display:flex;gap:6px;flex-wrap:wrap}.opsGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.opsGrid .btn{width:100%;padding:7px 5px}.btn{appearance:none;border:1px solid var(--border);background:var(--surface2);color:var(--text);border-radius:9px;padding:7px 9px;font-weight:700;font-size:10px;line-height:1.15;cursor:pointer}.btn.primary{background:var(--text);color:Canvas;border-color:var(--text)}.btn.danger{border-color:color-mix(in srgb,var(--bad) 45%,var(--border));color:var(--bad)}.btn:disabled{opacity:.55;cursor:not-allowed}.field{display:flex;gap:7px}.field input{min-width:0;flex:1;border:1px solid var(--border);background:var(--surface2);color:var(--text);border-radius:10px;padding:9px 10px;outline:none}.result{margin-top:7px;border:1px solid var(--border);background:color-mix(in srgb,var(--surface2) 75%,transparent);border-radius:9px;padding:8px 9px;font-size:10px;line-height:1.35}.result.ok{border-color:color-mix(in srgb,var(--good) 45%,var(--border));background:color-mix(in srgb,var(--good) 8%,var(--surface2))}.result.error{border-color:color-mix(in srgb,var(--bad) 50%,var(--border));background:color-mix(in srgb,var(--bad) 8%,var(--surface2));color:color-mix(in srgb,var(--bad) 82%,var(--text))}.hidden{display:none}.full-only{display:block}.fullscreen .full-only{display:block}.fullscreen .grid{grid-template-columns:repeat(4,1fr)}.fullscreen .shell{max-width:980px}.fullscreen{padding-bottom:calc(150px + env(safe-area-inset-bottom))}.customerActions{margin-top:8px}.busy{opacity:.7;pointer-events:none}.pip .grid,.pip .section{display:none}.pip #liveSection{display:block}.pip .card{border-radius:16px}.pip #liveResult{max-height:180px}.pageNav{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;padding:7px 8px;border-bottom:1px solid var(--border);position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--surface) 96%,transparent);backdrop-filter:blur(12px)}.pageNav::-webkit-scrollbar{display:none}.pageNav .btn{width:100%;white-space:nowrap;padding:7px 5px}.pageNav .btn.active{background:var(--text);color:Canvas;border-color:var(--text)}.pageHidden{display:none!important}.refreshMeta{padding:6px 9px;font-size:9px;color:var(--muted);display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;border-bottom:1px solid var(--border)}.releaseBox{border-top:1px solid var(--border);padding:9px}.releaseTitle{display:flex;align-items:center;justify-content:space-between;gap:8px}.releaseTitle h2{font-size:11px;margin:0}.versionLine{font-size:10px;font-weight:800}.releaseMeta{display:flex;gap:6px;flex-wrap:wrap;margin-top:5px;font-size:9px;color:var(--muted)}.releaseMeta span{border:1px solid var(--border);border-radius:999px;padding:3px 6px}.releaseVersionRow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;margin-top:7px}.versionInput{min-width:0;border:1px solid var(--border);background:var(--surface2);color:var(--text);border-radius:8px;padding:7px 8px;font:inherit;font-size:10px;font-weight:700;outline:none}.releaseActions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:7px}.releaseActions .btn{padding:7px 4px}.statusPulse{display:inline-flex;align-items:center;gap:5px}.statusPulse i{width:7px;height:7px;border-radius:50%;background:var(--good);display:inline-block}.statusPulse.busy i{background:var(--ready)}
@media(max-width:520px){body{padding:0 0 calc(96px + env(safe-area-inset-bottom))}.card{border-radius:0;border-left:0;border-right:0}.grid{grid-template-columns:1fr 1fr}.fullscreen .grid{grid-template-columns:1fr 1fr}.opsGrid{grid-template-columns:repeat(3,minmax(0,1fr))}.opsGrid .btn{font-size:9px;padding:7px 4px}}
</style>
</head>
<body>
<div class="shell">
 <div class="card" id="card">
  <div class="head">
   <div class="mark">D</div>
   <div><div class="title">Dev Panel</div><div class="sub">Private developer controls</div></div>
   <div class="grow"></div>
   <span class="pill" id="overall">Loading</span>
   <button class="btn" id="closePanel" aria-label="Close Dev Panel">Close</button>
  </div>
  <nav class="pageNav" id="pageNav"><button class="btn active" data-page-btn="overview">Overview</button><button class="btn" data-page-btn="releases">Releases</button><button class="btn" data-page-btn="services">Services</button></nav>
  <div class="refreshMeta"><span class="statusPulse" id="statusPulse"><i></i><span id="refreshState">Live status</span></span><span id="lastChecked">Not refreshed yet</span></div><div class="result hidden" id="stagedIntent"></div>
  <div class="grid" data-page="overview">
   <div class="stat" id="baseCard"><span class="sub">Base release</span><b id="baseState">—</b><span class="sub" id="baseDetail"></span></div>
   <div class="stat" id="engineCard"><span class="sub">Engine update</span><b id="engineState">—</b><span class="sub" id="engineDetail"></span></div>
   <div class="stat" id="lmCard"><span class="sub">Licence Manager</span><b id="lmState">—</b><span class="sub" id="lmDetail"></span></div>
   <div class="stat" id="bsCard"><span class="sub">V2 Billing Store</span><b id="bsState">—</b><span class="sub" id="bsDetail"></span></div>
  </div>
  <div class="legend" data-page="overview"><span><i class="red"></i>Failed</span><span><i class="blue"></i>Action required</span><span><i class="orange"></i>Ready to package</span><span><i class="green"></i>Latest</span></div>
  <div class="section" data-page="releases">
   <div class="sectionLead"><h2>Prepare release branches</h2><span class="miniState" id="releaseFreshness">Checking releases</span></div>
   <div class="opsGrid">
    <button class="btn" data-call="prepare" data-target="base">Prepare Base</button>
    <button class="btn" data-call="prepare" data-target="engine">Prepare Engine</button>
    <button class="btn primary" data-call="prepare" data-target="both">Prepare Both</button>
   </div>
   <div class="result hidden" id="prepareResult"></div>
  </div>
  <div class="releaseBox" data-page="releases">
   <div class="releaseTitle"><h2>Base release</h2><span class="miniState" id="baseBuildState">Loading</span></div>
   <div class="versionLine" id="baseVersionLine">Published — → Next —</div>
   <div class="releaseMeta"><span id="baseSourceMeta">Source —</span><span id="baseDbMeta">DB —</span></div>
   <div class="releaseVersionRow"><input class="versionInput" id="baseVersion" placeholder="Version"><button class="btn" data-use-suggested="base">Suggested</button></div>
   <div class="releaseActions">
    <button class="btn" data-release-build="base:inspect" id="baseInspect">Inspect</button>
    <button class="btn" data-release-build="base:database" id="baseDatabase">Check DB</button>
    <button class="btn primary" data-release-build="base:build" id="baseBuild">Build</button>
   </div>
   <div class="result hidden" id="baseBuildResult"></div>
  </div>
  <div class="releaseBox" data-page="releases">
   <div class="releaseTitle"><h2>Engine update</h2><span class="miniState" id="engineBuildState">Loading</span></div>
   <div class="versionLine" id="engineVersionLine">Published — → Next —</div>
   <div class="releaseMeta"><span id="engineSourceMeta">Source —</span><span id="engineDbMeta">DB —</span><span id="engineCompatMeta">Base —</span></div>
   <div class="releaseVersionRow"><input class="versionInput" id="engineVersion" placeholder="Version"><button class="btn" data-use-suggested="engine">Suggested</button></div>
   <div class="releaseActions">
    <button class="btn" data-release-build="engine:inspect" id="engineInspect">Inspect</button>
    <button class="btn" data-release-build="engine:database" id="engineDatabase">Check DB</button>
    <button class="btn primary" data-release-build="engine:build" id="engineBuild">Build</button>
   </div>
   <div class="result hidden" id="engineBuildResult"></div>
  </div>
  <div class="section" data-page="services">
   <div class="sectionLead"><h2>Licence Manager</h2><span class="miniState" id="lmDeployState">Checking</span></div>
   <div class="opsGrid">
    <button class="btn" data-deploy="license_manager:scan">Scan</button>
    <button class="btn primary" data-deploy="license_manager:deploy">Deploy</button>
    <button class="btn" data-deploy="license_manager:quick_deploy">Quick Deploy</button>
   </div>
   <div class="result hidden" id="lmServiceResult"></div>
  </div>
  <div class="section" data-page="services">
   <div class="sectionLead"><h2>Billing Store</h2><span class="miniState" id="bsDeployState">Checking</span></div>
   <div class="opsGrid">
    <button class="btn" data-deploy="billing_store:scan">Scan</button>
    <button class="btn primary" data-deploy="billing_store:deploy">Deploy</button>
    <button class="btn" data-deploy="billing_store:quick_deploy">Quick Deploy</button>
   </div>
   <div class="result hidden" id="bsServiceResult"></div>
  </div>
  <div class="section">
   <div class="row">
    <button class="btn" id="refresh">Refresh</button>
    <button class="btn primary" id="fullscreen">Full Dev Panel</button>
   </div>
  </div>
 </div>
</div>
<script>
const $=id=>document.getElementById(id);
let current=window.openai?.toolOutput||{},lastRun=null,lastRunTarget=null,liveTimer=null,currentPage="overview",refreshingStatus=false,releaseStates={base:null,engine:null},releaseStatesLoaded=false;
function short(v){return v?String(v).slice(0,8):"—"}
function text(el,value){$(el).textContent=value==null?"—":String(value)}
function stateClass(el,state){const node=$(el);if(!node)return;node.classList.remove("state-red","state-blue","state-orange","state-green");if(state)node.classList.add("state-"+state)}
function newestRun(...runs){return runs.filter(Boolean).sort((a,b)=>new Date(b.created_at||0).getTime()-new Date(a.created_at||0).getTime())[0]||null}
function resultMessage(value,fallback="Done"){
 if(value==null)return fallback;
 if(typeof value==="string"){
  const clean=value.trim();
  if(!clean)return fallback;
  try{return resultMessage(JSON.parse(clean),fallback)}catch{return clean}
 }
 if(value instanceof Error)return value.message||fallback;
 if(typeof value==="object"){
  if(value.error)return String(value.error);
  if(value.message)return String(value.message);
  if(Array.isArray(value.results)){
   const messages=value.results.map(item=>item?.message).filter(Boolean);
   if(messages.length)return messages.join(" ");
  }
  if(value.code&&value.ok===false)return String(value.code);
 }
 return fallback;
}
function showResult(id,value,options={}){
 const el=$(id);if(!el)return;
 const failed=options.error===true||Boolean(value?.error)||value?.ok===false;
 el.classList.remove("hidden","ok","error");
 el.classList.add(failed?"error":"ok");
 el.textContent=resultMessage(value,options.fallback|| (failed?"Action failed.":"Done."));
}
function setRefreshMeta(label="Live status",busy=false){const pulse=$("statusPulse");if(pulse)pulse.classList.toggle("busy",busy);text("refreshState",label);}
function markChecked(){text("lastChecked","Checked "+new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"}));}
function applyReleaseState(target,state){
 releaseStates[target]=state;
 const prefix=target==="base"?"base":"engine",published=state?.currentVersion?"v"+state.currentVersion:"none",next=state?.suggestedVersion?"v"+state.suggestedVersion:"—";
 text(prefix+"VersionLine","Published "+published+" → Next "+next);
 text(prefix+"SourceMeta",state?.preparedCurrent?"Source ready":((state?.commitsAhead||0)+" commits to prepare"));
 const db=state?.database;
 text(prefix+"DbMeta",db?(db.ok===false?"DB blocked":db.changedMigrationCount?("DB "+db.changedMigrationCount+" new"):("DB no changes")):"DB pending");
 if(target==="engine")text("engineCompatMeta",state?.minimumBaseVersion?"Min Base v"+state.minimumBaseVersion:"Base pending");
 text(prefix+"BuildState",state?.preparedCurrent?(db?.ok===false?"DB blocked":"Ready"):"Prepare first");
 stateClass(prefix+"BuildState",state?.preparedCurrent?(db?.ok===false?"red":"orange"):"blue");
 const input=$(prefix+"Version");
 if(input&&input.dataset.dirty!=="1"&&state?.suggestedVersion)input.value=state.suggestedVersion;
 const ready=Boolean(state?.preparedCurrent&&db?.ok!==false);
 for(const id of [prefix+"Inspect",prefix+"Database",prefix+"Build"])if($(id))$(id).disabled=!state?.preparedCurrent;
 if($(prefix+"Build"))$(prefix+"Build").textContent="Build "+(input?.value?("v"+input.value):"release");
}
async function releaseStatus(target){
 if(!window.openai?.callTool)return null;
 const result=await window.openai.callTool("release_build",{action:"status",target,channel:"stable"});
 return unpack(result);
}
async function refreshReleaseStates(force=false){
 if(releaseStatesLoaded&&!force)return;
 try{
  const base=await releaseStatus("base");applyReleaseState("base",base);
  const engine=await releaseStatus("engine");applyReleaseState("engine",engine);
  releaseStatesLoaded=true;
 }catch(e){
  showResult("prepareResult",e,{error:true,fallback:"Release state unavailable."});
 }
}
function showPage(page){currentPage=["overview","releases","services"].includes(page)?page:"overview";document.querySelectorAll("[data-page]").forEach(el=>el.classList.toggle("pageHidden",el.dataset.page!==currentPage));document.querySelectorAll("[data-page-btn]").forEach(btn=>btn.classList.toggle("active",btn.dataset.pageBtn===currentPage));try{window.openai?.setWidgetState?.({devPage:currentPage})}catch{}if(currentPage==="releases")void refreshReleaseStates(false);}
function unpack(result){return result?.structuredContent||result?.content?.find?.(x=>x.type==="text")?.text||result}
function stageRequestedIntent(requested){
 if(!requested||requested.intent==="open")return;
 const intent=String(requested.intent||""),target=String(requested.target||""),action=String(requested.action||"");
 let page="overview",selector="",label="@Dev "+intent;
 if(intent==="prepare"){page="releases";selector='[data-call="prepare"][data-target="'+target+'"]';label+=" "+(target||"");}
 else if(intent==="release_build"){page="releases";selector='[data-release-build="'+target+':'+action+'"]';label+=" "+[target,action].filter(Boolean).join(" ");}
 else if(intent==="deploy"){page="services";selector='[data-deploy="'+target+':'+action+'"]';label+=" "+[target,action].filter(Boolean).join(" ");}
 else if(intent==="release"){page="releases";label+=" "+[target,action].filter(Boolean).join(" ");}
 else if(intent==="update"||intent==="license_change"||intent==="lockdown"){page="overview";label+=" "+[target,action,requested.identity].filter(Boolean).join(" ");}
 showPage(page);
 const banner=$("stagedIntent");
 if(banner){banner.classList.remove("hidden","error");banner.classList.add("ok");banner.textContent=(label.trim()+" staged. Nothing has run. Use the Dev Panel control and confirm to execute.");}
 if(selector){const button=document.querySelector(selector);if(button){button.focus({preventScroll:true});button.scrollIntoView({block:"center",behavior:"smooth"});}}
}
function render(data){
 current=data||{};
 stageRequestedIntent(data?.requestedIntent);
 const base=data?.base||{},engine=data?.engine||{},lm=data?.licenseManager||{},bs=data?.billingStore||{};
 const baseAhead=Number(base.commitsAhead||0),engineAhead=Number(engine.commitsAhead||0);
 const basePrepareFailed=!base.preparedCurrent&&base.latestPrepare?.status==="completed"&&base.latestPrepare?.conclusion==="failure";
 const enginePrepareFailed=!engine.preparedCurrent&&engine.latestPrepare?.status==="completed"&&engine.latestPrepare?.conclusion==="failure";
 const baseColor=base.disabled?null:base.preparedCurrent?"orange":basePrepareFailed?"red":"blue";
 const engineColor=engine.disabled?null:engine.preparedCurrent?"orange":enginePrepareFailed?"red":"blue";
 text("baseState",base.disabled?"Disabled":base.preparedCurrent?"Ready to package":basePrepareFailed?"Prepare failed":"Prepare required");
 text("baseDetail",base.disabled?"":(base.preparedCurrent?("release "+short(base.preparedSha)):basePrepareFailed?"Last prepare workflow failed":(baseAhead+" commit"+(baseAhead===1?"":"s")+" ahead")));
 text("engineState",engine.disabled?"Disabled":engine.preparedCurrent?"Ready to package":enginePrepareFailed?"Prepare failed":"Prepare required");
 text("engineDetail",engine.disabled?"":(engine.preparedCurrent?("release "+short(engine.preparedSha)):enginePrepareFailed?"Last prepare workflow failed":(engineAhead+" commit"+(engineAhead===1?"":"s")+" ahead")));
 stateClass("baseCard",baseColor);stateClass("engineCard",engineColor);

 const lmService=lm?.service||{},lmHealth=lm?.health,lmLockKnown=lm?.lockdown?.ok===true,lmLocked=lmLockKnown&&lm?.lockdown?.locked===true,lmLockUnavailable=lm?.lockdown?.ok===false,lmCurrent=Boolean(lmService.productionCurrent),bsCurrent=Boolean(bs?.productionCurrent);
 const lmAttempt=newestRun(lmService.latestDeploy,lmService.latestQuickDeploy),bsAttempt=newestRun(bs?.latestDeploy,bs?.latestQuickDeploy);
 const lmFailed=lmAttempt?.status==="completed"&&lmAttempt?.conclusion==="failure";
 const bsFailed=bsAttempt?.status==="completed"&&bsAttempt?.conclusion==="failure";
 const lmMain=lmService.currentSha,lmProd=lmService.lastSuccessful?.head_sha,bsMain=bs?.currentSha,bsProd=bs?.lastSuccessful?.head_sha;
 const lmColor=lm?.disabled?null:lmLocked?"red":lmFailed?"red":lmCurrent?"green":"blue";
 const bsColor=bs?.disabled?null:bsFailed?"red":bsCurrent?"green":"blue";
 text("lmState",lm?.disabled?"Disabled":lmLocked?"LOCKED DOWN":lmFailed?"Deploy failed":lmCurrent?"Latest deployed":"Update available");
 text("lmDetail",lm?.disabled?"":lmLocked?(lm?.lockdown?.message||"Emergency authority lockdown active"):(lmFailed?("failed "+short(lmAttempt?.head_sha)):("main "+short(lmMain)+" · prod "+short(lmProd)+(lmLockUnavailable?" · lockdown check unavailable":""))));
 text("bsState",bs?.disabled?"Disabled":bsFailed?"Deploy failed":bsCurrent?"Latest deployed":"Update available");
 text("bsDetail",bs?.disabled?"":(bsFailed?("failed "+short(bsAttempt?.head_sha)):("main "+short(bsMain)+" · prod "+short(bsProd))));
 stateClass("lmCard",lmColor);stateClass("bsCard",bsColor);

 const releasesReady=base.preparedCurrent&&engine.preparedCurrent;
 const releaseFailed=basePrepareFailed||enginePrepareFailed;
 text("releaseFreshness",releaseFailed?"Prepare failed":releasesReady?"Ready to package":(baseAhead+engineAhead)+" commits to prepare");
 stateClass("releaseFreshness",releaseFailed?"red":releasesReady?"orange":"blue");
 text("lmDeployState",lm?.disabled?"Disabled":lmLocked?"LOCKED":lmFailed?"Failed":lmCurrent?(lmLockUnavailable?"Latest · check unavailable":"Latest"):"Update available");stateClass("lmDeployState",lmColor);
 text("bsDeployState",bs?.disabled?"Disabled":bsFailed?"Failed":bsCurrent?"Latest":"Update available");stateClass("bsDeployState",bsColor);
 const anyFailure=basePrepareFailed||enginePrepareFailed||lmLocked||lmFailed||bsFailed;
 const anyAction=!base.preparedCurrent||!engine.preparedCurrent||!lmCurrent||!bsCurrent;
 text("overall",anyFailure?"Failure":anyAction?"Action needed":"Latest");stateClass("overall",anyFailure?"red":anyAction?"blue":"green");
}
function mutationPrompt(name,args={}){
 if(name==="prepare")return "Prepare "+String(args?.target||"release")+"? This dispatches the guarded preparation workflow.";
 if(name==="deploy"&&String(args?.action||"status")!=="status")return "Run "+String(args?.action||"deployment").replaceAll("_"," ")+" for "+String(args?.target||"service")+"?";
 if(name==="release"&&!["list","get","manifest","validation","source","build","failures","compare"].includes(String(args?.action||"")))return "Apply release action "+String(args?.action||"change")+"?";
 if(name==="release_build"&&String(args?.action||"")==="build")return "Build and package the "+String(args?.target||"release")+" release?";
 if(name==="update"&&["apply","retry","rollback"].includes(String(args?.action||"")))return "Apply customer update action "+String(args?.action)+"?";
 if(name==="license_change")return "Change this customer licence?";
 if(name==="lockdown"&&["lock","unlock"].includes(String(args?.action||"")))return String(args?.action)==="lock"?"Lock down the Licence Manager API?":"Unlock the Licence Manager API?";
 return "";
}
async function call(name,args={}){
 const prompt=mutationPrompt(name,args);
 if(prompt&&!window.confirm(prompt))throw new Error("Action cancelled.");
 document.body.classList.add("busy");
 try{
  if(!window.openai?.callTool)throw new Error("ChatGPT tool bridge is unavailable.");
  const result=await window.openai.callTool(name,args);
  const value=unpack(result);
  if(value?.run){lastRun=value.run;lastRunTarget=args?.target||null}
  if(value?.results){
   const item=value.results.find?.(x=>x.run);
   if(item?.run){lastRun=item.run;lastRunTarget=item.target||args?.target||null}
  }
  if(lastRun&&lastRunTarget)startLive();
  return value;
 }finally{document.body.classList.remove("busy")}
}
async function refreshStatus(silent=false){
 if(refreshingStatus)return current;
 refreshingStatus=true;
 if(!silent)setRefreshMeta("Refreshing…",true);
 try{
  const r=await call("status",{scope:"all"});
  render(r);markChecked();
  if(!silent)setRefreshMeta("Live status",false);
  return r;
 }catch(e){
  if(!silent)setRefreshMeta("Refresh failed",false);
  return null;
 }finally{refreshingStatus=false}
}
document.querySelectorAll("[data-call=prepare]").forEach(btn=>btn.addEventListener("click",async()=>{
 const target=btn.dataset.target;
 try{
  const result=await call("prepare",{target});
  showResult("prepareResult",result,{fallback:target==="both"?"Base and Engine preparation queued.":(target==="base"?"Base preparation queued.":"Engine preparation queued.")});
  releaseStatesLoaded=false;void refreshStatus(true);
 }catch(e){showResult("prepareResult",e,{error:true,fallback:"Prepare failed."})}
}));
for(const target of ["base","engine"]){
 const input=$(target+"Version");
 if(input)input.addEventListener("input",()=>{input.dataset.dirty="1";if($(target+"Build"))$(target+"Build").textContent="Build "+(input.value?("v"+input.value):"release")});
}
document.querySelectorAll("[data-use-suggested]").forEach(btn=>btn.addEventListener("click",()=>{
 const target=btn.dataset.useSuggested,state=releaseStates[target],input=$(target+"Version");
 if(input&&state?.suggestedVersion){input.value=state.suggestedVersion;input.dataset.dirty="0";if($(target+"Build"))$(target+"Build").textContent="Build v"+state.suggestedVersion}
}));
document.querySelectorAll("[data-release-build]").forEach(btn=>btn.addEventListener("click",async()=>{
 const [target,action]=btn.dataset.releaseBuild.split(":"),input=$(target+"Version"),resultId=target+"BuildResult";
 try{
  const args={action,target,channel:"stable"};
  if(input?.value.trim())args.version=input.value.trim();
  const result=await call("release_build",args);
  applyReleaseState(target,{...(releaseStates[target]||{}),...result,database:result?.database??releaseStates[target]?.database});
  showResult(resultId,result,{fallback:target==="base"?"Base release action complete.":"Update release action complete."});
  if(action==="build"){lastRunTarget=target;releaseStatesLoaded=false;void refreshReleaseStates(true)}
 }catch(e){showResult(resultId,e,{error:true,fallback:"Release action failed."})}
}));
document.querySelectorAll("[data-deploy]").forEach(btn=>btn.addEventListener("click",async()=>{
 const [target,action]=btn.dataset.deploy.split(":"),resultId=target==="license_manager"?"lmServiceResult":"bsServiceResult";
 const label=target==="license_manager"?"Licence Manager":"Billing Store";
 try{
  const result=await call("deploy",{target,action});
  showResult(resultId,result,{fallback:label+" "+action.replaceAll("_"," ")+" queued."});
  void refreshStatus(true);
 }catch(e){showResult(resultId,e,{error:true,fallback:label+" action failed."})}
}));
$("refresh").addEventListener("click",async()=>{const r=await refreshStatus(false);releaseStatesLoaded=false;if(currentPage==="releases")void refreshReleaseStates(true);if(!r)showResult("prepareResult","Status refresh failed.",{error:true})});
document.querySelectorAll("[data-page-btn]").forEach(btn=>btn.addEventListener("click",()=>showPage(btn.dataset.pageBtn)));
$("fullscreen").addEventListener("click",async()=>{if(window.openai?.requestDisplayMode)await window.openai.requestDisplayMode({mode:"fullscreen"})});
$("closePanel").addEventListener("click",async()=>{try{if(window.openai?.requestClose){await window.openai.requestClose();return}if(window.openai?.requestDisplayMode&&window.openai?.displayMode!=="inline"){await window.openai.requestDisplayMode({mode:"inline"});return}}catch{}$("card").classList.add("hidden")});
async function refreshLive(){
 if(!lastRun?.id||!lastRunTarget||!window.openai?.callTool)return;
 try{
  const value=unpack(await window.openai.callTool("logs",{target:lastRunTarget,run_id:Number(lastRun.id)}));
  const run=value?.run||{};
  if(run.status==="completed"){
   if(liveTimer){clearInterval(liveTimer);liveTimer=null}
   void refreshStatus(true);
   releaseStatesLoaded=false;
   if(currentPage==="releases")void refreshReleaseStates(true);
  }
 }catch{}
}
function startLive(){void refreshLive();if(liveTimer)clearInterval(liveTimer);liveTimer=setInterval(()=>void refreshLive(),60000)}
function applyMode(){const mode=window.openai?.displayMode;document.body.classList.toggle("fullscreen",mode==="fullscreen");document.body.classList.toggle("pip",mode==="pip");if(mode==="pip"&&lastRun&&!liveTimer)startLive()}
window.addEventListener("openai:set_globals",()=>{applyMode();if(window.openai?.toolOutput)render(window.openai.toolOutput)});
if(!MCP_UI_POLICY.fullscreen)$("fullscreen").classList.add("hidden");
applyMode();render(current);showPage(window.openai?.widgetState?.devPage||"overview");markChecked();if(!current?.checkedAt)setTimeout(()=>void refreshStatus(true),250);
</script>
</body>
</html>`;

export function devPanelUiResource(settings:any={}){
 const origin=String(process.env.DEV_MCP_PUBLIC_ORIGIN||process.env.APP_URL||"https://dev.incendiarynetworks.cc").replace(/\/+$/,"");
 const policy={fullscreen:settings.ui_fullscreen_enabled!==false,pip:settings.ui_pip_enabled!==false};
 const modes=["inline",...(policy.fullscreen?["fullscreen"]:[]),...(policy.pip?["pip"]:[])];
 const html=DEV_PANEL_UI_HTML.replace("<script>\nconst $=", "<script>\nconst MCP_UI_POLICY="+JSON.stringify(policy)+";\nconst $=");
 return {
  uri:DEV_PANEL_UI_URI,
  name:"Private Dev Panel",
  description:"Mobile-first private developer controls for Base, Engine, deployments and customer licensing.",
  mimeType:"text/html;profile=mcp-app",
  text:html,
  _meta:{
   ui:{prefersBorder:true,domain:origin,csp:{connectDomains:[origin],resourceDomains:[]}},
   "openai/ui":{availableDisplayModes:modes},
   "openai/widgetDescription":"Private Dev Panel controls for release preparation, deployments, updates and customer licence management."
  }
 };
}
