import test from "node:test";
import assert from "node:assert/strict";
import { planProductionKey, assertReviewedProductionWrite } from "../src/lib/vercel-sync-policy.ts";

const row = (target = ["production"], extra = {}) => ({
  id: "env_123", key: "LICENSE_MASTER_URL", type: "sensitive", target,
  updatedAt: 1790000000000, gitBranch: null, customEnvironmentIds: [], visibility: "secret", ...extra
});

test("new key must be explicitly created in production only", () => {
  assert.deepEqual(planProductionKey([], "APP_URL"), {
    action: "create", key: "APP_URL", expectedId: null, expectedUpdatedAt: null
  });
});
test("an existing key requires an exact reviewed version", () => {
  const existing = [row()];
  const plan = planProductionKey(existing, "LICENSE_MASTER_URL");
  assert.equal(plan.action, "replace");
  assert.deepEqual(assertReviewedProductionWrite(existing, {
    key: "LICENSE_MASTER_URL", action: "replace", expectedId: "env_123", expectedUpdatedAt: 1790000000000
  }), plan);
  assert.throws(() => assertReviewedProductionWrite(existing, {
    key: "LICENSE_MASTER_URL", action: "replace", expectedId: "env_123", expectedUpdatedAt: 1700000000000
  }), /changed since comparison/);
});
test("do not change shared Production and Preview settings", () => {
  assert.equal(planProductionKey([row(["production", "preview"])], "LICENSE_MASTER_URL").action, "blocked");
  assert.equal(planProductionKey([row(["production"], { customEnvironmentIds: ["custom_1"] })], "LICENSE_MASTER_URL").action, "blocked");
});
test("do not export Vault connection tokens into target projects", () => {
  for (const key of ["VERCEL_TOKEN_MAIN", "VERCEL_TOKEN_FALLBACK", "VERCEL_TEAM_ID_MAIN", "VERCEL_TEAM_ID_FALLBACK"]) {
    assert.equal(planProductionKey([], key).action, "blocked");
  }
});
test("only one Production record can be replaced", () => {
  assert.equal(planProductionKey([row(), row(["production"], {id:"env_other"})], "LICENSE_MASTER_URL").action, "blocked");
});
test("does not mistake preview-only variables for Production variables", () => {
  assert.equal(planProductionKey([row(["preview"])], "LICENSE_MASTER_URL").action, "create");
});
