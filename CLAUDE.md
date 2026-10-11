# BTT Dive Planner – fejlesztői jegyzet

Dekompressziós és gáztervező (Bühlmann ZH-L16C + GF) a BTT Explorers Hungary számára: web/PWA + Tauri v2 desktop/iOS/Android. Felhasználói leírás: README.md.

## Indítás és teszt
- Node nincs globálisan: a projekt saját Node-ja a `.node/`-ban (gitignore). Minden parancs előtt: `export PATH="$PWD/.node/bin:$HOME/.cargo/bin:$PATH"`.
- Dev: `./dev.sh` → http://localhost:5173 (launch config: `dive-planner-dev`). Prod build előnézet: `./preview.sh` → 4173 (`dive-planner-preview`).
- Teszt: `npm test` (Vitest: engine, golden, `tests/sweep.test.ts` ~56k variáció független invariánsokkal). Build: `npm run build` (tsc + vite), `npm run build:single` (egyfájlos `dist-single/index.html`).
- Desktop: `npm run tauri build` (Rust kell, ~4 perc). Mobil: `npm run tauri ios build --debug --target aarch64-sim`, `npm run tauri android build --apk --target aarch64` (JAVA_HOME, ANDROID_HOME, NDK_HOME; NDK 27.2.12479018, platform/build-tools 35).
- A generált natív projektek a `src-tauri/gen`-ben (gitignore) – újra: `tauri ios init` / `tauri android init`.
- Orákulum: `tools/oracle` (dive-deco Rust crate, `cargo run --release -- 20 85 9`), `npm run golden:oracle`, `npm run compare:oracle`.

## Felépítés
- `src/engine/` – UI-független számítómotor (buhlmann, planner, gasPlan, penetration, recreational, sidemount, messages…);
  v0.11: `density.ts` (gázsűrűség), `contingency.ts` (elveszett deko-gáz, gázellátás-ellenőrzés, tartomány-tábla, max. fenékidő),
  `trace.ts` (túltelítettség/GF99), `repetitive.ts` (ismétlő merülés: kézi vagy napló-minták), `blend.ts` (gázkeverő).
- `src/ui/` – React UI: `App.tsx`, `kit.tsx` (közös komponensek, `GfChart`), `PrintSheet(s).tsx`, `pdf.ts` (PDF, oldaltörés, `askConfirm`/`showMessage`), `i18n.ts` (HU/EN),
  `Repetitive.tsx` (ismétlő merülés + napló-kontextus), `BlendSheet.tsx`, `Brief.tsx`, `planLink.ts` (`#plan=` kódolás/validálás).
- `src-tauri/` – `tauri.conf.json` (CSP, verzió), `Info.ios.plist`, `build.rs`, `capabilities/default.json` (desktop) + `mobile.json`, `vendor/tao`.
- `tests/golden/` – `oracle-*.json` generált (kézzel ne szerkeszd), `profile-*.json` külső tervezőből (pending, ha nincs referencia).
- `tests/baseline.test.ts` + `tests/fixtures/baseline-plans.json` – a v0.10.0 motor terveinek SHA-256 lenyomata: az új opciók
  alapértéken bájtazonos tervet kell adjanak. A fixture-t **nem** szabad újragenerálni egy elbukó teszt miatt.
- `scripts/` – `sign-apk.sh`, `gen-icons.sh`, `inline-icons.mjs`, oracle-szkriptek. `docs/` – App Store listing + screenshotok. `public/privacy.html`.

## Telepítés / kiadás
- Push `main`-re → `pages.yml` (teszt + build) → https://krisztianhari-wq.github.io/BTT-dive-planner/
- `v*` tag → `desktop.yml`: macOS (arm64 + universal), Windows, aláírt Android APK, SHA256SUMS; a release nem draft.
- A taget **külön** pushold (`git push origin vX.Y.Z`): branch+tag egy pushban nem indította a workflow-t.
- Verzió: `package.json` + `src-tauri/tauri.conf.json` (+ Cargo.toml) együtt – lásd /release skill.
- Git identitás repo-szinten: `sadrobot` + GitHub noreply cím. Céges e-mail soha nem kerülhet commitba vagy publikus fájlba (a history 2026-09-20-án át lett írva).

## Döntések
1. Web (PWA) az alap, az interoperabilitás miatt; a Tauri ugyanazt a buildet csomagolja.
2. A motor a Subsurface/Shearwater konvenciót követi (GF low az első megállónál, a következő megálló mélységén értékelve). A „Konzervatív” módszer a dive-deco viselkedését közelíti.
3. Ratio Deco nem lesz elsődleges algoritmus (a GUE nem publikálja).
4. Három mód: Recreational (minden indításkor ez az alap, csak no-deco), Technical, Penetration (GUE/TDI/IANTD full cave, intro szint nincs; harmadok, szifonban hatodok; stage: harmad vagy fél+15 bar). Technical/Penetration váltás munkamenetenként minősítés-megerősítést kér. Gázváltásnál 1 perc tartás.
5. Air csak opcionális GUE fenékgáz (0–30 m), automatikusan sosem választja.
6. Sidemount: 2 független palack, váltási létra 1/6 majd 1/3, elvesztett palack ellenőrzés (Technical + Penetration).
7. Hálózat nincs: minden asset bundle-ölve, a web CSP-t `vite.config.ts` teszi meta-ba (csak nem-Tauri buildnél); Tauri CSP a `tauri.conf.json`-ban. Google Fonts tilos (CSP).
8. Licenc: saját, minden jog fenntartva (LICENSE, EN+HU).
9. Dizájn (v0.10.0): a sadrobot merülésnapló rendszere – grafit/cián tokenek (`styles.css` eleje), alapból sötét, teljes szélességű
   fejléc HU/EN és téma gombbal; ≥1024 px-en kétoszlopos (beállítás | eredmények), alatta fülsor. Beágyazott build
   (`VITE_HOME_URL`, `VITE_LOG_URL`, lásd `src/ui/host.ts`): közös menü (Kezdőlap · Tervező · Napló), a nyelv és a téma a gazdaoldal
   `lang`/`theme` sütijét követi. A napló (`~/Claude_code/divelog`) `scripts/build-planner.sh`-sel építi be a /terv/ alá.
