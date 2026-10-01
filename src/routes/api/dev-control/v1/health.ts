import {createFileRoute} from "@tanstack/react-router";
import {requireOwner} from "@/lib/panel.server";

const TARGETS=[
 {key:"license_manager",label:"Custom License Manager",repo:process.env.LICENSE_MANAGER_REPO||"lucaskerim123/Custom-licence-manager"},
 {key:"billing_store",label:"V2 Billing Store",repo:process.env.BILLING_STORE_REPO||"lucaskerim123/V2_Billing_Store"},
];

function bearer(request:Request){
 return String(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
}

export const Route=createFileRoute("/api/dev-control/v1/health")({
 server:{
  handlers:{
   GET:async({request})=>{
    try{
     const token=bearer(request);
     if(!token)return Response.json({error:"UNAUTHORIZED"},{status:401});
     requireOwner(token);
     const enabled=String(process.env.DEV_CONTROL_ENABLED||"true").toLowerCase()!=="false";
     return Response.json({
      ok:true,
      service:"orbitfs-dev-control",
      apiVersion:"v1",
      enabled,
      ownerOnly:true,
      authority:{
       devControl:"operations-only",
       licenseManager:"authoritative",
      },
      modules:{
       deployer:{status:"foundation"},
       updater:{status:"foundation"},
       licensingBridge:{status:"planned"},
       jobs:{status:"foundation"},
      },
      targets:TARGETS,
      checkedAt:new Date().toISOString(),
     },{headers:{"cache-control":"no-store"}});
    }catch(error){
     const message=error instanceof Error?error.message:"UNAUTHORIZED";
     const status=/owner access required|not signed in|invalid session/i.test(message)?401:500;
     return Response.json({error:status===401?"UNAUTHORIZED":message},{status});
    }
   }
  }
 }
});
