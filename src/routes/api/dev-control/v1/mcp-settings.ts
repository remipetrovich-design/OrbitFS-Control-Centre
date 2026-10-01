import {createFileRoute} from "@tanstack/react-router";
import {getDevMcpSettings,requireDevControlOwner,updateDevMcpSettings} from "@/lib/dev-control.server";

export const Route=createFileRoute("/api/dev-control/v1/mcp-settings")({server:{handlers:{
 GET:async({request})=>{try{requireDevControlOwner(request);return Response.json({ok:true,settings:await getDevMcpSettings(),runtime:{endpoint:"/devmcp",tokenConfigured:Boolean(String(process.env.DEV_MCP_TOKEN||"").trim()),authMode:"private-bearer-dev"}},{headers:{"cache-control":"no-store"}})}catch{return Response.json({ok:false,error:"UNAUTHORIZED"},{status:401})}},
 PATCH:async({request})=>{try{const actor=requireDevControlOwner(request);const body=await request.json().catch(()=>({}));return Response.json({ok:true,settings:await updateDevMcpSettings(actor,body)})}catch(error){return Response.json({ok:false,error:error instanceof Error?error.message:"Unable to update MCP settings"},{status:400})}}
}}});
