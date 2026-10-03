import {createFileRoute} from "@tanstack/react-router";

function licenseManagerProfileUrl(){
 const base=String(process.env.LICENSE_MANAGER_URL||process.env.LICENSE_MASTER_URL||"https://incendiarynetworks.cc/api/v1").trim().replace(/\/+$/,"");
 return base+"/github-profile";
}

export const Route=createFileRoute("/api/github-profile")({
 server:{
  handlers:{
   GET:async()=>{
    try{
     const response=await fetch(licenseManagerProfileUrl(),{cache:"no-store",signal:AbortSignal.timeout(5000)});
     const body=await response.json().catch(()=>({}));
     if(!response.ok)return Response.json({error:body?.error||"License Manager source mode unavailable"},{status:503,headers:{"cache-control":"no-store"}});
     const raw=String(body?.profile||"").trim().toLowerCase();
     if(raw!=="primary"&&raw!=="fallback")return Response.json({error:"License Manager returned an invalid source mode"},{status:503,headers:{"cache-control":"no-store"}});
     return Response.json({profile:raw,mode:raw==="primary"?"main":"fallback",updatedAt:body?.updatedAt||null,source:"license_manager"},{headers:{"cache-control":"no-store, no-cache, must-revalidate"}});
    }catch(error){
     return Response.json({error:error instanceof Error?error.message:"Unable to resolve License Manager source mode"},{status:503,headers:{"cache-control":"no-store"}});
    }
   }
  }
 }
});
