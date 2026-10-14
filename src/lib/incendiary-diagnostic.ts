/**
 * Incendia Diagnostic System — Phase 1 catcher logger.
 * Observational only. Emits the locked schema to the existing log sink (console / Vercel logs).
 * Never changes behavior, never stores secrets, never becomes an authority.
 */

export type Direction = "egress" | "ingress";
export type SourceSystem = "license_manager" | "dev_panel" | "billing" | "base" | "engine";
export type Target =
  | "github"
  | "vercel"
  | "supabase"
  | "license_manager"
  | "billing"
  | "dev_panel"
  | "base"
  | "engine"
  | "other";
export type AccountMode = "main" | "fallback";

export interface DiagnosticEvent {
  ts: string;
  direction: Direction;
  source_system: SourceSystem;
  target: Target;
  account_mode: AccountMode;
  method: string;
  endpoint: string;
  status: number;
  request_id: string;
  latency_ms?: number;
  error?: string | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function newRequestId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function emitDiagnostic(event: Omit<DiagnosticEvent, "ts" | "request_id"> & { request_id?: string }): void {
  const full: DiagnosticEvent = {
    ts: nowIso(),
    request_id: event.request_id || newRequestId(),
    ...event,
    error: event.error ?? null,
  };
  // Structured line the Phase 2 scanner can later parse from Vercel/Supabase logs.
  console.info("[INCENDIA_DIAGNOSTIC]", JSON.stringify(full));
}

/** Wrap an outbound fetch so it emits an egress event. */
export async function diagnosticFetch(
  url: string | URL,
  init: RequestInit = {},
  meta: {
    source_system: SourceSystem;
    target: Target;
    account_mode: AccountMode;
    endpoint?: string;
  }
): Promise<Response> {
  const start = Date.now();
  const method = (init.method || "GET").toUpperCase();
  const endpoint = meta.endpoint || (typeof url === "string" ? url : url.toString());
  const request_id = newRequestId();
  let status = 0;
  let error: string | null = null;
  try {
    const response = await fetch(url, init);
    status = response.status;
    return response;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    status = 0;
    throw err;
  } finally {
    emitDiagnostic({
      direction: "egress",
      source_system: meta.source_system,
      target: meta.target,
      account_mode: meta.account_mode,
      method,
      endpoint,
      status,
      request_id,
      latency_ms: Date.now() - start,
      error,
    });
  }
}

/** Log an ingress event (call into this system). */
export function logIngress(
  meta: {
    source_system: SourceSystem;
    target: Target;
    account_mode: AccountMode;
    method: string;
    endpoint: string;
    status: number;
    request_id?: string;
    latency_ms?: number;
    error?: string | null;
  }
): void {
  emitDiagnostic({ direction: "ingress", ...meta });
}
