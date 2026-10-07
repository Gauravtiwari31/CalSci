// Evaluation router (spec §5.2). Parses LaTeX to MathJSON, inspects the head
// and free symbols, and dispatches through an ordered route table.
import { formatDecimal, plainDecimal } from './format';
import { formatValue, type FormattedValue } from './numeric/format-value';
import type { NumericEngine } from './numeric';
import {
  FreeSymbolError,
  serializeToMathjs,
  SymbolicHeadError,
  SYMBOLIC_HEADS,
  type SerializeOptions,
} from './numeric/serialize';
import type { CasOp, CasRequest, CasResponse } from './sympy/client';
import {
  ceSymbolic,
  containsHead,
  exactForm,
  freeSymbols,
  parseLatex,
  substitute,
  toLatex,
  type CeOp,
} from './symbolic';
import {
  CalcError,
  type EngineName,
  type EvalContext,
  type EvalResult,
  type MathJson,
  type UserFunction,
  type Variable,
} from './types';

export interface CasLike {
  request(req: Omit<CasRequest, 'id'>): Promise<CasResponse>;
}

export interface NumericWorkerLike {
  evaluate(job: {
    text: string;
    scope: Record<string, string>;
    lists: Record<string, Float64Array>;
    format: {
      digits: number;
      grouping: EvalContext['settings']['grouping'];
      domain: EvalContext['settings']['domain'];
    };
  }): Promise<
    | { ok: true; formatted: FormattedValue; usedStats: boolean; usedFinance: boolean }
    | { ok: false; message: string; code: string }
  >;
}

export interface RouterDeps {
  numeric: NumericEngine;
  cas: CasLike;
  numericWorker?: NumericWorkerLike;
}

const CONSTANT_SYMBOLS = new Set([
  'Pi',
  'ExponentialE',
  'ImaginaryUnit',
  'PositiveInfinity',
  'NegativeInfinity',
  'ComplexInfinity',
  'Indeterminate',
  'Nothing',
  'Half',
  'True',
  'False',
  'NaN',
]);
const RESERVED_NAMES = new Set([...CONSTANT_SYMBOLS, 'Ans', 'e', 'i', 'pi']);
const IDENT = /^[A-Za-z][A-Za-z0-9_]*$/;
const BIG_LIST = 10_000;
const BIG_MATRIX = 50;

/**
 * “to” separates a unit conversion target. MathLive rewrites `\operatorname{to}` as
 * `\operatorname{\mathrm{to}}`, so accept one level of mathrm/text nesting and the
 * thin spaces around it.
 */
const SPACES = String.raw`(?:\\[,:;! ]|~|\s)*`;
const TO_SPLIT = new RegExp(
  `${SPACES}\\\\(?:operatorname|mathrm|text)\\{\\s*(?:\\\\(?:mathrm|text)\\{\\s*to\\s*\\}|to)\\s*\\}${SPACES}`,
  'g',
);

/** Thin spaces and empty groups MathLive leaves around inserted units. */
function tidyLatex(s: string): string {
  return s
    .replace(/\{\s*\}/g, '')
    .replace(/(?:\\[,:;! ]|~)+$/g, '')
    .replace(/^(?:\\[,:;! ]|~)+/g, '')
    .trim();
}

// ---------------------------------------------------------------- utilities

function head(json: MathJson): string | null {
  return Array.isArray(json) && typeof json[0] === 'string' ? json[0] : null;
}

function hasFloat(json: MathJson): boolean {
  if (typeof json === 'number') return !Number.isInteger(json);
  if (json && typeof json === 'object' && !Array.isArray(json) && 'num' in json)
    return /[.eE]/.test(String((json as any).num));
  return Array.isArray(json) && json.slice(1).some(hasFloat);
}

function maxMatrixDim(json: MathJson): number {
  if (!Array.isArray(json)) return 0;
  let m = 0;
  if (json[0] === 'Matrix' && Array.isArray(json[1])) {
    const rows = json[1].slice(1) as MathJson[][];
    m = Math.max(rows.length, ...rows.map((r) => (Array.isArray(r) ? r.length - 1 : 1)));
  }
  return Math.max(m, ...json.slice(1).map(maxMatrixDim));
}

function listSize(valueText: string): number {
  return valueText.length > 40_000 ? (valueText.match(/,/g)?.length ?? 0) + 1 : 0;
}

