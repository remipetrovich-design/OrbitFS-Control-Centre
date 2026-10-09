import type { VaultRecord } from "./vault-crypto";

export type CoreSpec = {
  keyName: string;
  system: string;
  service: string;
  description: string;
};
export type CoreGroup = { title: string; purpose: string; entries: CoreSpec[] };
const spec = (keyName:string,system:string,service:string,description:string):CoreSpec => ({keyName,system,service,description});

/**
 * Names match the existing prefixed Vault import, not the unprefixed .env examples.
 * Never embed actual credentials from environment reference files in application code.
 */
export const CORE_GROUPS: CoreGroup[] = [
  {title:"Database and Supabase connections",purpose:"Dev Panel, Billing Store and License Manager database/public client settings",entries:[
    spec("LM_DATABASE_URL","Supabase","Database","License Manager · PostgreSQL connection"),
    spec("LM_DATABASE_SSL","Supabase","Database","License Manager · database SSL"),
    spec("LM_SUPABASE_POOLER_HOST","Supabase","Database","License Manager · pooler host"),
    spec("DEV_SUPABASE_URL","Supabase","Database","Dev Panel · Supabase URL"),
    spec("DEV_SUPABASE_PUBLISHABLE_KEY","Supabase","Database","Dev Panel · public client key"),
    spec("DEV_VITE_SUPABASE_URL","Supabase","Environment","Dev Panel · browser URL"),
    spec("DEV_VITE_SUPABASE_PUBLISHABLE_KEY","Supabase","Environment","Dev Panel · browser key"),
    spec("DEV_SUPABASE_SERVICE_ROLE_KEY","Supabase","Database","Dev Panel · server-only database key"),
    spec("BILLING_NEXT_PUBLIC_SUPABASE_URL","Supabase","Environment","Billing Store · public URL"),
    spec("BILLING_NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY","Supabase","Environment","Billing Store · public key"),
    spec("BILLING_SUPABASE_SERVICE_ROLE_KEY","Supabase","Database","Billing Store · server-only key"),
  ]},
  {title:"License Manager authority and service APIs",purpose:"Technical licensing/release authority and the integrations that call it",entries:[
    spec("LM_MASTER_API_TOKEN","License Manager","API","License Manager · master service"),
    spec("LM_ADMIN_API_TOKEN","License Manager","API","License Manager · administrative API"),
    spec("LM_BILLING_API_TOKEN","License Manager","Billing","License Manager · Billing Store identity"),
    spec("LM_DEPLOYER_API_TOKEN","License Manager","Deployment","License Manager · deployer identity"),
    spec("DEV_LICENSE_MASTER_URL","License Manager","API","Dev Panel · authority API URL"),
    spec("DEV_LICENSE_MASTER_API_TOKEN","License Manager","API","Dev Panel · authority credential"),
    spec("BILLING_LICENSE_MASTER_URL","License Manager","API","Billing Store · authority API URL"),
    spec("BILLING_MASTER_API_TIMEOUT_MS","License Manager","API","Billing Store · authority API timeout"),
    spec("BILLING_API_TOKEN","Billing Store","Billing","Billing Store · billing integration credential"),
    spec("BILLING_DEPLOYER_API_TOKEN","Billing Store","Deployment","Billing Store · deployer integration credential"),
  ]},
  {title:"Shared Master Database System",purpose:"The database builder and validated packages stay in lucaskerim123/Master-Database-System in either mode",entries:[
    spec("DEV_MASTER_DATABASE_REPO","GitHub","Deployment","Both Dev Panels · central database source repository"),
    spec("DEV_MASTER_DATABASE_GITHUB_TOKEN","GitHub","Deployment","Both Dev Panels · token with access to the shared central database repository"),
    spec("DEV_MASTER_DATABASE_REF","GitHub","Deployment","Both Dev Panels · central database source branch"),
  ]},
  {title:"GitHub account access — two shared tokens",purpose:"One Main token and one Fallback token; each serves all repositories that its account token can access",entries:[
    spec("GITHUB_TOKEN_MAIN","GitHub","Deployment","Main · lucaskerim123"),
    spec("GITHUB_TOKEN_FALLBACK","GitHub","Deployment","Fallback · remipetrovich-design"),
  ]},
  {title:"Release and deployment credentials",purpose:"GitHub release integration, Vercel account access, and Billing Store automation",entries:[
    spec("DEV_ORBITFS_RELEASE_DISPATCH_TOKEN","GitHub","Deployment","Dev Panel · release dispatch"),
    spec("LM_GITHUB_RELEASE_TOKEN","GitHub","Deployment","License Manager · artifact access"),
    spec("LM_GITHUB_TOKEN","GitHub","API","License Manager · GitHub API"),
    spec("LM_GITHUB_ACTIONS_TOKEN","GitHub","Deployment","License Manager · Actions"),
    spec("LM_ORBITFS_RELEASE_DISPATCH_TOKEN","GitHub","Deployment","License Manager · repository access for release dispatch"),
    spec("LM_AUTHORITY_LOCKDOWN_RECOVERY_TOKEN","License Manager","API","License Manager · emergency authority recovery token (keep service-only)"),
    spec("LM_ORBITFS_FALLBACK_GITHUB_TOKEN","GitHub","Deployment","License Manager · Fallback GitHub account preflight"),
    spec("LM_ORBITFS_MAIN_VERCEL_TOKEN","Vercel","Deployment","License Manager · verify Main Vercel projects"),
    spec("LM_ORBITFS_FALLBACK_VERCEL_TOKEN","Vercel","Deployment","License Manager · verify Fallback Vercel projects"),
    spec("BILLING_CRON_SECRET","Billing Store","Custom","Billing Store · cron endpoint"),
    spec("DEV_APP_SESSION_SECRET","Other","Dev","Dev Panel · server session signing"),
    spec("VERCEL_TOKEN_MAIN","Vercel","Deployment","Main Vercel connection"),
    spec("VERCEL_TEAM_ID_MAIN","Vercel","Deployment","Main Vercel team"),
    spec("VERCEL_TOKEN_FALLBACK","Vercel","Deployment","Fallback Vercel connection"),
    spec("VERCEL_TEAM_ID_FALLBACK","Vercel","Deployment","Fallback Vercel team"),
  ]},
];

