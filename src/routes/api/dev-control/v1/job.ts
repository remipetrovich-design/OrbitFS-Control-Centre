import {createFileRoute} from "@tanstack/react-router";
import {controlDevControlJob,getDevControlJob,requireDevControlOwner} from "@/lib/dev-control.server";

export const Route=createFileRoute("/api/dev-control/v1/job")({server:{handlers:{
 GET:async({request})=>{try{requireDevControlOwner(request);const id=new URL(request.url).searchParams.get("job_id")||"";if(!id)return Response.json({ok:false,error:"JOB_ID_REQUIRED"},{status:400});return Response.json({ok:true,job:await getDevControlJob(id)},{headers:{"cache-control":"no-store"}})}catch(error){return Response.json({ok:false,error:error instanceof Error?error.message:"Request failed"},{status:404})}},
 POST:async({request})=>{try{const actor=requireDevControlOwner(request);const body=await request.json().catch(()=>({}));const id=String(body.job_id||"");const action=String(body.action||"");if(!id||!["cancel","retry"].includes(action))return Response.json({ok:false,error:"INVALID_JOB_CONTROL"},{status:400});return Response.json({ok:true,job:await controlDevControlJob(actor,id,action as "cancel"|"retry")})}catch(error){return Response.json({ok:false,error:error instanceof Error?error.message:"Request failed"},{status:409})}}
}}});
