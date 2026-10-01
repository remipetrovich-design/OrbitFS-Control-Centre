create table if not exists public.panel_api_connections (
  service_key text primary key check (service_key in ('license_manager')),
  selected_url text not null,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint panel_api_connections_url_check check (
    selected_url ~ '^https://([a-z0-9-]+\\.)?incendiarynetworks\\.cc/api/v1$'
  )
);

insert into public.panel_api_connections(service_key,selected_url)
values('license_manager','https://incendiarynetworks.cc/api/v1')
on conflict(service_key) do nothing;

alter table public.panel_api_connections enable row level security;

comment on table public.panel_api_connections is 'Dev Panel-selected official OrbitFS API endpoints. Server-side only; License Manager registry remains authoritative.';
