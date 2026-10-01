import {createFileRoute} from "@tanstack/react-router";
import {licenseManagerRecoveryRequest,licenseManagerRequest,recordDevControlAudit,requireDevControlOwner} from "@/lib/dev-control.server";
export const Route=createFileRoute("/api/dev-control/v1/lockdown")({server:{handlers:{
 GET:async({request})=>{try{requireDevControlOwner(request);return Response.json(await licenseManagerRequest("/lockdown/status"),{headers:{"cache-control":"no-store"}})}catch(error){return Response.json({ok:false,error:error instanceof Error?error.message:"Lockdown status unavailable"},{status:502})}},
 POST:async({request})=>{try{const actor=requireDevControlOwner(request);const body=await request.json().catch(()=>({}));const action=String(body.action||"").trim();const reason=String(body.reason||"").trim();if(!reason)return Response.json({ok:false,error:"LOCKDOWN_REASON_REQUIRED"},{status:400});
  if(action==="enable"){
   if(String(body.confirm||"")!=="LOCKDOWN")return Response.json({ok:false,error:"LOCKDOWN_CONFIRMATION_REQUIRED"},{status:409});
   const data=await licenseManagerRequest("/lockdown",{method:"POST",body:JSON.stringify({confirm:"LOCKDOWN",reason,message:body.message})});
   await recordDevControlAudit(actor,"authority.lockdown.enable","license_manager",{reason});
   return Response.json(data);
  }
  if(action==="disable"){
   if(String(body.confirm||"")!=="UNLOCK")return Response.json({ok:false,error:"UNLOCK_CONFIRMATION_REQUIRED"},{status:409});
   const data=await licenseManagerRecoveryRequest({method:"POST",body:JSON.stringify({confirm:"UNLOCK",reason})});
   await recordDevControlAudit(actor,"authority.lockdown.disable","license_manager",{reason});
   return Response.json(data);
  }
  return Response.json({ok:false,error:"INVALID_LOCKDOWN_ACTION"},{status:400});
 }catch(error){return Response.json({ok:false,error:error instanceof Error?error.message:"Lockdown control failed"},{status:502})}}
}}});