10. v0.11 funkciók és szerződések:
   - Gázsűrűség: ideális gáz, 20 °C (nincs vízhőmérséklet-beállítás), tengerszinti felszínnel; ≥ 5,2 g/l figyelmeztetés,
     ≥ 6,2 g/l `densityCritical` = piros figyelmeztetés, NEM blokkol (Krisz döntése 2026-10-11; a tartomány-táblában „ρ” jel, a cella tervezhető marad).
   - Elveszett deko-gáz / tartomány / max. fenékidő: `planDive` a gáz nélkül; fenékgáz tartaléka a minimum gáz, deko-gázé ×1,5;
     standard módban a deko-palack = normál igény ×1,5 (a min. töltés), „Saját gázaim” módban a valós liter.
   - Motor-opciók (`PlanSettings`): `surfacePressureBar` (magasság), `initialTissues` (ismétlő / nem akklimatizált),
     `ascentRateChangeDepthM`; `DiveInput.initialTissues`. Alapértéken a régi terv bájtra (baseline teszt).
   - Magasság: P = 1,01325·(1 − 2,25577e-5·h)^5,25588; nem akklimatizálva a szövetek tengerszinten telítettek (konzervatív alap).
     Gáz, pO2, sűrűség, minimum gáz tengerszinten marad (konzervatív).
   - Tervlink: `#plan=<base64url(JSON)>`, v1 séma a `docs/plan-link.md`-ben (a napló is ezt generálja). Betöltéskor minden mező
     validálva/korlátozva, a hash törlődik, technikai/penetrációs mód megerősítést kér, a „bátor vagyok” linkből sosem kapcsol be;
     a standard listán kívüli gázok „(linkből)” opcióként jelennek meg. Tauriban a link a Pages-címre mutat.
   - Napló-szerződés (csak `VITE_HOME_URL` mellett, same-origin): `GET /api/planner/context` (credentials include) →
     `{ user, sac|null, recent: [{ id, start_local, start_utc_epoch|null, duration_s, samples:[{t,d,gas?}], gases:[{o2,he}] %, surface_mbar, salinity }] }`
     (48 óra, 401 = nincs bejelentkezve); `POST /api/plans` (`Content-Type: application/json`, `X-Requested-With: dive`,
     credentials same-origin) `{ name, planned_for, plan, summary, profile }` → `{ id }`. Ismeretlen időpontú napló-merülés
     közvetlenül a tervezett merülés elé kerül (konzervatív); sós víznél a mélység ×1,0101, édesvíznél nincs lefelé skálázás.

## Buktatók
- A `@fontsource/figtree` import (`src/main.tsx`) kell: a UI Chakra Petch + IBM Plex Mono (`src/ui/fonts/`, helyben, SIL OFL), de a nyomtatási lap (`.print-sheet`) Figtree-vel készül.
- iOS 27 SDK UIScene nélkül leállítja az appot: `Info.ios.plist` UIApplicationSceneManifest (`UIApplicationSupportsMultipleScenes=true`) + vendorolt tao 0.35.3 (tao#1245 javítás, `[patch.crates-io]`). Törlendő, ha a tauri-runtime-wry tao ≥ 0.36-ot használ. iOS min 15.0.
- Android 16 KB page alignment a `src-tauri/build.rs`-ben (rustc-link-arg), nem `.cargo/config`-ban (a Tauri felülírja a RUSTFLAGS-t).
- Mobilon nincs `window.confirm/alert` és nincs print: `askConfirm`/`showMessage` (dialog plugin); iOS PDF → `navigator.share`, Android (nincs Web Share) → dialog plugin natív mentés.
- GF 20/85-nél a 75 m-es E profil ~17 perccel eltér a dive-deco-tól (ő konzervatívabb) – ismert, nem hiba; GF 85/85-nél minden profil 1–2 percen belül egyezik.
- `mergeSegments` csak azonos sebességű emelkedéseket von össze (korábban ~5%-kal túlbecsülte a gázt). `decoTime` = felszínig hátralévő idő a fenék elhagyásától („felszállás + dekó”).
- PDF oldaltörés `.pb` blokkokon (`renderPages`/`pageBreaks` a `pdf.ts`-ben).
- A tervező első megállója a fenéken számolt plafonból jön (Subsurface-konvenció), így odaérve a vezető szövet GF-je kicsit
  a GF low fölött lehet (pl. 50 m/25′ 21/35, GF 20/85: ~27%) – ismert, nem hiba; a túltelítettség-grafikon ezt mutatja.
- `kiserlet` ág külön git worktree-ben (`../gue-dive-planner-kiserlet`, launch: `dive-planner-kiserlet` 5175, preview 4175): kísérletezésre, a `main` csak kiadásra; onnan soha ne pusholj `v*` taget.

## Nyitott
- App Store feltöltéshez Apple Developer fiók kell (még nincs); a `docs/app-store-listing.md` és screenshotok készen.
- `tests/golden/profile-*.json` külső (Decobuddy) referenciái még kitöltendők.
