create table note_idempotency (
  key text primary key,
  note_id uuid references case_notes(id),
  created_at timestamptz not null default now()
);
