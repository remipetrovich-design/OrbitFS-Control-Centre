import test from "node:test";
import assert from "node:assert/strict";
import {operationsWorkflowRunPaths} from "../src/lib/operations-workflow-runs.mjs";

test("queries each tracked Operations workflow directly so unrelated Actions runs cannot hide the latest deploy",()=>{
 const paths=operationsWorkflowRunPaths({repo:"lucaskerim123/V2_Billing_Store",branch:"main",ci:"ci.yml",deploy:"production-deploy.yml",quickDeploy:"quick-redesign-deploy.yml"});
 assert.deepEqual(paths,{
  ci:"/repos/lucaskerim123/V2_Billing_Store/actions/workflows/ci.yml/runs?branch=main&per_page=20",
  deploy:"/repos/lucaskerim123/V2_Billing_Store/actions/workflows/production-deploy.yml/runs?branch=main&per_page=20",
  quickDeploy:"/repos/lucaskerim123/V2_Billing_Store/actions/workflows/quick-redesign-deploy.yml/runs?branch=main&per_page=20"
 });
 for(const path of Object.values(paths))assert.match(path,/\/actions\/workflows\//);
});
