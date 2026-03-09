-- Comptes email connectés (tokens OAuth chiffrés)
create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  user_id text,
  provider text not null,
  email text not null,
  access_token text not null,
  refresh_token text,
  token_expires_at timestamptz,
  created_at timestamptz default now(),
  unique (provider, email)
);

-- Configurations de priorités par utilisateur
create table if not exists user_configs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique,
  sender_priorities jsonb default '{}'::jsonb,
  keyword_flags jsonb default '[]'::jsonb,
  amount_threshold numeric default 5000,
  stale_days integer default 5,
  context text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Métadonnées et résumés des courriels (pas de corps stocké)
create table if not exists email_metadata (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  email_id text not null,
  thread_id text,
  provider text not null,
  subject text,
  sender_email text,
  sender_name text,
  received_at timestamptz,
  summary text,
  category text,
  priority_level text default 'normal',
  decision_required boolean default false,
  detected_deadline timestamptz,
  detected_amounts jsonb default '[]'::jsonb,
  detected_people jsonb default '[]'::jsonb,
  analyzed_at timestamptz,
  created_at timestamptz default now(),
  unique (user_id, email_id, provider)
);

-- Suivi des décisions en attente
create table if not exists decisions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  email_id text not null,
  provider text not null,
  status text default 'waiting_response',
  summary text,
  detected_deadline timestamptz,
  days_waiting integer default 0,
  last_checked timestamptz default now(),
  resolved_at timestamptz,
  created_at timestamptz default now()
);

-- Index pour les requêtes fréquentes
create index if not exists idx_accounts_email on accounts (email, provider);
create index if not exists idx_email_metadata_user on email_metadata (user_id, provider);
create index if not exists idx_decisions_user_status on decisions (user_id, status);
