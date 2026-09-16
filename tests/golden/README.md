# Golden referencia-tesztek

Minden `*.json` fájl egy külső tervezőből (Decobuddy, Subsurface, MultiDeco, DecoPlanner) rögzített
referencia-ütemterv. A `golden.test.ts` mindet betölti és összeveti a saját motorunk eredményével.

Tűrések (alapértelmezés, fájlonként felülírható a `tolerance` mezővel):
- stoponként ±1 perc, stop mélysége egyezzen
- első stop mélysége egyezzen
- teljes dekóidő ±2 perc, runtime ±2 perc

Fájlformátum:
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
`pending: true` → a teszt kihagyja (még nincs referenciaérték). A referenciát kézzel kell beírni a külső tervezőből:
ugyanazokkal a beállításokkal (GF, sebességek, utolsó stop, fenékidő leszállással együtt).
