create table organisations (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  display_name text not null,
  sector text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  display_name text not null,
  password_hash text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  org_id uuid references organisations(id),
  role text not null check (role in (
    'data_steward','security_officer','information_officer',
    'regulator_analyst','regulator_supervisor',
    'system_administrator','audit_reviewer')),
  unique (user_id, org_id, role)
);

create table sessions (
  id text primary key,
  user_id uuid not null references users(id),
  mfa_ok boolean not null default false,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
