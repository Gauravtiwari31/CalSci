// Compute Engine adapter: LaTeX ↔ MathJSON and the fast symbolic tier.
import { ComputeEngine } from '@cortex-js/compute-engine';
import { CalcError, type AngleMode, type MathJson } from '../types';

/**
 * Lower-case names CalSci gives meaning to. Declared as functions so that
 * `\operatorname{lu}\left(M\right)` parses as an application, not lu × M.
 */
export const DECLARED_FUNCTIONS = [
  'solve',
  'series',
  'taylor',
  'dsolve',
  'laplace',
  'simplify',
  'expand',
  'factor',
  'diff',
  'lu',
  'qr',
  'eig',
  'lsolve',
  'lstsq',
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
  'std',
  'sum',
  'count',
  'nPr',
  'nCr',
];

/** Prefix for symbols that Compute Engine's parser identified as units. */
export const UNIT_PREFIX = 'U__';

let engine: ComputeEngine | null = null;
export function ce(): ComputeEngine {
  if (!engine) {
    engine = new ComputeEngine();
    for (const name of DECLARED_FUNCTIONS) {
      try {
        engine.declare(name, 'function');
      } catch {
        /* already defined by Compute Engine */
      }
    }
  }
  return engine;
}

/** Replace CE's `["__unit__", …]` markers with `U__name` symbols that survive canonicalization. */
function markUnits(json: MathJson): MathJson {
  if (!Array.isArray(json)) return json;
  if (json[0] === '__unit__') {
    const markLeaf = (u: MathJson): MathJson => {
      if (typeof u === 'string') return `${UNIT_PREFIX}${u}`;
      if (Array.isArray(u))
        return [u[0], ...u.slice(1).map((x) => (typeof x === 'string' ? markLeaf(x) : x))];
      return u;
    };
    return markLeaf(json[1]);
  }
  return json.map(markUnits);
}

/** Run with a fresh lexical scope so inferred symbol types never leak between evaluations. */
function scoped<T>(angle: AngleMode, fn: (c: ComputeEngine) => T): T {
  const c = ce();
  const prev = c.angularUnit;
  c.angularUnit = angle;
  c.pushScope();
  try {
    return fn(c);
  } finally {
    c.popScope();
    c.angularUnit = prev;
  }
}

export function containsHead(json: MathJson, heads: Set<string> | string): boolean {
  const set = typeof heads === 'string' ? new Set([heads]) : heads;
  if (Array.isArray(json)) {
    if (typeof json[0] === 'string' && set.has(json[0])) return true;
    return json.slice(1).some((a) => containsHead(a, set));
  }
  if (json && typeof json === 'object' && 'fn' in (json as object))
    return containsHead((json as { fn: MathJson }).fn, set);
  return false;
}

/** Parse LaTeX into canonical MathJSON. Throws a readable error on syntax problems. */
export function parseLatex(latex: string): MathJson {
  const json = scoped('rad', (c) => {
    const raw = c.parse(latex, { form: 'raw' }).json;
    return c.box(markUnits(raw) as any).json;
  });
  if (containsHead(json, 'Error')) {
    throw new CalcError("Couldn't read that expression. Check for a missing operand or bracket.", 'parse');
  }
  return json;
}

export function toLatex(json: MathJson): string {
  return scoped('rad', (c) => c.box(json as any).latex);
}

const NUMERIC_LITERAL = (j: MathJson) =>
  typeof j === 'number' ||
  (j !== null && typeof j === 'object' && !Array.isArray(j) && 'num' in (j as object));

/**
 * Exact evaluation (√2/2, 1/3, π/4). Returns null when the exact form is not
 * worth showing: a plain number, an unevaluated copy of the input, or too long.
 */
export function exactForm(json: MathJson, angle: AngleMode): { json: MathJson; latex: string } | null {
  try {
    return scoped(angle, (c) => {
      const input = c.box(json as any);
      const r = input.evaluate();
      const rj = r.json;
      if (NUMERIC_LITERAL(rj) || containsHead(rj, 'Error')) return null;
      if (r.isNumber === false) return null;
      if (
        containsHead(
          rj,
          new Set(['Sin', 'Cos', 'Tan', 'Ln', 'Log', 'Arcsin', 'Arccos', 'Arctan', 'Integrate', 'Limit']),
        )
      )
        return null;
      const latex = r.latex;
      if (latex.length > 80) return null;
      return { json: rj, latex };
    });
  } catch {
    return null;
  }
}

export type CeOp = 'simplify' | 'expand' | 'factor' | 'eval' | 'solve';

