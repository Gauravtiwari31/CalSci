import { useMemo, useState } from 'react';
import { numeric } from '../../app/services';
import { CURRENCY_NAMES } from '../../engine/currency';
import { formatDecimal } from '../../engine/format';
import { useStore } from '../../store';
import { Icon } from '../Icon';
import { mathfield } from '../mathfield/controller';
import { Segmented } from '../sheets/Sheet';
import { UNIT_CATEGORIES, unitLatex, unitSymbol } from './units';

type Mode = 'units' | 'currency';

const formatRatesDate = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

/** Accepts "1,234.5", "−3", "2.5e3". Returns a clean decimal string or null. */
function cleanAmount(s: string): string | null {
  const t = s.trim().replace(/[−–]/g, '-').replace(/,/g, '').replace(/\s/g, '');
  return /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t) ? t : null;
}

interface Conversion {
  value: string;
  display: string;
  rate: string;
}

function convert(
  amount: string,
  from: string,
  to: string,
  money: boolean,
  digits: number,
  grouping: 'international' | 'indian',
): Conversion {
  const run = (a: string) => {
    const out = numeric.evaluate(`(${a} ${from}) to ${to}`, {});
    const u = out.value as any;
    const n = u.toNumeric(u.formatUnits());
    return out.inst.math.isBigNumber(n) ? n.toString() : String(n);
  };
  const value = run(amount);
  const opts = { digits, grouping };
  const display =
    money && Math.abs(Number(value)) >= 0.01
      ? formatDecimal(Number(value).toFixed(2), { ...opts, digits: 30 }).text
      : formatDecimal(value, opts).text;
  const unitRate = formatDecimal(run('1'), { ...opts, digits: 8 }).text;
  return { value, display, rate: unitRate };
}

export function ConverterPanel() {
  const rates = useStore((s) => s.rates);
  const settings = useStore((s) => s.settings);
  const refreshRates = useStore((s) => s.refreshRates);
  const [mode, setMode] = useState<Mode>('units');
  const [catId, setCatId] = useState('length');
  const [amount, setAmount] = useState('1');
  const [pairs, setPairs] = useState<Record<string, [string, string]>>(() => ({
    ...Object.fromEntries(UNIT_CATEGORIES.map((c) => [c.id, c.pair])),
    currency: ['USD', 'INR'],
  }));
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const cat = UNIT_CATEGORIES.find((c) => c.id === catId)!;
  const key = mode === 'currency' ? 'currency' : catId;
  const [from, to] = pairs[key];
  const currencies = useMemo(() => [rates.base, ...Object.keys(rates.rates)].sort(), [rates]);
  const options =
    mode === 'currency'
      ? currencies.map((c) => ({ name: c, label: `${c} · ${CURRENCY_NAMES[c] ?? c}` }))
      : cat.units.map((x) => ({
          name: x.name,
          label: `${unitSymbol(cat, x.name)} · ${x.label.replace(/\s*\([^)]*\)$/, '')}`,
        }));

  const clean = cleanAmount(amount);
  let result: Conversion | null = null;
  let error: string | null = null;
  if (clean === null) error = amount.trim() ? 'Enter a number, like 12.5' : null;
  else {
    try {
      result = convert(clean, from, to, mode === 'currency', settings.displayDigits, settings.grouping);
    } catch (e) {
      error = (e as Error).message;
    }
  }

  const setPair = (f: string, t: string) => setPairs({ ...pairs, [key]: [f, t] });
  const sym = (n: string) => (mode === 'currency' ? n : unitSymbol(cat, n));
  const expression = clean ? `${clean}\\,${unitLatex(from)}\\operatorname{to}${unitLatex(to)}` : '';

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1400);
  };

  return (
    <section className="converter" aria-label="Converter">
      <div className="converter__head">
        <h2 className="section-label">Convert</h2>
        <div style={{ marginLeft: 'auto', minWidth: 210 }}>
          <Segmented
            label=""
            value={mode}
            onChange={setMode}
            options={[
              { value: 'units', label: 'Units' },
              { value: 'currency', label: 'Currency' },
            ]}
          />
        </div>
      </div>

      {mode === 'units' && (
        <div className="converter__cats" role="tablist" aria-label="Quantity">
          {UNIT_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              className="pill mode-pill"
              aria-selected={c.id === catId}
              onClick={() => setCatId(c.id)}
            >
              {c.title}
            </button>
          ))}
        </div>
      )}

      <div className="brutal converter__card">
        <label className="field">
          <span className="label">Amount</span>
          <input
            className="input"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={!!error}
            data-testid="convert-amount"
          />
        </label>
        <div className="converter__row">
          <label className="field">
            <span className="label">From</span>
            <select value={from} onChange={(e) => setPair(e.target.value, to)} data-testid="convert-from">
              {options.map((o) => (
                <option key={o.name} value={o.name}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="brutal press icon-btn converter__swap"
            aria-label="Swap units"
            onClick={() => setPair(to, from)}
          >
            <Icon name="swap" />
          </button>
          <label className="field">
            <span className="label">To</span>
            <select value={to} onChange={(e) => setPair(from, e.target.value)} data-testid="convert-to">
              {options.map((o) => (
                <option key={o.name} value={o.name}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="converter__result" aria-live="polite">
          <span className="label">Result</span>
          {error ? (
            <p className="converter__error">{error}</p>
          ) : result ? (
            <>
              <div className="converter__value" data-testid="convert-result">
                {result.display}
                <small>{sym(to)}</small>
              </div>
              <div className="converter__rate">
                1 {sym(from)} = {result.rate} {sym(to)}
              </div>
            </>
          ) : (
            <div className="converter__value">—</div>
          )}
        </div>

        {mode === 'currency' && (
          <div className="converter__foot">
            <span className="hint" style={{ flex: 1 }}>
              ECB reference rates · {formatRatesDate(rates.date)}
              {rates.fetchedAt ? '' : ' (bundled)'}
            </span>
            <button
              type="button"
              className="brutal press icon-btn"
              aria-label="Refresh rates"
              disabled={refreshing}
              onClick={async () => {
                setRefreshing(true);
                const before = rates.date;
                await refreshRates(true);
                setRefreshing(false);
                const now = useStore.getState().rates;
                flash(
                  now.fetchedAt && now.date !== before
                    ? `Rates updated to ${formatRatesDate(now.date)}`
                    : now.fetchedAt
                      ? 'Rates are up to date'
                      : 'Offline. Using saved rates.',
                );
              }}
            >
              <Icon name="refresh" />
            </button>
          </div>
        )}
      </div>

      <div className="btn-row">
        <button
          type="button"
          className="brutal press btn btn--sm"
          disabled={!result}
          onClick={() => {
            mathfield.set(expression);
            useStore.getState().setLayer('basic');
            useStore.getState().updatePreview();
          }}
        >
          Use in expression
        </button>
        <button
          type="button"
          className="brutal press btn btn--sm btn--primary"
          disabled={!result}
          onClick={async () => {
            mathfield.set(expression);
            await useStore.getState().evaluate();
            flash('Saved to history');
          }}
        >
          Save to history <Icon name="arrowRight" size={18} />
        </button>
      </div>

      {toast && (
        <div className="toast" role="status">
          <span className="toast__tick">
            <Icon name="check" size={16} stroke={2.6} />
          </span>
          {toast}
        </div>
      )}
    </section>
  );
}
