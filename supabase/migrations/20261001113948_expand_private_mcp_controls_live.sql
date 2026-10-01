-- Applied directly to the live Dev Panel/License Manager Supabase project while
-- repairing MCP Controls. Kept here so repository migration history matches
-- the remote database. The later 20261001213000 migration is intentionally
-- idempotent and remains safe to apply.
alter table if exists public.dev_mcp_settings
  add column if not exists tool_show_dev boolean not null default true,
  add column if not exists tool_status boolean not null default true,
  add column if not exists tool_prepare boolean not null default true,
  add column if not exists tool_deploy boolean not null default true,
  add column if not exists tool_release boolean not null default true,
  add column if not exists tool_update boolean not null default true,
  add column if not exists tool_license boolean not null default true,
  add column if not exists tool_license_change boolean not null default true,
  add column if not exists tool_diagnose boolean not null default true,
  add column if not exists tool_logs boolean not null default true,
  add column if not exists allow_prepare boolean not null default true,
  add column if not exists allow_service_scan boolean not null default true,
  add column if not exists allow_service_deploy boolean not null default true,
  add column if not exists allow_quick_deploy boolean not null default true,
  add column if not exists allow_workflow_control boolean not null default true,
  add column if not exists allow_release_review boolean not null default true,
  add column if not exists allow_release_publish boolean not null default true,
  add column if not exists allow_release_rollback boolean not null default true,
  add column if not exists allow_update_apply boolean not null default true,
  add column if not exists allow_update_rollback boolean not null default true,
  add column if not exists allow_license_state_changes boolean not null default true,
  add column if not exists allow_license_entitlement_changes boolean not null default true,
  add column if not exists allow_installation_unlock boolean not null default true,
  add column if not exists allow_license_linking boolean not null default true,
  add column if not exists ui_enabled boolean not null default true,
  add column if not exists ui_fullscreen_enabled boolean not null default true,
  add column if not exists ui_pip_enabled boolean not null default true,
  add column if not exists oauth_dcr_enabled boolean not null default true,
  add column if not exists oauth_cimd_enabled boolean not null default true,
  add column if not exists oauth_refresh_tokens_enabled boolean not null default true;

alter table if exists public.dev_oauth_clients
  add column if not exists registration_method text not null default 'dcr';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname='dev_oauth_clients_registration_method_check'
  ) then
    alter table public.dev_oauth_clients
      add constraint dev_oauth_clients_registration_method_check
      check (registration_method in ('dcr','cimd'));
  end if;
end $$;
