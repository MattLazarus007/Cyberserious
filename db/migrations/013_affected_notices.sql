create table affected_notices (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references cases(id),
  draft_public_id text not null,
  sender_org_id uuid not null references organisations(id),
  affected_total integer not null check (affected_total >= 0),
  sent integer not null check (sent >= 0),
  failed integer not null check (failed >= 0),
  channel text not null check (channel in ('email','sms','phone','letter')),
  completed_at timestamptz not null,
  received_at timestamptz not null default now(),
  check (sent + failed <= affected_total),
  unique (sender_org_id, draft_public_id, channel, completed_at)
);

create index affected_notices_case_idx on affected_notices (case_id, completed_at desc);
create index affected_notices_draft_idx on affected_notices (draft_public_id);
