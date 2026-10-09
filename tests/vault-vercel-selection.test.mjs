import test from "node:test";
import assert from "node:assert/strict";
import { assessVercelVaultEntry, attachVercelVaultEntry, suggestUnsavedVercelKeys, addBlankVercelVaultEntry } from "../src/lib/vault-vercel-selection.ts";
import { allowedForVercelProject } from "../src/lib/vault-schema.ts";

const record=(keyName,overrides={})=>({
  id:"source-"+keyName,systems:["Billing"],service:"Vercel",otherSystem:"",customService:"",
  keyName,secret:"correct-secret",usedIn:["main"],destinationSystem:"v2-billing-store",needsReview:false,...overrides
});
const fallback="orbitfs-billing-fallback";
test("a saved value on Main shows an explicit attach action for Fallback, not an invisible row",()=>{
 const original=record("BILLING_API_TOKEN");
 assert.equal(assessVercelVaultEntry(original,fallback,"fallback").status,"attach");
});
test("blank and placeholder Vault values are visible as needing a value",()=>{
 assert.equal(assessVercelVaultEntry(record("CRON_SECRET",{secret:""}),"v2-billing-store","main").status,"value");
 assert.equal(assessVercelVaultEntry(record("CRON_SECRET",{secret:"change-me"}),"v2-billing-store","main").status,"value");
});
test("verified live names are not required if a record is explicitly mapped with its exact key",()=>{
 const row=record("UNLISTED_BUT_REAL_KEY");
 assert.equal(allowedForVercelProject(row,"v2-billing-store","main"),true);
 assert.equal(assessVercelVaultEntry(row,"v2-billing-store","main").status,"ready");
});
test("connection-token names can be displayed but never attached as runtime variables",()=>{
 for(const keyName of ["VERCEL_TOKEN_MAIN","GITHUB_TOKEN_FALLBACK","VERCEL_TEAM_ID_MAIN"]){
  const row=record(keyName);
  assert.equal(assessVercelVaultEntry(row,"v2-billing-store","main").status,"protected");
  assert.throws(()=>attachVercelVaultEntry([row],row,fallback,"fallback","fresh"),/connection/i);
 }
});
test("attach creates a separate destination entry retaining both the exact name and original secret",()=>{
 const source=record("BILLING_API_TOKEN");
 const result=attachVercelVaultEntry([source],source,fallback,"fallback","new-id");
 assert.equal(result.length,2);
 assert.equal(result[0].keyName,"BILLING_API_TOKEN");
 assert.equal(result[0].secret,source.secret);
 assert.equal(result[0].destinationSystem,fallback);
 assert.equal(result[0].service,"Vercel");
 assert.deepEqual(result[0].systems,["Billing"]);
 assert.deepEqual(result[0].usedIn,["fallback"]);
 assert.equal(result[1],source);
});
test("same destination/key cannot be attached twice",()=>{
 const source=record("BILLING_API_TOKEN");
 const first=attachVercelVaultEntry([source],source,fallback,"fallback","new-id");
 assert.throws(()=>attachVercelVaultEntry(first,source,fallback,"fallback","another-id"),/already/i);
});
test("a GitHub-source record may be explicitly attached to Vercel without altering its original GitHub mapping",()=>{
 const source=record("BILLING_API_TOKEN",{service:"GitHub",destinationSystem:"lucaskerim123/V2_Billing_Store"});
 const result=attachVercelVaultEntry([source],source,fallback,"fallback","copy-id");
 assert.equal(result[0].service,"Vercel");
 assert.equal(result[0].destinationSystem,fallback);
 assert.equal(result[1].service,"GitHub");
});
test("invalid environment keys cannot be attached",()=>{
 const source=record("BAD-KEY");
 assert.equal(assessVercelVaultEntry(source,fallback,"fallback").status,"invalid");
 assert.throws(()=>attachVercelVaultEntry([source],source,fallback,"fallback","new-id"),/invalid/i);
});

test("the large verified inventory is offered in Vercel sync even if the name was never saved to Vault",()=>{
 const suggestions=suggestUnsavedVercelKeys([],fallback,["MY_FALLBACK_CUSTOM_KEY"]);
 assert.ok(suggestions.includes("BILLING_API_TOKEN"));
 assert.ok(suggestions.includes("MY_FALLBACK_CUSTOM_KEY"));
});
test("clicking a reference name creates a blank, correctly mapped Vault key",()=>{
 const result=addBlankVercelVaultEntry([],"BILLING_API_TOKEN",fallback,"fallback","ref-id");
 assert.equal(result.length,1);
 assert.equal(result[0].keyName,"BILLING_API_TOKEN");
 assert.equal(result[0].secret,"");
 assert.equal(result[0].destinationSystem,fallback);
 assert.deepEqual(result[0].usedIn,["fallback"]);
 assert.equal(assessVercelVaultEntry(result[0],fallback,"fallback").status,"value");
});
test("reference suggestions exclude saved keys, reserved account tokens, and invalid variable names",()=>{
 const known=[record("BILLING_API_TOKEN")];
 const refs=suggestUnsavedVercelKeys(known,fallback,["GITHUB_TOKEN_MAIN","BAD-KEY","FALLBACK_NEW_KEY"]);
 assert.ok(!refs.includes("BILLING_API_TOKEN"));
 assert.ok(!refs.includes("GITHUB_TOKEN_MAIN"));
 assert.ok(!refs.includes("BAD-KEY"));
 assert.ok(refs.includes("FALLBACK_NEW_KEY"));
});