/** Inline user-defined functions: f(2) with f(x) := x² becomes 2². */
export function expandFunctions(json: MathJson, fns: Map<string, UserFunction>, depth = 0): MathJson {
  if (!Array.isArray(json)) return json;
  if (depth > 32)
    throw new CalcError(
      'Function definitions call each other too deeply (recursion is not supported)',
      'recursion',
    );
  const [h, ...args] = json;
  const expandedArgs = args.map((a) => expandFunctions(a, fns, depth));
  if (typeof h === 'string' && fns.has(h)) {
    const f = fns.get(h)!;
    if (expandedArgs.length !== f.params.length) {
      throw new CalcError(
        `${h} takes ${f.params.length} argument${f.params.length === 1 ? '' : 's'}, got ${expandedArgs.length}`,
        'arguments',
      );
    }
    const map = new Map<string, MathJson>(f.params.map((p, i) => [p, expandedArgs[i]]));
    return expandFunctions(substitute(f.body, map), fns, depth + 1);
  }
  return [h, ...expandedArgs];
}

function unwrapBlock(json: MathJson): MathJson {
  return Array.isArray(json) && json[0] === 'Block' && json.length === 2 ? json[1] : json;
}

function trimApprox(s?: string | null): string | undefined {
  if (!s) return undefined;
  if (/[a-zA-Z]/.test(s.replace(/e[+-]?\d+/g, ''))) return s; // symbolic remainder; leave as-is
  return s
    .split(',')
    .map((p) => plainDecimal(p.trim()))
    .join(', ');
}

// ------------------------------------------------------------------ routes

interface RouteInfo {
  json: MathJson;
  head: string | null;
  free: Set<string>;
  referenced: Variable[];
  toTarget: MathJson | null;
  bigData: boolean;
  ctx: EvalContext;
  deps: RouterDeps;
}

interface Route {
  name: string;
  match: (i: RouteInfo) => boolean;
  run: (i: RouteInfo) => Promise<EvalResult>;
}

const CAS_HEAVY = new Set(['Integrate', 'Limit', 'solve', 'series', 'taylor', 'laplace', 'dsolve']);
const CAS_FAST = new Set(['D', 'diff', 'simplify', 'expand', 'factor', 'Expand', 'Factor', 'Simplify']);

const isEquationSystem = (j: MathJson) =>
  Array.isArray(j) && j[0] === 'List' && j.length > 1 && j.slice(1).every((e) => head(e) === 'Equal');

/** Route table. Order matters; change it after measuring, not with if/else chains. */
export const ROUTES: Route[] = [
  {
    name: 'ode',
    match: (i) => i.head === 'dsolve' || containsHead(i.json, 'Prime'),
    run: (i) => {
      const eq = i.head === 'dsolve' ? (i.json as MathJson[])[1] : i.json;
      return viaSympy(i, 'dsolve', [eq], null);
    },
  },
  {
    name: 'cas-heavy',
    match: (i) =>
      (i.head !== null && CAS_HEAVY.has(i.head)) ||
      (i.head === 'Equal' && i.free.size > 0) ||
      isEquationSystem(i.json),
    run: (i) => {
      const j = i.json as MathJson[];
      switch (i.head) {
        case 'Integrate':
          return viaSympy(i, 'integrate', [i.json], 'eval');
        case 'Limit':
          return viaSympy(i, 'limit', [i.json], 'eval');
        case 'solve':
          return viaSympy(i, 'solve', j.slice(1), j.length === 2 ? 'solve' : null, j[1]);
        case 'series':
        case 'taylor':
          return viaSympy(i, 'series', j.slice(1), null);
        case 'laplace':
          return viaSympy(i, 'laplace', j.slice(1), null);
        default:
          return viaSympy(i, 'solve', [i.json], i.head === 'Equal' ? 'solve' : null);
      }
    },
  },
  {
    name: 'cas-fast',
    match: (i) => i.head !== null && CAS_FAST.has(i.head),
    run: (i) => {
      const j = i.json as MathJson[];
      const h = i.head!.toLowerCase();
      if (h === 'd' || h === 'diff') {
        const node = h === 'diff' ? ['D', ...j.slice(1)] : i.json;
        return viaCe(i, 'eval', node, 'eval');
      }
      return viaCe(i, h as CeOp, j[1], h as CasOp);
    },
  },
  {
    name: 'sum-product',
    match: (i) => containsHead(i.json, new Set(['Sum', 'Product'])),
    run: (i) => viaCe(i, 'eval', i.json, 'eval'),
  },
  {
    name: 'nested-symbolic',
    match: (i) => containsHead(i.json, SYMBOLIC_HEADS),
    run: (i) => viaSympy(i, 'eval', [i.json], 'eval'),
  },
  {
    name: 'free-symbols',
    match: (i) => i.free.size > 0 && !i.toTarget,
    run: (i) => viaCe(i, 'simplify', i.json, 'simplify'),
  },
  {
    name: 'numeric-worker',
    match: (i) => i.bigData && !!i.deps.numericWorker,
    run: viaNumericWorker,
  },
  {
    name: 'numeric',
    match: () => true,
    run: viaNumeric,
  },
];

