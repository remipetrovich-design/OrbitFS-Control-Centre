import {createFileRoute} from "@tanstack/react-router";
import {createClient} from "@supabase/supabase-js";
import {localGithubProfileName} from "@/lib/github-profile";
import {logIngress} from "@/lib/incendiary-diagnostic";

// Read-only dependency check. Do not return credentials, usernames or
// upstream error bodies. This is safe for monitoring without logging in.
export const Route=createFileRoute("/api/health")({
 server:{
  handlers:{
   GET:async()=>{
    const start=Date.now();
    const request_id=crypto.randomUUID?.()||Math.random().toString(36).slice(2);
    const headers={"cache-control":"no-store"};
    let database="unavailable";
    let licenseManager="unavailable";
    let sourceMode="unavailable";
    let status=200;
    let error:string|null=null;
    try{
     // Reuse the same Supabase authentication path as panel.server.ts,
     // rather than a different helper that may hide an invalid key.
     const url=String(process.env.SUPABASE_URL||"");
     const key=String(process.env.SUPABASE_SERVICE_ROLE_KEY||"");
     if(url&&key){
      const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
      const [users,drafts,attempts]=await Promise.all([
       client.from("users").select("id",{head:true,count:"exact"}),
       client.from("panel_release_drafts").select("id",{head:true,count:"exact"}),
       client.from("panel_release_attempts").select("id",{head:true,count:"exact"})
      ]);
      if(!users.error&&!drafts.error&&!attempts.error)database="ready";
     }
    }catch(e:any){error=e?.message||"supabase"}
    try{
     const base="https://lm.incendiarynetworks.cc/api/v1";
     const api=new URL(base);
     if(api.protocol!=="https:"||(localGithubProfileName()==="fallback"&&api.hostname!=="lm.incendiarynetworks.cc")||api.pathname!=="/api/v1"||api.username||api.password||api.search||api.hash){
      throw new Error("License Manager API origin is not configured for this mode");
     }
     const token=String(process.env.LICENSE_MASTER_API_TOKEN||"").trim();
     if(!token)throw new Error("License Manager API token is missing");
     const [channels,profile]=await Promise.all([
      fetch(api.origin+"/api/v1/release-channels",{headers:{authorization:"Bearer "+token},cache:"no-store",signal:AbortSignal.timeout(7500)}),
      fetch(api.origin+"/api/v1/github-profile",{cache:"no-store",signal:AbortSignal.timeout(7500)})
     ]);
     if(channels.status===401||channels.status===403)licenseManager="unauthorized";
     else if(channels.ok){
      const body=await channels.json().catch(()=>null);
      licenseManager=Array.isArray(body?.channels)?"ready":"invalid_response";
     }else licenseManager="unavailable";
     if(profile.ok){
      const body=await profile.json().catch(()=>null);
      sourceMode=body?.profile==="fallback"?"fallback":body?.profile==="primary"?"primary":"unavailable";
     }
    }catch(e:any){error=error||e?.message||"license_manager"}
    const ok=database==="ready"&&licenseManager==="ready"&&sourceMode===localGithubProfileName();
    status=ok?200:503;
    logIngress({
      source_system:"dev_panel",
      target:"other",
      account_mode:localGithubProfileName()==="fallback"?"fallback":"main",
      method:"GET",
      endpoint:"/api/health",
      status,
      request_id,
      latency_ms:Date.now()-start,
      error
    });
    return Response.json(
     {ok,service:localGithubProfileName()==="fallback"?"fallback-dev-panel":"main-dev-panel",database,license_manager_api:licenseManager,source_mode:sourceMode},
     {status,headers}
    );
   }
  }
 }
});
