import { create } from 'zustand';
import { cas, deps, numeric } from '../app/services';
import { db, type HistoryEntry } from '../db';
import { BUNDLED_RATES, fetchRates, isStale, RATES_BASE, type RatesRow } from '../engine/currency';
import { evaluateLatex, previewLatex } from '../engine/router';
import type { CasStatus } from '../engine/sympy/client';
import { parseLatex } from '../engine/symbolic';
import {
  CalcError,
  DEFAULT_SETTINGS,
  type CalcSettings,
  type EvalContext,
  type UserFunction,
  type Variable,
} from '../engine/types';
import { haptics, nativePrefs, setHapticsEnabled } from '../platform';
import { mathfield } from '../ui/mathfield/controller';

export type ThemePref = 'system' | 'light' | 'dark';
export interface AppSettings extends CalcSettings {
  theme: ThemePref;
  haptics: boolean;
}

export const LAYERS = ['basic', 'functions', 'calculus', 'matrix', 'stats', 'convert', 'finance'] as const;
export type LayerId = (typeof LAYERS)[number];

export type SheetKind =
  | { kind: 'settings' }
  | { kind: 'matrix-size' }
  | { kind: 'stats-data' }
  | { kind: 'distributions' }
  | { kind: 'finance'; form: 'tvm' | 'npv' | 'cagr' | 'amort' | 'options' | 'bond' }
  | { kind: 'pin'; entryId: number }
  | { kind: 'variables' };

interface State {
  ready: boolean;
  settings: AppSettings;
  history: HistoryEntry[];
  variables: Record<string, Variable>;
  functions: Record<string, UserFunction>;
  layer: LayerId;
  shift: boolean;
  hyp: boolean;
  busy: boolean;
  preview: string | null;
  error: string | null;
  casStatus: CasStatus;
  rates: RatesRow;
  sheet: SheetKind | null;
  lastAddedId: number | null;
  announcement: string;

  init(): Promise<void>;
  evaluate(): Promise<void>;
  updatePreview(): void;
  setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void;
  cycleAngle(): void;
  setLayer(layer: LayerId): void;
  toggleShift(): void;
  toggleHyp(): void;
  openSheet(sheet: SheetKind): void;
  closeSheet(): void;
  pinEntry(entryId: number, name: string): Promise<void>;
  setVariables(vars: Variable[]): Promise<void>;
  deleteVariable(name: string): Promise<void>;
  deleteFunction(name: string): Promise<void>;
  deleteEntry(id: number): Promise<void>;
  clearHistory(): Promise<void>;
  refreshRates(force?: boolean): Promise<void>;
  clearError(): void;
}

const SETTINGS_KEY = 'settings';
const DEFAULT_APP_SETTINGS: AppSettings = { ...DEFAULT_SETTINGS, theme: 'system', haptics: true };

function context(s: State): EvalContext {
  return {
    settings: s.settings,
    variables: new Map(Object.entries(s.variables)),
    functions: new Map(Object.entries(s.functions)),
  };
}

let previewTimer: ReturnType<typeof setTimeout> | undefined;
let previewSeq = 0;

