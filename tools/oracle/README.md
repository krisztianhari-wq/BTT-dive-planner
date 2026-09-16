# Independent reference (oracle)

A small Rust program that computes the same reference profiles as our engine with the
[dive-deco](https://github.com/KG32/dive-deco) crate, an independent Bühlmann ZH-L16C + GF implementation.
The `tests/golden/oracle-*.json` golden tests are generated from its output.

```bash
cd tools/oracle && cargo run --release -- 20 85 9        # GF low, GF high, ascent rate (m/min)
cd tools/oracle && cargo run --release -- 20 85 9 json   # machine-readable output for fixture generation
npm run golden:oracle                                    # regenerate the fixtures
npm run compare:oracle                                   # print our schedules with matching settings
```

Known divergence: dive-deco anchors the GF slope differently and evaluates it at the current depth, so it
produces a more conservative schedule for deep (≥ 70 m), long-deco profiles. Our engine follows the
Subsurface / Shearwater convention (GF low at the first stop, evaluated at the next stop depth); the
“Conservative” calculation method in the app approximates the dive-deco behaviour. With GF low = GF high
(no slope) the two implementations agree within 1–2 minutes on every profile, which validates the tissue
model and gas handling.
