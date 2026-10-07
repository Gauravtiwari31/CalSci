/// <reference lib="webworker" />
// Heavy numeric work off the main thread: matrices with n > 50 and datasets
// over ~10k values (spec §5.2). Runs in double precision for speed.
import * as Comlink from 'comlink';
import { createCalcMath } from '../engine/numeric/instance';
import { formatValue, type FormatValueOptions } from '../engine/numeric/format-value';
import { CalcError } from '../engine/types';

const inst = createCalcMath('number');

export interface NumericJob {
  text: string;
  scope: Record<string, string>;
  /** Large lists, transferred rather than copied. */
  lists: Record<string, Float64Array>;
  format: Omit<FormatValueOptions, 'currencies'>;
}

const api = {
  evaluate(job: NumericJob) {
    const scope = new Map<string, unknown>();
    for (const [k, v] of Object.entries(job.scope)) scope.set(k, inst.evaluate(v));
    for (const [k, v] of Object.entries(job.lists)) scope.set(k, Array.from(v));
    inst.flags.double = inst.flags.finance = inst.flags.stats = false;
    try {
      const value = inst.evaluate(job.text, scope);
      const formatted = formatValue(inst.math, value, {
        ...job.format,
        currencies: new Set(),
        fullDigits: 15,
      });
      return { ok: true as const, formatted, usedStats: inst.flags.stats, usedFinance: inst.flags.finance };
    } catch (e) {
      return {
        ok: false as const,
        message: (e as Error).message,
        code: e instanceof CalcError ? e.code : 'mathjs',
      };
    }
  },
};

export type NumericWorkerApi = typeof api;
Comlink.expose(api);
