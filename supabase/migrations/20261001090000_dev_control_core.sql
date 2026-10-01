-- OrbitFS Dev Control core state.
-- Separate control-plane state owned by Dev Panel / Dev Control.
-- This does not replace or duplicate License Manager authority state.

create table if not exists public.dev_control_settings (
  id boolean primary key default true check (id = true),
  enabled boolean not null default true,
  read_only_mode boolean not null default false,
  quick_deploy_enabled boolean not null default true,
  production_deploy_enabled boolean not null default true,
  restart_enabled boolean not null default false,
  rollback_enabled boolean not null default false,
  updater_controls_enabled boolean not null default true,
  license_controls_enabled boolean not null default true,
  billing_controls_enabled boolean not null default true,
  require_critical_confirmation boolean not null default true,
  post_deploy_health_check boolean not null default true,
  auto_rollback_on_failed_verification boolean not null default false,
  secret_redaction boolean not null default true,
  audit_logging boolean not null default true,
  emergency_kill_switch boolean not null default false,
  allowed_services jsonb not null default '["license_manager","billing_store"]'::jsonb,
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.dev_control_settings(id) values(true)
on conflict(id) do nothing;

create table if not exists public.dev_control_jobs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  target text not null,
  status text not null default 'queued',
  source_ref text,
  source_sha text,
  workflow text,
  external_run_id bigint,
  external_run_url text,
  requested_by uuid references public.users(id) on delete set null,
  requested_by_email text,
  detail jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.dev_control_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.users(id) on delete set null,
  actor_email text,
  action text not null,
  target text,
  job_id uuid references public.dev_control_jobs(id) on delete set null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.dev_control_settings enable row level security;
alter table public.dev_control_jobs enable row level security;
alter table public.dev_control_audit enable row level security;

revoke all on public.dev_control_settings from anon, authenticated;
revoke all on public.dev_control_jobs from anon, authenticated;
revoke all on public.dev_control_audit from anon, authenticated;

grant all on public.dev_control_settings to service_role;
grant all on public.dev_control_jobs to service_role;
grant all on public.dev_control_audit to service_role;

create index if not exists idx_dev_control_jobs_created on public.dev_control_jobs(created_at desc);
create index if not exists idx_dev_control_jobs_target on public.dev_control_jobs(target,created_at desc);
create index if not exists idx_dev_control_jobs_external_run on public.dev_control_jobs(external_run_id);
create index if not exists idx_dev_control_audit_created on public.dev_control_audit(created_at desc);
