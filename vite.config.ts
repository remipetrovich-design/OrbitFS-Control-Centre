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
      }
    : true,
});
