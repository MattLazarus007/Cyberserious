alter table outbox_jobs drop constraint outbox_jobs_state_check;
alter table outbox_jobs add constraint outbox_jobs_state_check
  check (state in ('pending','leased','done','failed','dead'));
create index outbox_jobs_dead_idx on outbox_jobs (state) where state = 'dead';
