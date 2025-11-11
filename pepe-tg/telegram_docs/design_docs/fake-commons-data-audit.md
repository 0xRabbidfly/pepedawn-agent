# Fake Commons Data Audit

_Generated: November 8, 2025_

## Summary

- Parsed `fake-commons-data.json` to verify contiguous card numbering per series.
- Found multiple gaps, duplicates, and one entry with an invalid card number.
- Rare Pepes data was also scanned; no issues detected there.

## Detailed Findings

| Series | Card Range | Count | Missing Cards | Duplicate Cards | Notes |
|--------|------------|-------|----------------|-----------------|-------|
| 13 | 1 – 33 | 34 | — | `#33` (`FAKEPATRON`, `REDPEPER`) | Duplicate numbering |
| 14 | `null` – 53 | 54 | `33` | `#47` (`PEPABSTRACTS.FOURTEEN`, `PEPABSTRACTS.FIFTEEN`) | `FAKEKAMOTO` has `card: null` |
| 19 | 1 – 59 | 58 | `11`, `54` | `#53` (`THEPEPESBITE`, `COSPLAYPEPE`) | — |
| 23 | 1 – 45 | 42 | `37`, `38`, `39` | — | — |
| 24 | 1 – 61 | 59 | `37`, `38`, `39`, `58` | `#30` (`LOOSESLOTS`, `SCIFIFROG`); `#56` (`STARWARZPEPE`, `PEPULARITY`) | — |
| 25 | 1 – 41 | 40 | `30` | — | — |
| 35 | 1 – 23 | 22 | `21` | — | — |
| 36 | 1 – 13 | 14 | — | `#2` (`MASSAPPEAL`, `MASSAPEAL`) | Duplicate numbering |
| 54 | 1 – 11 | 10 | `6` | — | — |

## Recommended Next Steps

1. Update the flagged entries in `fake-commons-data.json` with correct card numbers and metadata.
2. Re-run the automated check (using the inline Node script that produced this report) to confirm the dataset is clean.
3. Once clean, regenerate commons embeddings if any asset names changed.

## Reference

The audit script grouped cards by `series`, inspected each `card` number within the range, and reported missing or duplicate slots. Rare Pepes (`rare-pepes-data.json`) passed with contiguous numbering across all series.***

