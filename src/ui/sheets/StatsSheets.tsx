import { useMemo, useState } from 'react';
import type { Variable } from '../../engine/types';
import { useStore } from '../../store';
import { mathfield } from '../mathfield/controller';
import { Field, Segmented, Sheet } from './Sheet';

const LISTS = ['L_1', 'L_2', 'L_3', 'L_4'] as const;

/** Numbers separated by commas, spaces, tabs, semicolons or new lines (spreadsheet paste). */
export function parseData(text: string): { values: number[]; bad: string[] } {
  const tokens = text
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const values: number[] = [];
  const bad: string[] = [];
  for (const t of tokens) {
    const n = Number(t.replace(/[−–]/g, '-'));
    if (Number.isFinite(n)) values.push(n);
    else bad.push(t);
  }
  return { values, bad };
}

function listVariable(name: string, values: number[]): Variable {
  return {
    name,
    valueText: `[${values.join(', ')}]`,
    json: values.length <= 1000 ? ['List', ...values] : null,
    latex:
      values.length <= 6
        ? `\\left[${values.join(',')}\\right]`
        : `\\left[${values.slice(0, 3).join(',')},\\ldots\\right]\\ (n=${values.length})`,
    updatedAt: Date.now(),
  };
}

const listText = (v?: Variable) => (v ? v.valueText.replace(/^\[|\]$/g, '').replace(/,\s*/g, '\n') : '');

export async function submitExpression(latex: string) {
  mathfield.set(latex);
  useStore.getState().closeSheet();
  await useStore.getState().evaluate();
}

