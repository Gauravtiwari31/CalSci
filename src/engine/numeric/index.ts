import { registerCurrencies, type RatesRow } from '../currency';
import { CalcError, type Precision } from '../types';
import { createCalcMath, type CalcMath } from './instance';

export interface NumericOutcome {
  value: unknown;
  inst: CalcMath;
  precision: Precision;
  usedFinance: boolean;
  usedStats: boolean;
}

/** Errors that mean "this function has no BigNumber implementation". */
const BIGNUMBER_UNSUPPORTED =
  /BigNumber|Cannot implicitly convert|Unexpected type of argument|not supported|No signature/i;

export class NumericEngine {
  big: CalcMath;
  readonly dbl: CalcMath;
  readonly currencies = new Set<string>();
  rates?: RatesRow;
  private precision: number;

  constructor(precision = 64) {
    this.precision = precision;
    this.big = createCalcMath('BigNumber', precision);
    this.dbl = createCalcMath('number');
  }

  setPrecision(p: number) {
    if (p === this.precision) return;
    this.precision = p;
    this.big = createCalcMath('BigNumber', p);
    if (this.rates) registerCurrencies([this.big], this.rates);
  }

  setRates(row: RatesRow) {
    const codes = registerCurrencies([this.big, this.dbl], row);
    this.rates = row;
    this.currencies.clear();
    for (const c of codes) this.currencies.add(c);
  }

  isUnit = (name: string): boolean => {
    try {
      return (this.big.math as any).Unit.isValuelessUnit(name);
    } catch {
      return false;
    }
  };

  isCurrency = (name: string) => this.currencies.has(name);

  private scopeFor(inst: CalcMath, scope: Record<string, string>): Map<string, unknown> {
    const m = new Map<string, unknown>();
    for (const [name, text] of Object.entries(scope)) {
      try {
        m.set(name, inst.evaluate(text));
      } catch {
        // A stored value that no longer parses (e.g. a currency missing from new rates) is skipped.
      }
    }
    return m;
  }

  /**
   * Evaluate math.js text. BigNumber first; when a function has no BigNumber
   * support, retry everything in double precision and say so (§5.4).
   */
  evaluate(text: string, scope: Record<string, string>): NumericOutcome {
    const run = (inst: CalcMath): NumericOutcome => {
      inst.flags.double = inst.flags.finance = inst.flags.stats = false;
      const value = inst.evaluate(text, this.scopeFor(inst, scope));
      return {
        value,
        inst,
        precision: inst.mode === 'number' || inst.flags.double ? 'double' : 'arbitrary',
        usedFinance: inst.flags.finance,
        usedStats: inst.flags.stats,
      };
    };
    try {
      return run(this.big);
    } catch (e) {
      if (e instanceof CalcError) throw e;
      const msg = (e as Error).message ?? '';
      if (!BIGNUMBER_UNSUPPORTED.test(msg)) throw translateMathjsError(e as Error);
      try {
        return run(this.dbl);
      } catch (e2) {
        throw e2 instanceof CalcError ? e2 : translateMathjsError(e2 as Error);
      }
    }
  }
}

/** Turn math.js messages into copy that says what happened and what to do (§7.8). */
export function translateMathjsError(e: Error): CalcError {
  const msg = e.message ?? String(e);
  let m: RegExpMatchArray | null;
  if ((m = msg.match(/Dimension mismatch.*?\((\d+(?:,\s*\d+)*)\)\s*must match\s*\((\d+(?:,\s*\d+)*)\)/i))) {
    return new CalcError(
      `Matrix sizes don't match: ${m[1].replace(/,\s*/g, '×')} and ${m[2].replace(/,\s*/g, '×')}.`,
      'dimension',
    );
  }
  if (/Dimension mismatch in multiplication/i.test(msg) || /Dimension mismatch.*multiply/i.test(msg)) {
    const dims = msg.match(/\[(\d+),\s*(\d+)\].*?\[(\d+),\s*(\d+)\]/);
    if (dims) {
      return new CalcError(
        `Matrix sizes don't match: ${dims[1]}×${dims[2]} times ${dims[3]}×${dims[4]}. Columns of the first must equal rows of the second.`,
        'dimension',
      );
    }
    return new CalcError(
      "Matrix sizes don't match. Columns of the first must equal rows of the second.",
      'dimension',
    );
  }
  if (/Dimension mismatch/i.test(msg))
    return new CalcError(`Matrix sizes don't match. ${msg.replace(/^.*?\(/, '(')}`, 'dimension');
  if (/Cannot calculate inverse, determinant is zero|singular/i.test(msg)) {
    return new CalcError('Matrix is singular (determinant is zero), so it has no inverse.', 'singular');
  }
  if (/Units do not match|Cannot convert|Unit .* does not match/i.test(msg)) {
    return new CalcError(`Units don't match: ${msg.replace(/^.*?:\s*/, '')}`, 'units');
  }
  if (/Undefined symbol (\w+)/.test(msg))
    return new CalcError(`${msg.match(/Undefined symbol (\w+)/)![1]} has no value`, 'undefined');
  if (/Unit "(\w+)" not found/.test(msg))
    return new CalcError(`Unknown unit ${msg.match(/Unit "(\w+)"/)![1]}`, 'unknown-unit');
  if (/Too few arguments|Too many arguments/i.test(msg)) {
    const fn = msg.match(/function (\w+)/)?.[1];
    return new CalcError(`Wrong number of arguments${fn ? ` for ${fn}` : ''}`, 'arguments');
  }
  if (/Matrix must be square/i.test(msg)) return new CalcError('That needs a square matrix', 'square');
  return new CalcError(msg, 'mathjs');
}
