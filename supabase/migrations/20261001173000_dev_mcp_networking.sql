-- Dev Control networking/MCP expansion.
alter table public.dev_control_settings
  alter column allowed_services set default '["base","engine","license_manager","billing_store"]'::jsonb;

update public.dev_control_settings
set allowed_services='["base","engine","license_manager","billing_store"]'::jsonb,
    updated_at=now()
where id=true
  and not (allowed_services ? 'base' and allowed_services ? 'engine');

create table if not exists public.dev_mcp_settings (
  id boolean primary key default true check (id=true),
  enabled boolean not null default true,
  read_only_mode boolean not null default false,
  allow_mutations boolean not null default true,
  require_critical_confirmation boolean not null default true,
  expose_base boolean not null default true,
  expose_engine boolean not null default true,
  expose_license_manager boolean not null default true,
  expose_billing_store boolean not null default true,
  expose_authority_controls boolean not null default true,
  audit_logging boolean not null default true,
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.dev_mcp_settings(id) values(true)
on conflict(id) do nothing;

alter table public.dev_mcp_settings enable row level security;
revoke all on public.dev_mcp_settings from anon,authenticated;
grant all on public.dev_mcp_settings to service_role;
