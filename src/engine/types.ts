export type MathJson = unknown;

export type EngineName = 'mathjs' | 'ce' | 'sympy' | 'jstat' | 'finance';
export type Precision = 'arbitrary' | 'double';
export type AngleMode = 'deg' | 'rad' | 'grad';
export type NumberDomain = 'real' | 'complex';
export type Grouping = 'international' | 'indian';

export interface Table {
  columns: string[];
  rows: (string | number)[][];
}

/** Every result carries engine, exact, approx and precision (spec §5.2). */
export interface EvalResult {
  engine: EngineName;
  /** Exact form as MathJSON, or null when the result is only approximate. */
  exact: MathJson | null;
  /** LaTeX for the exact form, when there is one. */
  exactLatex?: string;
  /** Approximate value at full working precision (plain text). */
  approx: string;
  /** Approximate value rounded for display (LaTeX). */
  approxLatex: string;
  precision: Precision;
  table?: Table;
  /** Set when the result used currency units: the ECB date of the rates. */
  ratesDate?: string;
  /** math.js text that recreates the value; used for Ans and pinned variables. */
  valueText?: string;
  /** Set when the input was an assignment: what to store. */
  define?: { variable?: Variable; func?: UserFunction };
  /** Name of the route that produced this result (for tests and diagnostics). */
  route?: string;
}

export interface CalcSettings {
  angle: AngleMode;
  domain: NumberDomain;
  /** Working precision in significant digits (16–1000). */
  precision: number;
  /** Displayed significant digits. */
  displayDigits: number;
  grouping: Grouping;
  casTimeoutMs: number;
}

export interface Variable {
  name: string;
  /** math.js text that recreates the value (number, matrix, unit, list…). */
  valueText: string;
  /** Exact MathJSON when known, used by the symbolic engines. */
  json: MathJson | null;
  latex: string;
  updatedAt: number;
}

export interface UserFunction {
  name: string;
  params: string[];
  body: MathJson;
  latex: string;
}

export interface EvalContext {
  settings: CalcSettings;
  variables: Map<string, Variable>;
  functions: Map<string, UserFunction>;
}

export class CalcError extends Error {
  constructor(
    message: string,
    readonly code = 'error',
  ) {
    super(message);
    this.name = 'CalcError';
  }
}

export const DEFAULT_SETTINGS: CalcSettings = {
  angle: 'deg',
  domain: 'real',
  precision: 64,
  displayDigits: 12,
  grouping: 'international',
  casTimeoutMs: 10_000,
};
