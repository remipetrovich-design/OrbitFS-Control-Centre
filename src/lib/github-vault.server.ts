import { createServerFn } from "@tanstack/react-start";
import sodium from "libsodium-wrappers";
import { requireVaultUser } from "@/lib/vault.server";
import {
  allowedVaultValue, assertReviewedGithubWrite, planGithubKey, targetPath, GITHUB_OWNERS,
  type GithubAccount, type GithubKind, type GithubScope, type GithubItem,
} from "@/lib/github-sync-policy";

type Connection = { token: string; githubToken: string; account: GithubAccount };
type Target = Connection & { repo: string; scope: GithubScope; kind: GithubKind };
type Write = Target & { key: string; value: string; action: "create" | "replace"; expectedUpdatedAt: string | null };

async function githubApi<T>(path: string, githubToken: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch("https://api.github.com" + path, {
      ...init, cache: "no-store", signal: AbortSignal.timeout(15000),
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: "Bearer " + githubToken,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
    });
  } catch {
    throw new Error("GitHub request failed or timed out. Refresh and compare before retrying.");
  }
  // Provider error bodies may contain sensitive information; never surface or log them.
  if (!response.ok) {
    if (response.status === 401) throw new Error("GitHub rejected the Vault token (401).");
    if (response.status === 403) throw new Error("GitHub denied this operation (403). Check token repository Secrets, Variables and Environments permissions or rate limits.");
    if (response.status === 404) throw new Error("GitHub repository or Actions endpoint unavailable (404). Check selected repository and token permissions.");
    if (response.status === 409 || response.status === 422) throw new Error("GitHub rejected the requested change (HTTP " + response.status + "). Inspect again.");
    if (response.status === 429) throw new Error("GitHub rate limit reached.");
    throw new Error("GitHub API rejected the request (HTTP " + response.status + ").");
  }
  if (response.status === 204 || response.status === 205) return {} as T;
  try { const raw = await response.text(); return raw ? JSON.parse(raw) as T : {} as T; }
  catch { throw new Error("GitHub returned an unreadable response. Refresh and compare again."); }
}

async function connection(input: Connection) {
  requireVaultUser(input.token);
  if (!Object.prototype.hasOwnProperty.call(GITHUB_OWNERS, input.account))
    throw new Error("Select Main or Fallback GitHub.");
  if (typeof input.githubToken !== "string" || input.githubToken.length < 16 || input.githubToken.length > 2048 || /\s/.test(input.githubToken))
    throw new Error("Save a valid account-scoped GitHub token in the unlocked Vault.");
  const account = await githubApi<{login?: string}>("/user", input.githubToken);
  if (account.login?.toLowerCase() !== GITHUB_OWNERS[input.account].toLowerCase())
    throw new Error("GitHub token account does not match the selected Main/Fallback owner.");
  return GITHUB_OWNERS[input.account];
}

function validatedRepo(fullName: string, owner: string) {
  if (typeof fullName !== "string") throw new Error("Choose a GitHub repository.");
  const [repoOwner, repo, extra] = fullName.split("/");
  if (extra || repoOwner?.toLowerCase() !== owner.toLowerCase() || !repo || !/^[A-Za-z0-9_.-]{1,100}$/.test(repo))
    throw new Error("Choose a repository owned by the connected GitHub account.");
  return repo;
}

async function confirmRepo(input: Target, owner: string) {
  const repo = validatedRepo(input.repo, owner);
  if (input.scope !== "repository" && input.scope !== "production") throw new Error("Invalid Actions scope.");
  if (input.kind !== "secret" && input.kind !== "variable") throw new Error("Invalid Actions entry type.");
  const info = await githubApi<{full_name?:string}>(pathForRepo(owner,repo),input.githubToken);
  if (info.full_name?.toLowerCase() !== input.repo.toLowerCase()) throw new Error("Repository identity did not match.");
  return repo;
}
function pathForRepo(owner:string,repo:string) {
  return "/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(repo);
}

async function productionEnvironment(owner:string, repo:string, githubToken:string) {
  const res = await githubApi<{total_count?:number;environments?:Array<{name?:string}>}>(
    pathForRepo(owner,repo) + "/environments?per_page=100", githubToken
  );
  if (!Array.isArray(res.environments)) throw new Error("GitHub did not return environment metadata.");
  const matches = res.environments.filter(e=>e.name?.toLowerCase()==="production");
  if (matches.length !== 1) throw new Error("This repository must already have exactly one Production environment. Vault sync will not create environments.");
  return matches[0]!.name!;
}

