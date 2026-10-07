# CalSci : Scientific Calculator

**Try it:** https://calsci.gauravt9431.workers.dev · **Privacy:** https://calsci.gauravt9431.workers.dev/privacy · **Android:** [latest release](https://github.com/Gauravtiwari31/CalSci/releases/latest)

A scientific calculator and lightweight CAS that runs fully offline. It ships as a PWA on the web and as a Capacitor app on Android, with iOS possible later from the same code. It implements the spec in [details.md](details.md) under the name CalSci instead of Vellum.

## Setup

```sh
npm install
npm run fetch:pyodide    # copies Pyodide core + downloads SymPy/mpmath wheels into public/pyodide (17.2 MB, sha256-checked)
npm run dev              # http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm run build` | Web build with service worker (PWA) |
| `npm run build:native` | Build without service worker, for Capacitor |
| `npm run cap:sync` | Native build + copy into `android/` |
| `npm test` | Unit, router, golden-vector and property tests (Vitest; runs real SymPy through Pyodide in Node) |
| `npm run test:e2e` | Playwright on phone and desktop viewports, including offline SymPy |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript strict |

Android: install Android Studio (SDK 36), then run `npm run cap:sync && npx cap open android`.

### Building a release

You need JDK 21, an Android SDK with platform 36, and `android/keystore.properties` (git-ignored):

```properties
storeFile=C:/path/to/calsci-upload.jks
storePassword=…
keyAlias=calsci-upload
keyPassword=…
```

Then run:

```sh
npm run cap:sync
cd android && ./gradlew bundleRelease assembleRelease
# android/app/build/outputs/bundle/release/app-release.aab  → Play Console
# android/app/build/outputs/apk/release/app-release.apk     → direct install
```

To bump a release, edit `versionCode` and `versionName` in `android/app/build.gradle`, and `version` in `package.json`. The Play Store listing text, graphics and Data safety answers are in [store/PLAY_STORE.md](store/PLAY_STORE.md). The privacy policy is in [PRIVACY.md](PRIVACY.md).

## What's in v1

- Arbitrary precision arithmetic (16–1000 significant digits), real and complex numbers, and deg/rad/grad angle modes.
- Exact forms shown first, with the approximate value beneath (`√2/2`, `1/3`, `π²/6`). Tap the approximate value to swap which one is primary.
- Symbolic tools: simplify, expand, factor, d/dx, indefinite and definite integrals, limits, Σ/Π, series, solve, systems, ODEs, and Laplace transforms.
- Matrices: arithmetic, det, inverse, transpose, rank, trace, LU with pivoting (P·A = L·U), QR, eigenvalues, Ax = b, and least squares.
- Statistics: data lists L₁–L₄ (paste from a spreadsheet), mean, median, σ, s, variance, regression, correlation, normal/t/χ²/binomial/Poisson distributions, and z/t tests.
- Units inside expressions (`17000 mi/h to m/s`) and currency as units (`2500 INR to USD`), with "Rates from …" shown under the result.
- Finance: TVM, NPV, IRR, CAGR, amortization table, Black–Scholes price and Greeks, bond price, Macaulay and modified duration, and convexity.
- A history tape that persists in IndexedDB, `Ans`, pinned variables (`a := 5`, or long-press a result), and user functions (`f(x) := x² + 1`).
- Vellum and blueprint themes with a graph-paper keypad, haptics, keyboard support (Enter, Esc, ↑), and a screen-reader live region.

## Architecture

```
mathfield (MathLive) ─► LaTeX ─► Compute Engine parse ─► MathJSON ─► router (route table)
                                                                       ├─ numeric        math.js BigNumber → double fallback (≈ double tag)
                                                                       ├─ numeric-worker matrices n > 50, lists > 10k (transferable Float64Array)
                                                                       ├─ cas-fast       Compute Engine: D, simplify, expand, factor → SymPy on failure
                                                                       ├─ cas-heavy      SymPy worker: integrate, limit, solve, series, laplace → CE fallback
                                                                       ├─ ode            SymPy dsolve
                                                                       └─ free-symbols   Compute Engine simplify
```

