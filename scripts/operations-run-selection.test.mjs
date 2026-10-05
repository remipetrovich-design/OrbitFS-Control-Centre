import test from "node:test";
import assert from "node:assert/strict";
import {selectOperationsRun} from "../src/lib/operations-run-selection.mjs";

const run=(name,status,created_at)=>({name,status,created_at});

test("keeps an active Quick Deploy in the console even when a newer Full Scan is active",()=>{
 const quick=run("Quick Deploy","in_progress","2026-10-05T13:00:00Z");
 const scan=run("Store Full Scan","in_progress","2026-10-05T13:01:00Z");
 assert.equal(selectOperationsRun({ciRun:scan,deployRun:null,quickDeployRun:quick}),quick);
});

test("keeps an active normal deployment ahead of an active scan",()=>{
 const deploy=run("Production Deploy","queued","2026-10-05T13:00:00Z");
 const scan=run("Store Full Scan","in_progress","2026-10-05T13:01:00Z");
 assert.equal(selectOperationsRun({ciRun:scan,deployRun:deploy,quickDeployRun:null}),deploy);
});

test("shows an active scan when there is no active deployment",()=>{
 const quick=run("Quick Deploy","completed","2026-10-05T12:59:00Z");
 const scan=run("Store Full Scan","in_progress","2026-10-05T13:01:00Z");
 assert.equal(selectOperationsRun({ciRun:scan,deployRun:null,quickDeployRun:quick}),scan);
});

test("falls back to the newest completed run when nothing is active",()=>{
 const quick=run("Quick Deploy","completed","2026-10-05T13:00:00Z");
 const scan=run("Store Full Scan","completed","2026-10-05T13:01:00Z");
 assert.equal(selectOperationsRun({ciRun:scan,deployRun:null,quickDeployRun:quick}),scan);
});
