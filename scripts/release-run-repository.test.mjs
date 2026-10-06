import test from "node:test";
import assert from "node:assert/strict";
import {activeReleaseRunRepository,githubRunRepository} from "../src/lib/release-run-repository.mjs";

test("extracts the repository from a GitHub Actions run URL",()=>{
 assert.equal(
  githubRunRepository("https://github.com/remipetrovich-design/OrbitFS-Control-Centre/actions/runs/37320556114"),
  "remipetrovich-design/OrbitFS-Control-Centre"
 );
});

test("does not restore a fallback Base run after MAIN becomes active",()=>{
 assert.equal(activeReleaseRunRepository({
  sourceRepo:"remipetrovich-design/OrbitFS-Base-System",
  runUrl:"https://github.com/remipetrovich-design/OrbitFS-Control-Centre/actions/runs/37320556114",
  activeSourceRepo:"lucaskerim123/V1-vercel-base",
  activeWorkerRepo:"lucaskerim123/Dev-panel"
 }),"");
});

test("restores a MAIN Base run only from the MAIN Dev Panel worker",()=>{
 assert.equal(activeReleaseRunRepository({
  sourceRepo:"lucaskerim123/V1-vercel-base",
  runUrl:"https://github.com/lucaskerim123/Dev-panel/actions/runs/37321688196",
  activeSourceRepo:"lucaskerim123/V1-vercel-base",
  activeWorkerRepo:"lucaskerim123/Dev-panel"
 }),"lucaskerim123/Dev-panel");
 assert.equal(activeReleaseRunRepository({
  sourceRepo:"lucaskerim123/V1-vercel-base",
  runUrl:"https://github.com/remipetrovich-design/OrbitFS-Control-Centre/actions/runs/37320556114",
  activeSourceRepo:"lucaskerim123/V1-vercel-base",
  activeWorkerRepo:"lucaskerim123/Dev-panel"
 }),"");
});

test("restores a MAIN Engine run only from the MAIN Engine repository",()=>{
 assert.equal(activeReleaseRunRepository({
  sourceRepo:"lucaskerim123/V1-vercel-engine",
  runUrl:"https://github.com/lucaskerim123/V1-vercel-engine/actions/runs/37320622337",
  activeSourceRepo:"lucaskerim123/V1-vercel-engine",
  activeWorkerRepo:"lucaskerim123/V1-vercel-engine"
 }),"lucaskerim123/V1-vercel-engine");
});
