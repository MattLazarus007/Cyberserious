create table security_events (
  seq bigint generated always as identity primary key,
  source text not null check (length(source) between 1 and 60),
  kind text not null check (length(kind) between 1 and 80),
  severity text not null check (severity in ('low','medium','high')),
  signature text not null check (length(signature) between 1 and 400),
  src text,
  dst text,
  observed_at timestamptz,
  raw jsonb not null default '{}',
  prev_hash text,
  entry_hash text not null,
  created_at timestamptz not null default now()
);
create index security_events_source_idx on security_events (source, created_at desc);
create index security_events_severity_idx on security_events (severity, created_at desc);

create table security_heartbeats (
  source text primary key,
  last_seen_at timestamptz not null default now(),
  detail jsonb not null default '{}'
);
