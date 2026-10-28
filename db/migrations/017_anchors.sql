create table anchors (
  day date primary key,
  audit_seq bigint not null,
  audit_hash text,
  security_seq bigint not null,
  security_hash text,
  audit_count bigint not null,
  security_count bigint not null,
  hmac text not null,
  created_at timestamptz not null default now()
);
