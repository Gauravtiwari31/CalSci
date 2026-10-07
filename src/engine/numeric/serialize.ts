// MathJSON → math.js expression text, through an allowlist. Unknown heads and
// names are errors, never passthrough. Angle mode is applied here.
import { CalcError, type AngleMode, type MathJson } from '../types';
import { UNIT_PREFIX } from '../symbolic';
import { FINANCE_FUNCTIONS, MATRIX_FUNCTIONS, STATS_FUNCTIONS } from './instance';

export interface SerializeOptions {
  angle: AngleMode;
  /** Names bound in the math.js scope (user variables, Ans, function params). */
  isBound: (name: string) => boolean;
  /** True if `name` is a math.js unit (including registered currencies). */
  isUnit: (name: string) => boolean;
  isCurrency: (name: string) => boolean;
}

export interface SerializeResult {
  text: string;
  usesUnits: boolean;
  usesCurrency: boolean;
}

/** Thrown when the expression has symbols with no value: route it to a CAS. */
export class FreeSymbolError extends CalcError {
  constructor(readonly symbol: string) {
    super(`${symbol} has no value`, 'free-symbol');
  }
}

/** Thrown when a head belongs to a symbolic engine. */
export class SymbolicHeadError extends CalcError {
  constructor(readonly head: string) {
    super(`${head} needs the symbolic engine`, 'symbolic');
  }
}

const CONSTANTS: Record<string, string> = {
  Pi: 'pi',
  ExponentialE: 'e',
  ImaginaryUnit: 'i',
  PositiveInfinity: 'Infinity',
  NegativeInfinity: '(-Infinity)',
  Half: '0.5',
  True: 'true',
  False: 'false',
  NaN: 'NaN',
};

const FN1: Record<string, string> = {
  Sqrt: 'sqrt',
  Exp: 'exp',
  Ln: 'log',
  Lb: 'log2',
  Lg: 'log10',
  Abs: 'abs',
  Floor: 'floor',
  Ceil: 'ceil',
  Sign: 'sign',
  Gamma: 'gamma',
  Erf: 'erf',
  Real: 're',
  Imaginary: 'im',
  Conjugate: 'conj',
  Arg: 'arg',
  Sinh: 'sinh',
  Cosh: 'cosh',
  Tanh: 'tanh',
  Coth: 'coth',
  Sech: 'sech',
  Csch: 'csch',
  Arsinh: 'asinh',
  Arcosh: 'acosh',
  Artanh: 'atanh',
  Arcoth: 'acoth',
  Arsech: 'asech',
  Arcsch: 'acsch',
  Determinant: 'det',
  Inverse: 'inv',
  Transpose: 'transpose',
  ConjugateTranspose: 'ctranspose',
  Trace: 'trace',
  MatrixRank: 'rank',
  Length: 'count',
};

const FNN: Record<string, string> = {
  Max: 'max',
  Min: 'min',
  GCD: 'gcd',
  LCM: 'lcm',
  Mod: 'mod',
  Round: 'round',
  Mean: 'mean',
  Median: 'median',
  Variance: 'variance',
  StandardDeviation: 'std',
  Correlation: 'corr',
  Binomial: 'combinations',
  Choose: 'combinations',
};

const TRIG: Record<string, string> = {
  Sin: 'sin',
  Cos: 'cos',
  Tan: 'tan',
  Cot: 'cot',
  Sec: 'sec',
  Csc: 'csc',
};
const INV_TRIG: Record<string, string> = {
  Arcsin: 'asin',
  Arccos: 'acos',
  Arctan: 'atan',
  Arccot: 'acot',
  Arcsec: 'asec',
  Arccsc: 'acsc',
};

