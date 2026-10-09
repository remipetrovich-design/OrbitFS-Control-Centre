import test from "node:test";
import assert from "node:assert/strict";
import { CORE_SPECS, CORE_GROUPS, coreMatches, coreSpecOf, coreStatus, isCoreRecord } from "../src/lib/vault-core.ts";

const row=(keyName,systems,service,secret="")=>({id:keyName,systems:[systems],service,keyName,secret,otherSystem:"",customService:""});

test("source-specific critical keys stay separate",()=>{
  const licensing=row("LM_BILLING_API_TOKEN","License Manager","Billing");
  const store=row("BILLING_API_TOKEN","Billing Store","Billing");
  assert.notEqual(coreSpecOf(licensing)?.keyName,coreSpecOf(store)?.keyName);
  assert.equal(coreSpecOf(licensing)?.description,"License Manager · Billing Store identity");
  assert.equal(coreSpecOf(store)?.description,"Billing Store · billing integration credential");
});
test("core section contains both GitHub account tokens, no per-repository credentials",()=>{
  const group=CORE_GROUPS.find(g=>g.title.includes("two shared tokens"));
  assert.deepEqual(group?.entries.map(x=>x.keyName),["GITHUB_TOKEN_MAIN","GITHUB_TOKEN_FALLBACK"]);
  assert.equal(coreMatches(row("GITHUB_TOKEN_MAIN","GitHub","Deployment"),group.entries[0]),true);
});
test("missing, blank, and placeholder produce reminders only",()=>{
  assert.equal(coreStatus(undefined),"missing");
  assert.equal(coreStatus(""),"blank");
  assert.equal(coreStatus("   "),"blank");
  assert.equal(coreStatus("change-me"),"placeholder");
  assert.equal(coreStatus("REPLACE_WITH_SECRET"),"placeholder");
  assert.equal(coreStatus("actual-value"),"filled");
});
test("critical raw and prefixed keys never disappear into generic list",()=>{
  for(const key of ["DATABASE_URL","LM_DATABASE_URL","LICENSE_MASTER_API_TOKEN","DEV_LICENSE_MASTER_API_TOKEN","BILLING_SUPABASE_SERVICE_ROLE_KEY"])
    assert.equal(isCoreRecord(row(key,"Other","Environment")),true,key);
  assert.equal(isCoreRecord(row("A_NORMAL_SETTING","Other","Environment")),false);
  assert.equal(new Set(CORE_SPECS.map(s=>[s.system,s.service,s.keyName].join("|"))).size,CORE_SPECS.length);
});
