create table research_cases (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  name text not null,
  sector text,
  period text not null,
  summary text not null,
  confidence text not null default 'medium' check (confidence in ('high','medium','low'))
);

create table research_sources (
  id uuid primary key default gen_random_uuid(),
  case_ref text not null references research_cases(reference),
  title text not null,
  outlet text not null,
  published_on date,
  confidence text not null default 'medium' check (confidence in ('high','medium','low')),
  detail_sealed text
);

create table research_findings (
  id uuid primary key default gen_random_uuid(),
  case_ref text not null references research_cases(reference),
  csf_function text not null check (csf_function in
    ('Govern','Identify','Protect','Detect','Respond','Recover')),
  finding text not null,
  confidence text not null default 'medium' check (confidence in ('high','medium','low'))
);

create table policy_versions (
  version integer primary key,
  body text not null,
  effective_from date not null
);

create table obligations (
  code text primary key,
  duty text not null,
  trigger text not null,
  timing_note text not null
);

create unique index research_sources_once on research_sources (case_ref, title);
create unique index research_findings_once on research_findings (case_ref, csf_function, md5(finding));

create table case_obligations (
  case_id uuid not null references cases(id),
  obligation_code text not null references obligations(code),
  status text not null default 'open' check (status in ('open','attended','pending')),
  note text,
  primary key (case_id, obligation_code)
);
