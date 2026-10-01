import {createFileRoute} from "@tanstack/react-router";
import {getDevControlSettings,requireDevControlOwner,updateDevControlSettings} from "@/lib/dev-control.server";

function errorResponse(error:unknown){const message=error instanceof Error?error.message:"Request failed";const status=/UNAUTHORIZED|Owner access required|Not signed in|session/i.test(message)?401:400;return Response.json({ok:false,error:status===401?"UNAUTHORIZED":message},{status})}

export const Route=createFileRoute("/api/dev-control/v1/settings")({
 server:{handlers:{
  GET:async({request})=>{try{requireDevControlOwner(request);return Response.json({ok:true,settings:await getDevControlSettings()},{headers:{"cache-control":"no-store"}})}catch(error){return errorResponse(error)}},
  PATCH:async({request})=>{try{const actor=requireDevControlOwner(request);const body=await request.json().catch(()=>({}));return Response.json({ok:true,settings:await updateDevControlSettings(actor,body)})}catch(error){return errorResponse(error)}}
 }}
});
