import type { VaultRecord } from "./vault-crypto";

export const VAULT_SYSTEMS = ["License","Billing","Base System","Shared Engine","Dev","Other"] as const;
export const VAULT_SERVICES = ["GitHub","Vercel","Supabase","Other"] as const;
export type VaultSystem = typeof VAULT_SYSTEMS[number];
export type VaultService = typeof VAULT_SERVICES[number];
export type VaultMode = "main" | "fallback";
export const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
export type VerifiedVariable = {system:VaultSystem;service:VaultService;name:string; destinationSystem:string;usedIn:VaultMode;purpose:string};

// Keys verified by reading real Production Vercel inventories. NEVER store credential values in this catalog.
const verified:Record<"License"|"Billing"|"Dev",string[]> = {
 License:"ADMIN_API_TOKEN AUTHORITY_LOCKDOWN_RECOVERY_TOKEN BILLING_API_TOKEN BOOTSTRAP_ADMIN_EMAIL BOOTSTRAP_ADMIN_PASSWORD CRON_SECRET DATABASE_SSL DATABASE_URL DEPLOYER_API_TOKEN GITHUB_ACTIONS_TOKEN GITHUB_RELEASE_TOKEN GITHUB_TOKEN LICENSE_MASTER_API_TOKEN LICENSE_MASTER_URL MASTER_API_TOKEN ORBITFS_RELEASE_DISPATCH_TOKEN SUPABASE_POOLER_HOST".split(" "),
 Billing:"BILLING_API_TOKEN CRON_SECRET DEPLOYER_API_TOKEN DEV_PANEL_EVENT_SECRET DEV_PANEL_URL MASTER_API_TIMEOUT_MS MASTER_API_URL NEXT_PUBLIC_ORBITFS_STORE_URL NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY NEXT_PUBLIC_SUPABASE_URL ORBITFS_SUPABASE_CLIENT_ID ORBITFS_SUPABASE_SCOPES ORBITFS_VERCEL_CLIENT_ID ORBITFS_VERCEL_INSTALL_URL RESEND_API_KEY RESEND_MAIL_API_KEY SITE_URL SUPABASE_SERVICE_ROLE_KEY".split(" "),
 Dev:"APP_SESSION_SECRET APP_URL BILLING_STORE_REPO BILLING_STORE_URL DEV_PANEL_EVENT_SECRET GITHUB_API_VERSION GITHUB_RELEASE_TOKEN LICENSE_MANAGER_REPO LICENSE_MASTER_API_TOKEN LICENSE_MASTER_LOCKDOWN_RECOVERY_TOKEN LICENSE_MASTER_URL OPERATIONS_CI_WORKFLOW OPERATIONS_DEPLOY_WORKFLOW ORBITFS_FALLBACK_GITHUB_TOKEN ORBITFS_RELEASE_DISPATCH_TOKEN SUPABASE_PUBLISHABLE_KEY SUPABASE_SERVICE_ROLE_KEY SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY VITE_SUPABASE_URL".split(" ")
};
const projectName:Record<"License"|"Billing"|"Dev",string>={License:"custom-licence-manager",Billing:"v2-billing-store",Dev:"base-deploy-panel"};
const descriptions:Record<string,string>={
 BILLING_API_TOKEN:"License Manager-issued Billing integration credential",
 DEPLOYER_API_TOKEN:"License Manager-issued deployment and update credential",
 MASTER_API_TOKEN:"License authority-only machine credential; never share with Billing",
 SUPABASE_SERVICE_ROLE_KEY:"Server-only database service-role key",
 NEXT_PUBLIC_SUPABASE_URL:"Billing Supabase project URL",
 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"Billing browser-safe Supabase API key",
 DATABASE_URL:"License Manager PostgreSQL connection",
 APP_SESSION_SECRET:"Dev Panel session signing secret",
 DEV_PANEL_EVENT_SECRET:"Billing / Dev Panel authenticated operational events",
 GITHUB_RELEASE_TOKEN:"GitHub release artifact / workflow access",
 CRON_SECRET:"Scheduled job request authentication",
 RESEND_API_KEY:"Billing transactional email transport key",
 VERCEL_TOKEN:"GitHub deployment workflow Vercel API token",
 SUPABASE_ACCESS_TOKEN:"GitHub deployment workflow Supabase management token"
};
export const MAIN_VERCEL_INVENTORY:VerifiedVariable[] = Object.entries(verified).flatMap(([system,keys])=>
 keys.map(name=>({system:system as VaultSystem,service:"Vercel" as const,name,
   destinationSystem:projectName[system as keyof typeof projectName],usedIn:"main" as const,
   purpose:descriptions[name]||"Confirmed Main Production environment variable"})));
