import test from "node:test";
import assert from "node:assert/strict";
import { normalizeVaultRecord, exactVerifiedName, recordIdentity, allowedForVercelProject, allowedForGithubRepo, systemForProject } from "../src/lib/vault-schema.ts";
const old = (key,systems=["Vercel"],service="Environment",secret="secret-A") => ({id:key,systems,otherSystem:"",service,customService:"",keyName:key,secret});
test("old prefixed Billing token uses exact verified runtime name and preserves value",()=>{
 const result=normalizeVaultRecord(old("BILLING_BILLING_API_TOKEN"));
 assert.equal(result.keyName,"BILLING_API_TOKEN");
 assert.equal(result.legacyKeyName,"BILLING_BILLING_API_TOKEN");
 assert.equal(result.secret,"secret-A");
 assert.equal(result.service,"Vercel");
 assert.equal(result.systems[0],"Billing");
 assert.equal(result.destinationSystem,"v2-billing-store");
});
test("verified original key does not get its legitimate BILLING_ prefix removed",()=>{
 const result=normalizeVaultRecord(old("BILLING_API_TOKEN",["Billing Store"],"Environment"));
 assert.equal(result.keyName,"BILLING_API_TOKEN");
});
test("unverified names never get guessed or automatically shortened",()=>{
 const result=normalizeVaultRecord(old("BILLING_FAKE_UNUSED_KEY"));
 assert.equal(result.keyName,"BILLING_FAKE_UNUSED_KEY");
 assert.equal(result.needsReview,true);
 assert.equal(result.destinationSystem,"");
});
test("same exact name in different services remains distinct",()=>{
 const a=normalizeVaultRecord(old("LM_BILLING_API_TOKEN"));
 const b=normalizeVaultRecord(old("BILLING_BILLING_API_TOKEN"));
 assert.equal(a.keyName,b.keyName);
 assert.notEqual(recordIdentity(a),recordIdentity(b));
 assert.equal(a.systems[0],"License");
 assert.equal(b.systems[0],"Billing");
});
test("migration is idempotent and never invents a destination for unknown key",()=>{
 const first=normalizeVaultRecord(old("DEV_UNKNOWN_VALUE"));
 assert.deepEqual(normalizeVaultRecord(first),first);
});
test("Vercel sync requires verified exact key, correct owning system, and explicit account",()=>{
 const billing=normalizeVaultRecord(old("BILLING_BILLING_API_TOKEN"));
 assert.equal(allowedForVercelProject(billing,"v2-billing-store","main"),true);
 assert.equal(allowedForVercelProject(billing,"custom-licence-manager","main"),false);
 assert.equal(allowedForVercelProject(billing,"v2-billing-store","fallback"),false);
});
test("GitHub sync never guesses a repository from key prefixes",()=>{
 const record=normalizeVaultRecord(old("VERCEL_TOKEN",["GitHub"],"Deployment"));
 assert.equal(allowedForGithubRepo(record,"lucaskerim123/V2_Billing_Store","main"),false);
 const mapped={...record,system:["Billing"],systems:["Billing"],service:"GitHub",destinationSystem:"lucaskerim123/V2_Billing_Store",usedIn:["main"],needsReview:false};
 assert.equal(allowedForGithubRepo(mapped,"lucaskerim123/V2_Billing_Store","main"),true);
});
test("Shared Engine and Base owner names are separate",()=>{
 assert.equal(systemForProject("orbitfs-engine-ofsdae9176"),"Shared Engine");
 assert.equal(systemForProject("v1-vercel-base"),"Base System");
});
