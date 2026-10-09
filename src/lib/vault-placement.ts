import type { VaultRecord } from "./vault-crypto";

export type VaultDestination = {
  service: "License Manager" | "Dev Panel" | "Billing Store" | "Base + Engine" | "Account connections" | "Other";
  destination: string;
  where: "Vercel" | "GitHub Actions" | "Vault only" | "Review";
  note: string;
};
const target = (service:VaultDestination["service"],where:VaultDestination["where"],destination:string,note:string):VaultDestination=>({service,where,destination,note});
const main="Main + Fallback Vercel Production projects";
export function whereDoesThisGo(record:Pick<VaultRecord,"keyName"|"systems"|"service">):VaultDestination {
  const k=record.keyName.toUpperCase();
  const system=record.systems[0]?.toLowerCase()||"";
  const origin=record.service?.toLowerCase()||"";
  if(/^GITHUB_TOKEN_(MAIN|FALLBACK)$/.test(k))
    return target("Account connections","Vault only",k.endsWith("MAIN")?"Main GitHub account":"Fallback GitHub account",
      "One token per GitHub account. Used by Vault to discover and update repos. Never sync the connection token to a repository.");
  if(/^VERCEL_(TOKEN|TEAM_ID)_(MAIN|FALLBACK)$/.test(k))
    return target("Account connections","Vault only",k.endsWith("MAIN")?"Main Vercel account":"Fallback Vercel account",
      "Used by Vault to manage projects. VERCEL_TOKEN is a separate GitHub Production secret for each service workflow.");
  if(/^(MAIN|FALLBACK)_VERCEL_TOKEN$/.test(k)||/^ORBITFS_(MAIN|FALLBACK)_VERCEL_TOKEN$/.test(k))
    return target("License Manager","Vercel","Main License Manager Production · "+k,
      "License Manager needs a token for both Vercel accounts to verify account/project IDs before allowing a mode switch.");
  if(k==="VERCEL_TOKEN")
    return target("Other","GitHub Actions","Each service repository · environment: production · secret VERCEL_TOKEN",
      "Main uses the Main Vercel token, Fallback uses the Fallback token. Do not put this in a public variable.");
  if(k==="LICENSE_MASTER_API_TOKEN")
    return target("Base + Engine","GitHub Actions","Base and Engine repositories · repository secret LICENSE_MASTER_API_TOKEN",
      "Scoped License Manager release-write credential. Each active repo requires it; never use MASTER_API_TOKEN for this.");
  if(k==="ORBITFS_LICENSE_MANAGER_URL"||k==="ORBITFS_LICENSE_MANAGER_TOKEN"||k==="SUPABASE_ACCESS_TOKEN")
    return target("Other","GitHub Actions","Master-Database-System · repository secret "+k,
      "Central database build/intake only. The database source stays shared when the GitHub mode changes.");
  if(k==="LM_MASTER_API_TOKEN"||k==="MASTER_API_TOKEN")
    return target("License Manager","Vercel",main+" · MASTER_API_TOKEN",
      "Authority-only credential. Never send the master token to Billing Store, Base, Engine or a GitHub release workflow.");
  if(k.startsWith("LM_"))
    return target("License Manager","Vercel",main+" · "+k.slice(3),
      "License Manager service setting. Keep Main and Fallback on the same approved authority database.");
  if(k.startsWith("DEV_"))
    return target("Dev Panel","Vercel",main+" · Dev Panel project · "+k.slice(4),
      "Add to each Dev Panel Vercel Production project; values may share configuration while API tokens remain server-only.");
  if(k.startsWith("BILLING_"))
    return target("Billing Store","Vercel",main+" · Billing Store project · "+k.slice(8),
      "Add to each Billing Store Vercel Production project. Billing and License Manager token records stay separate.");
  if(k==="ORBITFS_FALLBACK_GITHUB_TOKEN"||k==="ORBITFS_PRIMARY_GITHUB_TOKEN"||k==="ORBITFS_RELEASE_DISPATCH_TOKEN")
    return target("License Manager","Vercel","Main License Manager Production · "+k,
      "Account-specific server credential used for authoritative mode preflight. Do not use a token from the opposite GitHub account.");
  if(system==="github")
    return target("Other","GitHub Actions","Select an exact repository and repository/Production scope",
      "Check the workflow's secrets.X or vars.X reference first. Do not copy a generic token to all repos.");
  if(system==="vercel")
    return target("Other","Vercel","Select the service's project · Production only",
      "Check the service's .env.example or runtime reference before syncing.");
  if(system==="supabase"||origin==="database")
    return target("Other","Review","Only the service/database that owns this key",
      "Never sync a database connection into a customer project or an unrelated service.");
  return target("Other","Review","Check the owning application's environment reference",
    "This key has no confirmed destination yet. Keep it saved in Vault without syncing until identified.");
}

export function intendedForVercelProject(row:VaultRecord,projectName:string):boolean {
  const entry=whereDoesThisGo(row);
  // The four shared account tokens can be explicitly reused only by License
  // Manager for its account/asset verification; no other service sees them.
  if(/^(GITHUB_TOKEN|VERCEL_TOKEN)_(MAIN|FALLBACK)$/.test(row.keyName)){
    if(/licen/i.test(projectName))return true;
    if(/^GITHUB_TOKEN_/.test(row.keyName) && /dev-panel|deploy-panel/i.test(projectName))
      return projectName.toLowerCase().includes("fallback")
        ? row.keyName==="GITHUB_TOKEN_FALLBACK" : row.keyName==="GITHUB_TOKEN_MAIN";
    return false;
  }
  if(entry.where!=="Vercel")return false;
  const n=projectName.toLowerCase();
  if(entry.service==="License Manager")return n.includes("licen");
  if(entry.service==="Dev Panel")return n.includes("deploy-panel")||n.includes("dev-panel");
  if(entry.service==="Billing Store")return n.includes("billing");
  return false;
}
export function intendedForGithubRepo(row:VaultRecord,repo:string):boolean {
  const entry=whereDoesThisGo(row);
  if(entry.where!=="GitHub Actions")return false;
  if(row.keyName==="VERCEL_TOKEN")return /(?:dev-panel|control-centre|license|billing)/i.test(repo);
  if(/^VERCEL_TOKEN_(MAIN|FALLBACK)$/.test(row.keyName))
    return /(?:dev-panel|control-centre|licen|billing)/i.test(repo);
  if(row.keyName==="LICENSE_MASTER_API_TOKEN")return /(?:vercel-base|vercel-engine|Base-System|OrbitFS_Engine)/i.test(repo);
  if(row.keyName==="ORBITFS_LICENSE_MANAGER_TOKEN"||row.keyName==="ORBITFS_LICENSE_MANAGER_URL"||row.keyName==="SUPABASE_ACCESS_TOKEN")
    return repo==="lucaskerim123/Master-Database-System";
  return false;
}
