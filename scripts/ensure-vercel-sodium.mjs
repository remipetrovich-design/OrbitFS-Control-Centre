// Ensure the GitHub Actions secret encryption dependency is shipped with each
// prebuilt Vercel function. Nitro's ESM bundling cannot execute libsodium's
// CommonJS __dirname loader, so the dependency must stay external and be copied.
import { existsSync, readdirSync, mkdirSync, cpSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const output = resolve(".vercel/output/functions");
if (!existsSync(output)) {
  throw new Error("Vercel function output missing; refusing unverifiable sodium deployment");
}
const dependencies = ["libsodium-wrappers", "libsodium"];
const sources = dependencies.map(name => {
  const entry = require.resolve(name);
  let folder = resolve(entry);
  // Node's require.resolve resolves the published package entry; find package root.
  while (!existsSync(join(folder, "package.json"))) {
    const parent = resolve(folder, "..");
    if (parent === folder) throw new Error("Cannot locate package root: " + name);
    folder = parent;
  }
  return { name, folder: realpathSync(folder) };
});
const functions = [];
function walk(root) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.isDirectory() && entry.name.endsWith(".func")) functions.push(full);
    else if (entry.isDirectory()) walk(full);
  }
}
walk(output);
if (!functions.length) throw new Error("No Vercel functions found to validate bundled encryption dependency");
for (const fn of functions) {
  for (const { name, folder } of sources) {
    const dest = join(fn, "node_modules", name);
    mkdirSync(join(fn, "node_modules"), { recursive: true });
    cpSync(folder, dest, { recursive: true, force: true, dereference: true });
  }
  const scopedRequire = createRequire(join(fn, "__vault_sodium_check.cjs"));
  const sodium = scopedRequire("libsodium-wrappers");
  await sodium.ready;
  if (!sodium || typeof sodium.crypto_box_seal !== "function") {
    throw new Error("Vercel function missing usable libsodium wrappers: " + fn);
  }
}
console.log("Verified libsodium packages in " + functions.length + " Vercel functions");
