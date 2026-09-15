# BTT Dive Planner

Dekompressziós és gáztervező. Bühlmann ZH-L16C + gradient factor, GUE vagy PADI/SSI gázkészlet, magyar/angol, metrikus/angolszász.

**Nem validált szoftver. Merülést csak képzéssel és független tervezővel ellenőrizve tervezz.**

## Használat
- **Web / PWA:** https://krisztianhari-wq.github.io/BTT-dive-planner/ – telepíthető (Chrome/Edge: címsor „Telepítés”; iPhone: Megosztás → Főképernyőhöz adás), offline is fut.
- **macOS, Windows 11:** telepítők a [Releases](https://github.com/krisztianhari-wq/BTT-dive-planner/releases) oldalon. Aláírás nélkül: macOS-en első indításkor jobb klikk → Megnyitás; Windowson SmartScreen → További információ → Futtatás mindenképpen.
- **Egy fájl:** `dist-single/index.html` bárhonnan, internet nélkül megnyitható.

## Fejlesztés
```bash
npm install
npm run dev            # http://localhost:5173
npm test
```

## Build
```bash
npm run build          # dist/ – PWA, webszerverről kiszolgálva (fájlból megnyitva üres)
npm run build:single   # dist-single/index.html – egyfájlos, hordozható
npm run tauri build    # natív app, Rust toolchain kell (rustup.rs)
```

## Kiadás
- `main`-re push → GitHub Pages frissül automatikusan.
- Címke külön pusholva → telepítők draft Release-be:
  ```bash
  git tag v0.2.0 && git push origin v0.2.0
  ```
  Utána a Releases oldalon „Publish release”.

## Szerkezet
- `src/engine/` – számítómotor, UI-független TypeScript
  - `constants.ts` – ZH-L16C kompartment konstansok, fizikai állandók
  - `buhlmann.ts` – szöveti terhelés (Schreiner), ceiling gradient factorral, NDL
  - `gas.ts` – gázmatek (MOD, END, pO2), GUE standard gázok és limitek
  - `standards.ts` – gázszabványok: GUE és általános (PADI/SSI/TDI) készlet, limitek, ajánlások
  - `planner.ts` – dekó-ütemterv generálás gázváltásokkal
  - `gasPlan.ts` – fogyasztás, minimum gáz, palackok, dekógáz-igény
  - `inventory.ts` – csomaglista és „saját gázaim” megvalósíthatóság
  - `messages.ts` – nyelvfüggetlen üzenetkódok, a felület fordítja
- `src/ui/` – React felület
  - `App.tsx` – a teljes felület, kapcsolók (mód, szabvány, egység, nyelv, téma)
  - `ProfileChart.tsx` – merülési profil SVG grafikon
  - `i18n.ts` – magyar/angol szótár, üzenetfordítás
  - `units.ts` – metrikus/angolszász átváltás
  - `styles.css` – világos/sötét téma
- `src-tauri/` – asztali csomagolás (Tauri v2), ikonok, konfiguráció
- `scripts/inline-icons.mjs` – az egyfájlos build utófeldolgozása
- `.github/workflows/` – `pages.yml` (web közzététel), `desktop.yml` (telepítők)
- `tests/` – Vitest egység- és tulajdonságtesztek
