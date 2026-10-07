// Finance module (spec §5.6). Pure functions, no dependencies beyond the
// normal CDF. Sign convention follows spreadsheet TVM: money paid out is
// negative, money received is positive. `type` 0 = payments at period end,
// 1 = payments at period start.
import { normalCdf, normalPdf } from '../stats/distributions';
import { CalcError, type Table } from '../types';

export type PaymentTiming = 0 | 1;

export function fv(rate: number, nper: number, pmt: number, pv = 0, type: PaymentTiming = 0): number {
  if (rate === 0) return -(pv + pmt * nper);
  const g = Math.pow(1 + rate, nper);
  return -(pv * g + (pmt * (1 + rate * type) * (g - 1)) / rate);
}

export function pv(rate: number, nper: number, pmt: number, fvVal = 0, type: PaymentTiming = 0): number {
  if (rate === 0) return -(fvVal + pmt * nper);
  const g = Math.pow(1 + rate, nper);
  return -(fvVal + (pmt * (1 + rate * type) * (g - 1)) / rate) / g;
}

export function pmt(rate: number, nper: number, pvVal: number, fvVal = 0, type: PaymentTiming = 0): number {
  if (nper === 0) throw new CalcError('Number of periods must be greater than zero');
  if (rate === 0) return -(pvVal + fvVal) / nper;
  const g = Math.pow(1 + rate, nper);
  return -(rate * (pvVal * g + fvVal)) / ((1 + rate * type) * (g - 1));
}

export function nper(
  rate: number,
  pmtVal: number,
  pvVal: number,
  fvVal = 0,
  type: PaymentTiming = 0,
): number {
  if (rate === 0) {
    if (pmtVal === 0) throw new CalcError('Payment and rate cannot both be zero');
    return -(pvVal + fvVal) / pmtVal;
  }
  const a = pmtVal * (1 + rate * type);
  const num = a - fvVal * rate;
  const den = a + pvVal * rate;
  if (num / den <= 0) throw new CalcError('No number of periods reaches that future value');
  return Math.log(num / den) / Math.log(1 + rate);
}

/** Root-finder: Newton from a guess, falling back to bracket-and-bisect. */
function solveRoot(f: (x: number) => number, guess: number, lo: number, hi: number): number {
  let x = guess;
  for (let i = 0; i < 50; i++) {
    const y = f(x);
    if (!Number.isFinite(y)) break;
    if (Math.abs(y) < 1e-12) return x;
    const h = Math.max(1e-7, Math.abs(x) * 1e-7);
    const dy = (f(x + h) - f(x - h)) / (2 * h);
    if (!Number.isFinite(dy) || dy === 0) break;
    const next = x - y / dy;
    if (!Number.isFinite(next) || next <= lo || next >= hi) break;
    if (Math.abs(next - x) < 1e-14 * Math.max(1, Math.abs(x))) return next;
    x = next;
  }
  // Bracket: scan for a sign change across [lo, hi].
  const steps = 400;
  let a = lo;
  let fa = f(a);
  for (let i = 1; i <= steps; i++) {
    const b = lo + ((hi - lo) * i) / steps;
    const fb = f(b);
    if (Number.isFinite(fa) && Number.isFinite(fb) && Math.sign(fa) !== Math.sign(fb)) {
      let l = a;
      let r = b;
      let fl = fa;
      for (let k = 0; k < 200; k++) {
        const m = (l + r) / 2;
        const fm = f(m);
        if (Math.abs(fm) < 1e-13 || r - l < 1e-15) return m;
        if (Math.sign(fm) === Math.sign(fl)) {
          l = m;
          fl = fm;
        } else r = m;
      }
      return (l + r) / 2;
    }
    a = b;
    fa = fb;
  }
  throw new CalcError('No solution: the cash flows never change sign', 'no-sign-change');
}

export function rate(
  nperVal: number,
  pmtVal: number,
  pvVal: number,
  fvVal = 0,
  type: PaymentTiming = 0,
  guess = 0.1,
): number {
  const f = (r: number) =>
    Math.abs(r) < 1e-12
      ? pvVal + pmtVal * nperVal + fvVal
      : pvVal * Math.pow(1 + r, nperVal) +
        (pmtVal * (1 + r * type) * (Math.pow(1 + r, nperVal) - 1)) / r +
        fvVal;
  return solveRoot(f, guess, -0.999999, 10);
}

/** NPV where cashflows[0] occurs at t = 1 (spreadsheet convention). */
export function npv(r: number, cashflows: number[]): number {
  return cashflows.reduce((acc, cf, i) => acc + cf / Math.pow(1 + r, i + 1), 0);
}

