-- Persist the active GitHub control/source profile for Dev Panel.
-- Only one profile is active at a time.
alter table if exists public.dev_mcp_settings
  add column if not exists github_profile text not null default 'primary'
  check (github_profile in ('primary','fallback'));

update public.dev_mcp_settings
set github_profile=coalesce(nullif(github_profile,''),'primary')
where id=true;
