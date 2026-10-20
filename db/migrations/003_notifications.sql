create table notifications (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id),
  sender_org_id uuid not null references organisations(id),
  channel text not null check (channel in
    ('manual_import','org_portal','test_intake')),
  first_received_at timestamptz not null default now()
);

create table notification_versions (
  notification_id uuid not null references notifications(id),
  revision integer not null check (revision >= 1),
  payload jsonb not null,
  payload_hash text not null,
  received_at timestamptz not null default now(),
  predecessor_revision integer,
  primary key (notification_id, revision)
);

create table intake_receipts (
  id uuid primary key default gen_random_uuid(),
  sender_id text not null,
  submission_id text not null,
  payload_hash text not null,
  response jsonb not null,
  received_at timestamptz not null default now(),
  unique (sender_id, submission_id)
);
