import { BUNDLED_RATES } from '../../src/engine/currency';
import { NumericEngine } from '../../src/engine/numeric';
import { evaluateLatex, type CasLike } from '../../src/engine/router';
import {
  DEFAULT_SETTINGS,
  type CalcSettings,
  type EvalContext,
  type UserFunction,
  type Variable,
} from '../../src/engine/types';
import { nodeCas } from './node-cas';

export function makeCalc(settings: Partial<CalcSettings> = {}, cas: CasLike = nodeCas) {
  const numeric = new NumericEngine(settings.precision ?? DEFAULT_SETTINGS.precision);
  numeric.setRates(BUNDLED_RATES);
  const ctx: EvalContext = {
    settings: { ...DEFAULT_SETTINGS, ...settings },
    variables: new Map<string, Variable>(),
    functions: new Map<string, UserFunction>(),
  };
  const deps = { numeric, cas };
  /** Evaluate and apply definitions, like the store does. */
  const run = async (latex: string) => {
    const r = await evaluateLatex(latex, ctx, deps);
    if (r.define?.variable) ctx.variables.set(r.define.variable.name, r.define.variable);
    if (r.define?.func) ctx.functions.set(r.define.func.name, r.define.func);
    if (!r.define && r.valueText) {
      ctx.variables.set('Ans', {
        name: 'Ans',
        valueText: r.valueText,
        json: r.exact,
        latex: r.approxLatex,
        updatedAt: 0,
      });
    }
    return r;
  };
  return { ctx, deps, numeric, run };
}
