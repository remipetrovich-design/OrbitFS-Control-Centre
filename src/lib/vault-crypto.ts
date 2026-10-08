export type VaultRecord={
  id:string;
  systems:string[];
  otherSystem:string;
  service:string;
  customService:string;
  keyName:string;
  secret:string;
  vercelTargets?: Array<{connection:"main"|"fallback";projectId:string;projectName:string;keyName:string}>;
};

export type VaultEnvelope={
  ciphertext:string;
  salt:string;
  iv:string;
  kdfIterations:number;
  formatVersion:number;
  updatedAt?:string;
};

const ITERATIONS=310000;
const encoder=new TextEncoder();
const decoder=new TextDecoder();

function bytesToBase64(bytes:Uint8Array){
  let binary="";for(const byte of bytes)binary+=String.fromCharCode(byte);
  return btoa(binary);
}
function base64ToBytes(value:string){
  const binary=atob(value);const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return bytes;
}
async function deriveKey(password:string,salt:Uint8Array,iterations:number){
  const material=await crypto.subtle.importKey("raw",encoder.encode(password),"PBKDF2",false,["deriveKey"]);
  return crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations,hash:"SHA-256"},material,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
export async function createEnvelope(password:string,records:VaultRecord[],saltInput?:Uint8Array):Promise<VaultEnvelope>{
  if(!/^[0-9]{6,}$/.test(password))throw new Error("Vault PIN must contain at least 6 digits (numbers only).");
  const salt=saltInput||crypto.getRandomValues(new Uint8Array(16));
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await deriveKey(password,salt,ITERATIONS);
  const encrypted=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,encoder.encode(JSON.stringify(records)));
  return {ciphertext:bytesToBase64(new Uint8Array(encrypted)),salt:bytesToBase64(salt),iv:bytesToBase64(iv),kdfIterations:ITERATIONS,formatVersion:1};
}
export async function decryptEnvelope(password:string,envelope:VaultEnvelope):Promise<VaultRecord[]>{
  const salt=base64ToBytes(envelope.salt),iv=base64ToBytes(envelope.iv);
  const key=await deriveKey(password,salt,Number(envelope.kdfIterations));
  const clear=await crypto.subtle.decrypt({name:"AES-GCM",iv},key,base64ToBytes(envelope.ciphertext));
  const parsed=JSON.parse(decoder.decode(clear));
  if(!Array.isArray(parsed))throw new Error("Vault content is invalid.");
  return parsed;
}
