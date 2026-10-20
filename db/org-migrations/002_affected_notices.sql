create table affected_recipients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  reference text not null,
  display_name text not null,
  channel text not null check (channel in ('email','sms','phone','letter')),
  contact_ref text not null,
  created_at timestamptz not null default now(),
  unique (org_id, reference)
);

create table notification_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  draft_id uuid not null references drafts(id),
  affected_total integer not null check (affected_total >= 0),
  channel text not null check (channel in ('email','sms','phone','letter')),
  template_text text not null,
  status text not null default 'queued' check (status in ('queued','sending','complete','failed')),
  sent_count integer not null default 0 check (sent_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  regulator_status text not null default 'pending' check (regulator_status in ('pending','sent','failed')),
  regulator_error text,
  actor text not null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index notification_runs_draft_idx on notification_runs (draft_id, created_at desc);
create unique index notification_runs_one_active on notification_runs (draft_id) where status in ('queued','sending');

create table notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references notification_runs(id) on delete cascade,
  recipient_reference text not null,
  channel text not null check (channel in ('email','sms','phone','letter')),
  contact_ref text not null,
  status text not null check (status in ('sent','failed')),
  error text,
  created_at timestamptz not null default now(),
  unique (run_id, recipient_reference)
);

create table org_audit_events (
  seq bigint generated always as identity primary key,
  actor text not null,
  action text not null,
  resource text,
  result text not null check (result in ('ok','denied','error')),
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
