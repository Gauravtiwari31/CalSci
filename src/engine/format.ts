import Decimal from 'decimal.js';
import type { Grouping } from './types';

const D = Decimal.clone({ precision: 1100, toExpNeg: -1e9, toExpPos: 1e9 });

export interface FormatOptions {
  digits: number;
  grouping: Grouping;
  /** Significant digits kept in the full-precision value (trims last-digit noise). */
  fullDigits?: number;
}

function groupInteger(int: string, grouping: Grouping): string {
  if (int.length <= 3) return int;
  if (grouping === 'indian') {
    const last3 = int.slice(-3);
    const rest = int.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    return `${rest},${last3}`;
  }
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function stripZeros(s: string): string {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

/**
 * Format a decimal string (any precision) to `digits` significant digits.
 * Fixed notation between 1e-6 and 1e12, scientific outside. Exact decimal
 * arithmetic throughout; never round-trips through a double.
 */
export function formatDecimal(value: string, opts: FormatOptions): { text: string; latex: string } {
  const trimmed = value.trim();
  if (/^-?Infinity$/.test(trimmed)) {
    const neg = trimmed.startsWith('-');
    return { text: neg ? '−∞' : '∞', latex: neg ? '-\\infty' : '\\infty' };
  }
  if (trimmed === 'NaN') return { text: 'undefined', latex: '\\text{undefined}' };
  let d: Decimal;
  try {
    d = new D(trimmed);
  } catch {
    return { text: trimmed, latex: `\\text{${trimmed}}` };
  }
  if (d.isZero()) return { text: '0', latex: '0' };
  const r = d.toSignificantDigits(opts.digits, Decimal.ROUND_HALF_EVEN);
  const exp = r.e;
  const neg = r.isNegative();
  if (exp >= -6 && exp < 12) {
    const fixed = stripZeros(r.abs().toFixed());
    const [int, frac] = fixed.split('.');
    const grouped = groupInteger(int, opts.grouping);
    const body = frac ? `${grouped}.${frac}` : grouped;
    return {
      text: `${neg ? '−' : ''}${body}`,
      latex: `${neg ? '-' : ''}${body.replace(/,/g, '{,}')}`,
    };
  }
  const [mant, e] = r.abs().toExponential().split('e');
  const m = stripZeros(mant);
  const ex = String(Number(e));
  return {
    text: `${neg ? '−' : ''}${m} × 10^${ex}`,
    latex: `${neg ? '-' : ''}${m}\\times10^{${ex}}`,
  };
}

/** Full-precision plain text with trailing zeros removed. */
export function plainDecimal(value: string, sigDigits?: number): string {
  try {
    let d = new D(value);
    if (sigDigits && d.isFinite()) d = d.toSignificantDigits(sigDigits);
    if (!d.isFinite()) return value;
    const e = d.e;
    if (d.isInteger() && e < 1100) return d.toFixed();
    return e >= -9 && e < 21 ? stripZeros(d.toFixed()) : d.toExponential().replace(/\.?0+e/, 'e');
  } catch {
    return value;
  }
}

export function escapeLatexText(s: string): string {
  return s.replace(/[\\{}$&#^_%~]/g, (c) =>
    c === '\\' ? '\\textbackslash{}' : c === '^' || c === '~' ? `\\${c}{}` : `\\${c}`,
  );
}