export const VERIFIED_MAIN_KEYS = new Set(MAIN_VERCEL_INVENTORY.map(x=>x.name));

// GitHub names are workflow SOURCE REFERENCES, not claimed to be already configured GitHub secrets.
export const GITHUB_WORKFLOW_REFERENCES = [
 {system:"Dev" as VaultSystem,name:"VERCEL_TOKEN",repo:"lucaskerim123/Dev-panel",usedIn:"main" as VaultMode},
 {system:"Dev" as VaultSystem,name:"LICENSE_MASTER_API_TOKEN",repo:"lucaskerim123/Dev-panel",usedIn:"main" as VaultMode},
 {system:"Dev" as VaultSystem,name:"LICENSE_MASTER_URL",repo:"lucaskerim123/Dev-panel",usedIn:"main" as VaultMode},
 {system:"Dev" as VaultSystem,name:"ORBITFS_RELEASE_DISPATCH_TOKEN",repo:"lucaskerim123/Dev-panel",usedIn:"main" as VaultMode},
 {system:"Billing" as VaultSystem,name:"VERCEL_TOKEN",repo:"lucaskerim123/V2_Billing_Store",usedIn:"main" as VaultMode},
 {system:"Billing" as VaultSystem,name:"SUPABASE_ACCESS_TOKEN",repo:"lucaskerim123/V2_Billing_Store",usedIn:"main" as VaultMode},
 {system:"Billing" as VaultSystem,name:"VERCEL_TOKEN",repo:"remipetrovich-design/OrbitFS-Billing-Shopfront",usedIn:"fallback" as VaultMode},
 {system:"Billing" as VaultSystem,name:"SUPABASE_ACCESS_TOKEN",repo:"remipetrovich-design/OrbitFS-Billing-Shopfront",usedIn:"fallback" as VaultMode},
 {system:"Base System" as VaultSystem,name:"LICENSE_MASTER_API_TOKEN",repo:"lucaskerim123/V1-vercel-base",usedIn:"main" as VaultMode},
 {system:"Base System" as VaultSystem,name:"LICENSE_MASTER_URL",repo:"lucaskerim123/V1-vercel-base",usedIn:"main" as VaultMode},
 {system:"Shared Engine" as VaultSystem,name:"LICENSE_MASTER_API_TOKEN",repo:"lucaskerim123/V1-vercel-engine",usedIn:"main" as VaultMode},
 {system:"Shared Engine" as VaultSystem,name:"LICENSE_MASTER_URL",repo:"lucaskerim123/V1-vercel-engine",usedIn:"main" as VaultMode},
] as const;

