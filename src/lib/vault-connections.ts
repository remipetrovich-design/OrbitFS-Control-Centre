import type { VaultRecord } from "./vault-crypto";

/** These are operator account connections, not a customer's/runtime environment variables. */
const CONNECTION_NAMES=/^(?:GITHUB_TOKEN_(?:MAIN|FALLBACK)|VERCEL_(?:TOKEN|TEAM_ID)_(?:MAIN|FALLBACK))$/;
const PLACEHOLDER=/^(?:change-me|replace(?:[_ -]with)?|your[_-]|placeholder|todo\b)/i;

export function isVaultConnection(row:Pick<VaultRecord,"keyName">):boolean {
  return CONNECTION_NAMES.test(row.keyName);
}
export function usableConnectionValue(value:string|undefined):boolean {
  return !!value?.trim() && !PLACEHOLDER.test(value.trim());
}
export function bestVaultConnection(records:VaultRecord[],keyName:string):VaultRecord|undefined {
  if(!CONNECTION_NAMES.test(keyName))return undefined;
  const matching=records.filter(row=>row.keyName===keyName);
  return matching.find(row=>usableConnectionValue(row.secret)) || matching.find(row=>!!row.secret?.trim()) || matching[0];
}
function normalizedConnection(row:VaultRecord):VaultRecord {
  const mode=row.keyName.endsWith("_FALLBACK")?"fallback":"main";
  const provider=row.keyName.startsWith("GITHUB_")?"GitHub":"Vercel";
  return {...row,systems:["Dev"],otherSystem:"",service:provider,customService:"",
    usedIn:[mode],destinationSystem:"Vault connection",needsReview:false};
}
/**
 * Clean imports replace ordinary credentials, but never delete a saved usable
 * Main/Fallback account connection. No server receives plaintext Vault values.
 * This also repairs placeholders using an older encrypted backup's records.
 */
export function preserveVaultConnections(existing:VaultRecord[],incoming:VaultRecord[]):VaultRecord[] {
  const ordinary=incoming.filter(row=>!isVaultConnection(row));
  const keys=new Set([...existing,...incoming].filter(isVaultConnection).map(row=>row.keyName));
  const connections:Array<VaultRecord>=[];
  for(const key of keys) {
    const source=bestVaultConnection(existing,key);
    const replacement=bestVaultConnection(incoming,key);
    const chosen=source&&usableConnectionValue(source.secret)?source:
      replacement&&usableConnectionValue(replacement.secret)?replacement:source||replacement;
    if(chosen)connections.push(normalizedConnection(chosen));
  }
  return [...connections,...ordinary];
}
