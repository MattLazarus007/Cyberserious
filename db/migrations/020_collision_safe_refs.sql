-- Scope a note idempotency key to one case and one author.
alter table note_idempotency add column if not exists case_id uuid references cases(id);
alter table note_idempotency add column if not exists author_id uuid references users(id);
update note_idempotency k
   set case_id = n.case_id, author_id = n.author_id
  from case_notes n
 where n.id = k.note_id and (k.case_id is null or k.author_id is null);
alter table note_idempotency drop constraint if exists note_idempotency_pkey;
alter table note_idempotency add constraint note_idempotency_scope_key unique (key, case_id, author_id);

-- Collision-safe reference numbers. A sequence replaces the row count.
create sequence if not exists case_reference_seq;
select setval(
  'case_reference_seq',
  greatest(100, coalesce((select max((regexp_match(reference, '^BR-2026-([0-9]+)$'))[1]::int)
                            from cases where reference ~ '^BR-2026-[0-9]+$'), 100)),
  true
);