export function systemForProject(name:string):VaultSystem {
 const n=name.toLowerCase();
 if(n.includes("licen"))return "License";
 if(n.includes("billing"))return "Billing";
 if(n.includes("dev-panel")||n.includes("deploy-panel"))return "Dev";
 if(n.includes("engine")||n.includes("panel-"))return "Shared Engine";
 if(n.includes("base"))return "Base System";
 return "Other";
}
export function modeForProject(name:string):VaultMode {
 return name.toLowerCase().includes("fallback")?"fallback":"main";
}
export function serviceOf(row:VaultRecord):VaultService {
 const current=String(row.service||"");
 if((VAULT_SERVICES as readonly string[]).includes(current))return current as VaultService;
 const legacy=row.systems?.[0]||"";
 if(legacy==="GitHub"||legacy==="Vercel"||legacy==="Supabase")return legacy;
 return "Other";
}
export function systemOf(row:VaultRecord):VaultSystem {
 const current=row.systems?.[0]||"Other";
 if((VAULT_SYSTEMS as readonly string[]).includes(current))return current as VaultSystem;
 const key=row.keyName.toUpperCase();
 if(current==="License Manager")return "License";
 if(current==="Billing Store")return "Billing";
 if(current==="Dev Panel")return "Dev";
 if(key.startsWith("LM_"))return "License";
 if(key.startsWith("BILLING_"))return "Billing";
 if(key.startsWith("DEV_"))return "Dev";
 if(/^(VERCEL_(TOKEN|TEAM_ID)|GITHUB_TOKEN)_(MAIN|FALLBACK)$/.test(key))return "Dev";
 const names=["License","Billing","Dev"] as const;
 const match=names.filter(sys=>verified[sys].includes(key));
 return match.length===1?match[0]:"Other";
}
export function exactVerifiedName(row:VaultRecord):string | null {
 const k=String(row.keyName||"").trim();
 const system=systemOf(row);
 const match=verified[system as keyof typeof verified]||[];
 if(match.includes(k))return k;
 const prefix=system==="License"?"LM_":system==="Billing"?"BILLING_":system==="Dev"?"DEV_":"";
 if(prefix&&k.startsWith(prefix)&&match.includes(k.slice(prefix.length)))return k.slice(prefix.length);
 // Never invent a destination by stripping prefixes without a verified exact match.
 return null;
}
export function normalizeVaultRecord(row:VaultRecord):VaultRecord {
 const system=systemOf(row), service=serviceOf(row), exact=exactVerifiedName(row);
 const modes:VaultMode[]=(row.usedIn||[]).filter((v):v is VaultMode=>v==="main"||v==="fallback");
 const legacyKey=row.keyName;
 const hasSourceDestination=Boolean(row.destinationSystem?.trim());
 const inferred=service==="Vercel"?MAIN_VERCEL_INVENTORY.find(x=>x.system===system&&x.name===exact):null;
 return {
   ...row,systems:[system],service,otherSystem:system==="Other"?(row.otherSystem||""):"",
   customService:service==="Other"?(row.customService||""):"",
   // Preserve non-verified names intact; mark them for manual review.
   keyName:exact||legacyKey,
   legacyKeyName:exact&&exact!==legacyKey?legacyKey:row.legacyKeyName,
   destinationSystem:hasSourceDestination?row.destinationSystem:(row.vercelTargets?.[0]?.projectName||row.githubTargets?.[0]?.repo||inferred?.destinationSystem||""),
   usedIn:modes.length?modes:Array.from(new Set([...(row.vercelTargets||[]).map(x=>x.connection),...(row.githubTargets||[]).map(x=>x.account),...(inferred?[inferred.usedIn]:[])])) as VaultMode[],
   needsReview:!exact&&!hasSourceDestination&&!row.vercelTargets?.length&&!row.githubTargets?.length
 };
}
export function recordIdentity(row:VaultRecord):string {
 return [systemOf(row),serviceOf(row),row.keyName,row.destinationSystem||"",...(row.usedIn||[]).slice().sort()].join("|").toLowerCase();
}
export function allowedForVercelProject(row:VaultRecord,projectName:string,account:VaultMode):boolean {
 if(serviceOf(row)!=="Vercel")return false;
 if(!(row.usedIn||[]).includes(account))return false;
 if(row.destinationSystem&&row.destinationSystem.toLowerCase()!==projectName.toLowerCase())return false;
 if(systemOf(row)!==systemForProject(projectName))return false;
 // A manually assigned, exact destination is authoritative even when the name
 // is absent from the static Main inventory (e.g. new Fallback-only variables).
 // Never silently strip, add, or infer a prefix.
 if(!KEY_PATTERN.test(row.keyName) || row.keyName.length>256) return false;
 if(/^(?:GITHUB_TOKEN|VERCEL_(?:TOKEN|TEAM_ID))_(?:MAIN|FALLBACK)$/.test(row.keyName))return false;
 return !!row.destinationSystem && !row.needsReview;
}
export function allowedForGithubRepo(row:VaultRecord,repo:string,account:VaultMode):boolean {
 return serviceOf(row)==="GitHub"&&(row.usedIn||[]).includes(account)&&
    row.destinationSystem===repo&&!row.needsReview;
}
