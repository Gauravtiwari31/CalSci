import { useEffect, useRef, useState } from 'react';
import type { HistoryEntry } from '../../db';
import type { EngineName } from '../../engine/types';
import { copyText, share } from '../../platform';
import { useStore } from '../../store';
import { Icon } from '../Icon';
import { mathfield } from '../mathfield/controller';
import { MathView } from '../MathView';

const formatRatesDate = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};
const formatTime = (ms: number) =>
  new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

const ENGINE_STICKER: Record<EngineName, { label: string; tone: string }> = {
  mathjs: { label: 'Numeric', tone: 'sky' },
  ce: { label: 'Symbolic', tone: 'lilac' },
  sympy: { label: 'SymPy', tone: 'lilac' },
  jstat: { label: 'Stats', tone: 'mint' },
  finance: { label: 'Finance', tone: 'butter' },
};

/** Wrap in parentheses unless it's a bare number or symbol. */
function forInsertion(latex: string): string {
  return /^-?[\d.{},]+$|^[a-zA-Z]$/.test(latex) ? latex.replace(/\{,\}/g, '') : `\\left(${latex}\\right)`;
}

function valueLatex(e: HistoryEntry): string {
  if (e.valueText && /^-?[\d.]+(e[+-]?\d+)?$/i.test(e.valueText)) {
    return e.valueText.replace(/e([+-]?\d+)$/i, '\\times10^{$1}');
  }
  return e.resultLatex;
}

interface MenuState {
  entry: HistoryEntry;
  x: number;
  y: number;
}

function useLongPress(onLong: (x: number, y: number) => void, ms = 500) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fired = useRef(false);
  return {
    fired,
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        fired.current = false;
        const { clientX, clientY } = e;
        timer.current = setTimeout(() => {
          fired.current = true;
          onLong(clientX, clientY);
        }, ms);
      },
      onPointerUp: () => clearTimeout(timer.current),
      onPointerLeave: () => clearTimeout(timer.current),
      onPointerCancel: () => clearTimeout(timer.current),
      onContextMenu: (e: React.MouseEvent) => {
        e.preventDefault();
        clearTimeout(timer.current);
        fired.current = true;
        onLong(e.clientX, e.clientY);
      },
    },
  };
}

