import type { VaultRecord } from "./vault-crypto";
import { VAULT_SYSTEMS, systemOf, type VaultSystem } from "./vault-schema.ts";

export type VaultGroupMode="main"|"fallback"|"unassigned";
const order:VaultGroupMode[]=["main","fallback","unassigned"];
const labels:Record<VaultGroupMode,string>={main:"Main",fallback:"Fallback",unassigned:"Needs assignment"};
const systemLabels:Record<VaultSystem,string>={
  License:"License Manager",
  Billing:"Billing Store",
  "Base System":"Base System",
  "Shared Engine":"Shared Engine (addons)",
  Dev:"Dev Panel",
  Other:"Other"
};
export function vaultSystemLabel(system:VaultSystem):string {return systemLabels[system]}
export function vaultModeLabel(mode:VaultGroupMode):string {return labels[mode]}
export function groupVaultItems<T>(
  items:readonly T[],readRecord:(item:T)=>VaultRecord
):Array<{system:VaultSystem;label:string;count:number;sections:Array<{mode:VaultGroupMode;label:string;items:T[]}>}>{
  return VAULT_SYSTEMS.map(system=>{
    const included=items.filter(item=>systemOf(readRecord(item))===system);
    const sections=order.map(mode=>({
      mode,label:labels[mode],
      items:included.filter(item=>{
        const usedIn=readRecord(item).usedIn||[];
        return mode==="unassigned"?!usedIn.includes("main")&&!usedIn.includes("fallback"):usedIn.includes(mode);
      })
    })).filter(section=>section.items.length>0);
    return {system,label:systemLabels[system],count:included.length,sections};
  }).filter(group=>group.count>0);
}
