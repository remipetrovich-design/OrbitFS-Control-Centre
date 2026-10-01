import {createFileRoute} from "@tanstack/react-router";
import {authorizeOwner,oauthAuthorizeHtml,oauthIssuer,validateAuthorizationRequest} from "@/lib/dev-oauth.server";

function urlParams(url:URL){
 const out:Record<string,string>={};
 url.searchParams.forEach((value,key)=>out[key]=value);
 return out;
}
function formParams(form:FormData){
 const out:Record<string,string>={};
 for(const [key,value] of form.entries())if(typeof value==="string")out[key]=value;
 return out;
}
function html(body:string,status=200){
 return new Response(body,{status,headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store"}});
}

export const Route=createFileRoute("/oauth/authorize")({
 server:{handlers:{
  GET:async({request})=>{
   try{
    const input=urlParams(new URL(request.url));
    const valid=await validateAuthorizationRequest(input);
    return html(oauthAuthorizeHtml(input,String(valid.client?.client_name||"OpenAI MCP Client")));
   }catch(error){
    const message=String(error instanceof Error?error.message:"Authorization request failed").replace(/[<>&]/g,"");
    return html("<!doctype html><html><body style=\"background:#090d13;color:#fff;font-family:system-ui;padding:40px\"><h1>Invalid OAuth request</h1><p>"+message+"</p></body></html>",400);
   }
  },
  POST:async({request})=>{
   const all=formParams(await request.formData());
   const ownerEmail=String(all.owner_email||"");
   const ownerPassword=String(all.owner_password||"");
   delete all.owner_email;
   delete all.owner_password;
   try{
    const result=await authorizeOwner(all,ownerEmail,ownerPassword);
    const redirect=new URL(result.redirectUri);
    redirect.searchParams.set("code",result.code);
    if(result.state)redirect.searchParams.set("state",result.state);
    redirect.searchParams.set("iss",oauthIssuer());
    return Response.redirect(redirect.toString(),302);
   }catch(error){
    try{
     const valid=await validateAuthorizationRequest(all);
     return html(oauthAuthorizeHtml(all,String(valid.client?.client_name||"OpenAI MCP Client"),error instanceof Error?error.message:"Authorization failed"),401);
    }catch{
     return html("<!doctype html><html><body>OAuth authorization failed.</body></html>",400);
    }
   }
  }
 }}
});
