import { all, create, type MathJsInstance } from 'mathjs';
import * as fin from '../finance';
import * as st from '../stats';
import { CalcError, type Table } from '../types';

/** Tagged results produced by the custom functions below. */
export interface TableValue {
  __table: Table;
}
export interface MultiValue {
  __multi: { label: string; value: unknown }[];
}
export const isTable = (v: unknown): v is TableValue => typeof v === 'object' && v !== null && '__table' in v;
export const isMulti = (v: unknown): v is MultiValue => typeof v === 'object' && v !== null && '__multi' in v;

/** Which kinds of custom function an evaluation touched. Reset per evaluation. */
export interface UsageFlags {
  double: boolean;
  finance: boolean;
  stats: boolean;
}

export interface CalcMath {
  math: MathJsInstance;
  mode: 'BigNumber' | 'number';
  flags: UsageFlags;
  /** Kept outside the expression namespace, which has createUnit disabled. */
  createUnit: MathJsInstance['createUnit'];
  evaluate: (expr: string, scope?: Map<string, unknown>) => unknown;
}

export const FINANCE_FUNCTIONS = new Set([
  'fv',
  'pv',
  'pmt',
  'nper',
  'rate',
  'npv',
  'irr',
  'cagr',
  'amort',
  'bs',
  'bscall',
  'bsput',
  'bondprice',
  'duration',
  'mduration',
  'convexity',
]);
export const STATS_FUNCTIONS = new Set([
  'normpdf',
  'normcdf',
  'norminv',
  'tpdf',
  'tcdf',
  'tinv',
  'chi2pdf',
  'chi2cdf',
  'chi2inv',
  'binompdf',
  'binomcdf',
  'poisspdf',
  'poisscdf',
  'linreg',
  'corr',
  'ztest',
  'ttest',
  'pstd',
  'pvar',
]);
export const MATRIX_FUNCTIONS = new Set(['rank', 'lu', 'qr', 'eig', 'lstsq']);

