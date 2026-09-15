# BTT Dive Planner (web)

Dekompressziós és gáztervező webalkalmazás GUE standard gázokkal. Bühlmann ZH-L16C + gradient factor.

**Nem validált fejlesztői változat. Tényleges merülés tervezésére önmagában nem alkalmas.**

## Szerkezet
- `src/engine/` – UI-független számítómotor (tiszta TypeScript)
  - `constants.ts` – ZH-L16C kompartment konstansok
  - `gas.ts` – gázmatek (MOD, END, pO2), GUE standard fenék- és dekógázok, limitek
  - `buhlmann.ts` – szöveti terhelés (Schreiner), ceiling GF-fel, NDL
  - `planner.ts` – dekó-ütemterv generálás gázváltásokkal
  - `gasPlan.ts` – fogyasztás, GUE Minimum Gas, palackok, dekógáz-igény
  - `inventory.ts` – csomaglista és „saját gázaim” megvalósíthatóság
  - `messages.ts` – nyelvfüggetlen üzenetkódok, a felület fordítja
- `src/ui/` – React felület (magyar/angol, világos/sötét mód, `i18n.ts` szótár)
- `tests/` – Vitest egység- és tulajdonságtesztek

## Futtatás
```bash
npm install
npm test
npm run dev
```

## Validálás (teendő)
Golden tesztesetek összevetése Subsurface / MultiDeco / DecoPlanner kimenetével, percre pontosan.
