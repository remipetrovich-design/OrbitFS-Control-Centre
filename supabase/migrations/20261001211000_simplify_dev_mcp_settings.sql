-- Remove settings that belonged to the abandoned Dev Control layer.
-- The private MCP now has a small direct exposure/mutation configuration only.
alter table if exists public.dev_mcp_settings
  drop column if exists require_critical_confirmation,
  drop column if exists expose_authority_controls,
  drop column if exists audit_logging;
