import type { VaultRecord } from "./vault-crypto";
import { allowedForVercelProject, systemForProject, MAIN_VERCEL_INVENTORY, KEY_PATTERN, type VaultMode } from "./vault-schema.ts";

export type VercelVaultEntryStatus = "ready" | "attach" | "value" | "protected" | "invalid";
export type VercelVaultEntryAssessment = {status:VercelVaultEntryStatus;reason:string};
const protectedAccountKey=/^(?:GITHUB_TOKEN|VERCEL_(?:TOKEN|TEAM_ID))_(?:MAIN|FALLBACK)$/;
const emptyOrPlaceholder=/^(?:REPLACE_WITH_SECRET|YOUR_|replace-with|your-|placeholder|todo\b|change-me(?:$|[-_ ]))/i;

export function assessVercelVaultEntry(row:VaultRecord,project:string,account:VaultMode):VercelVaultEntryAssessment {
  if(protectedAccountKey.test(row.keyName))
    return {status:"protected",reason:"Vault account connection. This token is used to connect to GitHub/Vercel and cannot be pushed as a project variable."};
  if(!KEY_PATTERN.test(row.keyName) || row.keyName.length>256)
    return {status:"invalid",reason:"Invalid environment variable name. Edit the Vault key name first."};
  if(!allowedForVercelProject(row,project,account))
    return {status:"attach",reason:"Not attached to this "+account+" Vercel project. Attach it without changing the original Vault entry."};
  if(!row.secret?.trim() || emptyOrPlaceholder.test(row.secret.trim()))
    return {status:"value",reason:"Attached, but its value is blank or change-me. Edit this Vault entry to add the real value before syncing."};
  return {status:"ready",reason:"Ready for Production comparison and manual review."};
}

export function attachVercelVaultEntry(
  records:VaultRecord[],source:VaultRecord,project:string,account:VaultMode,id:string
):VaultRecord[] {
  if(protectedAccountKey.test(source.keyName))throw new Error("Account connection tokens cannot be attached as runtime variables.");
  if(!KEY_PATTERN.test(source.keyName) || source.keyName.length>256)throw new Error("Invalid environment variable name.");
  if(!project.trim())throw new Error("Choose the exact Vercel project first.");
  if(!records.some(row=>row.id===source.id))throw new Error("This Vault source is no longer available. Reload the Vault.");
  if(records.some(row=>row.keyName===source.keyName && row.service==="Vercel" &&
     row.destinationSystem?.toLowerCase()===project.toLowerCase() && row.usedIn?.includes(account)))
     throw new Error("This key is already attached to the selected project. Edit its existing Vault value.");
  const linked:VaultRecord={
    ...source,id,systems:[systemForProject(project)],otherSystem:"",
    service:"Vercel",customService:"",destinationSystem:project,usedIn:[account],needsReview:false,
    vercelTargets:[],githubTargets:undefined,
  };
  return [linked,...records];
}

/** The static Main inventory lists references, not necessarily saved Vault entries.
 *  Include actual Production names too so users can add them without guessing. */
export function suggestUnsavedVercelKeys(records:VaultRecord[],project:string,productionNames:string[]):string[] {
  const system=systemForProject(project);
  const sources=[...MAIN_VERCEL_INVENTORY.filter(item=>item.system===system).map(item=>item.name),...productionNames];
  const saved=new Set(records.map(row=>row.keyName));
  return [...new Set(sources)].filter(key=>KEY_PATTERN.test(key)&&key.length<=256&&
    !protectedAccountKey.test(key)&&!saved.has(key)).sort((a,b)=>a.localeCompare(b));
}
export function addBlankVercelVaultEntry(records:VaultRecord[],keyName:string,project:string,account:VaultMode,id:string):VaultRecord[] {
  if(!KEY_PATTERN.test(keyName)||keyName.length>256||protectedAccountKey.test(keyName))
    throw new Error("Invalid or protected environment variable name.");
  if(!project)throw new Error("Choose a Vercel project first.");
  if(records.some(row=>row.keyName===keyName && row.service==="Vercel" &&
    row.destinationSystem?.toLowerCase()===project.toLowerCase()&&row.usedIn?.includes(account)))
    throw new Error("This key is already saved for the selected project.");
  const record:VaultRecord={id,systems:[systemForProject(project)],otherSystem:"",service:"Vercel",
    customService:"",keyName,secret:"",usedIn:[account],destinationSystem:project,needsReview:false};
  return [record,...records];
}
