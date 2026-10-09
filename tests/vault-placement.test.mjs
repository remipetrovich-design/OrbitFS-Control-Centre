import test from "node:test";
import assert from "node:assert/strict";
import {whereDoesThisGo,intendedForGithubRepo,intendedForVercelProject} from "../src/lib/vault-placement.ts";
const item=(keyName)=>({id:keyName,keyName,systems:["Other"],service:"Environment",secret:"change-me",otherSystem:"",customService:""});
test("two GitHub tokens and Vercel account tokens are Vault-only",()=>{
 for(const key of ["GITHUB_TOKEN_MAIN","GITHUB_TOKEN_FALLBACK","VERCEL_TOKEN_MAIN","VERCEL_TEAM_ID_FALLBACK"])
  assert.equal(whereDoesThisGo(item(key)).where,"Vault only");
});
test("License Manager authority stays isolated, with distinct Billing recipients",()=>{
 assert.equal(whereDoesThisGo(item("LM_MASTER_API_TOKEN")).service,"License Manager");
 assert.equal(whereDoesThisGo(item("BILLING_API_TOKEN")).service,"Billing Store");
 assert.ok(intendedForVercelProject(item("LM_DATABASE_URL"),"orbitfs-license-fallback"));
 assert.ok(!intendedForVercelProject(item("LM_DATABASE_URL"),"orbitfs-billing-fallback"));
 assert.ok(intendedForVercelProject(item("BILLING_LICENSE_MASTER_URL"),"orbitfs-billing-fallback"));
});
test("release workflow credentials go only to relevant repositories",()=>{
 assert.ok(intendedForGithubRepo(item("LICENSE_MASTER_API_TOKEN"),"lucaskerim123/V1-vercel-engine"));
 assert.ok(intendedForGithubRepo(item("LICENSE_MASTER_API_TOKEN"),"remipetrovich-design/OrbitFS-Base-System"));
 assert.equal(intendedForGithubRepo(item("LICENSE_MASTER_API_TOKEN"),"lucaskerim123/Custom-licence-manager"),false);
 assert.equal(intendedForGithubRepo(item("GITHUB_TOKEN_MAIN"),"lucaskerim123/V1-vercel-base"),false);
 assert.equal(whereDoesThisGo(item("VERCEL_TOKEN")).where,"GitHub Actions");
});
test("unclassified keys do not get an invented destination",()=>{
 const result=whereDoesThisGo(item("SOME_UNKNOWN_SETTING"));
 assert.equal(result.where,"Review");
});

test("shared account tokens have only their intended explicit reuse destinations",()=>{
 assert.equal(intendedForVercelProject(item("GITHUB_TOKEN_MAIN"),"base-deploy-panel"),true);
 assert.equal(intendedForVercelProject(item("GITHUB_TOKEN_MAIN"),"orbitfs-dev-panel-fallback"),false);
 assert.equal(intendedForVercelProject(item("GITHUB_TOKEN_FALLBACK"),"orbitfs-dev-panel-fallback"),true);
 assert.equal(intendedForVercelProject(item("GITHUB_TOKEN_FALLBACK"),"orbitfs-billing-fallback"),false);
 assert.equal(intendedForVercelProject(item("VERCEL_TOKEN_MAIN"),"custom-licence-manager"),true);
 assert.equal(intendedForVercelProject(item("VERCEL_TOKEN_MAIN"),"v2-billing-store"),false);
});
