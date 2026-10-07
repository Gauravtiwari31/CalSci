import { beforeAll, describe, expect, it } from 'vitest';
import vectors from './vectors.json';
import { makeCalc } from '../helpers/context';
import { loadHandle } from '../helpers/node-cas';
import type { CalcSettings } from '../../src/engine/types';

interface Vector {
  latex: string;
  settings?: Partial<CalcSettings>;
  approx?: string;
  approxPrefix?: string;
  approxNumber?: number;
  approxText?: string;
  approxSet?: number[];
  exactInteger?: string;
  exactIncludes?: string;
  error?: string;
  precision?: 'double' | 'arbitrary';
  rates?: boolean;
}

/** Compare a decimal string with an expected value to 12 significant digits. */
function close(actual: string, expected: number) {
  const a = Number(actual.split(' ')[0]);
  const tol = Math.max(1e-11, Math.abs(expected) * 1e-11);
  expect(Math.abs(a - expected), `${actual} ≈ ${expected}`).toBeLessThanOrEqual(tol);
}

beforeAll(async () => {
  await loadHandle();
}, 120_000);

describe(`golden vectors (${vectors.length})`, () => {
  for (const vec of vectors as Vector[]) {
    const name = `${vec.latex}${vec.settings ? ` [${Object.values(vec.settings).join(',')}]` : ''}`;
    it(name, async () => {
      const calc = makeCalc({ angle: 'rad', ...vec.settings });
      if (vec.error) {
        await expect(calc.run(vec.latex)).rejects.toThrow(vec.error);
        return;
      }
      const r = await calc.run(vec.latex);
      if (vec.approx !== undefined) {
        const [n, ...unit] = vec.approx.split(' ');
        if (unit.length) {
          expect(r.approx.split(' ').slice(1).join(' ')).toBe(unit.join(' '));
          close(r.approx, Number(n));
        } else close(r.approx, Number(n));
      }
      if (vec.approxPrefix) expect(r.approx.startsWith(vec.approxPrefix), r.approx).toBe(true);
      if (vec.approxNumber !== undefined) close(r.approx, vec.approxNumber);
      if (vec.approxText)
        expect(r.approx.replace(/\s+/g, '') || r.approxLatex).toBe(vec.approxText.replace(/\s+/g, ''));
      if (vec.approxSet) {
        const got = r.approx
          .split(',')
          .map(Number)
          .sort((a, b) => a - b);
        expect(got).toHaveLength(vec.approxSet.length);
        got.forEach((g, i) => close(String(g), [...vec.approxSet!].sort((a, b) => a - b)[i]));
      }
      if (vec.exactInteger) expect(r.approx).toBe(vec.exactInteger);
      if (vec.exactIncludes)
        expect((r.exactLatex ?? r.approxLatex).replace(/\s+/g, '')).toContain(vec.exactIncludes);
      if (vec.precision) expect(r.precision).toBe(vec.precision);
      if (vec.rates) expect(r.ratesDate).toBeTruthy();
    });
  }
});
