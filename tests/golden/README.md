# Golden reference tests

Each `*.json` file is a reference schedule recorded from an external planner (dive-deco oracle, Decobuddy,
Subsurface, MultiDeco, DecoPlanner). `golden.test.ts` loads all of them and compares our engine's schedule.

Default tolerances (overridable per file with `tolerance`):
- per stop ±1 min, stop depths must match
- total deco time ±2 min, runtime ±2 min

File format:
```json
{
  "id": "B",
  "source": "Decobuddy 2026-09-16",
  "pending": false,
  "profile": { "maxDepth": 45, "bottomTime": 25, "bottomGas": { "o2": 0.21, "he": 0.35 },
               "decoGases": [ { "o2": 0.5, "he": 0, "switchDepth": 21 } ] },
  "settings": { "gfLow": 20, "gfHigh": 85, "lastStop": 6, "descentRate": 20, "ascentRate": 9, "ascentRateShallow": 3 },
  "expected": { "stops": [ { "depth": 12, "minutes": 1 }, { "depth": 9, "minutes": 2 }, { "depth": 6, "minutes": 17 } ],
                "decoTime": 30, "runtime": 55 }
}
```
`pending: true` → the test is skipped (no reference values yet). Enter the reference with identical settings
(GF, rates, last stop, bottom time including descent). `oracle-*.json` files are generated; do not edit them by hand.
