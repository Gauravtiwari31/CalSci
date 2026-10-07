// IndexedDB via Dexie (spec §8). Writes that touch several rows happen in one transaction.
import Dexie, { type Table } from 'dexie';
import type { RatesRow } from '../engine/currency';
import type {
  EngineName,
  MathJson,
  Precision,
  Table as ResultTable,
  UserFunction,
  Variable,
} from '../engine/types';

export interface HistoryEntry {
  id?: number;
  createdAt: number;
  inputLatex: string;
  inputJson: unknown;
  resultLatex: string;
  resultApprox?: string;
  /** LaTeX of the approximate value, shown beneath an exact result. */
  approxLatex?: string;
  exactJson?: MathJson | null;
  valueText?: string;
  table?: ResultTable;
  ratesDate?: string;
  engine: EngineName;
  precision: Precision;
  /** 0/1 rather than boolean so it can be indexed. */
  pinned: 0 | 1;
  error?: string;
}

export interface SettingRow {
  key: string;
  value: unknown;
}

export const HISTORY_CAP = 5_000;
export const HISTORY_TRIM_BATCH = 500;

export class CalcDb extends Dexie {
  history!: Table<HistoryEntry, number>;
  variables!: Table<Variable, string>;
  functions!: Table<UserFunction, string>;
  rates!: Table<RatesRow, string>;
  settings!: Table<SettingRow, string>;

  constructor(name = 'calsci') {
    super(name);
    this.version(1).stores({
      history: '++id, createdAt, pinned',
      variables: 'name, updatedAt',
      functions: 'name',
      rates: 'base',
      settings: 'key',
    });
  }

  async addHistory(entry: HistoryEntry): Promise<number> {
    return this.transaction('rw', this.history, async () => {
      const id = await this.history.add(entry);
      const unpinned = await this.history.where('pinned').equals(0).count();
      if (unpinned > HISTORY_CAP) {
        // Trim the oldest unpinned entries in one batch.
        const old = await this.history.where('pinned').equals(0).sortBy('createdAt');
        await this.history.bulkDelete(
          old.slice(0, Math.max(HISTORY_TRIM_BATCH, unpinned - HISTORY_CAP)).map((e) => e.id!),
        );
      }
      return id;
    });
  }

  recentHistory(limit = 300): Promise<HistoryEntry[]> {
    return this.history.orderBy('createdAt').reverse().limit(limit).toArray();
  }

  /** Bulk write in one readwrite transaction (stats datasets, imports). */
  putVariables(vars: Variable[]) {
    return this.transaction('rw', this.variables, () => this.variables.bulkPut(vars));
  }

  async saveRates(row: RatesRow) {
    await this.transaction('rw', this.rates, () => this.rates.put(row));
  }
}

export const db = new CalcDb();
