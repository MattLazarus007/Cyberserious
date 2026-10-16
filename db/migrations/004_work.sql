create table case_notes (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id),
  author_id uuid not null references users(id),
  body text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

create table case_events (
  id bigint generated always as identity primary key,
  case_id uuid not null references cases(id),
  actor_id uuid references users(id),
  event_type text not null,
  old_value text,
  new_value text,
  reason text,
  created_at timestamptz not null default now()
);

create table audit_events (
  seq bigint generated always as identity primary key,
  actor text not null,
  action text not null,
  resource text,
  result text not null check (result in ('ok','denied','error')),
  correlation_id text,
  meta jsonb not null default '{}',
  prev_hash text,
  entry_hash text not null,
  created_at timestamptz not null default now()
);

create table alerts (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references cases(id),
  rule_id text not null,
  rule_version integer not null,
  dedupe_key text not null unique,
  priority text not null check (priority in ('low','medium','high')),
  reason text not null,
  input_hash text not null,
  state text not null default 'open' check (state in
    ('open','acknowledged','snoozed','resolved')),
  owner_id uuid references users(id),
  snooze_until timestamptz,
  resolution text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index alerts_active_idx on alerts (state, priority) where state <> 'resolved';

create table outbox_jobs (
  id bigint generated always as identity primary key,
  job_type text not null,
  resource_id text not null,
  dedupe_key text not null unique,
  state text not null default 'pending' check (state in
    ('pending','leased','done','failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  last_error text
);
