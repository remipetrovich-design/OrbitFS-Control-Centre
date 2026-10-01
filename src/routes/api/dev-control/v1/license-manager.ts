import {createFileRoute} from "@tanstack/react-router";
import {getDevControlSettings,licenseManagerRequest,recordDevControlAudit,requireDevControlOwner} from "@/lib/dev-control.server";

const ACTIONS=new Set(["rotate","unlock","suspend","terminate","revoke","activate","set-component","set-components","unlock-installation"]);

export const Route=createFileRoute("/api/dev-control/v1/license-manager")({server:{handlers:{
 GET:async({request})=>{
  try{
   requireDevControlOwner(request);
   const settings=await getDevControlSettings();
   if(!settings.license_controls_enabled)return Response.json({ok:false,error:"LICENSE_CONTROLS_DISABLED"},{status:403});
   const url=new URL(request.url),view=String(url.searchParams.get("view")||"health");
   if(view==="health")return Response.json({ok:true,data:await licenseManagerRequest("/license/health")});
   if(view==="licenses")return Response.json({ok:true,data:await licenseManagerRequest("/license")});
   if(view==="audit")return Response.json({ok:true,data:await licenseManagerRequest("/audit-events?limit="+encodeURIComponent(url.searchParams.get("limit")||"50"))});
   if(view==="products")return Response.json({ok:true,data:await licenseManagerRequest("/products")});
   if(view==="releases")return Response.json({ok:true,data:await licenseManagerRequest("/releases")});
   if(view==="channels")return Response.json({ok:true,data:await licenseManagerRequest("/release-channels?include_disabled=true")});
   if(view==="authority")return Response.json({ok:true,data:await licenseManagerRequest("/authority-control")});
   if(view==="lockdown")return Response.json({ok:true,data:await licenseManagerRequest("/lockdown/status")});
   return Response.json({ok:false,error:"UNSUPPORTED_VIEW"},{status:400});
  }catch(error){const message=error instanceof Error?error.message:"Request failed";const auth=/Owner|UNAUTHORIZED|session/i.test(message);return Response.json({ok:false,error:auth?"UNAUTHORIZED":message},{status:auth?401:502})}
 },
 POST:async({request})=>{
  try{
   const actor=requireDevControlOwner(request);
   const settings=await getDevControlSettings();
   if(!settings.license_controls_enabled)return Response.json({ok:false,error:"LICENSE_CONTROLS_DISABLED"},{status:403});
   if(settings.read_only_mode||settings.emergency_kill_switch)return Response.json({ok:false,error:"DEV_CONTROL_MUTATIONS_BLOCKED"},{status:423});
   const body=await request.json().catch(()=>({}));
   const licenseId=String(body.license_id||"").trim(),action=String(body.action||"").trim();
   if(!licenseId||!ACTIONS.has(action))return Response.json({ok:false,error:"UNSUPPORTED_LICENSE_CONTROL"},{status:400});
   const payload:any={action};
   for(const key of ["installation_id","component","enabled","components"])if(body[key]!==undefined)payload[key]=body[key];
   const data=await licenseManagerRequest("/license/"+encodeURIComponent(licenseId)+"/control",{method:"POST",body:JSON.stringify(payload)});
   await recordDevControlAudit(actor,"license."+action,"license_manager",{license_id:licenseId,installation_id:body.installation_id||null});
   return Response.json({ok:true,data});
  }catch(error){const message=error instanceof Error?error.message:"Request failed";const auth=/Owner|UNAUTHORIZED|session/i.test(message);return Response.json({ok:false,error:auth?"UNAUTHORIZED":message},{status:auth?401:502})}
 }
}}});
