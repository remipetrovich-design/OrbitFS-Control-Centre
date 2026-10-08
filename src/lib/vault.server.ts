import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const required=(name:string)=>{const value=process.env[name];if(!value)throw new Error(`Missing server environment variable: ${name}`);return value};

type PanelUser={id:string;email:string;display_name:string;role:string};

function readSession(token:string):PanelUser{
  const [payload,sig]=String(token||"").split(".");
  if(!payload||!sig)throw new Error("Not signed in");
  const expected=crypto.createHmac("sha256",required("APP_SESSION_SECRET")).update(payload).digest("base64url");
  if(sig.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))throw new Error("Your session is no longer valid");
  const user=JSON.parse(Buffer.from(payload,"base64url").toString()) as PanelUser & {exp:number};
  if(!user.id||!user.email||user.exp<Date.now())throw new Error("Your session is no longer valid");
  return user;
}

export function requireVaultUser(token:string){
  const user=readSession(token);
  if(!["owner","admin"].includes(String(user.role||"").toLowerCase()))throw new Error("Vault access requires Owner or Admin access");
  return user;
}

function db(){
  return createClient(required("SUPABASE_URL"),required("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false}});
}

function validEnvelope(value:any){
  return value&&typeof value.ciphertext==="string"&&value.ciphertext.length>0&&
    typeof value.salt==="string"&&value.salt.length>0&&typeof value.iv==="string"&&value.iv.length>0&&
    Number.isInteger(Number(value.kdfIterations))&&Number(value.kdfIterations)>=200000;
}

export const getVaultEnvelope=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string}})=>{
  requireVaultUser(data.token);
  const {data:row,error}=await db().from("dev_panel_vault")
    .select("ciphertext,salt,iv,kdf_iterations,format_version,updated_at").eq("id",true).maybeSingle();
  if(error)throw new Error("Unable to load encrypted Vault");
  if(!row)return {exists:false,envelope:null};
  return {exists:true,envelope:{ciphertext:row.ciphertext,salt:row.salt,iv:row.iv,kdfIterations:row.kdf_iterations,formatVersion:row.format_version,updatedAt:row.updated_at}};
});

export const saveVaultEnvelope=createServerFn({method:"POST"}).handler(async({data}:{data:{token:string;envelope:any}})=>{
  const actor=requireVaultUser(data.token);
  if(!validEnvelope(data.envelope))throw new Error("Invalid encrypted Vault payload");
  const row={
    id:true,
    ciphertext:data.envelope.ciphertext,
    salt:data.envelope.salt,
    iv:data.envelope.iv,
    kdf_iterations:Number(data.envelope.kdfIterations),
    format_version:Number(data.envelope.formatVersion||1),
    updated_by:actor.id,
    updated_at:new Date().toISOString(),
  };
  const {data:saved,error}=await db().from("dev_panel_vault").upsert(row,{onConflict:"id"}).select("updated_at").single();
  if(error)throw new Error("Unable to save encrypted Vault");
  return {ok:true,updatedAt:saved.updated_at};
});
