# Scientific Calculator: Build Spec

Working name: **Vellum**. A scientific calculator and lightweight CAS that runs fully offline, ships as a PWA on the web and as a Capacitor app on Android (iOS later from the same codebase).

This spec is derived from the "Architectural Blueprint" research doc, but it does not follow it blindly. Section 2 lists what was kept, cut, and changed, and why.

---

## 1. Scope

### In v1
- Basic and scientific arithmetic with arbitrary precision (user-configurable significant digits).
- Real and complex numbers, deg/rad/grad angle modes.
- Symbolic: simplify, expand, factor, derivative, integral (indefinite and definite), limit, series, solve, systems, ODEs, Laplace transform.
- Matrices: arithmetic, inverse, determinant, transpose, rank, LU (with pivoting), QR, eigenvalues, solve Ax = b, least squares.
- Statistics: descriptive stats, linear regression, correlation, normal/t/chi²/binomial/Poisson PDF/CDF/inverse CDF, z/t tests.
- Units and dimensional analysis inside expressions (`17000 mi/h to m/s`).
- Currency as units inside expressions (`2500 INR to USD`), offline with last-synced rates.
- Finance: TVM (PV, FV, PMT, N, rate), NPV, IRR, CAGR, amortization table, Black–Scholes price + Greeks, bond price/duration/convexity.
- History tape, pinned results as variables, user-defined functions.
- Fully offline after first load (web) or from install (native).

### Not in v1
- Graphing/plotting (v2, big enough to be its own milestone).
- Programmer mode (hex/bin/bitwise on BigInt). Cheap to add later.
- Accounts, cloud sync, any backend.
- Step-by-step solutions.

---

## 2. Decisions vs. the blueprint doc

| Blueprint item | Decision | Reason |
|---|---|---|
| math.js + decimal.js BigNumber core | **Keep** | Correct choice. Note: not every math.js function supports BigNumber (see §5.4 fallback policy). |
| Custom Pratt / recursive-descent parser | **Cut** | MathLive already emits MathJSON from the visual editor, and math.js has its own parser for typed text. A third parser is pure maintenance cost. |
| Nerdamer + Algebrite + Compute Engine + SymPy (four CAS) | **Cut to two**: CortexJS Compute Engine (ships with MathLive) + SymPy via Pyodide | Four engines give four output formats, four bug surfaces, and inconsistent answers for the same input. Algebrite and Nerdamer add nothing SymPy doesn't do better. |
| Pyodide + SymPy in a Web Worker | **Keep**, lazy-loaded | Only realistic way to get real CAS power offline. Doc's 13.5 MB figure is for core only; SymPy + mpmath add more. Measure real transfer size in the spike. |
| Custom CORDIC trig | **Cut** | decimal.js already computes arbitrary-precision trig with series + argument reduction. Writing CORDIC adds risk, no capability. |
| WASM SIMD matrix library in C++/Rust | **Cut** | Calculator matrices are tiny. math.js handles up to a few hundred rows fine; anything heavier runs in a numeric worker. |
| COOP/COEP + SharedArrayBuffer | **Cut** | Nothing here needs shared memory. COEP also blocks cross-origin asset loads and is awkward to set inside Capacitor. |
| Transferable `Float64Array` to workers | **Keep** for stats/matrix payloads over ~10k values | Cheap to do, real win for big datasets. |
| QuantOracle API for finance | **Cut, implement locally** | Unknown third party, IP-based quota, breaks offline, and adds network latency to math that takes microseconds. All listed formulas are closed-form or a short Newton loop (~400 lines total). |
| Frankfurter API for currency | **Keep** | Free, keyless, ECB-sourced. Doc claims 220+ currencies; verify what the endpoint actually returns and only expose those. |
| Periodic Background Sync for rates | **Cut** | Chromium-only, needs install + engagement, doesn't exist in Capacitor. ECB publishes once per working day, so "refresh on open if older than 24h" is enough. |
| `navigator.vibrate(50)` haptics | **Replace** with `@capacitor/haptics` on native, `navigator.vibrate` fallback on web Android | Capacitor Haptics also works on iOS, which the Vibration API never will. |
| Workbox PWA | **Keep for web build only** | In the native build assets are already local; disable SW registration there. |
| IndexedDB via `idb` | **Keep**, use Dexie instead of raw `idb` | Schema versioning and bulk writes are simpler. Batch writes in one transaction as the doc says. |
| CSP with `wasm-unsafe-eval` | **Keep** | Set via `<meta>` in native builds (no server headers there). |
| Vitest + Playwright screenshots | **Keep + add property-based tests** | See §11. |

