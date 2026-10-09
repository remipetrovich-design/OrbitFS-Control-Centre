import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workspace=readFileSync(new URL("../src/components/vault-workspace.tsx",import.meta.url),"utf8");

test("saved system/account groups are visible near the top before large editor/import forms",()=>{
  const group=workspace.indexOf('<section className="orbit-panel overflow-hidden">');
  const form=workspace.indexOf('<form id="vault-entry-editor"');
  assert.ok(group>=0,"saved groups present");
  assert.ok(form>=0,"key form present");
  assert.ok(group<form,"saved system groups must precede the editor");
});
test("saved groups precede expanded workflow sync tools",()=>{
 const group=workspace.indexOf('<section className="orbit-panel overflow-hidden">');
 const vercel=workspace.indexOf('<VaultVercelSync');
 const github=workspace.indexOf('<VaultGithubSync');
 assert.ok(group>=0&&vercel>group&&github>group,"grouped saved keys must appear before sync tools");
});
test("saved groups never depend on reference-only catalog to render",()=>{
 const group=workspace.indexOf('<section className="orbit-panel overflow-hidden">');
 const ref=workspace.indexOf('<VaultInventorySection');
 assert.ok(group>=0&&ref>group,"reference library must come after the saved inventory");
});
