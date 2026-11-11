create table banned_ips (
  ip text primary key,
  reason text not null check (length(reason) between 1 and 300),
  banned_at timestamptz not null default now(),
  banned_by text not null,
  expires_at timestamptz
);
create index banned_ips_expiry_idx on banned_ips (expires_at) where expires_at is not null;