export function StatsDataSheet() {
  const variables = useStore((s) => s.variables);
  const setVariables = useStore((s) => s.setVariables);
  const close = useStore((s) => s.closeSheet);
  const [active, setActive] = useState<(typeof LISTS)[number]>('L_1');
  const [texts, setTexts] = useState<Record<string, string>>(() =>
    Object.fromEntries(LISTS.map((l) => [l, listText(variables[l])])),
  );
  const parsed = useMemo(() => parseData(texts[active] ?? ''), [texts, active]);
  const [msg, setMsg] = useState<string | null>(null);

  const save = async () => {
    const vars: Variable[] = [];
    for (const l of LISTS) {
      const { values } = parseData(texts[l] ?? '');
      if (!values.length) continue;
      vars.push(listVariable(l, values));
    }
    await setVariables(vars);
    return vars.length;
  };

  const paste = async () => {
    try {
      const t = await navigator.clipboard.readText();
      setTexts({ ...texts, [active]: t });
    } catch {
      setMsg('Clipboard access was blocked. Long-press the box and paste instead.');
    }
  };

  const use = async (fn: string) => {
    await save();
    const name = active.replace('_', '_{') + '}';
    mathfield.insert(`\\operatorname{${fn}}\\left(${name}\\right)`);
    close();
  };

  return (
    <Sheet title="Data lists">
      <Segmented
        label="List"
        value={active}
        onChange={setActive}
        options={LISTS.map((l) => ({ value: l, label: l.replace('_', '') }))}
      />
      <Field
        label={`Values in ${active.replace('_', '')}`}
        hint={`${parsed.values.length} value${parsed.values.length === 1 ? '' : 's'}${parsed.bad.length ? `; ignored: ${parsed.bad.slice(0, 3).join(' ')}` : ''}`}
      >
        <textarea
          value={texts[active]}
          onChange={(e) => setTexts({ ...texts, [active]: e.target.value })}
          placeholder="One value per line, or separated by commas. Paste a spreadsheet column."
          inputMode="decimal"
          spellCheck={false}
        />
      </Field>
      {msg && <p className="hint">{msg}</p>}
      <div className="btn-row">
        <button type="button" className="btn" onClick={paste}>
          Paste from clipboard
        </button>
        <button type="button" className="btn" onClick={() => setTexts({ ...texts, [active]: '' })}>
          Clear list
        </button>
        <button
          type="button"
          className="btn btn--primary"
          onClick={async () => {
            const n = await save();
            setMsg(n ? 'Saved. Use L1 to L4 in any expression.' : 'Nothing to save yet.');
          }}
        >
          Save lists
        </button>
      </div>
      <h3 className="section-title">Use {active.replace('_', '')}</h3>
      <div className="pick-grid">
        {[
          ['mean', 'mean'],
          ['median', 'median'],
          ['std', 's (sample)'],
          ['pstd', 'σ (population)'],
          ['var', 'variance'],
          ['sum', 'Σx'],
          ['count', 'n'],
        ].map(([fn, label]) => (
          <button key={fn} type="button" onClick={() => use(fn)}>
            {label}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

type Dist = 'normal' | 't' | 'chi2' | 'binom' | 'poisson';

const DIST: Record<
  Dist,
  { label: string; params: { name: string; label: string; def: string }[]; fns: Record<string, string> }
> = {
  normal: {
    label: 'Normal',
    params: [
      { name: 'mu', label: 'mean μ', def: '0' },
      { name: 'sigma', label: 'std dev σ', def: '1' },
    ],
    fns: { pdf: 'normpdf', cdf: 'normcdf', inv: 'norminv' },
  },
  t: {
    label: 'Student t',
    params: [{ name: 'df', label: 'degrees of freedom', def: '10' }],
    fns: { pdf: 'tpdf', cdf: 'tcdf', inv: 'tinv' },
  },
  chi2: {
    label: 'χ²',
    params: [{ name: 'df', label: 'degrees of freedom', def: '1' }],
    fns: { pdf: 'chi2pdf', cdf: 'chi2cdf', inv: 'chi2inv' },
  },
  binom: {
    label: 'Binomial',
    params: [
      { name: 'n', label: 'trials n', def: '10' },
      { name: 'p', label: 'success p', def: '0.5' },
    ],
    fns: { pdf: 'binompdf', cdf: 'binomcdf' },
  },
  poisson: {
    label: 'Poisson',
    params: [{ name: 'lambda', label: 'rate λ', def: '3' }],
    fns: { pdf: 'poisspdf', cdf: 'poisscdf' },
  },
};

const num = (s: string) => s.trim().replace(/[−–]/g, '-') || '0';

export function DistributionSheet() {
  const [dist, setDist] = useState<Dist>('normal');
  const [kind, setKind] = useState('cdf');
  const [x, setX] = useState('1.96');
  const [params, setParams] = useState<Record<string, string>>({});
  const d = DIST[dist];
  const fn = d.fns[kind] ?? d.fns.cdf;
  const xLabel = kind === 'inv' ? 'probability p' : dist === 'binom' || dist === 'poisson' ? 'k' : 'x';

  const go = () => {
    const args = [num(x), ...d.params.map((p) => num(params[`${dist}.${p.name}`] ?? p.def))];
    void submitExpression(`\\operatorname{${fn}}\\left(${args.join(',')}\\right)`);
  };

  return (
    <Sheet title="Distributions">
      <Segmented
        label="Distribution"
        value={dist}
        onChange={(v) => setDist(v)}
        options={(Object.keys(DIST) as Dist[]).map((k) => ({ value: k, label: DIST[k].label }))}
      />
      <Segmented
        label="Function"
        value={d.fns[kind] ? kind : 'cdf'}
        onChange={setKind}
        options={Object.keys(d.fns).map((k) => ({
          value: k,
          label: {
            pdf: dist === 'binom' || dist === 'poisson' ? 'P(X = k)' : 'pdf',
            cdf: 'P(X ≤ x)',
            inv: 'inverse',
          }[k]!,
        }))}
      />
      <div className="row">
        <Field label={xLabel}>
          <input inputMode="decimal" value={x} onChange={(e) => setX(e.target.value)} />
        </Field>
        {d.params.map((p) => (
          <Field key={p.name} label={p.label}>
            <input
              inputMode="decimal"
              value={params[`${dist}.${p.name}`] ?? p.def}
              onChange={(e) => setParams({ ...params, [`${dist}.${p.name}`]: e.target.value })}
            />
          </Field>
        ))}
      </div>
      <div className="btn-row">
        <button type="button" className="btn btn--primary" onClick={go}>
          Calculate
        </button>
      </div>
    </Sheet>
  );
}
