import test from "node:test";
import assert from "node:assert/strict";
import {SETUP_PROJECTS, setupKeyState, summarizeSystemSetup, getSetupKeySpecs} from "../src/lib/vault-setup-guide.ts";

test("every reviewed system maps to a distinct Main and Fallback Vercel project",()=>{
 assert.deepEqual(SETUP_PROJECTS.map(x=>x.system),["License","Billing","Dev"]);
 assert.equal(SETUP_PROJECTS[0].main,"custom-licence-manager");
 assert.equal(SETUP_PROJECTS[0].fallback,"orbitfs-license-fallback");
 assert.equal(SETUP_PROJECTS[1].fallback,"orbitfs-billing-fallback");
});
test("metadata presence means configured name, never a verified secret",()=>{
 assert.deepEqual(setupKeyState([{key:"DATABASE_URL"}],"DATABASE_URL"),{status:"present",description:"Exists in Vercel; secret value not verified"});
 assert.equal(setupKeyState([{key:"DATABASE_URL",placeholderNote:true}],"DATABASE_URL").status,"review");
});
test("unavailable scans must not be called missing",()=>{
 assert.equal(setupKeyState(null,"DATABASE_URL").status,"unchecked");
 assert.equal(setupKeyState([],"DATABASE_URL").status,"missing");
});
test("comparison shows important database and authority keys, not every optional Main override as required",()=>{
 const keys=getSetupKeySpecs("Billing");
 assert.ok(keys.some(x=>x.name==="SUPABASE_SERVICE_ROLE_KEY"));
 assert.ok(keys.some(x=>x.name==="BILLING_API_TOKEN"));
 assert.ok(!keys.some(x=>x.name==="SITE_URL"));
 assert.ok(!keys.some(x=>x.name==="MASTER_API_URL"));
});
test("core missing key is explicitly counted and optional extra names are not errors",()=>{
 const essential=getSetupKeySpecs("License");
 const main=essential.map(x=>({key:x.name}));
 const fall=main.filter(x=>x.key!=="DATABASE_URL");
 const snapshot=summarizeSystemSetup("License",main,fall);
 assert.ok(snapshot.rows.some(r=>r.key==="DATABASE_URL" && r.fallback.status==="missing" && r.main.status==="present"));
 assert.equal(snapshot.missingFallback.some(x=>x.key==="DATABASE_URL"),true);
 assert.equal(snapshot.fallbackExtra.length,0);
});
test("when no live connection, both sides remain unchecked, not green",()=>{
 const result=summarizeSystemSetup("Dev",null,null);
 assert.ok(result.rows.every(x=>x.main.status==="unchecked"&&x.fallback.status==="unchecked"));
 assert.equal(result.missingFallback.length,0);
});
test("unknown keys from live Production are shown as extra names, never discarded",()=>{
 const result=summarizeSystemSetup("Billing",
  [{key:"NEXT_PUBLIC_SUPABASE_URL"},{key:"MAIN_EXTRA_ONLY"}],
  [{key:"NEXT_PUBLIC_SUPABASE_URL"},{key:"FALLBACK_CUSTOM"}]);
 assert.ok(result.mainExtra.includes("MAIN_EXTRA_ONLY"));
 assert.ok(result.fallbackExtra.includes("FALLBACK_CUSTOM"));
});
