import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});


const FAMILY = 'fallback';
const AUTHORITIES = [
  'https://incendiarynetworks.cc/api/v1/source-configuration',
  'https://lm.incendiarynetworks.cc/api/v1/source-configuration',
] as const;
// A minimal readiness endpoint stays online without serving standby UI.
const sourceModeGuard = createMiddleware().server(async ({ next, request }) => {
  const path = new URL(request.url).pathname;
  if (path === '/_handover_health') {
    return new Response(JSON.stringify({ ready: true, family: FAMILY }), {
      status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }
  for (const authority of AUTHORITIES) {
    try {
      const response = await fetch(authority, {
        cache: 'no-store', signal: AbortSignal.timeout(3500),
      });
      if (!response.ok) continue;
      const state = await response.json() as { mode?: string };
      if (state.mode !== 'main' && state.mode !== 'fallback') continue;
      if (state.mode !== FAMILY) return new Response('Source mode standby', {
        status: 503, headers: { 'cache-control': 'no-store' },
      });
      return await next();
    } catch { /* Retry against the independently hosted License Manager. */ }
  }
  return new Response('Source mode unavailable', {
    status: 503, headers: { 'cache-control': 'no-store' },
  });
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [sourceModeGuard, errorMiddleware, csrfMiddleware],
}));
