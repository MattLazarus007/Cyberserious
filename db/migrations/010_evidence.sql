create table evidence (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id),
  filename text not null,
  mime text not null,
  size_bytes integer not null check (size_bytes > 0),
  sha256 text not null,
  status text not null default 'quarantine' check (status in ('quarantine','clean','rejected')),
  uploaded_by uuid references users(id),
  created_at timestamptz not null default now()
);
create index evidence_case_idx on evidence (case_id);