---

## 3. Platform: Capacitor, not React Native

**Use Capacitor.** React Native is the wrong tool for this specific app:

- MathLive is a DOM web component. RN has no DOM, so the math editor would have to live in a WebView anyway.
- Pyodide is WebAssembly. Hermes (RN's JS engine) does not run WASM. SymPy would also have to live in a WebView.
- Web Workers, IndexedDB, Cache Storage: all browser APIs, none native to RN.

An RN version would end up as an RN shell around a WebView doing all the work, which is a worse Capacitor. The only thing RN would genuinely win is native-feeling list and gesture performance, and the keypad doesn't need it.

What Capacitor gives:
- One codebase: web PWA + Android + iOS.
- Native plugins where the web is weak: haptics (incl. iOS), filesystem, share sheet, status bar, splash.
- Pyodide bundled inside the APK, so advanced math works offline from the first launch.

Versus a TWA (Trusted Web Activity): TWA is Android-only, depends on the user's Chrome, and gets no native plugins. Capacitor is the better default here.

Your React experience from DoAll carries over; React Native-specific knowledge mostly doesn't, and that's fine.

---

## 4. Stack

| Concern | Choice |
|---|---|
| Build | Vite + TypeScript (strict) |
| UI | React 18 + Zustand for state |
| Math input/render | MathLive (mathfield + static render) |
| Symbolic (fast tier) | `@cortex-js/compute-engine` |
| Numeric | math.js configured with `number: 'BigNumber'` |
| Symbolic (heavy tier) | Pyodide + SymPy in a dedicated worker |
| Worker RPC | Comlink |
| Stats | jStat (distributions, tests) + simple-statistics (regression) |
| Finance | Local module, no dependencies |
| Storage | Dexie (IndexedDB) |
| Native shell | Capacitor 6+ with `@capacitor/haptics`, `@capacitor/share`, `@capacitor/status-bar`, `@capacitor/preferences` |
| PWA (web only) | `vite-plugin-pwa` (Workbox) |
| Tests | Vitest, fast-check, Playwright |
| Lint/format | ESLint + Prettier |

---

## 5. Architecture

### 5.1 Overview

```
┌──────────────────────── Main thread ────────────────────────┐
│  UI (React)                                                 │
│   ├─ Tape (history)                                         │
│   ├─ Mathfield (MathLive)  ──► MathJSON                     │
│   └─ Keypad layers                                          │
│                                                             │
│  Evaluation router ──────────┬──────────┬────────────┐      │
│   │                          │          │            │      │
│   ▼                          ▼          ▼            ▼      │
│  math.js (BigNumber)   Compute Engine  jStat     finance/   │
│  numbers, complex,     simplify,       stats     currency   │
│  units, small matrix   derivative                           │
└──────────────┬─────────────────────────────┬────────────────┘
               │ Comlink                     │ Comlink
               ▼                             ▼
     ┌─────────────────┐          ┌──────────────────────┐
     │ Numeric worker  │          │ Pyodide worker       │
     │ big matrices,   │          │ SymPy: integrate,    │
     │ big datasets    │          │ limit, solve, dsolve │
     └─────────────────┘          │ (disposable)         │
                                  └──────────────────────┘
               Dexie (IndexedDB): history, vars, functions, rates, settings
```

### 5.2 Evaluation router

The router takes the MathJSON from the mathfield, inspects the head operator and free symbols, and dispatches. Routes are a table, not if/else chains, so they can be changed after measuring.

| Input | Engine | Thread |
|---|---|---|
| Pure numeric expression, functions, complex, units, currency | math.js | main |
| Matrix ops, n ≤ 50 | math.js | main |
| Matrix ops, n > 50, or dataset > 10k values | math.js / simple-statistics | numeric worker |
| `simplify`, `expand`, `D` (derivative), substitution | Compute Engine, fall back to SymPy on failure | main → worker |
| `integrate`, `limit`, `series`, `solve`, systems, `dsolve`, `laplace` | SymPy | Pyodide worker |
| Distributions, hypothesis tests | jStat | main |
| TVM, NPV, IRR, Black–Scholes, bonds | `engine/finance` | main |

Rules:
- If the expression has free symbols and the user pressed `=`, try to evaluate with stored variables first; if symbols remain, treat as symbolic and route accordingly.
- Every result carries `engine`, `exact` (MathJSON or null), `approx` (string), and `precision` (`'arbitrary' | 'double'`).

### 5.3 Pyodide worker

- Loaded on first symbolic request, not at startup. Show a one-time loading line in the tape: "Loading advanced math (first time only)" with a progress bar.
- Native builds: Pyodide and the SymPy/mpmath wheels are bundled in `public/pyodide/`, `indexURL` points there.
- Web build: same files served from your own origin, cached with a CacheFirst rule (not precached).
- **Never** build Python source by concatenating user text. Convert MathJSON to SymPy calls node by node through an allowlisted serializer (`Add`, `Multiply`, `Power`, `Sin`, …). Unknown heads → error, not passthrough. Do not call `sympify` on raw strings.
- Every call has a timeout (default 10 s, setting up to 60 s). On timeout: `worker.terminate()`, spawn a fresh worker, report "Took too long, stopped after 10 s".
- Also respawn after every 200 calls to cap WASM heap growth.
- Request/response shape:

```ts
type CasRequest = { id: string; op: CasOp; args: MathJson[]; timeoutMs: number };
type CasResponse =
  | { id: string; ok: true; exact: MathJson; latex: string; approx?: string }
  | { id: string; ok: false; error: { code: string; message: string } };
```

### 5.4 Precision policy

- math.js config: `{ number: 'BigNumber', precision: 64 }` by default; user setting 16 to 1000 significant digits.
- Display: 12 significant digits by default, tap result to expand to full precision.
- Some math.js functions don't support BigNumber (several matrix decompositions, some special functions). Policy: try BigNumber, on "not supported" error retry with `number`, and mark the result with a small `≈ double` tag. Never silently mix.
- Results that are exact (√2/2, 1/3, π/4) show exact form first, approximate value beneath. Tap to swap which is primary.
- Trig argument reduction for huge inputs is handled by decimal.js; add a test for `sin(10^22)`.
- Display grouping uses `Intl.NumberFormat`. Settings offer international (1,000,000) and Indian (10,00,000) grouping.

### 5.5 Units and currency

- Units: math.js unit system as-is.
- Currency: on startup, load cached rates from Dexie and register each currency with `math.createUnit('USD', …)` relative to the base. Then `2500 INR to USD` works in the same expression pipeline as `5 km to mi`.
- Refresh: on app open, if `fetchedAt` older than 24 h and online, fetch Frankfurter, write in one transaction, re-register units.
- Always show "Rates from 6 Oct 2026" under any result that used a currency.

### 5.6 Finance module

Pure functions, all unit-tested against known values:
- `fv, pv, pmt, nper, rate` (rate via Newton with bisection fallback).
- `npv(rate, cashflows)`, `irr(cashflows)` (Newton, bracket-and-bisect fallback, error if no sign change).
- `cagr`, `amortization(principal, rate, n)` → table rendered in the tape.
- `blackScholes(S, K, T, r, σ, type)` → price, Δ, Γ, Θ, ν, ρ. Normal CDF from jStat.
- `bondPrice`, `macaulayDuration`, `modifiedDuration`, `convexity`.

---

## 6. Features by keypad layer

Layers are swipeable pages of the keypad. The mathfield and tape stay fixed.

1. **Basic**: digits, `+ − × ÷`, `( )`, `%`, `±`, `Ans`, backspace, clear, `=`.
2. **Functions**: trig + inverse + hyperbolic (shift for inverse), `ln log logₙ`, `eˣ 10ˣ`, `√ ∛ ⁿ√`, `x² xʸ`, `n! nPr nCr`, `|x|`, `π e i`, angle mode.
3. **Calculus**: `d/dx`, `∫`, `∫ₐᵇ`, `lim`, `Σ`, `Π`, series, `solve`, `x y z t` symbols, `=` (equation, not evaluate).
4. **Matrix**: insert m×n matrix, add row/col, `det inv Aᵀ rank`, `LU QR eig`, solve.
5. **Stats**: data entry sheet (opens a sheet with a column editor, paste from clipboard supported), `mean median σ s`, regression, distribution picker.
6. **Convert**: unit and currency pickers that insert `to <unit>` into the expression.
7. **Finance**: opens form sheets (TVM, NPV/IRR, options, bonds). Results go to the tape like everything else.

Physical keyboard on desktop/tablet: typing goes straight into the mathfield; `Enter` evaluates, `Esc` clears, `↑` recalls last tape entry.

---

## 7. UI and visual design

### 7.1 Concept

**Engineering vellum by day, blueprint by night.** The calculator is drawn like a drafting sheet: a faint graph-paper grid that the keypad sits on, ink-blue linework, one highlighter-yellow mark for the thing that matters. Dark mode is literally a blueprint: deep blue sheet, chalk-white lines.

The single memorable element is the **graph-paper keypad**: keys are cells of the grid, not floating buttons. Everything else stays quiet.

### 7.2 Color tokens

| Token | Vellum (light) | Blueprint (dark) | Use |
|---|---|---|---|
| `--sheet` | `#E8ECEF` | `#15325C` | background |
| `--grid` | `#C9D3DB` | `#2A4B7A` | graph lines, perforations |
| `--ink` | `#1B2B48` | `#EAF0F7` | primary text, key glyphs |
| `--graphite` | `#5E6875` | `#9DB0C8` | secondary text, expressions in tape |
| `--signal` | `#F2BE22` | `#F2BE22` | `=` key, active layer marker, selection |
| `--fault` | `#B4234A` | `#FF7A90` | errors only |

Text on `--signal` is always `--ink` from the light theme (`#1B2B48`). Verify every pair hits WCAG AA.

### 7.3 Type

- **Barlow** (UI, key labels, numbers in tape). DIN-like, engineering-sign feel, free on Google Fonts. Use **Barlow Semi Condensed** for function keys so `asinh` and `logₙ` fit without shrinking.
- **MathLive's KaTeX fonts** for all math (expressions and symbolic results). This is the second family, and it's correct for the subject.
- Sentence case everywhere. Angle mode shows as `deg` / `rad` / `grad` (lowercase, as written in math).
- Scale (px): 13 / 15 / 18 / 24 / 36. Results 36, expressions in tape 15, key labels 18 (digits 24).

### 7.4 Layout (phone, portrait)

```
┌──────────────────────────────┐
│ deg                  ⋮       │  ← status row: angle mode, menu
│                              │
│   2x + 3 = 7                 │
│                         x=2  │  ← tape entry
│ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │  ← perforation between entries
│   ∫ x² sin x dx              │
│        −x²cos x + 2x sin x   │
│              + 2cos x        │
│ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │
│ ┌──────────────────────────┐ │
│ │ √(2)/2 + │               │ │  ← mathfield (current input)
│ │                 ≈ 0.7071 │ │  ← live preview, graphite
│ └──────────────────────────┘ │
│ basic functions calculus ma… │  ← layer names, yellow bar under active
├──┬──┬──┬──┬──────────────────┤
│7 │8 │9 │÷ │ ⌫               │
├──┼──┼──┼──┼──                │  ← graph-paper grid, keys are cells
│4 │5 │6 │× │ (                │
├──┼──┼──┼──┼──                │
│1 │2 │3 │− │ )                │
├──┼──┼──┼──┼──                │
│0 │. │Ans│+ │ ███ = ███       │  ← only filled element
└──┴──┴──┴──┴──────────────────┘
```

Tablet/landscape/desktop: tape on the left (40%), mathfield + keypad on the right. Same components, no separate design.

Alignment: expressions left-aligned, results right-aligned, like a ledger.

### 7.5 Components

- **Keys** by role, not one style for all:
  - Digits: bare glyph centered in a grid cell. No border, no fill.
  - Operators: glyph inside a 1.5 px `--ink` outline, 3 px radius.
  - Functions: Semi Condensed label; the shifted function sits small in the cell's top-right corner (`sin` with `sin⁻¹` above), like hardware calculators.
  - `=`: filled `--signal`, spans two columns. The only filled key.
  - Pressed state: cell fills with `--grid` for 80 ms + haptic tick.
- **Tape entries**: expression (graphite, small, left), result (ink, large, right), dashed perforation below. Tap result → insert into input. Long press → copy, pin as variable, share, convert units.
- **Pinned variables**: appear as chips in a strip above the mathfield (`a = 3.14…`). Tapping inserts the name.
- **Sheets** (stats data, finance forms, matrix size): slide up from the bottom, same grid background, no shadows; separated from the page by a 1 px `--ink` top rule.
- **Layer switcher**: plain words in a row, a 3 px yellow bar slides under the active one. Swiping the keypad changes layer too.

### 7.6 Motion

One orchestrated moment only: on `=`, the input line drops onto the tape (≈180 ms translate) and the perforation line draws left to right beneath it. Everything else is instant. With `prefers-reduced-motion`, the entry just appears.

### 7.7 Haptics

- Native: `Haptics.impact({ style: ImpactStyle.Light })` on key press, `Medium` on `=`, `notification({ type: Error })` on error.
- Web Android: `navigator.vibrate(10)` for keys. iOS web: silent.
- Toggle in settings, on by default.

### 7.8 Copy

- Errors say what happened and what to do: "Can't divide by zero", "Matrix sizes don't match: 2×3 times 2×3. Columns of the first must equal rows of the second.", "No real solution. Switch to complex mode to see complex roots."
- Empty tape: "Results land here. Tap one to reuse it."
- No exclamation marks, no apologies.

### 7.9 Explicitly avoid

Gradients, glassmorphism, glows, drop shadows on keys, identical rounded-card stacks, Inter/Roboto, emoji, sparkle/AI icons, all-caps labels, bouncy entrance animations, purple accents, a "hero" result in a giant gradient box.

### 7.10 Accessibility

- Every key is a `<button>` with an `aria-label` in words ("sine", "square root", "open parenthesis").
- Tape is a list; new results are announced via an `aria-live="polite"` region.
- MathLive's built-in speech output enabled for the mathfield.
- Touch targets ≥ 48 px (5 columns on a 360 px screen gives ~72 px cells).
- Visible focus ring: 2 px `--signal` outline offset 2 px.
- Both themes pass AA contrast; follow system theme by default.

---

## 8. Data model (Dexie)

```ts
db.version(1).stores({
  history:   '++id, createdAt, pinned',
  variables: 'name, updatedAt',
  functions: 'name',
  rates:     'base',       // one row per base currency
  settings:  'key',
});

interface HistoryEntry {
  id?: number;
  createdAt: number;
  inputLatex: string;
  inputJson: unknown;      // MathJSON
  resultLatex: string;
  resultApprox?: string;
  engine: 'mathjs' | 'ce' | 'sympy' | 'jstat' | 'finance';
  precision: 'arbitrary' | 'double';
  pinned: boolean;
}

interface RatesRow { base: string; date: string; fetchedAt: number; rates: Record<string, number>; }
```

- History capped at 5,000 unpinned entries; trim in batches of 500 inside one transaction.
- Bulk imports (stats datasets) written in one `readwrite` transaction.
- Settings mirrored to `@capacitor/preferences` on native so a WebView storage wipe doesn't reset them.

---

## 9. Offline and packaging

| | Web (PWA) | Native (Capacitor) |
|---|---|---|
| App shell | Precached by Workbox | Bundled in APK |
| Pyodide + SymPy | CacheFirst on first use | Bundled in APK |
| Fonts | Self-hosted, precached | Bundled |
| Service worker | Yes | Not registered (`Capacitor.isNativePlatform()` check) |
| Rates | Dexie, refresh if > 24 h | Same |

Spike items to verify early:
- Capacitor's Android local server serves `.wasm` with `application/wasm`. If not, Pyodide's streaming instantiate fails; patch or fall back to ArrayBuffer instantiate.
- Pyodide cold start time and memory on a mid-range Android phone. If cold start > 4 s, show the loading line and keep the main UI usable.
- APK size with Pyodide bundled. If too large, switch native to download-on-first-use into the Filesystem plugin.

---

## 10. Security

Native (meta tag in `index.html`) and web (response header):

```
default-src 'self';
script-src 'self' 'wasm-unsafe-eval';
worker-src 'self' blob:;
connect-src 'self' https://api.frankfurter.dev;
style-src 'self' 'unsafe-inline';
font-src 'self';
img-src 'self' data:;
```

- Confirm whether Pyodide needs anything beyond `wasm-unsafe-eval` in the spike; don't add `unsafe-eval` unless proven necessary.
- `style-src 'unsafe-inline'` is needed by MathLive's dynamic styles; check if the current version supports a nonce instead.
- No user string ever reaches Python as code (§5.3).
- Frankfurter domain: confirm the current API host before shipping.

---

## 11. Testing

- **Unit (Vitest)**: every finance function, every router rule, MathJSON → SymPy serializer, precision fallback. Use `toBeCloseTo` only for double-precision paths; compare BigNumber results as strings to a fixed number of digits.
- **Golden vectors**: a JSON file of ~300 input → expected output pairs (trig at special angles, factorials, known integrals, matrix decompositions). Run on every commit.
- **Property-based (fast-check)**:
  - `d/dx ∫ f dx ≈ f` at random points for random polynomial/trig expressions.
  - Compute Engine derivative vs SymPy derivative agree numerically at random points (differential testing between your two CAS).
  - `A = L·U` (with pivot) and `A = Q·R` reconstruct within tolerance for random matrices.
  - Unit round-trips: `x a to b to a ≈ x`.
- **E2E (Playwright)**: key sequences produce expected tape entries; offline mode (network disabled) still evaluates everything including SymPy after warm cache.
- **Visual (Playwright `toHaveScreenshot`)**: mathfield and tape rendering in both themes. Run screenshots in a pinned Docker image, otherwise font rendering differences across machines make them flaky.

---

## 12. Project structure

```
vellum/
├─ src/
│  ├─ app/            App shell, theme, layout
│  ├─ ui/
│  │  ├─ keypad/      layers, key components, layer switcher
│  │  ├─ tape/        history list, entry, context menu
│  │  ├─ mathfield/   MathLive wrapper, live preview
│  │  └─ sheets/      stats data, finance forms, matrix size, settings
│  ├─ engine/
│  │  ├─ router.ts
│  │  ├─ numeric/     math.js instance + BigNumber fallback
│  │  ├─ symbolic/    Compute Engine adapter
│  │  ├─ sympy/       worker, serializer, lifecycle
│  │  ├─ stats/
│  │  ├─ finance/
│  │  └─ currency/    rates sync, unit registration
│  ├─ store/          Zustand slices
│  ├─ db/             Dexie schema + queries
│  ├─ platform/       haptics, isNative, share, preferences
│  └─ workers/        numeric.worker.ts, pyodide.worker.ts
├─ public/
│  ├─ pyodide/        core + sympy + mpmath wheels
│  └─ fonts/
├─ tests/
│  ├─ unit/  property/  golden/  e2e/
├─ android/  ios/     Capacitor projects
├─ capacitor.config.ts
└─ vite.config.ts
```

---

## 13. Milestones

| # | Milestone | Done when |
|---|---|---|
| M0 | Spike | MathLive + math.js + Pyodide worker running inside a Capacitor Android build on a real phone. Measured: APK size, Pyodide cold start, Compute Engine coverage for derivative/simplify, `.wasm` MIME. |
| M1 | Core calculator | Basic + Functions layers, tape, variables, precision setting, both themes, Dexie persistence, PWA installable. |
| M2 | Symbolic | Router + Compute Engine + SymPy worker with timeout/respawn, Calculus layer, exact/approx display. |
| M3 | Matrix + stats | Matrix layer and editor, numeric worker, stats sheet with paste import, distributions. |
| M4 | Convert + finance | Units, currency with offline rates, finance forms. |
| M5 | Ship | Accessibility pass, golden + property tests green, Play Store internal testing track, web deploy. |

---

## 14. Open questions to settle in M0

1. Real Frankfurter currency coverage and current API host.
2. Real download size of Pyodide core + SymPy + mpmath.
3. Which symbolic ops Compute Engine handles reliably (adjust router table accordingly).
4. Full list of math.js functions without BigNumber support (drives the `≈ double` tag).
5. Whether Barlow's tabular figures are available in the hosted build; if not, render tape results through MathLive static markup so columns still align.
6. Minimum Android WebView version to support (affects `wasm-unsafe-eval` and Pyodide).
