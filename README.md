# BTT Dive Planner

Decompression and gas planner for technical diving. Bühlmann ZH-L16C with gradient factors, GUE or PADI/SSI gas sets, metric or imperial units. **The application is available in Hungarian and English** (switch in the header).

**Unvalidated software. Never plan a real dive without proper training and a cross-check against an independent planner.**

## Use it
- **Web / PWA:** https://krisztianhari-wq.github.io/BTT-dive-planner/ – installable (Chrome/Edge: “Install” icon in the address bar; iPhone: Share → Add to Home Screen), works offline.
- **macOS, Windows 11:** installers on the [Releases](https://github.com/krisztianhari-wq/BTT-dive-planner/releases) page.
  - **macOS:** the app is not signed with an Apple developer certificate, so a downloaded copy is reported as “damaged”. Drag it to Applications, then run once in Terminal:
    ```bash
    xattr -cr "/Applications/BTT Dive Planner.app"
    ```
    After that it opens normally. (Adjust the path if you put it elsewhere.)
  - **Windows:** SmartScreen → “More info” → “Run anyway”.
- **Single file:** `dist-single/index.html` opens from anywhere, no internet needed.

## Features
Three planning modes, switched in the header (Recreational is the default; Technical and Penetration ask for a certification confirmation once per session):
- **Recreational** – no-decompression planning: NDL for the depth and gas, 40 m limit, rock-bottom reserve for two divers, safety stop; tells you when a dive cannot be done without deco and the maximum bottom time.
- **Technical** – open-water decompression planning (everything below).
- **Penetration** – cave / mine / wreck planning per GUE, TDI or IANTD full-cave rules: thirds (sixths in siphons), team gas matching for dissimilar cylinders, stage cylinders (thirds or half + reserve) with drop pressures and points, shared-exit check, conservative deco for the whole exposure, in/out itinerary.

Technical mode:
- Standard plan with GUE standard gases (or common PADI/SSI/TDI gases), automatic bottom and deco gas suggestion
- “My gases” mode: enter your cylinders and gases; the planner tells you whether the dive is feasible and exactly how much gas is missing
- Deco schedule, gas plan (minimum gas, consumption per gas), packing list, minute-by-minute itinerary
- Standard (Subsurface / Shearwater convention) or Conservative calculation method
- Light / dark theme, Hungarian / English, metric / imperial

## Development
```bash
npm install
npm run dev            # http://localhost:5173
npm test
```

## Build
```bash
npm run build          # dist/ – PWA, serve from a web server (blank when opened from disk)
npm run build:single   # dist-single/index.html – single portable file
npm run tauri build    # native app, requires a Rust toolchain (rustup.rs)
```

## Release
- Push to `main` → GitHub Pages updates automatically.
- Push a tag separately → installers are attached to a published GitHub Release:
  ```bash
  git tag v0.4.0 && git push origin v0.4.0
  ```

## Validation
An independent Bühlmann implementation (the [dive-deco](https://github.com/KG32/dive-deco) Rust crate) is run on reference profiles via `tools/oracle`; generated golden tests in `tests/golden` compare our schedules against it on every test run. See `tools/oracle/README.md` for the known divergence on deep profiles with a GF slope.

## Structure
- `src/engine/` – calculation engine, UI-independent TypeScript
  - `constants.ts` – ZH-L16C compartment constants, physical constants
  - `buhlmann.ts` – tissue loading (Schreiner), ceiling with gradient factors, NDL
  - `gas.ts` – gas maths (MOD, END, pO2), GUE standard gases and limits
  - `standards.ts` – gas standards: GUE and generic (PADI/SSI/TDI), limits, recommendations
  - `planner.ts` – deco schedule generation with gas switches
  - `gasPlan.ts` – consumption, minimum gas, cylinders, deco gas requirements
  - `inventory.ts` – packing list and “my gases” feasibility
  - `itinerary.ts` – chronological event list
  - `penetration.ts` – overhead (cave / mine / wreck) gas rules, gas matching, stages, exit check, itinerary
  - `recreational.ts` – no-deco planning with NDL and rock-bottom reserve
  - `messages.ts` – language-neutral message codes, translated by the UI
- `src/ui/` – React UI
  - `App.tsx` – the whole UI and its switches (environment, mode, standard, units, language, theme, method)
  - `PenetrationView.tsx`, `RecreationalView.tsx` – the penetration and recreational mode panels
  - `ProfileChart.tsx` – dive profile SVG chart
  - `i18n.ts` – Hungarian / English dictionary and message translation
  - `units.ts` – metric / imperial conversion
  - `styles.css` – light / dark theme
- `src-tauri/` – desktop packaging (Tauri v2), icons, configuration
- `tools/oracle/` – independent reference implementation harness (Rust)
- `scripts/` – single-file build post-processing, golden fixture generation, schedule printers
- `.github/workflows/` – `pages.yml` (web deployment), `desktop.yml` (installers)
- `tests/` – Vitest unit, property and golden tests

## Credits
Made by **sadrobot** for BTT Explorers Hungary. Logo © BTT Explorers Hungary.
