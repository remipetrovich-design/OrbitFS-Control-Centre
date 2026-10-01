export const DEV_PANEL_UI_URI="ui://dev-panel/v1.html";

export const DEV_PANEL_UI_HTML=String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Dev Panel</title>
<style>
:root{color-scheme:light dark;--bg:transparent;--surface:color-mix(in srgb,Canvas 94%,CanvasText 6%);--surface2:color-mix(in srgb,Canvas 88%,CanvasText 12%);--border:color-mix(in srgb,CanvasText 18%,transparent);--text:CanvasText;--muted:color-mix(in srgb,CanvasText 58%,transparent);--good:#22a06b;--warn:#b7791f;--bad:#c93756}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
body{padding:10px}.shell{max-width:760px;margin:0 auto}.card{border:1px solid var(--border);background:var(--surface);border-radius:18px;overflow:hidden}.head{display:flex;align-items:center;gap:10px;padding:14px;border-bottom:1px solid var(--border)}.mark{width:32px;height:32px;border-radius:10px;display:grid;place-items:center;background:var(--surface2);font-weight:800}.grow{flex:1}.title{font-weight:800}.sub{font-size:11px;color:var(--muted)}.pill{font-size:10px;font-weight:800;border:1px solid var(--border);border-radius:999px;padding:5px 8px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:10px}.stat{border:1px solid var(--border);background:var(--surface2);border-radius:13px;padding:11px;min-height:76px}.stat b{display:block;margin-top:6px;font-size:13px}.dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--good);margin-right:5px}.dot.warn{background:var(--warn)}.dot.bad{background:var(--bad)}
.section{border-top:1px solid var(--border);padding:12px}.section h2{font-size:12px;margin:0 0 9px}.row{display:flex;gap:7px;flex-wrap:wrap}.btn{appearance:none;border:1px solid var(--border);background:var(--surface2);color:var(--text);border-radius:10px;padding:9px 11px;font-weight:700;font-size:11px;cursor:pointer}.btn.primary{background:var(--text);color:Canvas;border-color:var(--text)}.btn.danger{border-color:color-mix(in srgb,var(--bad) 45%,var(--border));color:var(--bad)}.btn:disabled{opacity:.55;cursor:not-allowed}.field{display:flex;gap:7px}.field input{min-width:0;flex:1;border:1px solid var(--border);background:var(--surface2);color:var(--text);border-radius:10px;padding:9px 10px;outline:none}.result{margin-top:9px;border:1px solid var(--border);background:color-mix(in srgb,var(--surface2) 75%,transparent);border-radius:11px;padding:10px;font-size:11px;white-space:pre-wrap;max-height:230px;overflow:auto}.hidden{display:none}.full-only{display:none}.fullscreen .full-only{display:block}.fullscreen .grid{grid-template-columns:repeat(4,1fr)}.fullscreen .shell{max-width:980px}.customerActions{margin-top:8px}.busy{opacity:.7;pointer-events:none}.pip .grid,.pip .section{display:none}.pip #liveSection{display:block}.pip .card{border-radius:16px}.pip #liveResult{max-height:180px}
@media(max-width:520px){body{padding:0}.card{border-radius:0;border-left:0;border-right:0}.grid{grid-template-columns:1fr 1fr}.fullscreen .grid{grid-template-columns:1fr 1fr}}
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
  </div>
  <div class="grid">
   <div class="stat"><span class="sub">Base</span><b id="baseState">—</b><span class="sub" id="baseDetail"></span></div>
   <div class="stat"><span class="sub">Engine</span><b id="engineState">—</b><span class="sub" id="engineDetail"></span></div>
   <div class="stat"><span class="sub">Licence Manager</span><b id="lmState">—</b><span class="sub" id="lmDetail"></span></div>
   <div class="stat"><span class="sub">Billing Store</span><b id="bsState">—</b><span class="sub" id="bsDetail"></span></div>
  </div>
  <div class="section">
   <h2>Prepare release branches</h2>
   <div class="row">
    <button class="btn" data-call="prepare" data-target="base">Prepare Base</button>
    <button class="btn" data-call="prepare" data-target="engine">Prepare Engine</button>
    <button class="btn primary" data-call="prepare" data-target="both">Prepare Both</button>
   </div>
   <div class="result hidden" id="prepareResult"></div>
  </div>
  <div class="section">
   <h2>Customer / licence</h2>
   <div class="field"><input id="identity" type="email" placeholder="Customer email or ID"><button class="btn primary" id="lookup">Check</button></div>
   <div class="result hidden" id="licenseResult"></div>
   <div class="row customerActions hidden" id="customerActions">
    <button class="btn danger" data-license-action="suspend">Suspend</button>
    <button class="btn" data-license-action="unsuspend">Unsuspend</button>
    <button class="btn danger" data-license-action="revoke">Revoke</button>
    <button class="btn" data-license-action="restore">Restore</button>
    <button class="btn" data-license-action="force_revalidation">Revalidate</button>
    <button class="btn" data-license-action="link">Auto-link</button>
   </div>
  </div>
  <div class="section full-only">
   <h2>Customer update</h2>
   <div class="sub">Uses the customer identity above and resolves the linked installation through Billing Store.</div>
   <div class="row" style="margin-top:8px">
    <button class="btn" data-update-action="plan">Plan Update</button>
    <button class="btn primary" data-update-action="apply">Apply Update</button>
    <button class="btn danger" data-update-action="rollback">Rollback Update</button>
   </div>
   <div class="result hidden" id="updateResult"></div>
  </div>
  <div class="section full-only">
   <h2>Release management</h2>
   <div class="field"><input id="releaseId" placeholder="Release ID"><button class="btn" data-release-action="get">Open</button></div>
   <div class="row" style="margin-top:8px">
    <button class="btn" data-release-action="validate">Validate</button>
    <button class="btn primary" data-release-action="publish">Publish</button>
    <button class="btn danger" data-release-action="unpublish">Unpublish</button>
   </div>
   <div class="result hidden" id="releaseResult"></div>
  </div>
  <div class="section full-only">
   <h2>Service operations</h2>
   <div class="row">
    <button class="btn" data-deploy="license_manager:scan">Scan Licence Manager</button>
    <button class="btn" data-deploy="license_manager:deploy">Deploy Licence Manager</button>
    <button class="btn" data-deploy="license_manager:quick_deploy">Quick Deploy Licence Manager</button>
    <button class="btn" data-deploy="billing_store:scan">Scan Billing Store</button>
    <button class="btn" data-deploy="billing_store:deploy">Deploy Billing Store</button>
    <button class="btn" data-deploy="billing_store:quick_deploy">Quick Deploy Billing Store</button>
   </div>
   <div class="result hidden" id="serviceResult"></div>
  </div>
  <div class="section hidden" id="liveSection">
   <h2>Live job</h2>
   <div class="result" id="liveResult">Waiting for workflow state…</div>
  </div>
  <div class="section">
   <div class="row">
    <button class="btn" id="refresh">Refresh</button>
    <button class="btn primary" id="fullscreen">Open Full Dev Panel</button>
    <button class="btn hidden" id="pin">Pin Live Job</button>
   </div>
  </div>
 </div>
