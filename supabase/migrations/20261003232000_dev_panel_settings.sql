-- Normal Dev Panel configuration. This is deliberately separate from private MCP settings.
create table if not exists public.dev_panel_settings (
  id boolean primary key default true check (id=true),
  github_profile text not null default 'primary' check (github_profile in ('primary','fallback')),
  updated_by uuid null,
  updated_at timestamptz not null default now()
);

insert into public.dev_panel_settings(id,github_profile)
values(true,'primary')
on conflict(id) do nothing;

alter table public.dev_panel_settings enable row level security;
