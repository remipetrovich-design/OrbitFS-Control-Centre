import test from "node:test";
import assert from "node:assert/strict";
import { isVaultConnection, bestVaultConnection, preserveVaultConnections } from "../src/lib/vault-connections.ts";

const entry=(key,secret,extras={})=>({id:key+":"+secret,systems:["Dev"],otherSystem:"",service:key.startsWith("GITHUB")?"GitHub":"Vercel",customService:"",keyName:key,secret,...extras});
test("replace-all import keeps four valid account connections over placeholder JSON",()=>{
 const original=["VERCEL_TOKEN_MAIN","VERCEL_TOKEN_FALLBACK","GITHUB_TOKEN_MAIN","GITHUB_TOKEN_FALLBACK"].map((k,i)=>entry(k,"original-secret-"+i));
 const incoming=original.map(x=>entry(x.keyName,"change-me"));
 const next=preserveVaultConnections(original,[...incoming,entry("BILLING_API_TOKEN","new-value")]);
 assert.equal(next.length,5);
 for(const k of original.map(x=>x.keyName))assert.equal(bestVaultConnection(next,k)?.secret,original.find(x=>x.keyName===k)?.secret);
 assert.equal(next.find(x=>x.keyName==="BILLING_API_TOKEN")?.secret,"new-value");
});
test("real existing connection is preferred even when imported item is listed first",()=>{
 const rows=[entry("GITHUB_TOKEN_MAIN","change-me"),entry("GITHUB_TOKEN_MAIN","real-pat")];
 assert.equal(bestVaultConnection(rows,"GITHUB_TOKEN_MAIN")?.secret,"real-pat");
});
test("blank existing connection may be repaired from a valid encrypted backup",()=>{
 const next=preserveVaultConnections([entry("VERCEL_TOKEN_MAIN","change-me")],[entry("VERCEL_TOKEN_MAIN","real-restored-token")]);
 assert.equal(bestVaultConnection(next,"VERCEL_TOKEN_MAIN")?.secret,"real-restored-token");
});
test("non-account production credentials are replaced as requested",()=>{
 const result=preserveVaultConnections([entry("BILLING_API_TOKEN","old")],[entry("BILLING_API_TOKEN","new")]);
 assert.equal(result.length,1);assert.equal(result[0].secret,"new");
});
test("account-team identifiers are protected along with tokens",()=>{
 const result=preserveVaultConnections([entry("VERCEL_TEAM_ID_MAIN","team_old")],[entry("VERCEL_TEAM_ID_MAIN","change-me")]);
 assert.equal(result.find(x=>x.keyName==="VERCEL_TEAM_ID_MAIN")?.secret,"team_old");
});
test("only the six connection names are special",()=>{
 assert.equal(isVaultConnection(entry("VERCEL_TOKEN_MAIN","x")),true);
 assert.equal(isVaultConnection(entry("GITHUB_TOKEN_FALLBACK","x")),true);
 assert.equal(isVaultConnection(entry("BILLING_API_TOKEN","x")),false);
 assert.equal(isVaultConnection(entry("VERCEL_TOKEN","x")),false);
});
test("connection records are stamped with accurate service and account without changing secret",()=>{
 const old=entry("GITHUB_TOKEN_FALLBACK","real-token",{systems:["GitHub"],service:"Deployment",usedIn:[]});
 const fixed=preserveVaultConnections([old],[])[0];
 assert.equal(fixed.service,"GitHub");assert.equal(fixed.systems[0],"Dev");
 assert.deepEqual(fixed.usedIn,["fallback"]);assert.equal(fixed.secret,"real-token");
});
test("import-only records with no old connections are retained without inventing token values",()=>{
 const rows=preserveVaultConnections([], [entry("GITHUB_TOKEN_MAIN","change-me"),entry("BILLING_API_TOKEN","change-me")]);
 assert.equal(rows.length,2);
 assert.equal(bestVaultConnection(rows,"GITHUB_TOKEN_MAIN")?.secret,"change-me");
});