/** IRR where cashflows[0] occurs at t = 0. */
export function irr(cashflows: number[], guess = 0.1): number {
  if (cashflows.length < 2) throw new CalcError('IRR needs at least two cash flows');
  const hasPos = cashflows.some((c) => c > 0);
  const hasNeg = cashflows.some((c) => c < 0);
  if (!hasPos || !hasNeg)
    throw new CalcError('IRR needs at least one negative and one positive cash flow', 'no-sign-change');
  const f = (r: number) => cashflows.reduce((acc, cf, i) => acc + cf / Math.pow(1 + r, i), 0);
  return solveRoot(f, guess, -0.999999, 100);
}

export function cagr(begin: number, end: number, years: number): number {
  if (begin <= 0 || years <= 0) throw new CalcError('CAGR needs a positive starting value and period');
  return Math.pow(end / begin, 1 / years) - 1;
}

/** Amortization schedule. `rate` is per period. */
export function amortization(principal: number, r: number, n: number): Table {
  if (!Number.isInteger(n) || n <= 0 || n > 1200)
    throw new CalcError('Number of periods must be a whole number from 1 to 1200');
  const payment = -pmt(r, n, principal);
  const rows: (string | number)[][] = [];
  let balance = principal;
  for (let k = 1; k <= n; k++) {
    const interest = balance * r;
    const princ = payment - interest;
    balance = k === n ? 0 : balance - princ;
    rows.push([k, round2(payment), round2(interest), round2(princ), round2(Math.max(0, balance))]);
  }
  return { columns: ['Period', 'Payment', 'Interest', 'Principal', 'Balance'], rows };
}

const round2 = (x: number) => Math.round(x * 100) / 100;

export interface Greeks {
  price: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
}

/** Black–Scholes for European options. T in years, r and σ annualised. Theta per year. */
export function blackScholes(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  type: 'call' | 'put',
): Greeks {
  if (S <= 0 || K <= 0 || T <= 0 || sigma <= 0) throw new CalcError('S, K, T and σ must be positive');
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const disc = Math.exp(-r * T);
  const pdf1 = normalPdf(d1);
  const gamma = pdf1 / (S * sigma * sqrtT);
  const vega = S * pdf1 * sqrtT;
  if (type === 'call') {
    return {
      price: S * normalCdf(d1) - K * disc * normalCdf(d2),
      delta: normalCdf(d1),
      gamma,
      theta: (-S * pdf1 * sigma) / (2 * sqrtT) - r * K * disc * normalCdf(d2),
      vega,
      rho: K * T * disc * normalCdf(d2),
    };
  }
  return {
    price: K * disc * normalCdf(-d2) - S * normalCdf(-d1),
    delta: normalCdf(d1) - 1,
    gamma,
    theta: (-S * pdf1 * sigma) / (2 * sqrtT) + r * K * disc * normalCdf(-d2),
    vega,
    rho: -K * T * disc * normalCdf(-d2),
  };
}

interface BondFlows {
  times: number[];
  flows: number[];
  y: number;
  freq: number;
}

function bondFlows(face: number, couponRate: number, ytm: number, years: number, freq: number): BondFlows {
  if (![1, 2, 4, 12].includes(freq)) throw new CalcError('Coupon frequency must be 1, 2, 4 or 12');
  const n = Math.round(years * freq);
  if (n <= 0) throw new CalcError('Maturity must be at least one coupon period');
  const c = (face * couponRate) / freq;
  const times: number[] = [];
  const flows: number[] = [];
  for (let k = 1; k <= n; k++) {
    times.push(k / freq);
    flows.push(k === n ? c + face : c);
  }
  return { times, flows, y: ytm / freq, freq };
}

export function bondPrice(face: number, couponRate: number, ytm: number, years: number, freq = 2): number {
  const { flows, y } = bondFlows(face, couponRate, ytm, years, freq);
  return flows.reduce((acc, cf, i) => acc + cf / Math.pow(1 + y, i + 1), 0);
}

/** Macaulay duration in years. */
export function macaulayDuration(
  face: number,
  couponRate: number,
  ytm: number,
  years: number,
  freq = 2,
): number {
  const { times, flows, y } = bondFlows(face, couponRate, ytm, years, freq);
  const price = bondPrice(face, couponRate, ytm, years, freq);
  return flows.reduce((acc, cf, i) => acc + (times[i] * cf) / Math.pow(1 + y, i + 1), 0) / price;
}

export function modifiedDuration(
  face: number,
  couponRate: number,
  ytm: number,
  years: number,
  freq = 2,
): number {
  return macaulayDuration(face, couponRate, ytm, years, freq) / (1 + ytm / freq);
}

/** Convexity in years². */
export function convexity(face: number, couponRate: number, ytm: number, years: number, freq = 2): number {
  const { flows, y } = bondFlows(face, couponRate, ytm, years, freq);
  const price = bondPrice(face, couponRate, ytm, years, freq);
  const sum = flows.reduce((acc, cf, i) => {
    const k = i + 1;
    return acc + (cf * k * (k + 1)) / Math.pow(1 + y, k + 2);
  }, 0);
  return sum / (price * freq * freq);
}
