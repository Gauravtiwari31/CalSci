import { jStat } from 'jstat';
import { CalcError } from '../types';

const prob = (p: number) => {
  if (!(p > 0 && p < 1)) throw new CalcError('Probability must be strictly between 0 and 1');
  return p;
};
const positive = (x: number, name: string) => {
  if (!(x > 0)) throw new CalcError(`${name} must be positive`);
  return x;
};
const wholeNonNeg = (x: number, name: string) => {
  if (!Number.isInteger(x) || x < 0) throw new CalcError(`${name} must be a whole number ≥ 0`);
  return x;
};

export const normalPdf = (x: number, mu = 0, sigma = 1) => jStat.normal.pdf(x, mu, positive(sigma, 'σ'));
export const normalCdf = (x: number, mu = 0, sigma = 1) => jStat.normal.cdf(x, mu, positive(sigma, 'σ'));
export const normalInv = (p: number, mu = 0, sigma = 1) =>
  jStat.normal.inv(prob(p), mu, positive(sigma, 'σ'));

export const tPdf = (x: number, df: number) => jStat.studentt.pdf(x, positive(df, 'Degrees of freedom'));
/**
 * jStat's t CDF loses ~1e-9 near t = 0 (incomplete beta at x → 1). For |t| < √df use
 * the symmetric form 0.5 ± ½·I(t²/(df+t²); ½, df/2), which keeps x small.
 */
export const tCdf = (x: number, df: number) => {
  positive(df, 'Degrees of freedom');
  if (x * x < df) {
    const half = 0.5 * jStat.ibeta((x * x) / (df + x * x), 0.5, df / 2);
    return x >= 0 ? 0.5 + half : 0.5 - half;
  }
  return jStat.studentt.cdf(x, df);
};
export const tInv = (p: number, df: number) =>
  jStat.studentt.inv(prob(p), positive(df, 'Degrees of freedom'));

export const chi2Pdf = (x: number, df: number) => jStat.chisquare.pdf(x, positive(df, 'Degrees of freedom'));
export const chi2Cdf = (x: number, df: number) => jStat.chisquare.cdf(x, positive(df, 'Degrees of freedom'));
export const chi2Inv = (p: number, df: number) =>
  jStat.chisquare.inv(prob(p), positive(df, 'Degrees of freedom'));

const checkP = (p: number) => {
  if (!(p >= 0 && p <= 1)) throw new CalcError('Probability must be between 0 and 1');
  return p;
};
export const binomPdf = (k: number, n: number, p: number) =>
  jStat.binomial.pdf(wholeNonNeg(k, 'k'), wholeNonNeg(n, 'n'), checkP(p));
export const binomCdf = (k: number, n: number, p: number) =>
  jStat.binomial.cdf(wholeNonNeg(k, 'k'), wholeNonNeg(n, 'n'), checkP(p));
export const poissonPdf = (k: number, lambda: number) =>
  jStat.poisson.pdf(wholeNonNeg(k, 'k'), positive(lambda, 'λ'));
export const poissonCdf = (k: number, lambda: number) =>
  jStat.poisson.cdf(wholeNonNeg(k, 'k'), positive(lambda, 'λ'));
