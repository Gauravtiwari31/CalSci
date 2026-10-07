import fc from 'fast-check';
import { all, create } from 'mathjs';
import { beforeAll, describe, expect, it } from 'vitest';
import { ce } from '../../src/engine/symbolic';
import { makeCalc } from '../helpers/context';
import { loadHandle, nodeCas } from '../helpers/node-cas';

const math = create(all);

// ------------------------------------------------------------ random expressions

type Expr = { latex: string; json: unknown };
const coef = fc.integer({ min: -5, max: 5 }).filter((c) => c !== 0);
const term: fc.Arbitrary<Expr> = fc.oneof(
  fc
    .tuple(coef, fc.integer({ min: 0, max: 4 }))
    .map(([c, n]) => ({ latex: `${c}x^{${n}}`, json: ['Multiply', c, ['Power', 'x', n]] })),
  fc.tuple(coef, fc.constantFrom('Sin', 'Cos', 'Exp')).map(([c, f]) => ({
    latex: `${c}\\${f.toLowerCase()}(x)`,
    json: ['Multiply', c, [f, 'x']],
  })),
);
const expr = fc.array(term, { minLength: 1, maxLength: 3 }).map((ts) => ({
  latex: ts.map((t) => t.latex).join('+'),
  json: ['Add', ...ts.map((t) => t.json)],
}));

/** Evaluate a MathJSON expression at x numerically with Compute Engine. */
function at(json: unknown, x: number): number {
  const e = ce()
    .box(json as any)
    .subs({ x });
  return Number(e.N().re);
}

beforeAll(async () => {
  await loadHandle();
}, 120_000);

describe('calculus properties', () => {
  it('d/dx ∫ f dx ≈ f at random points (SymPy integrates, Compute Engine differentiates)', async () => {
    await fc.assert(
      fc.asyncProperty(expr, fc.double({ min: -2, max: 2, noNaN: true }), async (f, x) => {
        const res = await nodeCas.request({
          op: 'integrate',
          args: [['Integrate', f.json, ['Limits', 'x', 'Nothing', 'Nothing']]],
          timeoutMs: 10_000,
        });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        const F = ce().parse(res.latex).json;
        const dF = ce()
          .box(['D', F as any, 'x'])
          .evaluate().json;
        const lhs = at(dF, x);
        const rhs = at(f.json, x);
        expect(Math.abs(lhs - rhs)).toBeLessThan(1e-8 * Math.max(1, Math.abs(rhs)));
      }),
      { numRuns: 25 },
    );
  });

  it('Compute Engine and SymPy derivatives agree numerically (differential test)', async () => {
    await fc.assert(
      fc.asyncProperty(expr, fc.double({ min: -2, max: 2, noNaN: true }), async (f, x) => {
        const ceD = ce()
          .box(['D', f.json as any, 'x'])
          .evaluate().json;
        const sp = await nodeCas.request({ op: 'diff', args: [f.json, 'x'], timeoutMs: 10_000 });
        expect(sp.ok).toBe(true);
        if (!sp.ok) return;
        const spD = ce().parse(sp.latex).json;
        expect(Math.abs(at(ceD, x) - at(spD, x))).toBeLessThan(1e-9 * Math.max(1, Math.abs(at(spD, x))));
      }),
      { numRuns: 25 },
    );
  });
});

// ------------------------------------------------------------------ matrices

const matrix = (n: number) =>
  fc.array(fc.array(fc.integer({ min: -9, max: 9 }), { minLength: n, maxLength: n }), {
    minLength: n,
    maxLength: n,
  });
const sized = fc.integer({ min: 2, max: 6 }).chain(matrix);
const maxAbsDiff = (a: number[][], b: number[][]) =>
  Math.max(...a.flatMap((r, i) => r.map((v, j) => Math.abs(v - b[i][j]))));

describe('matrix decompositions', () => {
  it('P·A = L·U (partial pivoting) reconstructs A', () => {
    fc.assert(
      fc.property(sized, (A) => {
        const { L, U, p } = math.lup(A) as unknown as { L: number[][]; U: number[][]; p: number[] };
        const PA: number[][] = [];
        p.forEach((dest, k) => (PA[dest] = A[k]));
        expect(maxAbsDiff(math.multiply(L, U) as number[][], PA)).toBeLessThan(1e-9);
      }),
      { numRuns: 200 },
    );
  });
  it('A = Q·R with Q orthogonal', () => {
    fc.assert(
      fc.property(sized, (A) => {
        const { Q, R } = math.qr(A) as unknown as { Q: number[][]; R: number[][] };
        expect(maxAbsDiff(math.multiply(Q, R) as number[][], A)).toBeLessThan(1e-9);
        const QtQ = math.multiply(math.transpose(Q), Q) as number[][];
        expect(maxAbsDiff(QtQ, math.identity(A.length).valueOf() as number[][])).toBeLessThan(1e-9);
      }),
      { numRuns: 200 },
    );
  });
  it('the calculator’s lu() gives P·A = L·U', () => {
    const { numeric } = makeCalc();
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 5 }).chain(matrix), (A) => {
        const out = numeric.evaluate(`lu(${JSON.stringify(A)})`, {});
        const parts = Object.fromEntries((out.value as any).__multi.map((p: any) => [p.label, p.value]));
        const m = out.inst.math;
        const diff = m.subtract(m.multiply(parts.P, A), m.multiply(parts.L, parts.U)) as any;
        expect(Number(m.max(m.abs(diff)).toString())).toBeLessThan(1e-9);
      }),
      { numRuns: 100 },
    );
  });
});

// --------------------------------------------------------------------- units

describe('unit round-trips', () => {
  const pairs: [string, string][] = [
    ['km', 'mi'],
    ['m', 'ft'],
    ['kg', 'lb'],
    ['h', 's'],
    ['L', 'gal'],
    ['J', 'kWh'],
    ['degC', 'degF'],
    ['K', 'degC'],
    ['USD', 'INR'],
    ['EUR', 'JPY'],
  ];
  it('x a to b to a ≈ x', async () => {
    const { run } = makeCalc();
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...pairs),
        fc.double({ min: 0.001, max: 1e6, noNaN: true }),
        async ([a, b], x) => {
          const v = x.toPrecision(10);
          const there = await run(`${v}\\,\\mathrm{${a}}\\operatorname{to}\\mathrm{${b}}`);
          const back = await run(
            `${there.approx.split(' ')[0]}\\,\\mathrm{${b}}\\operatorname{to}\\mathrm{${a}}`,
          );
          const got = Number(back.approx.split(' ')[0]);
          expect(Math.abs(got - Number(v))).toBeLessThan(1e-9 * Math.max(1, Math.abs(Number(v))));
        },
      ),
      { numRuns: 60 },
    );
  });
});
