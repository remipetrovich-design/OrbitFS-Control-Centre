import { createServerFn } from "@tanstack/react-start";
import { requireVaultUser } from "@/lib/vault.server";
import { assertReviewedProductionWrite, planProductionKey, type VercelEnvMeta } from "@/lib/vercel-sync-policy";

type ConnectionInput = { token: string; vercelToken: string; teamId: string };
type ProjectInput = ConnectionInput & { projectId: string };
type WriteInput = ProjectInput & {
  key: string; value: string; action: "create" | "replace";
  expectedId?: string | null; expectedUpdatedAt?: number | null;
};

function validateConnection(input: ConnectionInput) {
  requireVaultUser(input.token);
  if (!/^team_[A-Za-z0-9]{8,64}$/.test(String(input.teamId || "")))
    throw new Error("Add a valid Vercel team ID to your Vault connection.");
  if (typeof input.vercelToken !== "string" || input.vercelToken.length < 12 || input.vercelToken.length > 2048)
    throw new Error("Add a valid Vercel API token to your Vault connection.");
}
function validateProject(projectId: string) {
  if (!/^prj_[A-Za-z0-9]{8,64}$/.test(String(projectId || ""))) throw new Error("Choose a Vercel project from the list.");
}
async function vercelApi<T>(path: string, vercelToken: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch("https://api.vercel.com" + path, {
      ...options,
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
      headers: { Authorization: "Bearer " + vercelToken, "Content-Type": "application/json" },
    });
  } catch {
    throw new Error("Vercel request failed or timed out. No success is assumed; refresh and compare again.");
  }
  // Do not print Vercel error bodies: provider messages can contain sensitive values.
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error("Vercel rejected this token or team permission (" + response.status + ").");
    if (response.status === 429) throw new Error("Vercel rate limit reached. Try again later.");
    throw new Error("Vercel API rejected the request (HTTP " + response.status + ").");
  }
  try { return await response.json() as T; }
  catch { throw new Error("Vercel returned an unreadable response. Refresh before trying again."); }
}
function scope(teamId: string) { return "?teamId=" + encodeURIComponent(teamId); }
function normalizeEnvironment(v: any): VercelEnvMeta {
  const rawTarget = Array.isArray(v?.target) ? v.target : typeof v?.target === "string" ? [v.target] : [];
  const rawTimestamp = Number(v?.updatedAt);
  return {
    id: typeof v?.id === "string" ? v.id : "",
    key: typeof v?.key === "string" ? v.key : "",
    type: typeof v?.type === "string" ? v.type : "",
    target: rawTarget.filter((t: any) => typeof t === "string"),
    updatedAt: Number.isFinite(rawTimestamp) && rawTimestamp > 0 ? rawTimestamp : null,
    gitBranch: typeof v?.gitBranch === "string" && v.gitBranch ? v.gitBranch : null,
    customEnvironmentIds: Array.isArray(v?.customEnvironmentIds) ? v.customEnvironmentIds.filter((id: any) => typeof id === "string") : [],
    visibility: typeof v?.visibility === "string" ? v.visibility : "",
  };
}
async function readEnvironments(input: ProjectInput) {
  const response = await vercelApi<{envs?: unknown[]}>(
    "/v9/projects/" + encodeURIComponent(input.projectId) + "/env" + scope(input.teamId),
    input.vercelToken
  );
  if (!Array.isArray(response?.envs)) throw new Error("Vercel did not return an environment inventory.");
  return response.envs.map(normalizeEnvironment).filter(v => v.key && v.target.includes("production"));
}

export const listVaultVercelProjects = createServerFn({method:"POST"}).handler(
  async ({data}: {data: ConnectionInput}) => {
    validateConnection(data);
    const response = await vercelApi<{projects?: any[]}>("/v9/projects" + scope(data.teamId) + "&limit=100", data.vercelToken);
    if (!Array.isArray(response?.projects)) throw new Error("Vercel did not return a project list.");
    return {projects: response.projects
      .filter(project => typeof project?.id === "string" && /^prj_[A-Za-z0-9]+$/.test(project.id))
      .map(project => ({id: String(project.id), name: String(project.name || project.id)}))
      .sort((a,b) => a.name.localeCompare(b.name))};
  }
);
export const inspectVaultVercelProduction = createServerFn({method:"POST"}).handler(
  async ({data}: {data: ProjectInput}) => {
    validateConnection(data); validateProject(data.projectId);
    const envs = await readEnvironments(data);
    return {target: "production" as const, envs};
  }
);
export const writeVaultVercelProduction = createServerFn({method:"POST"}).handler(
  async ({data}: {data: WriteInput}) => {
    validateConnection(data); validateProject(data.projectId);
    if (typeof data.value !== "string" || !data.value.trim() || data.value.length > 64000)
      throw new Error("A nonempty Vault value (maximum 64KB) is required.");
    if (/^(REPLACE_WITH_SECRET|YOUR_|replace-with|your-|placeholder|todo\b)/i.test(data.value.trim()))
      throw new Error("Vault placeholder values cannot be pushed to Production.");
    if (data.action !== "create" && data.action !== "replace") throw new Error("Invalid sync action.");
    // Compare a fresh server-side snapshot to the exact action reviewed in the browser.
    const current = await readEnvironments(data);
    const plan = assertReviewedProductionWrite(current, data);
    const projectPath = "/v9/projects/" + encodeURIComponent(data.projectId) + "/env";
    if (plan.action === "create") {
      await vercelApi(projectPath + scope(data.teamId), data.vercelToken, {
        method: "POST",
        body: JSON.stringify({key: data.key, value: data.value, type: "sensitive", target: ["production"]}),
      });
    } else if (plan.action === "replace") {
      const currentRow = current.find(row => row.id === plan.expectedId)!;
      if (currentRow.type === "system") throw new Error("System-owned variables cannot be modified through the Vault.");
      await vercelApi(
        projectPath + "/" + encodeURIComponent(plan.expectedId) + scope(data.teamId),
        data.vercelToken,
        {method: "PATCH", body: JSON.stringify({value: data.value})}
      );
    }
    // Values marked Secret by Vercel are deliberately unreadable. Verify metadata presence, not plaintext equality.
    const after = await readEnvironments(data);
    if (planProductionKey(after, data.key).action !== "replace")
      throw new Error("Vercel accepted the write but verification was inconclusive. Check Production before retrying.");
    return {ok: true, key: data.key, action: plan.action, target: "production" as const, presenceVerified: true, valueVerified: false};
  }
);
export const importVaultVercelConfig = createServerFn({method:"POST"}).handler(
  async ({data}: {data: ProjectInput & {envId: string; expectedUpdatedAt: number | null}}) => {
    validateConnection(data); validateProject(data.projectId);
    const envs = await readEnvironments(data);
    const item = envs.find(row => row.id === data.envId);
    if (!item || item.updatedAt !== data.expectedUpdatedAt)
      throw new Error("Vercel variable changed since comparison. Refresh before importing.");
    if (item.visibility !== "config" || item.type === "sensitive" || planProductionKey(envs,item.key).action !== "replace")
      throw new Error("Only readable, Production-only Vercel Config variables can be imported.");
    const response = await vercelApi<any>(
      "/v1/projects/" + encodeURIComponent(data.projectId) + "/env/" + encodeURIComponent(item.id) + scope(data.teamId),
      data.vercelToken
    );
    if (response?.decrypted !== true || typeof response?.value !== "string" || !response.value.length)
      throw new Error("Vercel does not permit retrieval of this value.");
    return {key: item.key, value: response.value, source: "Vercel Production" as const};
  }
);
