import {createFileRoute} from "@tanstack/react-router";
import {getDevControlJobs,getDevControlSettings,getDevControlSystems,licenseManagerRequest,requireDevControlOwner} from "@/lib/dev-control.server";
export const Route=createFileRoute("/api/dev-control/v1/diagnostics")({server:{handlers:{GET:async({request})=>{
 try{
  requireDevControlOwner(request);
  const [settings,systems,jobs,lockdown]=await Promise.all([
   getDevControlSettings(),getDevControlSystems(),getDevControlJobs(10),licenseManagerRequest("/lockdown/status").catch((error:any)=>({ok:false,error:error?.message||"unavailable"}))
  ]);
  return Response.json({ok:true,checkedAt:new Date().toISOString(),settings,systems:systems.systems,jobs:jobs.jobs,licenseManager:{lockdown}});
 }catch(error){return Response.json({ok:false,error:error instanceof Error?error.message:"Diagnostics failed"},{status:500})}
}}}});
