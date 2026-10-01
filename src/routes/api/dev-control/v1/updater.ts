import {createFileRoute} from "@tanstack/react-router";
import {getDevControlSettings,licenseManagerRequest,requireDevControlOwner} from "@/lib/dev-control.server";
export const Route=createFileRoute("/api/dev-control/v1/updater")({server:{handlers:{
 GET:async({request})=>{try{requireDevControlOwner(request);const settings=await getDevControlSettings();if(!settings.updater_controls_enabled)return Response.json({ok:false,error:"UPDATER_CONTROLS_DISABLED"},{status:403});const u=new URL(request.url);const payload={product:u.searchParams.get("product")||"orbitfs_base",channel:u.searchParams.get("channel")||"stable",type:u.searchParams.get("type")||"update",release_id:u.searchParams.get("release_id")||undefined};return Response.json(await licenseManagerRequest("/updater",{method:"POST",body:JSON.stringify(payload)}))}catch(error){return Response.json({ok:false,error:error instanceof Error?error.message:"Updater unavailable"},{status:502})}}
}}});
