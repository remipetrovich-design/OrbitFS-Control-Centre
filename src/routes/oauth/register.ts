import {createFileRoute} from "@tanstack/react-router";
import {registerOAuthClient} from "@/lib/dev-oauth.server";

export const Route=createFileRoute("/oauth/register")({
 server:{handlers:{
  POST:async({request})=>{
   try{
    const body=await request.json().catch(()=>({}));
    const client=await registerOAuthClient(body);
    return Response.json(client,{status:201,headers:{"cache-control":"no-store"}});
   }catch(error){
    return Response.json({
     error:"invalid_client_metadata",
     error_description:error instanceof Error?error.message:"Client registration failed"
    },{status:400,headers:{"cache-control":"no-store"}});
   }
  }
 }}
});
