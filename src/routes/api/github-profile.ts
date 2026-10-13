import {createFileRoute} from "@tanstack/react-router";

// This panel is immutably attached to its own License Manager family.
function licenseManagerProfileUrl(){
 return "https://lm.incendiarynetworks.cc/api/v1/source-configuration";
}

export const Route=createFileRoute("/api/github-profile")({
 server:{
  handlers:{
   GET:async()=>{
    try{
     const response=await fetch(licenseManagerProfileUrl(),{cache:"no-store",signal:AbortSignal.timeout(5000)});
     const body=await response.json().catch(()=>({}));
     if(!response.ok)return Response.json({error:body?.error||"License Manager source mode unavailable"},{status:503,headers:{"cache-control":"no-store"}});
     const raw=body?.mode==="main"?"primary":body?.mode==="fallback"?"fallback":"";
     if(raw!=="primary"&&raw!=="fallback")return Response.json({error:"License Manager returned an invalid source mode"},{status:503,headers:{"cache-control":"no-store"}});
     return Response.json({profile:raw,mode:raw==="primary"?"main":"fallback",updatedAt:body?.updatedAt||null,source:"license_manager"},{headers:{"cache-control":"no-store, no-cache, must-revalidate"}});
    }catch(error){
     return Response.json({error:error instanceof Error?error.message:"Unable to resolve License Manager source mode"},{status:503,headers:{"cache-control":"no-store"}});
    }
   }
  }
 }
});
