import {createFileRoute} from "@tanstack/react-router";
import {createClient} from "@supabase/supabase-js";

function required(name:string){
 const value=String(process.env[name]||"").trim();
 if(!value)throw new Error("Missing server environment variable: "+name);
 return value;
}
function service(){
 return createClient(required("SUPABASE_URL"),required("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false}});
}

export const Route=createFileRoute("/api/github-profile")({
 server:{
  handlers:{
   GET:async()=>{
    try{
     const {data,error}=await service().from("dev_panel_settings").select("github_profile,updated_at").eq("id",true).single();
     if(error)throw error;
     const raw=String(data?.github_profile||"").trim().toLowerCase();
     if(raw!=="primary"&&raw!=="fallback")throw new Error("Persisted GitHub profile is invalid or missing.");
     return Response.json({profile:raw,updatedAt:data?.updated_at||null},{headers:{"cache-control":"no-store, no-cache, must-revalidate"}});
    }catch(error){
     return Response.json({error:error instanceof Error?error.message:"Unable to resolve GitHub profile"},{status:500,headers:{"cache-control":"no-store"}});
    }
   }
  }
 }
});