export const useStore = create<State>((set, get) => ({
  ready: false,
  settings: DEFAULT_APP_SETTINGS,
  history: [],
  variables: {},
  functions: {},
  layer: 'basic',
  shift: false,
  hyp: false,
  busy: false,
  preview: null,
  error: null,
  casStatus: { state: 'idle' },
  rates: BUNDLED_RATES,
  sheet: null,
  lastAddedId: null,
  announcement: '',

  async init() {
    cas.onStatus = (casStatus) => set({ casStatus });
    let settings = DEFAULT_APP_SETTINGS;
    try {
      const row = await db.settings.get(SETTINGS_KEY);
      const native = await nativePrefs.get(SETTINGS_KEY);
      const stored =
        (row?.value as Partial<AppSettings> | undefined) ?? (native ? JSON.parse(native) : undefined);
      settings = { ...DEFAULT_APP_SETTINGS, ...stored };
    } catch {
      /* fall back to defaults */
    }
    setHapticsEnabled(settings.haptics);
    numeric.setPrecision(settings.precision);

    const [history, vars, fns, ratesRow] = await Promise.all([
      db.recentHistory().catch(() => []),
      db.variables.toArray().catch(() => []),
      db.functions.toArray().catch(() => []),
      db.rates.get(RATES_BASE).catch(() => undefined),
    ]);
    const rates = ratesRow ?? BUNDLED_RATES;
    numeric.setRates(rates);
    set({
      ready: true,
      settings,
      history: history.reverse(),
      variables: Object.fromEntries(vars.map((v) => [v.name, v])),
      functions: Object.fromEntries(fns.map((f) => [f.name, f])),
      rates,
    });
    void get().refreshRates();
  },

  async refreshRates(force = false) {
    const current = get().rates;
    if (!force && !isStale(current)) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    try {
      const row = await fetchRates(RATES_BASE);
      await db.saveRates(row);
      numeric.setRates(row);
      set({ rates: row });
    } catch {
      /* stay on cached rates; the date under each result says how old they are */
    }
  },

  async evaluate() {
    const latex = mathfield.value().trim();
    if (!latex || get().busy) return;
    set({ busy: true, error: null });
    const s = get();
    try {
      const r = await evaluateLatex(latex, context(s), deps);
      let inputJson: unknown = null;
      try {
        inputJson = parseLatex(latex);
      } catch {
        inputJson = null;
      }
      const entry: HistoryEntry = {
        createdAt: Date.now(),
        inputLatex: latex,
        inputJson,
        resultLatex: r.exactLatex ?? r.approxLatex,
        resultApprox: r.approx || undefined,
        approxLatex: r.exactLatex && r.approxLatex ? r.approxLatex : undefined,
        exactJson: r.exact,
        valueText: r.valueText,
        table: r.table,
        ratesDate: r.ratesDate,
        engine: r.engine,
        precision: r.precision,
        pinned: 0,
      };
      const id = await db.addHistory(entry).catch(() => Date.now());
      entry.id = id;

      const variables = { ...get().variables };
      const functions = { ...get().functions };
      if (r.define?.variable) {
        variables[r.define.variable.name] = r.define.variable;
        void db.variables.put(r.define.variable);
      }
      if (r.define?.func) {
        functions[r.define.func.name] = r.define.func;
        void db.functions.put(r.define.func);
      }
      if (r.valueText) {
        const ans: Variable = {
          name: 'Ans',
          valueText: r.valueText,
          json: r.exact,
          latex: entry.resultLatex,
          updatedAt: Date.now(),
        };
        variables.Ans = ans;
        void db.variables.put(ans);
      }
      const spoken = r.approx || (r.table ? 'table' : '');
      set({
        history: [...get().history, entry],
        variables,
        functions,
        busy: false,
        preview: null,
        lastAddedId: id,
        announcement: spoken ? `Result: ${spoken.replace(/-/g, 'minus ')}` : 'Result added',
      });
      haptics.equals();
      mathfield.clear();
    } catch (e) {
      const message = e instanceof CalcError ? e.message : `Something went wrong: ${(e as Error).message}`;
      set({ busy: false, error: message, announcement: message });
      haptics.error();
    }
  },

  updatePreview() {
    clearTimeout(previewTimer);
    if (get().error) set({ error: null });
    previewTimer = setTimeout(async () => {
      const latex = mathfield.value().trim();
      const seq = ++previewSeq;
      if (!latex) {
        set({ preview: null });
        return;
      }
      const p = await previewLatex(latex, context(get()), deps);
      if (seq === previewSeq) set({ preview: p });
    }, 120);
  },

  setSetting(key, value) {
    const settings = { ...get().settings, [key]: value };
    set({ settings });
    if (key === 'haptics') setHapticsEnabled(value as boolean);
    if (key === 'precision') numeric.setPrecision(value as number);
    void db.settings.put({ key: SETTINGS_KEY, value: settings });
    void nativePrefs.set(SETTINGS_KEY, JSON.stringify(settings));
    get().updatePreview();
  },

  cycleAngle() {
    const order = ['deg', 'rad', 'grad'] as const;
    const next = order[(order.indexOf(get().settings.angle) + 1) % order.length];
    get().setSetting('angle', next);
  },

  setLayer(layer) {
    set({ layer, shift: false });
  },
  toggleShift() {
    set({ shift: !get().shift });
  },
  toggleHyp() {
    set({ hyp: !get().hyp });
  },
  openSheet(sheet) {
    set({ sheet });
  },
  closeSheet() {
    set({ sheet: null });
    mathfield.focus();
  },

  async pinEntry(entryId, name) {
    const entry = get().history.find((e) => e.id === entryId);
    if (!entry || !entry.valueText) throw new CalcError('Only results with a value can be pinned');
    const variable: Variable = {
      name,
      valueText: entry.valueText,
      json: entry.exactJson ?? null,
      latex: entry.resultLatex,
      updatedAt: Date.now(),
    };
    await db.transaction('rw', db.variables, db.history, async () => {
      await db.variables.put(variable);
      await db.history.update(entryId, { pinned: 1 });
    });
    set({
      variables: { ...get().variables, [name]: variable },
      history: get().history.map((e) => (e.id === entryId ? { ...e, pinned: 1 } : e)),
    });
  },

  async setVariables(vars) {
    await db.putVariables(vars);
    set({ variables: { ...get().variables, ...Object.fromEntries(vars.map((v) => [v.name, v])) } });
  },

  async deleteVariable(name) {
    await db.variables.delete(name);
    const variables = { ...get().variables };
    delete variables[name];
    set({ variables });
  },

  async deleteFunction(name) {
    await db.functions.delete(name);
    const functions = { ...get().functions };
    delete functions[name];
    set({ functions });
  },

  async deleteEntry(id) {
    await db.history.delete(id);
    set({ history: get().history.filter((e) => e.id !== id) });
  },

  async clearHistory() {
    await db.history.where('pinned').equals(0).delete();
    set({ history: get().history.filter((e) => e.pinned === 1) });
  },

  clearError() {
    set({ error: null });
  },
}));
