# Play Store submission kit: CalSci 1.0.0

Everything the Play Console asks for, in the order it asks.

## Build

| Item | Value |
|---|---|
| Package name | `app.calsci.calculator` |
| Version | 1.0.0 (versionCode 1) |
| Upload file | `app-release.aab` (attached to the GitHub release v1.0.0) |
| Target / min SDK | 36 / 24 (Android 7.0+) |
| Signing | Upload key `calsci-upload` (keep the `.jks` and its password safe). Enroll in **Play App Signing** when Play asks. |
| Permissions | `INTERNET` (currency rates), `VIBRATE` (haptics) |

To rebuild the files, see "Building a release" in the [README](../README.md).

## Main store listing

**App name** (30 max): `CalSci : Scientific Calculator`

**Short description** (80 max):

```
Offline scientific calculator with calculus, matrices, units, currency & finance
```

**Full description** (4000 max):

```
CalSci is a scientific calculator that thinks like a math notebook. Type real math notation, see results exactly (√2/2, π²/6, 1/3) with the decimal value right beneath, and keep a tidy history of everything you calculate.

Everything runs on your phone. No account, no ads, no tracking. It works offline, including the symbolic math engine.

WHAT IT DOES

• Precision you choose: 16 to 1000 significant digits. 0.1 + 0.2 is exactly 0.3.
• Real and complex numbers, degrees, radians and gradians.
• Calculus: derivatives, integrals (indefinite and definite), limits, sums and products, Taylor series, Laplace transforms.
• Algebra: solve equations and systems, simplify, expand, factor, differential equations.
• Matrices: determinant, inverse, transpose, rank, LU, QR, eigenvalues, solve Ax = b, least squares.
• Statistics: mean, median, standard deviation, regression, correlation, normal, t, chi-squared, binomial and Poisson distributions, z and t tests. Paste data straight from a spreadsheet.
• Units: length, mass, temperature, time, speed, area, volume, energy, power, pressure, data and angle. Works inside expressions too: 17000 mi/h to m/s.
• Currency: 30 currencies using European Central Bank reference rates, saved for offline use.
• Finance: loan payments and time value of money, NPV, IRR, CAGR, amortization tables, Black–Scholes option prices with Greeks, bond price, duration and convexity.
• Variables and your own functions: a := 5, f(x) := x² + 1.

DESIGNED TO BE CLEAR

• A clean paper-and-ink design in light and dark themes.
• Results show which engine produced them, and when a result used double precision instead of full precision.
• Errors say what happened and what to do, like "Matrix sizes don't match: 2×3 times 2×3".
• Long-press any result to copy it, pin it as a variable or share it.
• Haptic feedback, screen reader labels and large touch targets.
```

**Category:** Education (alternative: Tools)
**Tags:** Calculator, Math, Education, Productivity
**Contact email:** your developer email
**Website:** https://github.com/Gauravtiwari31/CalSci
**Privacy policy URL:** https://github.com/Gauravtiwari31/CalSci/blob/main/PRIVACY.md

## Graphics

| Asset | File | Spec |
|---|---|---|
| App icon | `store/icon-512.png` | 512×512 PNG |
| Feature graphic | `store/feature-graphic.png` | 1024×500 PNG |
| Phone screenshots | `store/screenshots/1-…5-*.png` | 1080×2160, 2–8 required |

Regenerate them with `node scripts/make-assets.mjs` and `npm run build && node scripts/store-screenshots.mjs`.

## App content answers

| Section | Answer |
|---|---|
| Privacy policy | URL above |
| Ads | No ads |
| App access | All functionality is available without restrictions (no login) |
| Content rating | Questionnaire category "Utility, Productivity, Communication, or Other": answer No to everything, which gives Everyone / PEGI 3 |
| Target audience | 13+ (or 18+). Not designed for children, though suitable for all ages |
| News app | No |
| Government app | No |
| Financial features | None. It is a calculator and does not provide financial services |
| Health | No |

### Data safety

- **Does your app collect or share any of the required user data types?** No.
- **Is all of the user data collected by your app encrypted in transit?** Not applicable (no user data is collected). The only network call is an HTTPS request for public exchange rates.
- **Do you provide a way for users to request that their data is deleted?** Not applicable (nothing leaves the device).

## Release checklist

1. Create the app in Play Console with the name and default language **English (United States)**.
2. Complete the **App content** answers above.
3. Fill in the **Main store listing** and upload the graphics.
4. Go to **Testing → Internal testing**, create a release, upload `app-release.aab`, and accept Play App Signing.
5. Release notes: see the text below.
6. Test on a real device through the internal testing link. Check the first symbolic calculation (it loads the math engine), offline mode, and the back button.
7. Promote to closed testing, then production. New personal developer accounts must first run a closed test with at least 12 testers for 14 days.

**Release notes (en-US, 500 max):**

```
First release of CalSci.
• Arbitrary-precision scientific calculator with exact results
• Calculus, equation solving and ODEs, fully offline
• Matrices, statistics and distributions
• Unit and currency converter
• Finance: loans, NPV, IRR, options, bonds
• Light and dark themes
```
