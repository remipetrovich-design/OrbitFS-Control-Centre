-- OAuth 2.1 / MCP authorization state for the private OrbitFS Dev MCP.
create table if not exists public.dev_oauth_clients (
  client_id text primary key,
  client_name text,
  redirect_uris jsonb not null default '[]'::jsonb,
  token_endpoint_auth_method text not null default 'none',
  grant_types jsonb not null default '["authorization_code","refresh_token"]'::jsonb,
  response_types jsonb not null default '["code"]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.dev_oauth_codes (
  code_hash text primary key,
  client_id text not null references public.dev_oauth_clients(client_id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  redirect_uri text not null,
  scopes jsonb not null default '[]'::jsonb,
  resource text not null,
  code_challenge text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.dev_oauth_tokens (
  token_hash text primary key,
  token_type text not null check (token_type in ('access','refresh')),
  client_id text not null references public.dev_oauth_clients(client_id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  scopes jsonb not null default '[]'::jsonb,
  resource text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_dev_oauth_codes_expiry on public.dev_oauth_codes(expires_at);
create index if not exists idx_dev_oauth_tokens_expiry on public.dev_oauth_tokens(expires_at);
create index if not exists idx_dev_oauth_tokens_user on public.dev_oauth_tokens(user_id,created_at desc);

alter table public.dev_oauth_clients enable row level security;
alter table public.dev_oauth_codes enable row level security;
alter table public.dev_oauth_tokens enable row level security;

revoke all on public.dev_oauth_clients from anon,authenticated;
revoke all on public.dev_oauth_codes from anon,authenticated;
revoke all on public.dev_oauth_tokens from anon,authenticated;

grant all on public.dev_oauth_clients to service_role;
grant all on public.dev_oauth_codes to service_role;
grant all on public.dev_oauth_tokens to service_role;