function Entry({
  entry,
  isNew,
  onMenu,
}: {
  entry: HistoryEntry;
  isNew: boolean;
  onMenu: (m: MenuState) => void;
}) {
  const [full, setFull] = useState(false);
  const [approxFirst, setApproxFirst] = useState(false);
  const lp = useLongPress((x, y) => onMenu({ entry, x, y }));
  const hasExact = !!entry.approxLatex;
  const primary = hasExact && approxFirst ? entry.approxLatex! : entry.resultLatex;
  const secondary = hasExact ? (approxFirst ? entry.resultLatex : entry.approxLatex!) : null;
  const isLong = primary.length > 60;
  const engine = ENGINE_STICKER[entry.engine];
  const manyDigits = !!entry.resultApprox && entry.resultApprox.replace(/[^\d]/g, '').length > 12;

  const insert = () => {
    if (lp.fired.current || !entry.resultLatex) return;
    mathfield.insert(forInsertion(entry.valueText ? valueLatex(entry) : entry.resultLatex));
    useStore.getState().updatePreview();
  };

  return (
    <li className={`brutal entry${isNew ? ' entry--new' : ''}`} data-testid="tape-entry">
      <div className="entry__meta">
        <span className={`sticker sticker--${engine.tone}`}>{engine.label}</span>
        {entry.precision === 'double' && (
          <span className="sticker sticker--butter" title="Computed in double precision (about 15 digits)">
            ≈ Double
          </span>
        )}
        {entry.ratesDate && (
          <span className="sticker sticker--plain">Rates {formatRatesDate(entry.ratesDate)}</span>
        )}
        {entry.pinned === 1 && <span className="sticker sticker--lime">Pinned</span>}
        <span className="label entry__time">{formatTime(entry.createdAt)}</span>
      </div>
      <button
        type="button"
        className="entry__input"
        aria-label="Reuse this expression"
        onClick={() => mathfield.set(entry.inputLatex)}
      >
        <MathView latex={entry.inputLatex} />
      </button>
      <div className="entry__rule" aria-hidden="true" />
      {primary && (
        <button
          type="button"
          className={`entry__result${isLong ? ' is-long' : ''}`}
          aria-label="Insert result"
          onClick={insert}
          {...lp.handlers}
        >
          <MathView latex={primary} />
        </button>
      )}
      {entry.table && (
        <div className="table-wrap" {...lp.handlers}>
          <table className="result-table">
            <thead>
              <tr>
                {entry.table.columns.map((c, i) => (
                  <th key={i} scope="col">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entry.table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) =>
                    j === 0 ? (
                      <th key={j} scope="row">
                        {c}
                      </th>
                    ) : (
                      <td key={j}>{c}</td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(secondary || manyDigits) && (
        <div className="entry__sub">
          {secondary && (
            <button
              type="button"
              className="entry__approx"
              aria-label="Swap exact and approximate"
              onClick={() => setApproxFirst((v) => !v)}
            >
              {approxFirst ? '' : '≈ '}
              <MathView latex={secondary} />
            </button>
          )}
          {manyDigits && (
            <button type="button" className="link" onClick={() => setFull((v) => !v)} aria-expanded={full}>
              {full ? 'Fewer digits' : 'All digits'}
            </button>
          )}
        </div>
      )}
      {full && entry.resultApprox && <div className="entry__full">{entry.resultApprox}</div>}
    </li>
  );
}

function EntryMenu({ menu, onClose }: { menu: MenuState; onClose: () => void }) {
  const { entry } = menu;
  const ref = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState<string | null>(null);
  const openSheet = useStore((s) => s.openSheet);
  const deleteEntry = useStore((s) => s.deleteEntry);

  useEffect(() => {
    ref.current?.querySelector('button')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose();
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [onClose]);

  const text = entry.resultApprox || entry.resultLatex;
  const act = async (fn: () => unknown, msg?: string) => {
    await fn();
    if (msg) {
      setToast(msg);
      setTimeout(onClose, 800);
    } else onClose();
  };
  const left = Math.min(menu.x, window.innerWidth - 248);
  const top = Math.min(menu.y, window.innerHeight - 360);
  const hasUnit = !!entry.valueText && /[a-zA-Z]/.test(entry.valueText.replace(/e[+-]?\d+/i, ''));

  return (
    <>
      <div
        ref={ref}
        className="brutal menu"
        role="menu"
        style={{ left: Math.max(8, left), top: Math.max(8, top) }}
      >
        <button
          role="menuitem"
          onClick={() =>
            act(() => mathfield.insert(forInsertion(entry.valueText ? valueLatex(entry) : entry.resultLatex)))
          }
        >
          <Icon name="plus" size={18} /> Insert into expression
        </button>
        <button role="menuitem" onClick={() => act(() => copyText(text), 'Copied')}>
          <Icon name="copy" size={18} /> Copy value
        </button>
        <button role="menuitem" onClick={() => act(() => copyText(entry.resultLatex), 'Copied LaTeX')}>
          <Icon name="copy" size={18} /> Copy LaTeX
        </button>
        {entry.valueText && entry.id !== undefined && (
          <button role="menuitem" onClick={() => act(() => openSheet({ kind: 'pin', entryId: entry.id! }))}>
            <Icon name="vars" size={18} /> Pin as variable
          </button>
        )}
        {hasUnit && (
          <button
            role="menuitem"
            onClick={() => act(() => mathfield.set(`${forInsertion(entry.resultLatex)}\\operatorname{to}`))}
          >
            <Icon name="swap" size={18} /> Convert to another unit
          </button>
        )}
        <button role="menuitem" onClick={() => act(() => share(`${entry.inputLatex} = ${text}`))}>
          <Icon name="arrowRight" size={18} /> Share
        </button>
        <hr />
        <button
          role="menuitem"
          className="is-danger"
          onClick={() => act(() => entry.id !== undefined && deleteEntry(entry.id))}
        >
          <Icon name="x" size={18} /> Delete
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
    </>
  );
}

const EXAMPLES: { label: string; latex: string }[] = [
  { label: '√2 / 2', latex: '\\frac{\\sqrt{2}}{2}' },
  { label: '∫ x² sin x dx', latex: '\\int x^2\\sin(x)\\,\\mathrm{d}x' },
  { label: '2x + 3 = 7', latex: '2x+3=7' },
  { label: '5 km to mi', latex: '5{\\mathrm{km}}\\operatorname{to}{\\mathrm{mi}}' },
];

function EmptyState() {
  return (
    <li className="brutal empty">
      <span className="label">History</span>
      <h2 className="empty__title">
        Results land <span className="serif">here.</span>
      </h2>
      <p>Tap a result to reuse it. Long-press for copy, pin and share.</p>
      <div className="empty__examples">
        {EXAMPLES.map((ex) => (
          <button
            key={ex.label}
            type="button"
            className="pill mode-pill"
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => {
              mathfield.set(ex.latex);
              useStore.getState().updatePreview();
            }}
          >
            {ex.label}
          </button>
        ))}
      </div>
    </li>
  );
}

export function Tape() {
  const history = useStore((s) => s.history);
  const lastAddedId = useStore((s) => s.lastAddedId);
  const casStatus = useStore((s) => s.casStatus);
  const announcement = useStore((s) => s.announcement);
  const ready = useStore((s) => s.ready);
  const ref = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history.length, casStatus.state]);

  return (
    <section className="tape" ref={ref} aria-label="History">
      <ol className="tape__list">
        {ready && history.length === 0 && <EmptyState />}
        {history.map((e) => (
          <Entry key={e.id ?? e.createdAt} entry={e} isNew={e.id === lastAddedId} onMenu={setMenu} />
        ))}
        {casStatus.state === 'loading' && (
          <li className="brutal cas-loading" aria-live="polite">
            <span className="label">First time only</span>
            <p>Loading advanced math…</p>
            <div
              className="progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(casStatus.progress * 100)}
            >
              <div className="progress__bar" style={{ width: `${casStatus.progress * 100}%` }} />
            </div>
          </li>
        )}
      </ol>
      <div className="visually-hidden" aria-live="polite">
        {announcement}
      </div>
      {menu && <EntryMenu menu={menu} onClose={() => setMenu(null)} />}
    </section>
  );
}
