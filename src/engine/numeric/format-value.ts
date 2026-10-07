import type { MathJsInstance } from 'mathjs';
import { formatDecimal, plainDecimal, type FormatOptions } from '../format';
import { CalcError, type NumberDomain, type Table } from '../types';
import { isMulti, isTable } from './instance';

export interface FormattedValue {
  approx: string;
  approxLatex: string;
  valueText?: string;
  table?: Table;
  /** The value contains a complex number (math.js complex is always double). */
  complex: boolean;
  /** Matrix dimensions, if the value is a matrix. */
  dims?: number[];
}

export interface FormatValueOptions extends FormatOptions {
  domain: NumberDomain;
  currencies: Set<string>;
}

export function formatValue(math: MathJsInstance, value: unknown, opts: FormatValueOptions): FormattedValue {
  let complex = false;

  const scalar = (v: unknown): { text: string; latex: string; full: string } => {
    if (typeof v === 'number' || math.isBigNumber(v)) {
      const s = math.isBigNumber(v) ? v.toString() : String(v);
      const f = formatDecimal(s, opts);
      return { text: f.text, latex: f.latex, full: plainDecimal(s, opts.fullDigits) };
    }
    if (math.isComplex(v)) {
      const c = v as unknown as { re: number; im: number };
      if (Math.abs(c.im) < 1e-15 * Math.max(1, Math.abs(c.re))) return scalar(c.re);
      if (opts.domain === 'real') {
        throw new CalcError('No real result. Switch to complex mode to see it.', 'complex-result');
      }
      complex = true;
      const re = formatDecimal(String(c.re), opts);
      const im = formatDecimal(String(Math.abs(c.im)), opts);
      const sign = c.im < 0 ? '-' : '+';
      const imL = im.latex === '1' ? '' : im.latex;
      const imT = im.text === '1' ? '' : im.text;
      if (Math.abs(c.re) < 1e-15 * Math.abs(c.im)) {
        return {
          text: `${c.im < 0 ? '−' : ''}${imT}i`,
          latex: `${c.im < 0 ? '-' : ''}${imL}i`,
          full: `${c.im}i`,
        };
      }
      return {
        text: `${re.text} ${sign === '-' ? '−' : '+'} ${imT}i`,
        latex: `${re.latex}${sign}${imL}i`,
        full: `${c.re} ${sign} ${Math.abs(c.im)}i`,
      };
    }
    if (math.isFraction(v)) return scalar(Number(v.valueOf()));
    if (typeof v === 'boolean') return { text: String(v), latex: `\\text{${v}}`, full: String(v) };
    throw new CalcError('Unsupported value inside a matrix');
  };

  const matrixLatex = (m: unknown): { latex: string; dims: number[] } => {
    const arr = (math.isMatrix(m) ? m.toArray() : m) as unknown[];
    const rows = Array.isArray(arr[0]) ? (arr as unknown[][]) : [arr];
    const isColumnList = !Array.isArray(arr[0]);
    const body = rows.map((r) => r.map((x) => scalar(x).latex).join('&')).join('\\\\');
    if (isColumnList) {
      return {
        latex: `\\left[${rows[0].map((x) => scalar(x).latex).join(',\\;')}\\right]`,
        dims: [rows[0].length],
      };
    }
    return { latex: `\\begin{pmatrix}${body}\\end{pmatrix}`, dims: [rows.length, rows[0]?.length ?? 0] };
  };

  if (value === undefined || value === null) throw new CalcError('No result');
  if (typeof value === 'function')
    throw new CalcError('That is a function, not a value. Call it with arguments.');

  if (isTable(value)) {
    return { approx: '', approxLatex: '', table: formatTable(value.__table, opts), complex };
  }
  if (isMulti(value)) {
    const parts = value.__multi.map(({ label, value: v }) => {
      const inner = math.isMatrix(v) || Array.isArray(v) ? matrixLatex(v).latex : scalar(v).latex;
      return `${label}=${inner}`;
    });
    return { approx: '', approxLatex: parts.join(',\\quad '), complex };
  }
  if (math.isUnit(value)) {
    const u = value as any;
    const units: string = u.formatUnits();
    const n = u.toNumeric(units);
    const isMoney = opts.currencies.has(units.trim());
    const raw = math.isBigNumber(n) ? n.toString() : String(n);
    const f = isMoney ? formatMoney(raw, opts) : formatDecimal(raw, opts);
    const unitLatex = `\\mathrm{${units.replace(/\s+/g, '').replace(/deg([CF])/, '{}^{\\circ}$1')}}`;
    return {
      approx: `${plainDecimal(raw, opts.fullDigits)} ${units}`,
      approxLatex: `${f.latex}\\,${unitLatex}`,
      valueText: `${plainDecimal(raw, opts.fullDigits)} ${units}`,
      complex,
    };
  }
  if (math.isMatrix(value) || Array.isArray(value)) {
    const flat = ((math.isMatrix(value) ? value.toArray() : value) as unknown[]).flat(Infinity);
    if (
      flat.some(
        (x) => (typeof x === 'number' && !Number.isFinite(x)) || (math.isBigNumber(x) && !x.isFinite()),
      )
    ) {
      throw new CalcError(
        'Result has undefined entries. The matrix may be singular (determinant is zero).',
        'singular',
      );
    }
    const { latex, dims } = matrixLatex(value);
    return {
      approx: math.format(value as any, { precision: 20 }),
      approxLatex: latex,
      valueText: math.format(value as any),
      complex,
      dims,
    };
  }
  const s = scalar(value);
  return { approx: s.full, approxLatex: s.latex, valueText: complex ? s.full : s.full, complex };
}

function formatMoney(raw: string, opts: FormatOptions) {
  const n = Number(raw);
  if (Math.abs(n) >= 1e12 || Math.abs(n) < 0.01) return formatDecimal(raw, opts);
  const fixed = n.toFixed(2);
  const f = formatDecimal(fixed, { ...opts, digits: 30 });
  const pad = (s: string) => (/\.\d$/.test(s) ? `${s}0` : /\./.test(s) ? s : `${s}.00`);
  return { text: pad(f.text), latex: pad(f.latex) };
}

function formatTable(t: Table, opts: FormatOptions): Table {
  return {
    columns: t.columns,
    rows: t.rows.map((r) =>
      r.map((c) =>
        typeof c === 'number' && !Number.isInteger(c)
          ? formatDecimal(String(c), { ...opts, digits: Math.min(opts.digits, 10) }).text
          : c,
      ),
    ),
  };
}
