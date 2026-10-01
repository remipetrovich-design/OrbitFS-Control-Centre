import {createFileRoute} from "@tanstack/react-router";
import {getDevControlAudit,requireDevControlOwner} from "@/lib/dev-control.server";
export const Route=createFileRoute("/api/dev-control/v1/audit")({server:{handlers:{GET:async({request})=>{try{requireDevControlOwner(request);const limit=Number(new URL(request.url).searchParams.get("limit")||100);return Response.json({ok:true,...await getDevControlAudit(limit)},{headers:{"cache-control":"no-store"}})}catch(error){return Response.json({ok:false,error:error instanceof Error?error.message:"Request failed"},{status:500})}}}}});
