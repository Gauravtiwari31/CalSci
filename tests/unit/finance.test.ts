import { describe, expect, it } from 'vitest';
import * as f from '../../src/engine/finance';

// Reference values from spreadsheet functions (Excel / LibreOffice) and textbook examples.
describe('time value of money', () => {
  it('pmt', () => expect(f.pmt(0.05 / 12, 360, 300000)).toBeCloseTo(-1610.4648690364, 8));
  it('pmt with zero rate', () => expect(f.pmt(0, 10, 1000)).toBeCloseTo(-100, 10));
  it('pmt at period start', () => expect(f.pmt(0.01, 12, 1000, 0, 1)).toBeCloseTo(-87.9693, 3));
  it('fv', () => expect(f.fv(0.06 / 12, 120, -100)).toBeCloseTo(16387.9347, 3));
  it('pv', () => expect(f.pv(0.08 / 12, 240, 500)).toBeCloseTo(-59777.1458, 3));
  it('nper', () => expect(f.nper(0.01, -100, -1000, 10000)).toBeCloseTo(60.0821228538, 8));
  it('nper at period start', () => expect(f.nper(0.01, -100, -1000, 10000, 1)).toBeCloseTo(59.6738656742, 8));
  it('rate', () => expect(f.rate(48, -200, 8000)).toBeCloseTo(0.0077014724, 9));
  it('pv and fv are inverse', () => {
    const v = f.fv(0.004, 60, -250, -1000);
    expect(f.pv(0.004, 60, -250, v)).toBeCloseTo(-1000, 8);
  });
});

describe('npv / irr / cagr', () => {
  it('npv (spreadsheet example)', () =>
    expect(f.npv(0.1, [-10000, 3000, 4200, 6800])).toBeCloseTo(1188.4434, 3));
  it('irr (spreadsheet example)', () =>
    expect(f.irr([-70000, 12000, 15000, 18000, 21000, 26000])).toBeCloseTo(0.086631, 5));
  it('irr makes npv zero', () => {
    const cfs = [-100, 30, 40, 50];
    const r = f.irr(cfs);
    expect(cfs.reduce((a, c, i) => a + c / (1 + r) ** i, 0)).toBeCloseTo(0, 9);
  });
  it('irr errors without a sign change', () =>
    expect(() => f.irr([100, 200])).toThrow(/negative and one positive/));
  it('cagr', () => expect(f.cagr(1000, 2000, 5)).toBeCloseTo(0.148698355, 8));
  it('amortization ends at zero and sums to principal', () => {
    const t = f.amortization(10000, 0.01, 12);
    expect(t.rows).toHaveLength(12);
    expect(t.rows.at(-1)![4]).toBe(0);
    const principal = t.rows.reduce((a, r) => a + (r[3] as number), 0);
    expect(principal).toBeCloseTo(10000, 0);
  });
});

describe('Black–Scholes', () => {
  const call = f.blackScholes(100, 100, 1, 0.05, 0.2, 'call');
  const put = f.blackScholes(100, 100, 1, 0.05, 0.2, 'put');
  it('prices', () => {
    expect(call.price).toBeCloseTo(10.4506, 4);
    expect(put.price).toBeCloseTo(5.5735, 4);
  });
  it('put–call parity', () => expect(call.price - put.price).toBeCloseTo(100 - 100 * Math.exp(-0.05), 10));
  it('greeks', () => {
    expect(call.delta).toBeCloseTo(0.63683, 5);
    expect(put.delta).toBeCloseTo(-0.36317, 5);
    expect(call.gamma).toBeCloseTo(0.018762, 6);
    expect(call.vega).toBeCloseTo(37.524, 3);
    expect(call.theta).toBeCloseTo(-6.414, 3);
    expect(call.rho).toBeCloseTo(53.232, 3);
  });
});

describe('bonds', () => {
  it('price below par when yield > coupon', () =>
    expect(f.bondPrice(1000, 0.05, 0.06, 10, 2)).toBeCloseTo(925.6126, 3));
  it('par bond prices at par', () => expect(f.bondPrice(100, 0.1, 0.1, 3, 1)).toBeCloseTo(100, 10));
  it('Macaulay and modified duration (textbook 3-year 10% bond)', () => {
    expect(f.macaulayDuration(100, 0.1, 0.1, 3, 1)).toBeCloseTo(2.73554, 5);
    expect(f.modifiedDuration(100, 0.1, 0.1, 3, 1)).toBeCloseTo(2.48685, 5);
  });
  it('convexity', () => expect(f.convexity(100, 0.1, 0.1, 3, 1)).toBeCloseTo(8.7563, 3));
  it('rejects odd frequencies', () => expect(() => f.bondPrice(100, 0.05, 0.05, 5, 3)).toThrow(/frequency/));
});
