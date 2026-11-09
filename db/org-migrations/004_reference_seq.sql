-- Collision-safe draft numbers. A sequence replaces the row count.
create sequence if not exists draft_reference_seq;
select setval(
  'draft_reference_seq',
  coalesce((select max((regexp_match(public_id, '^SUB-2026-([0-9]+)$'))[1]::int)
              from drafts where public_id ~ '^SUB-2026-[0-9]+$'), 1),
  (select max((regexp_match(public_id, '^SUB-2026-([0-9]+)$'))[1]::int)
     from drafts where public_id ~ '^SUB-2026-[0-9]+$') is not null
);
