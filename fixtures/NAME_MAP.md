# Fixture organisation names

The prototype's demo records once carried the names of real South African
organisations. Software fixtures use fictional names instead. The real case
studies (Gauteng Provincial Government, Statistics South Africa, Standard
Bank, Liberty Group) belong to the research register, where every claim
carries a source. They never appear in operational case data.

| Fictional name | Sector | Replaces |
| --- | --- | --- |
| Bosmont Financial | financial services | Standard Bank |
| Langeberg Insurance | insurance | Liberty Group |
| Highveld Municipal Services | public services | Statistics South Africa |
| Bushveld Provincial Services | provincial services | Gauteng Provincial Government |
| Thabazimbi Health Group | health | Example Healthcare (already fictional, renamed for style) |
| Swartland Financial Services | financial services | Example Financial Services (already fictional, renamed for style) |

Two demo cases share Swartland Financial Services on purpose. One organisation
can report more than one incident.

Incident and notification dates sit between January and May 2026, the window
used by the research study.

Check for leftovers before any release from this branch:

```
grep -rn "Standard Bank\|Liberty Group\|Statistics South Africa\|Gauteng Provincial" \
  js/ *.html
```

No output means the fixtures are clean.