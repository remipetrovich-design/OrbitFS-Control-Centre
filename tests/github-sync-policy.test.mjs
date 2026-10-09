import test from "node:test";
import assert from "node:assert/strict";
import { planGithubKey, assertReviewedGithubWrite, allowedVaultValue, targetPath, GITHUB_OWNERS } from "../src/lib/github-sync-policy.ts";

const existing = [{name:"LICENSE_MASTER_API_TOKEN",createdAt:"2026-10-01T00:00:00Z",updatedAt:"2026-10-02T00:00:00Z"}];

test("create, replace, stale-review refusal and case insensitive matching", () => {
  assert.equal(planGithubKey(existing,"NEW_VALUE").action,"create");
  const plan = planGithubKey(existing,"license_master_api_token");
  assert.equal(plan.action,"replace");
  assert.equal(plan.expectedUpdatedAt,"2026-10-02T00:00:00Z");
  assert.equal(assertReviewedGithubWrite(existing,{key:plan.key,action:"replace",expectedUpdatedAt:plan.expectedUpdatedAt}).action,"replace");
  assert.throws(()=>assertReviewedGithubWrite(existing,{key:plan.key,action:"create",expectedUpdatedAt:null}),/changed since review/);
  assert.throws(()=>assertReviewedGithubWrite([{...existing[0],updatedAt:"2026-10-03T00:00:00Z"}],{key:plan.key,action:"replace",expectedUpdatedAt:plan.expectedUpdatedAt}),/changed since review/);
});
test("never export connection tokens, reject malformed or ambiguous names", () => {
  for(const key of ["GITHUB_TOKEN","GITHUB_TOKEN_MAIN","GITHUB_TOKEN_FALLBACK","GH_TOKEN","VERCEL_TOKEN_MAIN","VERCEL_TEAM_ID_FALLBACK","BAD-NAME"]) {
    assert.equal(planGithubKey([],key).action,"blocked",key);
  }
  assert.equal(planGithubKey([...existing,...existing],"LICENSE_MASTER_API_TOKEN").action,"blocked");
  assert.equal(planGithubKey([{name:"A",updatedAt:null,createdAt:null}],"A").action,"blocked");
});
test("reject placeholders and unsafe empty values", () => {
  for(const value of ["","change-me","REPLACE_WITH_SECRET","your-key","todo","  "]) assert.equal(allowedVaultValue(value),false);
  assert.equal(allowedVaultValue("legitimate-production-secret"),true);
});
test("root database and master authority secrets never go to GitHub Actions",()=>{
  for(const key of ["MASTER_API_TOKEN","LM_MASTER_API_TOKEN","DATABASE_URL","LM_DATABASE_URL","SUPABASE_SERVICE_ROLE_KEY","BOOTSTRAP_ADMIN_PASSWORD"])
    assert.equal(planGithubKey([],key).action,"blocked",key);
});
test("GitHub scopes are distinct and only allow Production", () => {
  assert.equal(GITHUB_OWNERS.main,"lucaskerim123");
  assert.equal(GITHUB_OWNERS.fallback,"remipetrovich-design");
  assert.equal(targetPath("lucaskerim123","V1-vercel-engine","repository","secret"),"/repos/lucaskerim123/V1-vercel-engine/actions/secrets");
  assert.equal(targetPath("lucaskerim123","V1-vercel-engine","production","variable","Production"),"/repos/lucaskerim123/V1-vercel-engine/environments/Production/variables");
  assert.throws(()=>targetPath("lucaskerim123","Dev-panel","production","secret","Staging"),/Only an existing Production/);
});
