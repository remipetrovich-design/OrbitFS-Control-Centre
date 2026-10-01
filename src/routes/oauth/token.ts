import {createFileRoute} from "@tanstack/react-router";
import {exchangeOAuthToken} from "@/lib/dev-oauth.server";

function formObject(form:FormData){
 const out:Record<string,string>={};
 for(const [key,value] of form.entries())if(typeof value==="string")out[key]=value;
 return out;
}

export const Route=createFileRoute("/oauth/token")({
 server:{handlers:{
  POST:async({request})=>{
   try{
    const type=String(request.headers.get("content-type")||"");
    const body=type.includes("application/json")
      ? await request.json().catch(()=>({}))
      : formObject(await request.formData());
    const result=await exchangeOAuthToken(body as Record<string,string>);
    return Response.json(result,{headers:{"cache-control":"no-store","pragma":"no-cache"}});
   }catch(error){
    return Response.json({
     error:"invalid_grant",
     error_description:error instanceof Error?error.message:"Token exchange failed"
    },{status:400,headers:{"cache-control":"no-store","pragma":"no-cache"}});
   }
  }
 }}
});
