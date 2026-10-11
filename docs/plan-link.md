# Plan link (`#plan=`) – schema v1

The planner reads and writes its full input state in the URL hash:

```
https://<planner>/#plan=<base64url(UTF-8 JSON)>
```

`base64url` = RFC 4648 §5 alphabet (`-` and `_`), no `=` padding. The JSON:

| field | type | notes |
|---|---|---|
| `v` | `1` | schema version; any other value is rejected |
| `env` | `'rec' \| 'open' \| 'pen'` | recreational, technical, penetration |
| `maxDepth` | number, m | clamped 3–60 (rec/pen) or 3–120 (open) |
| `bottomTime` | number, min | incl. descent; integer 1–300 |
| `bottomGas` | `{ o2, he }` | fractions 0–1 (a value > 1 is read as percent); O2 5–100 %, He ≤ 100 − O2 |
| `decoGases` | `[{ o2, he, switchDepth }]` | up to 6; `switchDepth` 1–120 m |
| `gfLow`, `gfHigh` | number, % | 5–100; `gfLow` is lowered to `gfHigh` if larger |
| `lastStop` | `3 \| 6` | m; anything else → 6 |
| `sacBottom`, `sacDeco` | number, l/min | 5–60 |
| `altitudeM` | number, m (optional) | 0–4500 |
| `std` | `'gue' \| 'generic'` (optional) | gas standard |
| `unit` | `'metric' \| 'imperial'` (optional) | display units (values in the link are always metric) |
| `name` | string (optional) | ≤ 80 characters, control characters and `<>` removed |
| `pen` | object (optional, `env: 'pen'`) | subset of the penetration state (team, cylinders by index, stages, flow…) |

Rules on load:

- Every field is validated and clamped; unknown fields are ignored; an invalid link only shows a message.
- Gases that are not in the selected standard's list appear as an extra "(from link)" choice; nothing is silently
  replaced by a different gas.
- Technical and penetration links still require the qualification confirmation of the session.
- A link can never switch on the penetration "brave" (outside the gas rules) override.
- Repetitive-dive data and the "my gases" cylinder inventory are not part of the link.
- After loading, the hash is removed from the address bar.

Examples (the napló generates links in exactly this format):

```js
const plan = { v: 1, env: 'open', maxDepth: 45, bottomTime: 25, bottomGas: { o2: 0.21, he: 0.35 },
  decoGases: [{ o2: 0.5, he: 0, switchDepth: 21 }], gfLow: 20, gfHigh: 85, lastStop: 6,
  sacBottom: 18, sacDeco: 14, std: 'gue', name: 'Re-plan of dive #123' };
const b64url = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(plan))))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
location.href = `/terv/#plan=${b64url}`;
```

"Plan with my SAC": the same object with the diver's `sacBottom` / `sacDeco`.

## Embedded mode (napló) – server contract

Only when the planner is built with `VITE_HOME_URL` (see `src/ui/host.ts`), same origin:

- `GET /api/planner/context` (credentials included) →
  `{ user: { display_name }, sac: { bottom, deco } | null, recent: [{ id, start_local, start_utc_epoch: number | null,
  duration_s, samples: [{ t: s, d: m, gas?: index }], gases: [{ o2: %, he: % }], surface_mbar, salinity }] }`
  – dives of the last 48 h, newest first; `401` when not signed in. Used for the repetitive dive (actual profiles).
- `POST /api/plans` (headers `Content-Type: application/json`, `X-Requested-With: dive`, credentials same-origin), body
  `{ name, planned_for: 'YYYY-MM-DD' | null, plan: <the #plan= object>, summary: { env, maxDepth, bottomTime, runtime,
  decoTime, gfLow, gfHigh, gases: [{ o2, he }] (percent) }, profile: [{ t: s, d: m }] }` → `{ id }`; `401` when not
  signed in.