export const CORE_SPECS = CORE_GROUPS.flatMap(group => group.entries);
const exactKey = (row: Pick<VaultRecord,"keyName"|"systems"|"service">) =>
  row.keyName.toUpperCase()+"|"+row.systems[0]?.toLowerCase()+"|"+row.service.toLowerCase();

export function coreMatches(row: VaultRecord, entry: CoreSpec): boolean {
  return exactKey(row) === entry.keyName.toUpperCase()+"|"+entry.system.toLowerCase()+"|"+entry.service.toLowerCase();
}

export function coreSpecOf(row: VaultRecord): CoreSpec | undefined {
  return CORE_SPECS.find(entry=>coreMatches(row,entry));
}

/** Uncatalogued infrastructure keys also belong outside the ordinary Vault list. */
export function isCoreRecord(row: VaultRecord): boolean {
  return Boolean(coreSpecOf(row)) || CORE_SPECS.some(spec=>spec.keyName.toUpperCase()===row.keyName.toUpperCase()) ||
    /(^|_)(DATABASE_URL|DATABASE_SSL|SUPABASE_(URL|SERVICE_ROLE_KEY|PUBLISHABLE_KEY|POOLER_HOST)|LICENSE_MASTER_(URL|API_TOKEN)|MASTER_API_TOKEN|DEPLOYER_API_TOKEN|ADMIN_API_TOKEN|GITHUB_(TOKEN|ACTIONS_TOKEN|RELEASE_TOKEN)|APP_SESSION_SECRET|CRON_SECRET)$/.test(row.keyName.toUpperCase()) ||
    /^GITHUB_TOKEN_(MAIN|FALLBACK)$/.test(row.keyName.toUpperCase()) ||
    /^VERCEL_(TOKEN|TEAM_ID)_(MAIN|FALLBACK)$/.test(row.keyName.toUpperCase());
}

export type CoreStatus = "missing" | "blank" | "placeholder" | "filled";
/** A visual reminder only. This does not restrict Vault saving. */
export function coreStatus(value: string | undefined): CoreStatus {
  if (value===undefined) return "missing";
  if (!value.trim()) return "blank";
  if (/^(change-me|replace[-_ ]with|replace[-_ ]with[-_ ]secret|your[_-]|todo\b|placeholder\b|admin@example\.com$)/i.test(value.trim()))
    return "placeholder";
  return "filled";
}
