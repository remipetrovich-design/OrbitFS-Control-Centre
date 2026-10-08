export type VercelEnvMeta = {
  id: string;
  key: string;
  type: string;
  target: string[];
  updatedAt: number | null;
  gitBranch: string | null;
  customEnvironmentIds: string[];
  visibility: string;
};

export type ProductionPlan =
  | { action: "create"; key: string; expectedId: null; expectedUpdatedAt: null }
  | { action: "replace"; key: string; expectedId: string; expectedUpdatedAt: number | null }
  | { action: "blocked"; key: string; reason: string };

export function isConnectionKey(key: string): boolean {
  return /^(VERCEL_TOKEN|VERCEL_TEAM_ID)_(MAIN|FALLBACK)$/.test(key);
}

export function planProductionKey(envs: VercelEnvMeta[], key: string): ProductionPlan {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || key.length > 256)
    return { action: "blocked", key, reason: "Invalid environment variable name." };
  if (isConnectionKey(key))
    return { action: "blocked", key, reason: "Vercel connection credentials cannot be synced as project variables." };
  const matches = envs.filter(row => row.key === key && row.target.includes("production"));
  if (!matches.length) return { action: "create", key, expectedId: null, expectedUpdatedAt: null };
  if (matches.length !== 1)
    return { action: "blocked", key, reason: "Multiple Production variables share this name." };
  const row = matches[0]!;
  if (row.target.length !== 1 || row.target[0] !== "production" || row.gitBranch || row.customEnvironmentIds.length)
    return { action: "blocked", key, reason: "Existing variable also targets another environment or branch. Split it in Vercel before syncing." };
  if (!row.id)
    return { action: "blocked", key, reason: "Vercel did not return a variable ID." };
  return { action: "replace", key, expectedId: row.id, expectedUpdatedAt: row.updatedAt };
}

export function assertReviewedProductionWrite(
  envs: VercelEnvMeta[],
  input: { key: string; action: "create" | "replace"; expectedId?: string | null; expectedUpdatedAt?: number | null }
): ProductionPlan {
  const current = planProductionKey(envs, input.key);
  if (current.action === "blocked") throw new Error(current.reason);
  if (current.action !== input.action) throw new Error("Production changed since comparison. Compare again before syncing.");
  if (current.action === "replace" && (
    current.expectedId !== input.expectedId ||
    current.expectedUpdatedAt !== (input.expectedUpdatedAt ?? null)
  )) throw new Error("Production variable changed since comparison. Compare again before syncing.");
  return current;
}
