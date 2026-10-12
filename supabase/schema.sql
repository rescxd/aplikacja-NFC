-- Shared workspace storage for the optional Supabase sync.
-- IMPORTANT: Do not expose this table to anon without an authenticated access model.
-- The frontend-config login is not authentication and cannot protect database rows.
create table if not exists public.workspace_state (
  workspace_key text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.workspace_state enable row level security;

-- Add policies only after choosing an authentication model.
-- For secure per-user isolation, use Supabase Auth and policies based on auth.uid().
