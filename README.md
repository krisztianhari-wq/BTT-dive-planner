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

## PWA (telepíthető, offline)
A build `vite-plugin-pwa`-val manifestet és service workert is készít, ezért a `dist/` bármilyen HTTPS statikus tárhelyre
feltöltve telepíthető alkalmazásként jelenik meg (Chrome/Edge: címsor „Telepítés” ikon; iOS Safari: Megosztás → Főképernyőhöz adás),
és első betöltés után internet nélkül is fut.

```bash
npm run build      # dist/ előállítása
npm run preview    # a build kipróbálása http://localhost:4173 címen
```

A service worker csak HTTPS-en vagy localhoston aktív. Ikonok: `public/icons/` (a logóból, fehér háttérrel iOS-hez).

**Fontos:** a `dist/index.html` közvetlenül, fájlból megnyitva üres oldalt ad, mert a böngésző `file://`-ról nem tölt be
ES-modulokat és abszolút útvonalakat. Webszerverről kell kiszolgálni, vagy az egyfájlos változatot használni.

## GitHub Pages közzététel
A `.github/workflows/pages.yml` minden `main`-re push után buildel, teszteket futtat és publikál.
Egyszeri beállítás:
1. Hozz létre egy (publikus) GitHub repót, és told fel a kódot: `git remote add origin <url> && git push -u origin main`
2. A repóban Settings → Pages → Build and deployment → Source: **GitHub Actions**
3. Az első futás után az app a `https://<felhasználó>.github.io/<repó>/` címen érhető el, PWA-ként telepíthető.

A base útvonalat a workflow a repó nevéből állítja be (`VITE_BASE=/<repó>/`); helyben `/` marad.

## Egyfájlos, hordozható változat
```bash
npm run build:single   # dist-single/index.html – minden beágyazva, dupla kattintással nyílik
```
Ez a fájl pendrive-ról, e-mailből, `file://`-ról is fut, nincs benne service worker és nem telepíthető PWA-ként.

## Validálás (teendő)
Golden tesztesetek összevetése Subsurface / MultiDeco / DecoPlanner kimenetével, percre pontosan.
