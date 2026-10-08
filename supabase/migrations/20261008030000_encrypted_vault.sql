-- Persistent single-user encrypted vault storage.
-- The application server may read/write ciphertext only. Plaintext vault data and unlock secrets never enter Postgres.
create table if not exists public.dev_panel_vault (
  id boolean primary key default true check (id = true),
  ciphertext text not null,
  salt text not null,
  iv text not null,
  kdf_iterations integer not null default 310000 check (kdf_iterations >= 200000),
  format_version integer not null default 1,
  updated_by uuid null,
  updated_at timestamptz not null default now()
);

alter table public.dev_panel_vault enable row level security;
revoke all on table public.dev_panel_vault from anon, authenticated;
grant all on table public.dev_panel_vault to service_role;

comment on table public.dev_panel_vault is 'Opaque client-encrypted Dev Panel vault. Decryption keys and plaintext are never persisted.';