/** Fast symbolic tier. Throws when Compute Engine can't produce a closed form. */
export function ceSymbolic(
  op: CeOp,
  json: MathJson,
  angle: AngleMode = 'rad',
): { json: MathJson; latex: string; approx?: string } {
  return scoped(angle, (c) => {
    const expr = c.box(json as any);
    let r;
    switch (op) {
      case 'simplify':
        r = expr.simplify();
        break;
      case 'expand':
        r = c.box(['Expand', json as any]).evaluate();
        break;
      case 'factor':
        r = c.box(['Factor', json as any]).evaluate();
        break;
      case 'solve': {
        const unknowns = expr.unknowns;
        if (unknowns.length !== 1)
          throw new CalcError('Compute Engine solves one unknown at a time', 'ce-solve');
        const sols = expr.solve(unknowns[0]);
        if (!sols || !Array.isArray(sols) || sols.length === 0)
          throw new CalcError('No solution found', 'no-solution');
        const v = unknowns[0];
        const latex = sols.map((s: any) => `${v}=${s.latex}`).join(',\\; ');
        const approx = sols.map((s: any) => s.N().toString()).join(', ');
        return { json: null, latex, approx };
      }
      default:
        r = expr.evaluate();
    }
    const rj = r.json;
    if (containsHead(rj, new Set(['Error', 'Integrate', 'Limit', 'D']))) {
      throw new CalcError('Compute Engine has no closed form for this', 'ce-unevaluated');
    }
    let approx: string | undefined;
    if (r.unknowns.length === 0 && !NUMERIC_LITERAL(rj)) {
      try {
        const n = r.N();
        if (NUMERIC_LITERAL(n.json)) approx = n.toString();
      } catch {
        /* no numeric value */
      }
    } else if (NUMERIC_LITERAL(rj)) {
      approx = r.toString();
    }
    return { json: rj, latex: r.latex, approx };
  });
}

/** Free symbols, excluding bound variables of Sum/Integrate/Function etc. */
export function freeSymbols(json: MathJson): Set<string> {
  const out = new Set<string>();
  const walk = (node: MathJson, bound: Set<string>) => {
    if (typeof node === 'string') {
      if (!node.startsWith("'") && !node.startsWith(UNIT_PREFIX) && !bound.has(node)) out.add(node);
      return;
    }
    if (node && typeof node === 'object' && !Array.isArray(node)) {
      const o = node as Record<string, MathJson>;
      if (typeof o.sym === 'string') walk(o.sym, bound);
      if (Array.isArray(o.fn)) walk(o.fn, bound);
      return;
    }
    if (!Array.isArray(node) || node.length === 0) return;
    const [head, ...args] = node;
    if (head === 'Function') {
      const inner = new Set([...bound, ...(args.slice(1).filter((a) => typeof a === 'string') as string[])]);
      walk(args[0], inner);
      return;
    }
    if (head === 'Quantity') {
      walk(args[0], bound);
      return;
    }
    if (head === 'Limits' && typeof args[0] === 'string') {
      args.slice(1).forEach((a) => walk(a, bound));
      return;
    }
    if (
      (head === 'Sum' || head === 'Product' || head === 'Integrate') &&
      Array.isArray(args[1]) &&
      args[1][0] === 'Limits'
    ) {
      const v = args[1][1];
      const inner = typeof v === 'string' ? new Set([...bound, v]) : bound;
      walk(args[0], inner);
      walk(args[1], bound);
      return;
    }
    if (head === 'Limit' || head === 'D') {
      // Limit(Function(...)) binds through Function; D(f, x) differentiates by x.
      walk(args[0], bound);
      if (head === 'Limit') args.slice(1).forEach((a) => walk(a, bound));
      return;
    }
    if (typeof head !== 'string') walk(head, bound);
    args.forEach((a) => walk(a, bound));
  };
  walk(json, new Set());
  return out;
}

/** Replace symbols (not heads) according to `map`. */
export function substitute(json: MathJson, map: Map<string, MathJson>): MathJson {
  if (typeof json === 'string') return map.has(json) ? map.get(json) : json;
  if (Array.isArray(json)) {
    const [head, ...args] = json;
    if (head === 'Function') {
      // Bound parameters shadow outer names.
      const inner = new Map(map);
      args.slice(1).forEach((p) => typeof p === 'string' && inner.delete(p));
      return [head, substitute(args[0], inner), ...args.slice(1)];
    }
    if (
      (head === 'Sum' || head === 'Product' || head === 'Integrate') &&
      Array.isArray(args[1]) &&
      args[1][0] === 'Limits'
    ) {
      const inner = new Map(map);
      inner.delete(args[1][1] as string);
      return [head, substitute(args[0], inner), substitute(args[1], inner), ...args.slice(2)];
    }
    return [head, ...args.map((a) => substitute(a, map))];
  }
  return json;
}
