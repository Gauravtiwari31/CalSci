import { useState } from 'react';
import { LINKS } from '../../app/links';
import { CURRENCY_NAMES } from '../../engine/currency';
import { isNative } from '../../platform';
import { useStore } from '../../store';
import { Icon } from '../Icon';
import { Field, Segmented, Sheet } from './Sheet';

const clampInt = (v: string, lo: number, hi: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

export function SettingsSheet() {
  const s = useStore((st) => st.settings);
  const set = useStore((st) => st.setSetting);
  const rates = useStore((st) => st.rates);
  const refreshRates = useStore((st) => st.refreshRates);
  const clearHistory = useStore((st) => st.clearHistory);
  const [precision, setPrecision] = useState(String(s.precision));
  const [confirmClear, setConfirmClear] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  return (
    <Sheet title="Settings">
      <Segmented
        label="Angle mode"
        value={s.angle}
        onChange={(v) => set('angle', v)}
        options={[
          { value: 'deg', label: 'deg' },
          { value: 'rad', label: 'rad' },
          { value: 'grad', label: 'grad' },
        ]}
      />
      <Segmented
        label="Numbers"
        value={s.domain}
        onChange={(v) => set('domain', v)}
        options={[
          { value: 'real', label: 'real' },
          { value: 'complex', label: 'complex' },
        ]}
      />
      <div className="row">
        <Field label="Working precision (significant digits)" hint="16 to 1000. Higher is slower.">
          <input
            type="number"
            inputMode="numeric"
            min={16}
            max={1000}
            value={precision}
            onChange={(e) => setPrecision(e.target.value)}
            onBlur={() => {
              const v = clampInt(precision, 16, 1000, s.precision);
              setPrecision(String(v));
              set('precision', v);
            }}
          />
        </Field>
        <Field label="Displayed digits">
          <select value={s.displayDigits} onChange={(e) => set('displayDigits', Number(e.target.value))}>
            {[6, 8, 10, 12, 15, 20, 30].map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Segmented
        label="Digit grouping"
        value={s.grouping}
        onChange={(v) => set('grouping', v)}
        options={[
          { value: 'international', label: '1,000,000' },
          { value: 'indian', label: '10,00,000' },
        ]}
      />
      <Segmented
        label="Theme"
        value={s.theme}
        onChange={(v) => set('theme', v)}
        options={[
          { value: 'system', label: 'system' },
          { value: 'light', label: 'vellum' },
          { value: 'dark', label: 'blueprint' },
        ]}
      />
      <Segmented
        label="Haptics"
        value={s.haptics ? 'on' : 'off'}
        onChange={(v) => set('haptics', v === 'on')}
        options={[
          { value: 'on', label: 'on' },
          { value: 'off', label: 'off' },
        ]}
      />
      <Field label="Symbolic time limit">
        <select value={s.casTimeoutMs} onChange={(e) => set('casTimeoutMs', Number(e.target.value))}>
          {[10, 20, 30, 45, 60].map((sec) => (
            <option key={sec} value={sec * 1000}>
              {sec} s
            </option>
          ))}
        </select>
      </Field>

      <h3 className="section-title">Currency rates</h3>
      <p>
        {Object.keys(rates.rates).length + 1} currencies, ECB rates from {rates.date}
        {rates.fetchedAt
          ? `, synced ${new Date(rates.fetchedAt).toLocaleString()}`
          : ' (bundled with the app)'}
        .
      </p>
      <p className="hint">
        Source: Frankfurter (European Central Bank reference rates). Refreshed on open when older than 24
        hours. Supported: {Object.keys(CURRENCY_NAMES).join(', ')}.
      </p>
      <div className="btn-row">
        <button
          type="button"
          className="btn"
          disabled={refreshing}
          onClick={async () => {
            setRefreshing(true);
            await refreshRates(true);
            setRefreshing(false);
          }}
        >
          {refreshing ? 'Refreshing…' : 'Refresh rates now'}
        </button>
      </div>

      <h3 className="section-title">History</h3>
      <div className="btn-row">
        {confirmClear ? (
          <>
            <button type="button" className="btn" onClick={() => setConfirmClear(false)}>
              Keep history
            </button>
            <button
              type="button"
              className="btn btn--danger"
              onClick={async () => {
                await clearHistory();
                setConfirmClear(false);
              }}
            >
              Delete unpinned entries
            </button>
          </>
        ) : (
          <button type="button" className="btn" onClick={() => setConfirmClear(true)}>
            Clear history…
          </button>
        )}
      </div>

      <h3 className="section-title">About</h3>
      <p className="hint">
        CalSci : Scientific Calculator {__APP_VERSION__}. Numbers: math.js with arbitrary precision. Symbolic:
        Compute Engine and SymPy (runs on this device). Statistics: jStat. Everything works offline.
      </p>
      <ul className="list">
        {[
          { href: LINKS.privacy, label: 'Privacy policy' },
          { href: LINKS.website, label: 'Website' },
          { href: LINKS.source, label: 'Source code' },
          { href: LINKS.issues, label: 'Report a problem' },
        ].map((l) => (
          <li key={l.href}>
            <a
              href={l.href}
              // Android: Capacitor hands outside links to the phone's browser. Web: new tab.
              target={isNative() ? undefined : '_blank'}
              rel="noopener"
              style={{ color: 'inherit', fontWeight: 600, textDecoration: 'none' }}
            >
              {l.label}
            </a>
            <Icon name="arrowRight" size={18} />
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
