import {createFileRoute} from "@tanstack/react-router";
import {supabaseAdmin} from "@/integrations/supabase/client.server";

// Read-only dependency check. Do not return credentials, usernames or
// upstream error bodies. This is safe for monitoring without logging in.
export const Route=createFileRoute("/api/health")({
 server:{
  handlers:{
   GET:async()=>{
    const headers={"cache-control":"no-store"};
    let database="unavailable";
    let licenseManager="unavailable";
    let sourceMode="unavailable";
    try{
     const {error}=await supabaseAdmin.from("users").select("id",{head:true,count:"exact"});
     if(!error)database="ready";
    }catch{}
    try{
     const base=String(process.env.LICENSE_MASTER_URL||"").trim();
     const api=new URL(base);
     if(api.protocol!=="https:"||api.hostname!=="lm.incendiarynetworks.cc"||api.pathname.replace(/\\/+$/,"")!=="/api/v1"||api.username||api.password||api.search||api.hash){
      throw new Error("Fallback API origin is not configured");
     }
     const token=String(process.env.LICENSE_MASTER_API_TOKEN||"").trim();
     if(!token)throw new Error("Fallback API token is missing");
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
    }catch{}
    const ok=database==="ready"&&licenseManager==="ready"&&sourceMode==="fallback";
    return Response.json(
     {ok,service:"fallback-dev-panel",database,license_manager_api:licenseManager,source_mode:sourceMode},
     {status:ok?200:503,headers}
    );
   }
  }
 }
});