function normalizeRows(items: unknown): GithubItem[] {
  if (!Array.isArray(items)) throw new Error("GitHub did not return an Actions inventory.");
  return items.map((x:any)=>({
    name: typeof x?.name==="string" ? x.name : "",
    updatedAt: typeof x?.updated_at==="string" ? x.updated_at : null,
    createdAt: typeof x?.created_at==="string" ? x.created_at : null,
  })).filter(x=>Boolean(x.name));
}

async function inventory(input: Target, owner: string, repo: string) {
  const environment = input.scope === "production" ? await productionEnvironment(owner,repo,input.githubToken) : undefined;
  const base = targetPath(owner,repo,input.scope,input.kind,environment);
  let all: GithubItem[] = [];
  for(let page=1;page<=10;page++){
    const path = base + "?per_page=100&page=" + page;
    const result = await githubApi<{total_count?:number;secrets?:unknown[];variables?:unknown[]}>(path,input.githubToken);
    const batch = normalizeRows(input.kind==="secret" ? result.secrets : result.variables);
    all = all.concat(batch);
    if(batch.length<100) return {items:all,environment:environment||null,base};
  }
  throw new Error("Actions inventory exceeds 1,000 records. Sync is blocked to prevent incomplete comparisons.");
}

export const listVaultGithubRepositories = createServerFn({method:"POST"}).handler(
  async ({data}:{data:Connection}) => {
    const owner = await connection(data);
    const repositories:Array<{fullName:string;name:string;isPrivate:boolean}> = [];
    for(let page=1;page<=10;page++){
      const rows=await githubApi<Array<{full_name?:string;name?:string;private?:boolean;owner?:{login?:string}}>>(
        "/user/repos?affiliation=owner&per_page=100&page="+page+"&sort=full_name",data.githubToken
      );
      if(!Array.isArray(rows)) throw new Error("GitHub did not return a repository list.");
      for(const row of rows){
        if(row.owner?.login?.toLowerCase()===owner.toLowerCase() && row.full_name && row.name)
          repositories.push({fullName:row.full_name,name:row.name,isPrivate:!!row.private});
      }
      if(rows.length<100) return {owner,repositories:repositories.sort((a,b)=>a.name.localeCompare(b.name))};
    }
    throw new Error("Repository list exceeds 1,000 entries. Refusing an incomplete inventory.");
  }
);

export const inspectVaultGithubActions = createServerFn({method:"POST"}).handler(
  async ({data}:{data:Target}) => {
    const owner=await connection(data),repo=await confirmRepo(data,owner);
    const result=await inventory(data,owner,repo);
    return {items:result.items,scope:data.scope,kind:data.kind,environment:result.environment};
  }
);

export const writeVaultGithubAction = createServerFn({method:"POST"}).handler(
  async ({data}:{data:Write}) => {
    const owner=await connection(data),repo=await confirmRepo(data,owner);
    if(!allowedVaultValue(data.value)) throw new Error("Cannot sync an empty, placeholder or oversized Vault value.");
    if(data.action!=="create" && data.action!=="replace") throw new Error("Invalid reviewed action.");
    const before=await inventory(data,owner,repo);
    const plan=assertReviewedGithubWrite(before.items,data);
    const endpoint=before.base;
    if(data.kind==="secret"){
      // GitHub accepts libsodium sealed boxes, never plaintext. Values cannot be read back.
      const publicKey=await githubApi<{key?:string;key_id?:string}>(endpoint+"/public-key",data.githubToken);
      if(!publicKey.key || !publicKey.key_id) throw new Error("GitHub did not supply an Actions secret public key.");
      await sodium.ready;
      const recipient=sodium.from_base64(publicKey.key,sodium.base64_variants.ORIGINAL);
      if(recipient.length!==32) throw new Error("GitHub returned an invalid Actions secret public key.");
      const encrypted=sodium.to_base64(sodium.crypto_box_seal(sodium.from_string(data.value),recipient),sodium.base64_variants.ORIGINAL);
      await githubApi(endpoint+"/"+encodeURIComponent(data.key),data.githubToken,{
        method:"PUT",body:JSON.stringify({encrypted_value:encrypted,key_id:publicKey.key_id})
      });
    }else if(plan.action==="create"){
      await githubApi(endpoint,data.githubToken,{
        method:"POST",body:JSON.stringify({name:data.key,value:data.value})
      });
    }else{
      await githubApi(endpoint+"/"+encodeURIComponent(data.key),data.githubToken,{
        method:"PATCH",body:JSON.stringify({name:data.key,value:data.value})
      });
    }
    const after=await inventory(data,owner,repo);
    if(planGithubKey(after.items,data.key).action!=="replace")
      throw new Error("GitHub accepted the request but verification was inconclusive. Inspect before retrying.");
    return {ok:true,action:plan.action,scope:data.scope,kind:data.kind,presenceVerified:true,valueVerified:false};
  }
);
