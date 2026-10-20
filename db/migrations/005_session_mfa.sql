alter table sessions add column otp_hash text;
alter table sessions add column otp_expires_at timestamptz;
alter table sessions add column otp_attempts integer not null default 0;
