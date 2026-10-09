import test from "node:test";
import assert from "node:assert/strict";
import { groupVaultItems, vaultSystemLabel, vaultModeLabel } from "../src/lib/vault-grouping.ts";

const row=(id,system,usedIn)=>({id,systems:[system],otherSystem:"",service:"Vercel",customService:"",keyName:id,secret:"test-secret",usedIn,destinationSystem:"example"});
test("groups by system first and then Main or Fallback",()=>{
 const rows=[row("a","Billing",["main"]),row("b","License",["fallback"]),row("c","Billing",["fallback"])];
 const groups=groupVaultItems(rows,x=>x);
 assert.deepEqual(groups.map(g=>g.system),["License","Billing"]);
 assert.deepEqual(groups.find(g=>g.system==="Billing").sections.map(s=>[s.mode,s.items.map(x=>x.id)]),
   [["main",["a"]],["fallback",["c"]]]);
});
test("a record configured for both accounts appears inside both groups without modification",()=>{
 const shared=row("shared","Dev",["main","fallback"]);
 const groups=groupVaultItems([shared],x=>x);
 assert.equal(groups[0].count,1);
 assert.equal(groups[0].sections[0].items[0],shared);
 assert.equal(groups[0].sections[1].items[0],shared);
});
test("unassigned records remain visible in a separate third group",()=>{
 const unknown=row("unassigned","Other",[]);
 const groups=groupVaultItems([unknown],x=>x);
 assert.deepEqual(groups[0].sections.map(s=>s.mode),["unassigned"]);
});
test("supports assessed Vercel entries while retaining the status and the original Vault record",()=>{
 const assessed={row:row("key","Base System",["fallback"]),assessment:{status:"attach"}};
 const groups=groupVaultItems([assessed],x=>x.row);
 assert.equal(groups[0].sections[0].items[0],assessed);
 assert.equal(groups[0].sections[0].items[0].assessment.status,"attach");
});
test("search-filtered input never changes the original Vault records or secret",()=>{
 const original=[row("s1","License",["main"]),row("s2","Billing",["fallback"])];
 const filtered=original.filter(x=>x.keyName==="s2");
 const groups=groupVaultItems(filtered,x=>x);
 assert.equal(groups.length,1);
 assert.equal(groups[0].sections[0].items[0].secret,"test-secret");
 assert.equal(original.length,2);
});
test("friendly group labels identify the system and account explicitly",()=>{
 assert.equal(vaultSystemLabel("License"),"License Manager");
 assert.equal(vaultSystemLabel("Billing"),"Billing Store");
 assert.equal(vaultSystemLabel("Dev"),"Dev Panel");
 assert.equal(vaultModeLabel("main"),"Main");
 assert.equal(vaultModeLabel("fallback"),"Fallback");
 assert.equal(vaultModeLabel("unassigned"),"Needs assignment");
});