export function createCalcMath(mode: 'BigNumber' | 'number', precision = 64): CalcMath {
  const math = create(all, mode === 'BigNumber' ? { number: 'BigNumber', precision } : { number: 'number' });
  const flags: UsageFlags = { double: false, finance: false, stats: false };
  // Built-ins that custom functions below shadow; keep the originals (math.js calls them internally).
  const qrBuiltin = math.qr;

  const toNum = (x: unknown): number => {
    if (typeof x === 'number') return x;
    if (math.isBigNumber(x)) return Number(x.toString());
    if (typeof x === 'boolean') return x ? 1 : 0;
    if (math.isFraction(x)) return Number(x.valueOf());
    throw new CalcError('Expected a real number');
  };
  const toList = (x: unknown): number[] => {
    if (math.isMatrix(x)) return toList(x.toArray());
    if (Array.isArray(x)) return (x.flat(Infinity) as unknown[]).map(toNum);
    throw new CalcError('Expected a list of numbers, like [1, 2, 3]');
  };
  const out = (n: number) => {
    if (!Number.isFinite(n)) {
      if (Number.isNaN(n)) throw new CalcError('Result is undefined for these inputs');
    }
    return mode === 'BigNumber' && Number.isFinite(n) ? math.bignumber(String(n)) : n;
  };
  const table = (t: Table): TableValue => ({ __table: t });
  const toArray2D = (A: unknown): number[][] => {
    const arr = math.isMatrix(A) ? (A.toArray() as unknown[]) : (A as unknown[]);
    if (!Array.isArray(arr)) throw new CalcError('Expected a matrix');
    return arr.map((row) => (Array.isArray(row) ? row.map(toNum) : [toNum(row)]));
  };

  /** Wrap a plain numeric function: converts args, marks double precision. */
  const fn =
    (kind: 'finance' | 'stats', f: (...a: number[]) => number) =>
    (...args: unknown[]) => {
      flags.double = true;
      flags[kind] = true;
      return out(f(...args.map(toNum)));
    };

  const timing = (t: unknown) => (t === undefined ? 0 : (toNum(t) as 0 | 1));

  const custom: Record<string, (...a: any[]) => unknown> = {
    // Finance (§5.6)
    fv: fn('finance', (r, n, p, v = 0, t = 0) => fin.fv(r, n, p, v, timing(t))),
    pv: fn('finance', (r, n, p, f = 0, t = 0) => fin.pv(r, n, p, f, timing(t))),
    pmt: fn('finance', (r, n, v, f = 0, t = 0) => fin.pmt(r, n, v, f, timing(t))),
    nper: fn('finance', (r, p, v, f = 0, t = 0) => fin.nper(r, p, v, f, timing(t))),
    rate: fn('finance', (n, p, v, f = 0, t = 0) => fin.rate(n, p, v, f, timing(t))),
    cagr: fn('finance', fin.cagr),
    npv: (r: unknown, ...flows: unknown[]) => {
      flags.double = flags.finance = true;
      return out(fin.npv(toNum(r), flows.flatMap(toListOrNum)));
    },
    irr: (...flows: unknown[]) => {
      flags.double = flags.finance = true;
      return out(fin.irr(flows.flatMap(toListOrNum)));
    },
    amort: (p: unknown, r: unknown, n: unknown) => {
      flags.double = flags.finance = true;
      return table(fin.amortization(toNum(p), toNum(r), toNum(n)));
    },
    bscall: (...a: unknown[]) => bsTable('call', a),
    bsput: (...a: unknown[]) => bsTable('put', a),
    bs: (...a: unknown[]) => bsTable('call', a),
    bondprice: fn('finance', (f, c, y, n, q = 2) => fin.bondPrice(f, c, y, n, q)),
    duration: fn('finance', (f, c, y, n, q = 2) => fin.macaulayDuration(f, c, y, n, q)),
    mduration: fn('finance', (f, c, y, n, q = 2) => fin.modifiedDuration(f, c, y, n, q)),
    convexity: fn('finance', (f, c, y, n, q = 2) => fin.convexity(f, c, y, n, q)),

    // Distributions and tests (jStat)
    normpdf: fn('stats', (x, m = 0, s = 1) => st.normalPdf(x, m, s)),
    normcdf: fn('stats', (x, m = 0, s = 1) => st.normalCdf(x, m, s)),
    norminv: fn('stats', (p, m = 0, s = 1) => st.normalInv(p, m, s)),
    tpdf: fn('stats', st.tPdf),
    tcdf: fn('stats', st.tCdf),
    tinv: fn('stats', st.tInv),
    chi2pdf: fn('stats', st.chi2Pdf),
    chi2cdf: fn('stats', st.chi2Cdf),
    chi2inv: fn('stats', st.chi2Inv),
    binompdf: fn('stats', st.binomPdf),
    binomcdf: fn('stats', st.binomCdf),
    poisspdf: fn('stats', st.poissonPdf),
    poisscdf: fn('stats', st.poissonCdf),
    linreg: (xs: unknown, ys: unknown) => {
      flags.double = flags.stats = true;
      return table(st.linreg(toList(xs), toList(ys)));
    },
    corr: (xs: unknown, ys: unknown) => {
      flags.double = flags.stats = true;
      return out(st.correlation(toList(xs), toList(ys)));
    },
    ztest: (xs: unknown, mu: unknown, s: unknown) => {
      flags.double = flags.stats = true;
      return table(st.zTest(toList(xs), toNum(mu), toNum(s)));
    },
    ttest: (xs: unknown, mu: unknown) => {
      flags.double = flags.stats = true;
      return table(st.tTest(toList(xs), toNum(mu)));
    },
    // Population σ and variance stay in arbitrary precision via math.js.
    pstd: (...xs: unknown[]) => math.std(flattenArgs(xs) as any, 'uncorrected'),
    pvar: (...xs: unknown[]) => math.variance(flattenArgs(xs) as any, 'uncorrected'),

    // Matrix extras
    rank: (A: unknown) => out(matrixRank(toArray2D(A))),
    lu: (A: unknown) => {
      const r = math.lup(A as any);
      const P = math.zeros(r.p.length, r.p.length, 'dense') as any;
      // math.js: original row k lands at row p[k] of L·U, so P[p[k]][k] = 1 and P·A = L·U.
      r.p.forEach((dest: number, k: number) => P.set([dest, k], 1));
      return {
        __multi: [
          { label: 'L', value: r.L },
          { label: 'U', value: r.U },
          { label: 'P', value: P },
        ],
      };
    },
    qr: (A: unknown) => {
      const r = qrBuiltin(A as any);
      return {
        __multi: [
          { label: 'Q', value: r.Q },
          { label: 'R', value: r.R },
        ],
      };
    },
    eig: (A: unknown) => {
      const r = math.eigs(A as any) as any;
      const vectors = (r.eigenvectors ?? []).map((e: any) => e.vector);
      const items: { label: string; value: unknown }[] = [{ label: 'λ', value: r.values }];
      if (vectors.length)
        items.push({
          label: 'V',
          value: math.transpose(math.matrix(vectors.map((v: any) => (math.isMatrix(v) ? v.toArray() : v)))),
        });
      return { __multi: items };
    },
    lstsq: (A: unknown, b: unknown) => {
      const At = math.transpose(A as any);
      return math.lusolve(math.multiply(At, A as any) as any, math.multiply(At, b as any) as any);
    },
    nPr: (n: unknown, k: unknown) => math.permutations(n as any, k as any),
    // Trig results below rounding noise relative to the argument are exactly zero (cos 90°, sin π).
    chopTrig: (result: unknown, arg: unknown) => {
      // Compare directly: math.smaller treats tiny values as equal (absTol).
      if (math.isBigNumber(result)) {
        const a = math.isBigNumber(arg) ? arg.abs() : math.bignumber(Math.abs(toNum(arg)));
        return result.abs().lt(a.times(`1e-${Math.max(8, precision - 8)}`)) ? math.bignumber(0) : result;
      }
      if (typeof result === 'number') return Math.abs(result) < Math.abs(toNum(arg)) * 1e-13 ? 0 : result;
      return result;
    },
    nCr: (n: unknown, k: unknown) => math.combinations(n as any, k as any),
  };

  function toListOrNum(x: unknown): number[] {
    return math.isMatrix(x) || Array.isArray(x) ? toList(x) : [toNum(x)];
  }
  function flattenArgs(xs: unknown[]): unknown[] {
    return xs.flatMap((x) =>
      math.isMatrix(x)
        ? (x.toArray() as unknown[]).flat(Infinity)
        : Array.isArray(x)
          ? x.flat(Infinity)
          : [x],
    );
  }
  function bsTable(type: 'call' | 'put', a: unknown[]): TableValue {
    flags.double = flags.finance = true;
    const [S, K, T, r, sigma] = a.map(toNum);
    const g = fin.blackScholes(S, K, T, r, sigma, type);
    return table({
      columns: ['', type === 'call' ? 'Call' : 'Put'],
      rows: [
        ['Price', g.price],
        ['Δ delta', g.delta],
        ['Γ gamma', g.gamma],
        ['Θ theta /yr', g.theta],
        ['ν vega', g.vega],
        ['ρ rho', g.rho],
      ],
    });
  }

  const createUnit = math.createUnit.bind(math) as MathJsInstance['createUnit'];
  const inv = math.inv;
  custom.inv = (A: unknown) => {
    if ((math.isMatrix(A) || Array.isArray(A)) && math.equal(math.det(A as any), 0)) {
      throw new CalcError('Matrix is singular (determinant is zero), so it has no inverse.', 'singular');
    }
    return inv(A as any);
  };
  math.import(custom, { override: true });

  // Defence in depth (math.js security guidance): the serializer only emits
  // allowlisted names, and these are disabled in the expression namespace anyway.
  const evaluate = math.evaluate.bind(math);
  const blocked = (name: string) => () => {
    throw new CalcError(`${name} is disabled`);
  };
  math.import(
    {
      import: blocked('import'),
      createUnit: blocked('createUnit'),
      evaluate: blocked('evaluate'),
      parse: blocked('parse'),
      compile: blocked('compile'),
      simplify: blocked('simplify'),
      derivative: blocked('derivative'),
      resolve: blocked('resolve'),
      reviver: blocked('reviver'),
    },
    { override: true },
  );

  return { math, mode, flags, createUnit, evaluate: (expr, scope) => evaluate(expr, scope ?? new Map()) };
}

/** Numerical rank by Gaussian elimination with partial pivoting. */
export function matrixRank(A: number[][]): number {
  const m = A.map((r) => [...r]);
  const rows = m.length;
  const cols = rows ? m[0].length : 0;
  const scale = Math.max(1, ...m.flat().map(Math.abs));
  const tol = Math.max(rows, cols) * Number.EPSILON * scale * 16;
  let rank = 0;
  for (let c = 0; c < cols && rank < rows; c++) {
    let p = rank;
    for (let r = rank + 1; r < rows; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    if (Math.abs(m[p][c]) <= tol) continue;
    [m[rank], m[p]] = [m[p], m[rank]];
    for (let r = rank + 1; r < rows; r++) {
      const f = m[r][c] / m[rank][c];
      for (let k = c; k < cols; k++) m[r][k] -= f * m[rank][k];
    }
    rank++;
  }
  return rank;
}
