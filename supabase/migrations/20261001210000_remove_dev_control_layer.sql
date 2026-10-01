-- Retire the abandoned standalone Dev Control API/control-plane state.
-- The private /devmcp endpoint now calls Dev Panel server logic directly.
-- Keep dev_mcp_settings and OAuth tables; remove only the redundant control plane.
drop table if exists public.dev_control_audit;
drop table if exists public.dev_control_jobs;
drop table if exists public.dev_control_settings;