/** Lower-case function names typed with \operatorname that map straight to math.js. */
const NAMED: Record<string, string> = {
  std: 'std',
  stdev: 'std',
  s: 'std',
  variance: 'variance',
  sum: 'sum',
  count: 'count',
  mode: 'mode',
  nPr: 'nPr',
  lsolve: 'lusolve',
  nCr: 'nCr',
  cbrt: 'cbrt',
  erf: 'erf',
  ...Object.fromEntries([...FINANCE_FUNCTIONS, ...STATS_FUNCTIONS, ...MATRIX_FUNCTIONS].map((n) => [n, n])),
};

export const SYMBOLIC_HEADS = new Set([
  'Integrate',
  'Limit',
  'D',
  'Sum',
  'Product',
  'Equal',
  'Prime',
  'Function',
  'solve',
  'series',
  'taylor',
  'dsolve',
  'laplace',
  'simplify',
  'expand',
  'factor',
  'diff',
  'Expand',
  'Factor',
  'Simplify',
]);

const IDENT = /^[A-Za-z][A-Za-z0-9_]*$/;

export function serializeToMathjs(json: MathJson, opts: SerializeOptions): SerializeResult {
  let usesUnits = false;
  let usesCurrency = false;

  const angleIn = (x: string) =>
    opts.angle === 'deg' ? `((${x}) * pi / 180)` : opts.angle === 'grad' ? `((${x}) * pi / 200)` : x;
  const angleOut = (x: string) =>
    opts.angle === 'deg' ? `(${x} * 180 / pi)` : opts.angle === 'grad' ? `(${x} * 200 / pi)` : x;

  const unitName = (name: string): string | null => {
    const base = name.endsWith('_upright') ? name.slice(0, -'_upright'.length) : name;
    if (opts.isUnit(base)) {
      usesUnits = true;
      if (opts.isCurrency(base)) usesCurrency = true;
      return base;
    }
    return null;
  };

  const symbol = (name: string): string => {
    if (name in CONSTANTS) return CONSTANTS[name];
    if (name === 'ComplexInfinity') throw new CalcError("Can't divide by zero", 'div-zero');
    if (name === 'Indeterminate')
      throw new CalcError('Result is undefined (0/0 or similar)', 'indeterminate');
    if (name.startsWith("'")) throw new CalcError('Text is not allowed in expressions');
    if (name.startsWith(UNIT_PREFIX)) {
      const u = unitName(name.slice(UNIT_PREFIX.length));
      if (!u) throw new CalcError(`Unknown unit ${name.slice(UNIT_PREFIX.length)}`, 'unknown-unit');
      return u;
    }
    if (!IDENT.test(name)) throw new CalcError(`Invalid name ${name}`);
    if (opts.isBound(name)) return name;
    const upright = name.endsWith('_upright');
    // Units: written upright (\mathrm{m}) or multi-letter names math.js knows (km, mi, USD).
    if (upright || (name.length > 1 && !name.includes('_'))) {
      const u = unitName(name);
      if (u) return u;
      if (upright) {
        const base = name.slice(0, -'_upright'.length);
        if (opts.isBound(base)) return base;
        throw new FreeSymbolError(base);
      }
    }
    throw new FreeSymbolError(name);
  };

  const unitExpr = (node: MathJson): string => {
    if (typeof node === 'string') {
      const u = unitName(node.startsWith(UNIT_PREFIX) ? node.slice(UNIT_PREFIX.length) : node);
      if (!u) throw new CalcError(`Unknown unit ${node.replace(/_upright$/, '')}`, 'unknown-unit');
      return u;
    }
    if (Array.isArray(node)) {
      const [head, ...args] = node as [string, ...MathJson[]];
      if (head === 'Multiply') return args.map(unitExpr).join(' ');
      if (head === 'Divide') return `${unitExpr(args[0])} / ${unitExpr(args[1])}`;
      if (head === 'Power') return `${unitExpr(args[0])}^${ser(args[1])}`;
      if (head === 'Delimiter') return unitExpr(args[0]);
    }
    throw new CalcError('Unsupported unit expression', 'unknown-unit');
  };

  const num = (s: string): string => {
    if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) throw new CalcError(`Unsupported number ${s}`);
    return s.replace(/\.$/, '').replace(/\.0+$/, '');
  };

  const ser = (node: MathJson): string => {
    if (typeof node === 'number') {
      if (Number.isNaN(node)) return 'NaN';
      if (!Number.isFinite(node)) return node > 0 ? 'Infinity' : '(-Infinity)';
      return node < 0 ? `(${String(node)})` : String(node);
    }
    if (typeof node === 'string') return symbol(node);
    if (typeof node === 'boolean') return String(node);
    if (node && typeof node === 'object' && !Array.isArray(node)) {
      const o = node as Record<string, unknown>;
      if (typeof o.num === 'string') {
        const v = num(o.num);
        return v.startsWith('-') ? `(${v})` : v;
      }
      if (typeof o.sym === 'string') return symbol(o.sym);
      if (Array.isArray(o.fn)) return ser(o.fn);
      throw new CalcError('Unsupported expression');
    }
    if (!Array.isArray(node) || typeof node[0] !== 'string') throw new CalcError('Unsupported expression');
    const [head, ...args] = node as [string, ...MathJson[]];
    const list = () => args.map(ser).join(', ');

    switch (head) {
      case 'Add':
        return `(${args.map(ser).join(' + ')})`;
      case 'Subtract':
        return `(${ser(args[0])} - ${ser(args[1])})`;
      case 'Negate':
        return `(-${ser(args[0])})`;
      case 'Multiply':
        return `(${args.map(ser).join(' * ')})`;
      case 'Divide':
        return `(${ser(args[0])} / ${ser(args[1])})`;
      case 'Power':
        return `(${ser(args[0])} ^ ${ser(args[1])})`;
      case 'Root':
        return `nthRoot(${ser(args[0])}, ${ser(args[1])})`;
      case 'Rational':
        return `(${ser(args[0])} / ${ser(args[1])})`;
      case 'Complex':
        return `complex(${ser(args[0])}, ${ser(args[1])})`;
      case 'Log':
        return args.length > 1 ? `log(${ser(args[0])}, ${ser(args[1])})` : `log10(${ser(args[0])})`;
      case 'Factorial':
        return `factorial(${ser(args[0])})`;
      case 'Delimiter':
        return `(${ser(args[0])})`;
      case 'Hold':
        return ser(args[0]);
      case 'Percent':
        return `(${ser(args[0])} / 100)`;
      case 'List':
      case 'Tuple':
        return `[${list()}]`;
      case 'Matrix':
        return ser(args[0]);
      case 'Quantity':
        return `(${ser(args[0])} ${unitExpr(args[1])})`;
      case 'Error':
        throw new CalcError(
          "Couldn't read that expression. Check for a missing operand or bracket.",
          'parse',
        );
    }
    if (head in TRIG) {
      const arg = angleIn(ser(args[0]));
      return `chopTrig(${TRIG[head]}(${arg}), ${arg})`;
    }
    if (head in INV_TRIG) return angleOut(`${INV_TRIG[head]}(${ser(args[0])})`);
    if (head in FN1) return `${FN1[head]}(${ser(args[0])})`;
    if (head in FNN) return `${FNN[head]}(${list()})`;
    if (SYMBOLIC_HEADS.has(head)) throw new SymbolicHeadError(head);
    if (head in NAMED) return `${NAMED[head]}(${list()})`;
    if (opts.isBound(head)) return `${head}(${list()})`;
    throw new CalcError(`Unknown function ${head}`, 'unknown-function');
  };

  const text = ser(json);
  return { text, usesUnits, usesCurrency };
}

/** Converts the target side of `x to unit` into a math.js unit string. */
export function serializeUnitTarget(json: MathJson, opts: SerializeOptions): string {
  const r = serializeToMathjs(json, { ...opts, isBound: () => false });
  // `km/h` comes back as "(km / h)"; math.js `to` accepts that form.
  return r.text;
}
