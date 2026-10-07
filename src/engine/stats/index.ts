import { linearRegression, rSquared, sampleCorrelation } from 'simple-statistics';
import { CalcError, type Table } from '../types';
import { normalCdf, tCdf } from './distributions';

export * from './distributions';

function needData(xs: number[], min = 1): number[] {
  if (xs.length < min) throw new CalcError(`Needs at least ${min} data value${min === 1 ? '' : 's'}`);
  if (xs.some((x) => !Number.isFinite(x)))
    throw new CalcError('Data contains a value that is not a finite number');
  return xs;
}

export const mean = (xs: number[]) => needData(xs).reduce((a, b) => a + b, 0) / xs.length;

/** Sample variance (n − 1), computed with Welford's algorithm for stability. */
export function sampleVariance(xs: number[]): number {
  needData(xs, 2);
  let m = 0;
  let s = 0;
  xs.forEach((x, i) => {
    const d = x - m;
    m += d / (i + 1);
    s += d * (x - m);
  });
  return s / (xs.length - 1);
}

export function populationVariance(xs: number[]): number {
  const m = mean(xs);
  return xs.reduce((acc, x) => acc + (x - m) * (x - m), 0) / xs.length;
}

export const sampleStd = (xs: number[]) => Math.sqrt(sampleVariance(xs));
export const populationStd = (xs: number[]) => Math.sqrt(populationVariance(xs));

function pairs(xs: number[], ys: number[]): [number, number][] {
  needData(xs, 2);
  needData(ys, 2);
  if (xs.length !== ys.length)
    throw new CalcError(`Lists have different lengths: ${xs.length} and ${ys.length}`);
  return xs.map((x, i) => [x, ys[i]]);
}

export function linreg(xs: number[], ys: number[]): Table {
  const data = pairs(xs, ys);
  const { m, b } = linearRegression(data);
  const fn = (x: number) => m * x + b;
  return {
    columns: ['', 'Value'],
    rows: [
      ['slope m', m],
      ['intercept b', b],
      ['r', sampleCorrelation(xs, ys)],
      ['r²', rSquared(data, fn)],
      ['n', xs.length],
    ],
  };
}

export function correlation(xs: number[], ys: number[]): number {
  pairs(xs, ys);
  return sampleCorrelation(xs, ys);
}

/** One-sample two-sided z test with known population σ. */
export function zTest(xs: number[], mu0: number, sigma: number): Table {
  needData(xs, 1);
  if (!(sigma > 0)) throw new CalcError('σ must be positive');
  const z = (mean(xs) - mu0) / (sigma / Math.sqrt(xs.length));
  const p = 2 * (1 - normalCdf(Math.abs(z)));
  return {
    columns: ['', 'Value'],
    rows: [
      ['z', z],
      ['p (two-sided)', p],
      ['x̄', mean(xs)],
      ['n', xs.length],
    ],
  };
}

/** One-sample two-sided t test. */
export function tTest(xs: number[], mu0: number): Table {
  needData(xs, 2);
  const df = xs.length - 1;
  const t = (mean(xs) - mu0) / (sampleStd(xs) / Math.sqrt(xs.length));
  const p = 2 * (1 - tCdf(Math.abs(t), df));
  return {
    columns: ['', 'Value'],
    rows: [
      ['t', t],
      ['p (two-sided)', p],
      ['df', df],
      ['x̄', mean(xs)],
      ['s', sampleStd(xs)],
    ],
  };
}