// ------------------------------------------------------------- engines

function symbolicJson(i: RouteInfo, json: MathJson): MathJson {
  const map = new Map<string, MathJson>();
  for (const v of i.referenced) if (v.json !== null) map.set(v.name, v.json);
  return map.size ? substitute(json, map) : json;
}

function resultFromLatex(
  engine: EngineName,
  latex: string,
  approx: string | undefined,
  i: RouteInfo,
  route: string,
): EvalResult {
  let exact: MathJson | null;
  try {
    exact = parseLatex(latex);
  } catch {
    exact = null;
  }
  const a = trimApprox(approx);
  const single = a && !a.includes(',') && /^-?[\d.]+(e[+-]?\d+)?$/i.test(a);
  const approxLatex = single
    ? formatDecimal(a!, { digits: i.ctx.settings.displayDigits, grouping: i.ctx.settings.grouping }).latex
    : '';
  const isPlainNumber = single && (latex === a || /^-?\d+$/.test(latex));
  return {
    engine,
    exact: isPlainNumber ? null : exact,
    exactLatex: isPlainNumber ? undefined : latex,
    approx: a ?? '',
    approxLatex: isPlainNumber ? approxLatex || latex : approxLatex,
    precision: 'arbitrary',
    valueText: single ? a : undefined,
    route,
  };
}

async function viaSympy(
  i: RouteInfo,
  op: CasOp,
  args: MathJson[],
  ceFallback: CeOp | null,
  ceArg?: MathJson,
): Promise<EvalResult> {
  const s = i.ctx.settings;
  const sargs = args.map((a) => symbolicJson(i, a));
  let failure: CalcError;
  try {
    const res = await i.deps.cas.request({
      op,
      args: sargs,
      timeoutMs: s.casTimeoutMs,
      angle: op === 'solve' || op === 'eval' ? s.angle : 'rad',
      digits: Math.min(s.precision, 100),
      complex: s.domain === 'complex',
    });
    if (res.ok) return resultFromLatex('sympy', res.latex, res.approx, i, `sympy:${op}`);
    failure = new CalcError(res.error.message, res.error.code);
    // Definitive answers from SymPy are not second-guessed by the fallback.
    if (res.error.code === 'no-real-solution' || res.error.code === 'no-solution') throw failure;
  } catch (e) {
    if (
      e instanceof CalcError &&
      (e.code === 'timeout' || e.code === 'no-real-solution' || e.code === 'no-solution')
    )
      throw e;
    failure = e instanceof CalcError ? e : new CalcError((e as Error).message, 'cas');
  }
  if (ceFallback) {
    try {
      const r = ceSymbolic(
        ceFallback,
        symbolicJson(i, ceArg ?? args[0]),
        ceFallback === 'solve' ? s.angle : 'rad',
      );
      return resultFromLatex('ce', r.latex, r.approx, i, `ce:${ceFallback}`);
    } catch {
      /* report SymPy's error below */
    }
  }
  throw failure;
}

async function viaCe(
  i: RouteInfo,
  op: CeOp,
  arg: MathJson,
  sympyFallback: CasOp | null,
): Promise<EvalResult> {
  const sarg = symbolicJson(i, arg);
  try {
    const r = ceSymbolic(op, sarg, 'rad');
    return resultFromLatex('ce', r.latex, r.approx, i, `ce:${op}`);
  } catch (e) {
    if (!sympyFallback) throw e;
    return viaSympy(i, sympyFallback, [sarg], null);
  }
}

function serializeOptions(i: RouteInfo): SerializeOptions {
  const names = new Set(i.ctx.variables.keys());
  return {
    angle: i.ctx.settings.angle,
    isBound: (n) => names.has(n),
    isUnit: i.deps.numeric.isUnit,
    isCurrency: i.deps.numeric.isCurrency,
  };
}

function scopeFor(i: RouteInfo): Record<string, string> {
  const scope: Record<string, string> = {};
  for (const v of i.referenced) scope[v.name] = v.valueText;
  return scope;
}

