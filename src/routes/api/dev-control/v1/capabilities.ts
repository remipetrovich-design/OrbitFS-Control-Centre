import {createFileRoute} from "@tanstack/react-router";
import {devControlTargetList,requireDevControlOwner} from "@/lib/dev-control.server";

export const Route=createFileRoute("/api/dev-control/v1/capabilities")({server:{handlers:{GET:async({request})=>{
 try{
  requireDevControlOwner(request);
  return Response.json({
   ok:true,apiVersion:"v1",targets:devControlTargetList(),
   endpoints:[
    "health","capabilities","settings","systems","actions","jobs","job","audit","diagnostics",
    "license-manager","authority-control","lockdown","updater","deployer","releases","release-channels","installation-lifecycle"
   ],
   actions:["prepare_latest_source","quick_deploy","production_deploy","redeploy"],
   jobControls:["cancel","retry"],
   notes:{restart:"Not exposed until a real service restart mechanism exists.",rollback:"Reserved until a verified rollback implementation exists."}
  },{headers:{"cache-control":"no-store"}});
 }catch{return Response.json({ok:false,error:"UNAUTHORIZED"},{status:401})}
}}}});
