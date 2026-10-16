# ADR-0010: Fixtures stay fictional, research stays sourced

Date: 2026-10-16. Owner: Group 1.

Software fixtures use invented organisations only. The four
case-study organisations from the research live in the research
register, where every claim carries a source and a confidence
label. Real names never appear in operational case data.

Earlier prototype data mixed real names with invented dates and
counts. That mix could mislead a reader into treating demo rows as
findings. The mapping file under fixtures/ records what was
replaced, and a grep command there proves the fixtures are clean.

Research material and seed data are reviewed under different rules.
This separation keeps both honest.
