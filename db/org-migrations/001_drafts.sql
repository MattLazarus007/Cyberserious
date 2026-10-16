create table drafts (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  org_ref text not null,
  category text not null,
  narrative text not null check (length(narrative) between 1 and 8000),
  severity text not null default 'medium' check (severity in ('low','medium','high','critical')),
  priority text not null default 'routine' check (priority in ('routine','urgent','immediate')),
  affected_count integer check (affected_count is null or affected_count >= 0),
  revision integer not null default 1 check (revision >= 1),
  status text not null default 'Draft' check (status in
    ('Draft','ReadyForApproval','Approved','Sending','Acknowledged','Rejected','RetryPending')),
  approved_revision integer,
  approved_hash text,
  receipt jsonb,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
