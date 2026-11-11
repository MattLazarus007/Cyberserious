create table export_manifests (
  id bigint generated always as identity primary key,
  actor text not null,
  kind text not null,
  resource text not null,
  row_count integer not null,
  byte_count integer not null,
  pii jsonb not null default '{}',
  destination text not null default 'browser download',
  created_at timestamptz not null default now()
);
create index export_manifests_created_idx on export_manifests (created_at desc);
