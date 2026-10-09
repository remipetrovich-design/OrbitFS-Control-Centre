export type GithubAccount = "main" | "fallback";
export type GithubScope = "repository" | "production";
export type GithubKind = "secret" | "variable";
export type GithubItem = { name: string; updatedAt: string | null; createdAt: string | null };
export type GithubPlan =
  | { action: "create"; key: string; expectedUpdatedAt: null }
  | { action: "replace"; key: string; expectedUpdatedAt: string }
  | { action: "blocked"; key: string; reason: string };

export const GITHUB_OWNERS: Record<GithubAccount, string> = {
  main: "lucaskerim123",
  fallback: "remipetrovich-design",
};
const CONNECTION_NAMES = /^(GITHUB_TOKEN(?:_(?:MAIN|FALLBACK))?|GH_TOKEN|VERCEL_(?:TOKEN|TEAM_ID)_(?:MAIN|FALLBACK))$/i;

export function planGithubKey(items: GithubItem[], key: string): GithubPlan {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || key.length > 100)
    return { action: "blocked", key, reason: "Invalid GitHub Actions variable/secret name." };
  if (CONNECTION_NAMES.test(key))
    return { action: "blocked", key, reason: "Vault connection tokens cannot be pushed into GitHub Actions." };
  if (/^(LM_)?(MASTER_API_TOKEN|DATABASE_URL|SUPABASE_SERVICE_ROLE_KEY|BOOTSTRAP_ADMIN_PASSWORD|AUTHORITY_LOCKDOWN_RECOVERY_TOKEN)$/i.test(key))
    return {action:"blocked",key,reason:"Authority and database root secrets must stay in their owning Vercel service, not GitHub Actions."};
  const matches = items.filter(item => item.name.toUpperCase() === key.toUpperCase());
  if (!matches.length) return { action: "create", key, expectedUpdatedAt: null };
  if (matches.length !== 1 || !matches[0]?.updatedAt)
    return { action: "blocked", key, reason: "Cannot verify the existing item revision." };
  return { action: "replace", key, expectedUpdatedAt: matches[0].updatedAt };
}

export function assertReviewedGithubWrite(
  items: GithubItem[],
  reviewed: { key: string; action: "create" | "replace"; expectedUpdatedAt: string | null },
): GithubPlan {
  const plan = planGithubKey(items, reviewed.key);
  if (plan.action === "blocked") throw new Error(plan.reason);
  if (plan.action !== reviewed.action || plan.expectedUpdatedAt !== reviewed.expectedUpdatedAt)
    throw new Error("GitHub Actions configuration changed since review. Inspect and review again.");
  return plan;
}

export function allowedVaultValue(value: string): boolean {
  return typeof value === "string" && !!value.trim() && value.length <= 64000 &&
    !/^(REPLACE_WITH_SECRET|YOUR_|replace-with|your-|placeholder|todo\b|change-me$)/i.test(value.trim());
}

export function targetPath(owner: string, repo: string, scope: GithubScope, kind: GithubKind, environment?: string): string {
  if (scope === "repository") return "/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(repo) + "/actions/" + (kind === "secret" ? "secrets" : "variables");
  if (!environment || environment.toLowerCase() !== "production") throw new Error("Only an existing Production environment is supported.");
  return "/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(repo) + "/environments/" + encodeURIComponent(environment) + "/" + (kind === "secret" ? "secrets" : "variables");
}
