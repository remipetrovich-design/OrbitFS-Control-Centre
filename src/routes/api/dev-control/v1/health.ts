import {createFileRoute} from "@tanstack/react-router";
import {devControlTargetList,getDevControlSettings,requireDevControlOwner} from "@/lib/dev-control.server";

export const Route=createFileRoute("/api/dev-control/v1/health")({server:{handlers:{GET:async({request})=>{
 try{
  requireDevControlOwner(request);
  const settings=await getDevControlSettings();
  const envEnabled=String(process.env.DEV_CONTROL_ENABLED||"true").toLowerCase()!=="false";
  return Response.json({
   ok:true,
   service:"orbitfs-dev-control",
   apiVersion:"v1",
   ownerOnly:true,
   enabled:envEnabled&&settings.enabled!==false&&!settings.emergency_kill_switch,
   environmentEnabled:envEnabled,
   readOnly:settings.read_only_mode===true,
   emergencyKillSwitch:settings.emergency_kill_switch===true,
   storageReady:settings.storageReady!==false,
   authority:{devControl:"independent-control-plane",licenseManager:"external-authority"},
   modules:{
    deployer:{status:settings.production_deploy_enabled?"ready":"disabled"},
    updater:{status:settings.updater_controls_enabled?"ready":"disabled"},
    licensingBridge:{status:settings.license_controls_enabled?"ready":"disabled"},
    billingBridge:{status:settings.billing_controls_enabled?"ready":"disabled"},
    jobs:{status:settings.storageReady===false?"migration-required":"ready"}
   },
   targets:devControlTargetList(),
   checkedAt:new Date().toISOString()
  },{headers:{"cache-control":"no-store"}});
 }catch(error){
  const message=error instanceof Error?error.message:"UNAUTHORIZED";
  const auth=/Owner|UNAUTHORIZED|session|signed in/i.test(message);
  return Response.json({ok:false,error:auth?"UNAUTHORIZED":message},{status:auth?401:500});
 }
}}}});
