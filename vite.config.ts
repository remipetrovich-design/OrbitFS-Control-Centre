// @lovable.dev/vite-tanstack-config already includes TanStack Start, React,
// Tailwind, tsconfig paths and Nitro. Dev Panel is deployed to Vercel, while
// Lovable/local preview may still use the wrapper default target.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const isVercelBuild =
  process.env.VERCEL === "1" ||
  Boolean(process.env.VERCEL_URL) ||
  process.env.ORBITFS_VERCEL_BUILD === "1";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  nitro: isVercelBuild
    ? {
        preset: "vercel",
        // github-vault.server uses createRequire for libsodium WASM compatibility.
        // Explicitly trace its runtime package so the Vercel function includes it.
        externals: {
          traceInclude: ["node_modules/libsodium-wrappers/**", "node_modules/libsodium/**"],
        },
      }
    : true,
});
