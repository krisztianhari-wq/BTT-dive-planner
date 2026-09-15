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
- `src/engine/` – számítómotor, UI-független (Bühlmann, gázok, gázterv, szabványok)
- `src/ui/` – React felület, `i18n.ts` szótár, `units.ts` egységek
- `src-tauri/` – asztali csomagolás
- `tests/` – Vitest tesztek