- `src/engine/router.ts` holds the route table (`ROUTES`). Every result carries `engine`, `exact`, `approx` and `precision`.
- `src/engine/numeric/serialize.ts` converts MathJSON to math.js text through an allowlist. Unknown heads are errors, not passthrough.
- `src/engine/sympy/bridge.py` holds the fixed Python that converts MathJSON to SymPy node by node. It never calls `sympify` on text, and user strings never become code. Tests cover injection attempts.
- `src/engine/sympy/client.ts` loads the CAS lazily on first use, terminates and respawns the worker on timeout (10 s by default, configurable up to 60 s), and recycles it every 200 calls.
- Finance (`src/engine/finance`) and stats (`src/engine/stats`) are pure functions, registered into math.js so they work inside any expression.

## Answers to the spec's open questions (§14) and spike items (§9)

| Question | Finding |
|---|---|
| Frankfurter coverage and host | `https://api.frankfurter.dev/v1`, keyless. It returns **30 currencies** (29 rates plus the EUR base), not 220+. Only those are exposed. A snapshot from 6 Oct 2026 is bundled so currency works on first launch offline. |
| Pyodide + SymPy size | Pyodide 314.0.7 (Python 3.14) + SymPy 1.14 + mpmath 1.4.1 = **17.2 MB** on disk (wasm 9.2 MB, stdlib 2.5 MB). In the APK it adds 18 MB of assets. |
| Pyodide cold start | 4.3 s to load SymPy in Node on a desktop. **Not yet measured on a mid-range Android phone.** The loading line in the tape keeps the UI usable meanwhile. |
| Compute Engine coverage | Compute Engine 0.148 is stronger than the spec assumed. It handles derivatives, simplify, expand, factor, Σ/Π including infinite sums, many definite integrals and limits, and single-unknown solve. The router still prefers SymPy for integrate/limit/solve and uses CE as the offline fallback when SymPy isn't available. |
| math.js functions without BigNumber | Seen so far: `gamma` for non-integers, `erf`, and every complex number (math.js complex is always double). They fall back to double and get the `≈ double` tag. |
| Barlow tabular figures | `font-variant-numeric: tabular-nums` is set. Results render through MathLive's KaTeX fonts anyway, so tape columns align either way. |
| `.wasm` MIME in Capacitor | Capacitor 8's `WebViewLocalServer` serves `.wasm` as `application/wasm`, so streaming instantiate works with no patch. |
| CSP | Pyodide runs under the spec's CSP (`'wasm-unsafe-eval'`, no `'unsafe-eval'`). This is verified by the offline E2E test, which runs against the production build. |
| Minimum Android WebView | Capacitor 8 sets minSdk 24. The real WebView minimum for Pyodide has **not been tested on devices**. |

## Known gaps and decisions

- **Release build:** the signed AAB is 16.3 MB, and SymPy is bundled so symbolic math works offline from the first launch. The build has **not yet been tested on a physical device**, so cold start time and WebView compatibility still need a check through Play's internal testing track.
- The main JS chunk is 5.9 MB (1.7 MB gzipped), mostly Compute Engine, math.js and MathLive. It is precached by the service worker. Code-splitting is a later optimization.
- Symbolic calculus always works in radians. Numeric evaluation and `solve` follow the angle mode.
- Units must be upright (inserted by the convert keys or picker, or typed as `\mathrm{km}`). Italic single letters like `m` are treated as variables.
- Visual screenshot tests (`toHaveScreenshot`) are not added yet. They need a pinned Docker image to be stable, as the spec notes.
- Out of scope for v1, as the spec says: graphing, programmer mode, accounts or sync, and step-by-step solutions.