function buildText(i: RouteInfo): { text: string; usesUnits: boolean; usesCurrency: boolean } {
  const opts = serializeOptions(i);
  const lhs = serializeToMathjs(i.json, opts);
  if (!i.toTarget) return lhs;
  const rhs = serializeToMathjs(i.toTarget, { ...opts, isBound: () => false });
  if (!rhs.usesUnits) throw new CalcError('After “to”, write a unit, for example km or USD', 'unit-target');
  return {
    text: `(${lhs.text}) to ${rhs.text}`,
    usesUnits: true,
    usesCurrency: lhs.usesCurrency || rhs.usesCurrency,
  };
}

async function viaNumeric(i: RouteInfo): Promise<EvalResult> {
  const s = i.ctx.settings;
  let built;
  try {
    built = buildText(i);
  } catch (e) {
    if (e instanceof FreeSymbolError && !i.toTarget) return viaCe(i, 'simplify', i.json, 'simplify');
    if (e instanceof SymbolicHeadError) return viaSympy(i, 'eval', [i.json], 'eval');
    throw e;
  }
  const { numeric } = i.deps;
  numeric.setPrecision(s.precision);
  const out = numeric.evaluate(built.text, scopeFor(i));
  const f = formatValue(out.inst.math, out.value, {
    digits: s.displayDigits,
    grouping: s.grouping,
    domain: s.domain,
    currencies: numeric.currencies,
    fullDigits: out.precision === 'double' ? 15 : Math.max(16, s.precision - 2),
  });
  const engine: EngineName = out.usedFinance ? 'finance' : out.usedStats ? 'jstat' : 'mathjs';

  // §5.4: exact form first when the input had no decimals and the result is a real scalar.
  let exact: { json: MathJson; latex: string } | null = null;
  if (
    engine === 'mathjs' &&
    !built.usesUnits &&
    !f.dims &&
    !f.table &&
    !f.complex &&
    f.approx &&
    !hasFloat(i.json)
  ) {
    if (i.referenced.every((v) => v.json !== null)) exact = exactForm(symbolicJson(i, i.json), s.angle);
  }
  return {
    engine,
    exact: exact?.json ?? null,
    exactLatex: exact?.latex,
    approx: f.approx,
    approxLatex: f.approxLatex,
    precision: f.complex ? 'double' : out.precision,
    table: f.table,
    ratesDate: built.usesCurrency ? numeric.rates?.date : undefined,
    valueText: f.valueText,
    route: 'numeric',
  };
}

async function viaNumericWorker(i: RouteInfo): Promise<EvalResult> {
  const s = i.ctx.settings;
  const built = buildText(i);
  const scope: Record<string, string> = {};
  const lists: Record<string, Float64Array> = {};
  for (const v of i.referenced) {
    if (listSize(v.valueText) > BIG_LIST) {
      const nums = v.valueText
        .replace(/[[\]\s]/g, '')
        .split(',')
        .map(Number);
      lists[v.name] = Float64Array.from(nums);
    } else scope[v.name] = v.valueText;
  }
  const r = await i.deps.numericWorker!.evaluate({
    text: built.text,
    scope,
    lists,
    format: { digits: s.displayDigits, grouping: s.grouping, domain: s.domain },
  });
  if (!r.ok) throw new CalcError(r.message, r.code);
  return {
    engine: r.usedFinance ? 'finance' : r.usedStats ? 'jstat' : 'mathjs',
    exact: null,
    approx: r.formatted.approx,
    approxLatex: r.formatted.approxLatex,
    precision: 'double',
    table: r.formatted.table,
    valueText: r.formatted.valueText,
    route: 'numeric-worker',
  };
}

// ------------------------------------------------------------ entry points

function prepareLatex(latex: string, ctx: EvalContext): { lhs: string; target: string | null } {
  let s = latex.trim().replace(/(=|\\coloneq|:=)\s*$/, '');
  // In degree mode a written degree sign is redundant; elsewhere Compute Engine converts it.
  if (ctx.settings.angle === 'deg') s = s.replace(/\^\{?\\circ\}?/g, '');
  const parts = s.split(TO_SPLIT);
  if (parts.length > 2) throw new CalcError('Use “to” once per conversion', 'unit-target');
  return { lhs: tidyLatex(parts[0]), target: parts.length === 2 ? tidyLatex(parts[1]) : null };
}

