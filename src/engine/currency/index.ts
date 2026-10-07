// Currency as math.js units (spec §5.5). Rates are stored per base currency;
// every currency is registered relative to the base so `2500 INR to USD`
// runs through the same pipeline as `5 km to mi`.
import type { CalcMath } from '../numeric/instance';

export const RATES_API = 'https://api.frankfurter.dev/v1';
export const RATES_BASE = 'EUR';
export const RATES_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface RatesRow {
  base: string;
  /** ECB publication date, YYYY-MM-DD. */
  date: string;
  fetchedAt: number;
  rates: Record<string, number>;
}

/** Names of the currencies Frankfurter actually returns, with display names. */
export type CurrencyNames = Record<string, string>;

const CODE = /^[A-Z]{3}$/;

/** Register (or re-register) all currencies in the given math instances. */
export function registerCurrencies(instances: CalcMath[], row: RatesRow): string[] {
  const codes = [row.base, ...Object.keys(row.rates)].filter((c) => CODE.test(c));
  for (const inst of instances) {
    // A base unit can only be created once per math.js instance.
    if (!(inst.math as any).Unit.isValuelessUnit(row.base)) inst.createUnit(row.base, { aliases: [] });
    for (const code of codes) {
      if (code === row.base) continue;
      const perBase = row.rates[code];
      if (!(perBase > 0)) continue;
      // 1 CODE = (1 / perBase) BASE. Use a decimal string so BigNumber stays exact enough.
      inst.createUnit(
        code,
        { definition: `${(1 / perBase).toPrecision(15)} ${row.base}` },
        { override: true },
      );
    }
  }
  return codes;
}

export function isStale(row: RatesRow | undefined, now = Date.now()): boolean {
  return !row || now - row.fetchedAt > RATES_MAX_AGE_MS;
}

export async function fetchRates(base = RATES_BASE, fetchImpl: typeof fetch = fetch): Promise<RatesRow> {
  const res = await fetchImpl(`${RATES_API}/latest?base=${encodeURIComponent(base)}`);
  if (!res.ok) throw new Error(`Rates request failed: ${res.status}`);
  const body = (await res.json()) as { base: string; date: string; rates: Record<string, number> };
  if (!body || typeof body.rates !== 'object' || !CODE.test(body.base))
    throw new Error('Unexpected rates response');
  const rates: Record<string, number> = {};
  for (const [k, v] of Object.entries(body.rates))
    if (CODE.test(k) && typeof v === 'number' && v > 0) rates[k] = v;
  return { base: body.base, date: body.date, fetchedAt: Date.now(), rates };
}

export async function fetchCurrencyNames(fetchImpl: typeof fetch = fetch): Promise<CurrencyNames> {
  const res = await fetchImpl(`${RATES_API}/currencies`);
  if (!res.ok) throw new Error(`Currency list request failed: ${res.status}`);
  return (await res.json()) as CurrencyNames;
}

/** Snapshot shipped with the app so currency works on first launch offline. */
export const BUNDLED_RATES: RatesRow = {
  base: 'EUR',
  date: '2026-10-06',
  fetchedAt: 0,
  rates: {
    AUD: 1.614,
    BRL: 5.5991,
    CAD: 1.6058,
    CHF: 0.9359,
    CNY: 7.5554,
    CZK: 24.405,
    DKK: 7.4747,
    GBP: 0.8488,
    HKD: 8.8438,
    HUF: 364.95,
    IDR: 20104.8,
    ILS: 3.4348,
    INR: 108.6615,
    ISK: 137.2,
    JPY: 178.15,
    KRW: 1508.67,
    MXN: 20.2217,
    MYR: 4.6034,
    NOK: 10.778,
    NZD: 2.0061,
    PHP: 70.702,
    PLN: 4.365,
    RON: 5.351,
    SEK: 11.2425,
    SGD: 1.4392,
    THB: 37.836,
    TRY: 55.4196,
    USD: 1.1269,
    ZAR: 18.5829,
  },
};

export const CURRENCY_NAMES: CurrencyNames = {
  AUD: 'Australian Dollar',
  BRL: 'Brazilian Real',
  CAD: 'Canadian Dollar',
  CHF: 'Swiss Franc',
  CNY: 'Chinese Renminbi Yuan',
  CZK: 'Czech Koruna',
  DKK: 'Danish Krone',
  EUR: 'Euro',
  GBP: 'British Pound',
  HKD: 'Hong Kong Dollar',
  HUF: 'Hungarian Forint',
  IDR: 'Indonesian Rupiah',
  ILS: 'Israeli New Shekel',
  INR: 'Indian Rupee',
  ISK: 'Icelandic Króna',
  JPY: 'Japanese Yen',
  KRW: 'South Korean Won',
  MXN: 'Mexican Peso',
  MYR: 'Malaysian Ringgit',
  NOK: 'Norwegian Krone',
  NZD: 'New Zealand Dollar',
  PHP: 'Philippine Peso',
  PLN: 'Polish Złoty',
  RON: 'Romanian Leu',
  SEK: 'Swedish Krona',
  SGD: 'Singapore Dollar',
  THB: 'Thai Baht',
  TRY: 'Turkish Lira',
  USD: 'United States Dollar',
  ZAR: 'South African Rand',
};
