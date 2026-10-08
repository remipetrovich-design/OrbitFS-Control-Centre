import {readFileSync} from "node:fs";

const server=readFileSync("src/lib/panel.server.ts","utf8");
const page=readFileSync("src/components/database-system-workspace.tsx","utf8");
const baseWorkflow=readFileSync(".github/workflows/package-base-release.yml","utf8");
const assert=(condition,message)=>{if(!condition)throw new Error(message)};

assert(
  server.includes("ensureAutomaticReleaseDatabasePackages") &&
  server.includes("requiredDatabaseComponentsForRelease"),
  "Database automation contract failed: normal releases must automatically ensure the central package set."
);
const databasePreparationIndex=server.indexOf("databasePackages=await ensureAutomaticReleaseDatabasePackages");
const releaseDispatchIndex=server.indexOf("await github(\`/repos/\${workerRepo}/actions/workflows",databasePreparationIndex);
assert(
  databasePreparationIndex>=0 && releaseDispatchIndex>databasePreparationIndex,
  "Database automation contract failed: database package readiness must be checked before release worker dispatch."
);
assert(
  server.includes("orbitfs_deployment_events") &&
  server.includes("update.engine.preflight") &&
  server.includes("database.migration"),
  "Database operations contract failed: Dev Panel must surface Inner Deployer / database execution activity."
);
assert(
  page.includes("Automatic release integration") &&
  page.includes("Verify & sync product databases") &&
  page.includes("Inner Deployer → Shared Engine Host"),
  "Database page contract failed: automatic flow and recovery controls must be visible."
);
assert(
  !page.includes("Register built product package(s) as License Manager candidate(s)"),
  "Database page contract failed: candidate registration must not be the primary operator workflow."
);
assert(
  baseWorkflow.includes("seq 1 72") && baseWorkflow.includes("sleep 5"),
  "Database automation contract failed: Base worker must allow enough time for full isolated Supabase validation and candidate intake."
);

console.log("Dev Panel database automation contract checks passed.");