</div>
<script>
const $=id=>document.getElementById(id);
let current=window.openai?.toolOutput||{},lastRun=null,lastRunTarget=null,liveTimer=null;
function short(v){return v?String(v).slice(0,8):"—"}
function text(el,value){$(el).textContent=value==null?"—":String(value)}
function showResult(id,value){const el=$(id);el.classList.remove("hidden");el.textContent=typeof value==="string"?value:JSON.stringify(value,null,2)}
function unpack(result){return result?.structuredContent||result?.content?.find?.(x=>x.type==="text")?.text||result}
function render(data){
 current=data||{};
 const base=data?.base||{},engine=data?.engine||{},lm=data?.licenseManager||{},bs=data?.billingStore||{};
 text("baseState",base.disabled?"Disabled":base.preparedCurrent?"Ready":"Changes available");text("baseDetail",base.disabled?"":(base.preparedCurrent?short(base.currentSha):(base.commitsAhead||0)+" commits ahead"));
 text("engineState",engine.disabled?"Disabled":engine.preparedCurrent?"Ready":"Changes available");text("engineDetail",engine.disabled?"":(engine.preparedCurrent?short(engine.currentSha):(engine.commitsAhead||0)+" commits ahead"));
 const lmHealth=lm?.health; text("lmState",lm?.disabled?"Disabled":lmHealth?.ok===false?"Issue":"Online");text("lmDetail",lm?.service?.productionCurrent?"Production current":short(lm?.service?.currentSha));
 text("bsState",bs?.disabled?"Disabled":bs?.ok===false?"Issue":bs?.productionCurrent?"Current":"Update pending");text("bsDetail",short(bs?.currentSha));
 const healthy=!base?.error&&!engine?.error&&lmHealth?.ok!==false&&bs?.ok!==false;text("overall",healthy?"Ready":"Check systems");
}
async function call(name,args={}){
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
  if(lastRun&&lastRunTarget)$("pin").classList.remove("hidden");
  return value;
 }finally{document.body.classList.remove("busy")}
}
document.querySelectorAll("[data-call=prepare]").forEach(btn=>btn.addEventListener("click",async()=>{try{showResult("prepareResult",await call("prepare",{target:btn.dataset.target}))}catch(e){showResult("prepareResult",{error:e.message})}}));
$("lookup").addEventListener("click",async()=>{const identity=$("identity").value.trim();if(!identity)return;try{const r=await call("license",{identity,view:"summary"});showResult("licenseResult",r);$("customerActions").classList.remove("hidden")}catch(e){showResult("licenseResult",{error:e.message})}});
document.querySelectorAll("[data-license-action]").forEach(btn=>btn.addEventListener("click",async()=>{const identity=$("identity").value.trim();if(!identity)return;try{const r=await call("license_change",{identity,action:btn.dataset.licenseAction});showResult("licenseResult",r)}catch(e){showResult("licenseResult",{error:e.message})}}));
document.querySelectorAll("[data-deploy]").forEach(btn=>btn.addEventListener("click",async()=>{const [target,action]=btn.dataset.deploy.split(":");try{showResult("serviceResult",await call("deploy",{target,action}))}catch(e){showResult("serviceResult",{error:e.message})}}));
document.querySelectorAll("[data-update-action]").forEach(btn=>btn.addEventListener("click",async()=>{const identity=$("identity").value.trim();if(!identity)return showResult("updateResult",{error:"Enter a customer email or ID above first."});try{showResult("updateResult",await call("update",{identity,action:btn.dataset.updateAction}))}catch(e){showResult("updateResult",{error:e.message})}}));
document.querySelectorAll("[data-release-action]").forEach(btn=>btn.addEventListener("click",async()=>{const release_id=$("releaseId").value.trim();if(!release_id)return showResult("releaseResult",{error:"Enter a release ID first."});try{showResult("releaseResult",await call("release",{release_id,action:btn.dataset.releaseAction}))}catch(e){showResult("releaseResult",{error:e.message})}}));
$("refresh").addEventListener("click",async()=>{try{const r=await call("status",{scope:"all"});render(r)}catch(e){showResult("prepareResult",{error:e.message})}});
$("fullscreen").addEventListener("click",async()=>{if(window.openai?.requestDisplayMode)await window.openai.requestDisplayMode({mode:"fullscreen"})});
async function refreshLive(){
 if(!lastRun?.id||!lastRunTarget||!window.openai?.callTool)return;
 try{
  const value=unpack(await window.openai.callTool("logs",{target:lastRunTarget,run_id:Number(lastRun.id)}));
  $("liveSection").classList.remove("hidden");
  const run=value?.run||{},jobs=value?.jobs||[];
  const lines=[lastRunTarget+" · run #"+(run.run_number||run.id||lastRun.id)+" · "+(run.status||"unknown")+(run.conclusion?" / "+run.conclusion:"")];
  for(const job of jobs)lines.push((job.conclusion==="success"?"✓":job.conclusion==="failure"?"✕":"…")+" "+job.name+" · "+job.status+(job.conclusion?" / "+job.conclusion:""));
  $("liveResult").textContent=lines.join("\n");
  if(run.status==="completed"&&liveTimer){clearInterval(liveTimer);liveTimer=null}
 }catch(e){$("liveSection").classList.remove("hidden");$("liveResult").textContent="Live job read failed: "+e.message}
}
function startLive(){void refreshLive();if(liveTimer)clearInterval(liveTimer);liveTimer=setInterval(()=>void refreshLive(),4000)}
$("pin").addEventListener("click",async()=>{if(window.openai?.requestDisplayMode)await window.openai.requestDisplayMode({mode:"pip"});startLive()});
function applyMode(){const mode=window.openai?.displayMode;document.body.classList.toggle("fullscreen",mode==="fullscreen");document.body.classList.toggle("pip",mode==="pip");if(mode==="pip"&&lastRun&&!liveTimer)startLive()}
window.addEventListener("openai:set_globals",()=>{applyMode();if(window.openai?.toolOutput)render(window.openai.toolOutput)});
applyMode();render(current);
</script>
</body>
</html>`;

export function devPanelUiResource(){
 const origin=String(process.env.DEV_MCP_PUBLIC_ORIGIN||process.env.APP_URL||"https://dev.incendiarynetworks.cc").replace(/\/+$/,"");
 return {
  uri:DEV_PANEL_UI_URI,
  name:"Private Dev Panel",
  description:"Mobile-first private developer controls for Base, Engine, deployments and customer licensing.",
  mimeType:"text/html;profile=mcp-app",
  text:DEV_PANEL_UI_HTML,
  _meta:{
   ui:{prefersBorder:true,domain:origin,csp:{connectDomains:[origin],resourceDomains:[]}},
   "openai/ui":{availableDisplayModes:["inline","fullscreen","pip"]},
   "openai/widgetDescription":"Private Dev Panel controls for release preparation, deployments, updates and customer licence management."
  }
 };
}
