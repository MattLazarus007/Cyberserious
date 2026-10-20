create table sender_keys (
  sender_id text primary key,
  org_id uuid not null references organisations(id),
  public_jwk jsonb not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
