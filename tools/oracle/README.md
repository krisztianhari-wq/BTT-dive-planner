# Független referencia (oracle)

Kis Rust program, amely a [dive-deco](https://github.com/KG32/dive-deco) könyvtárral (független Bühlmann ZH-L16C + GF
implementáció) számolja ki ugyanazokat a profilokat, mint a saját motorunk. Ebből készülnek a `tests/golden/oracle-*.json`
golden tesztek.

```bash
cd tools/oracle && cargo run --release -- 20 85 9        # GF low, GF high, felszállási sebesség (m/min)
cd tools/oracle && cargo run --release -- 20 85 9 json   # gépi kimenet a fixture-generáláshoz
npm run golden:oracle                                    # fixture-ök újragenerálása
```

Ismert eltérés: a dive-deco a GF-meredekséget másképp horgonyozza és az aktuális mélységen értékeli, ezért mély
(≥ 70 m), hosszú dekós profiloknál konzervatívabb ütemtervet ad. A saját motorunk a Subsurface / Shearwater konvenciót
követi (GF low az első stopnál, kiértékelés a következő stop mélységén). GF low = GF high esetén (nincs meredekség) a két
implementáció minden profilon 1–2 percen belül egyezik, ami a szöveti modell és a gázkezelés helyességét igazolja.
