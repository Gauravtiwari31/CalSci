import { describe, expect, it } from 'vitest';
import * as st from '../../src/engine/stats';

describe('stats', () => {
  const xs = [2, 4, 4, 4, 5, 5, 7, 9];
  it('mean / variance / std', () => {
    expect(st.mean(xs)).toBe(5);
    expect(st.populationStd(xs)).toBeCloseTo(2, 12);
    expect(st.sampleVariance(xs)).toBeCloseTo(32 / 7, 12);
  });
  it('distributions', () => {
    expect(st.normalCdf(1.96)).toBeCloseTo(0.9750021, 7);
    expect(st.normalInv(0.975)).toBeCloseTo(1.959964, 6);
    expect(st.tInv(0.975, 10)).toBeCloseTo(2.228139, 6);
    expect(st.chi2Cdf(3.841459, 1)).toBeCloseTo(0.95, 6);
    expect(st.binomPdf(2, 5, 0.5)).toBeCloseTo(0.3125, 12);
    expect(st.poissonCdf(2, 3)).toBeCloseTo(0.4231901, 7);
  });
  it('argument checks', () => {
    expect(() => st.normalInv(1.5)).toThrow(/between 0 and 1/);
    expect(() => st.binomPdf(2.5, 5, 0.5)).toThrow(/whole number/);
  });
  it('linear regression', () => {
    const t = st.linreg([1, 2, 3, 4], [3, 5, 7, 9]);
    expect(t.rows[0][1]).toBeCloseTo(2, 12);
    expect(t.rows[1][1]).toBeCloseTo(1, 12);
    expect(t.rows[3][1]).toBeCloseTo(1, 12);
  });
  it('t test', () => {
    const t = st.tTest([5.1, 4.9, 5.3, 5.0, 4.8], 5);
    expect(t.rows[0][1]).toBeCloseTo(0.2324953, 6);
    expect(t.rows[2][1]).toBe(4);
  });
  it('mismatched lists', () => expect(() => st.correlation([1, 2, 3], [1, 2])).toThrow(/different lengths/));
});
