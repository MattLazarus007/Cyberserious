create table cases (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  org_id uuid not null references organisations(id),
  state text not null default 'Pending' check (state in
    ('Pending','UnderReview','AwaitingInformation','Closed')),
  severity text check (severity in ('low','medium','high','critical')),
  priority text check (priority in ('routine','urgent','immediate')),
  assigned_to uuid references users(id),
  row_version integer not null default 1,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  closure_reason text
);
create index cases_list_idx on cases (state, opened_at desc, id);
create index cases_org_idx on cases (org_id);

create table case_facts (
  case_id uuid primary key references cases(id),
  incident_occurred_at timestamptz,
  occurred_precision text not null default 'unknown' check (occurred_precision in
    ('exact','date','approximate','unknown')),
  discovered_at timestamptz,
  discovered_precision text not null default 'unknown' check (discovered_precision in
    ('exact','minute','date','approximate','unknown')),
  discovery_source text,
  triaged_at timestamptz,
  breach_status text not null default 'suspected' check (breach_status in
    ('suspected','reported','substantiated','not_substantiated')),
  category text,
  affected_count integer check (affected_count is null or affected_count >= 0),
  count_precision text not null default 'unknown' check (count_precision in
    ('exact','estimate','range','unknown')),
  data_categories text[] not null default '{}',
  narrative text check (narrative is null or length(narrative) <= 8000)
);