function makeInfo(json: MathJson, target: MathJson | null, ctx: EvalContext, deps: RouterDeps): RouteInfo {
  const expanded = expandFunctions(json, ctx.functions);
  const all = freeSymbols(expanded);
  const referenced: Variable[] = [];
  const free = new Set<string>();
  for (const name of all) {
    if (CONSTANT_SYMBOLS.has(name)) continue;
    const v = ctx.variables.get(name);
    if (v) {
      referenced.push(v);
      continue;
    }
    const base = name.replace(/_upright$/, '');
    if (name.endsWith('_upright') || (name.length > 1 && !name.includes('_'))) {
      if (deps.numeric.isUnit(base)) continue;
      if (ctx.variables.has(base)) {
        referenced.push(ctx.variables.get(base)!);
        continue;
      }
    }
    free.add(base);
  }
  const bigData =
    maxMatrixDim(expanded) > BIG_MATRIX || referenced.some((v) => listSize(v.valueText) > BIG_LIST);
  return { json: expanded, head: head(expanded), free, referenced, toTarget: target, bigData, ctx, deps };
}

async function route(info: RouteInfo): Promise<EvalResult> {
  const r = ROUTES.find((x) => x.match(info))!;
  const result = await r.run(info);
  result.route ??= r.name;
  return result;
}

/** Evaluate a mathfield's LaTeX. Pure with respect to `ctx`: definitions come back in `result.define`. */
export async function evaluateLatex(latex: string, ctx: EvalContext, deps: RouterDeps): Promise<EvalResult> {
  const { lhs, target } = prepareLatex(latex, ctx);
  if (!lhs) throw new CalcError('Nothing to calculate', 'empty');
  const json = parseLatex(lhs);
  const targetJson = target ? parseLatex(target) : null;

  if (head(json) === 'Assign') return assign(json as MathJson[], ctx, deps);
  return route(makeInfo(json, targetJson, ctx, deps));
}

async function assign(node: MathJson[], ctx: EvalContext, deps: RouterDeps): Promise<EvalResult> {
  const [, rawName, value] = node;
  const name = typeof rawName === 'string' ? rawName.replace(/_upright$/, '') : '';
  if (!IDENT.test(name) || RESERVED_NAMES.has(name))
    throw new CalcError(`Can't use ${name || 'that'} as a name`, 'name');
  if (deps.numeric.isUnit(name) && name.length > 1)
    throw new CalcError(`${name} is a unit name; pick another`, 'name');

  if (head(value) === 'Function') {
    const fn = value as MathJson[];
    const params = fn.slice(2).filter((p): p is string => typeof p === 'string');
    const body = unwrapBlock(fn[1]);
    const paramLatex = params.join(',');
    const latex = `${name}\\left(${paramLatex}\\right)\\coloneq ${toLatex(body)}`;
    const func: UserFunction = { name, params, body, latex };
    return {
      engine: 'ce',
      exact: null,
      approx: '',
      approxLatex: latex,
      precision: 'arbitrary',
      define: { func },
      route: 'define-function',
    };
  }

  const r = await route(makeInfo(value, null, ctx, deps));
  if (!r.valueText && !r.exact)
    throw new CalcError(`${name} needs a value, not an expression with unknowns`, 'name');
  const variable: Variable = {
    name,
    valueText: r.valueText ?? r.approx,
    json:
      r.exact ?? (r.valueText && /^-?[\d.]+(e[+-]?\d+)?$/i.test(r.valueText) ? { num: r.valueText } : null),
    latex: r.exactLatex ?? r.approxLatex,
    updatedAt: Date.now(),
  };
  return { ...r, define: { variable } };
}

/** Live preview: numeric only, synchronous-ish, never touches the CAS. */
export async function previewLatex(
  latex: string,
  ctx: EvalContext,
  deps: RouterDeps,
): Promise<string | null> {
  try {
    const { lhs, target } = prepareLatex(latex, ctx);
    if (!lhs) return null;
    const json = parseLatex(lhs);
    if (head(json) === 'Assign') return null;
    const noCas: CasLike = {
      request: () => Promise.reject(new CalcError('Preview never uses the CAS', 'preview')),
    };
    const info = makeInfo(json, target ? parseLatex(target) : null, ctx, { ...deps, cas: noCas });
    const r = ROUTES.find((x) => x.match(info))!;
    if (r.name !== 'numeric') return null;
    const res = await viaNumeric(info);
    if (res.route !== 'numeric' || res.table) return null;
    if (!res.approxLatex || res.approxLatex.length > 200) return null;
    return res.approxLatex;
  } catch {
    return null;
  }
}
