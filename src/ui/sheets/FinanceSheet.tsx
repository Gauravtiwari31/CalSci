import { useState } from 'react';
import { parseData, submitExpression } from './StatsSheets';
import { Field, Segmented, Sheet } from './Sheet';

type Form = 'tvm' | 'npv' | 'cagr' | 'amort' | 'options' | 'bond';
const TITLES: Record<Form, string> = {
  tvm: 'Time value of money',
  npv: 'NPV and IRR',
  cagr: 'Compound annual growth',
  amort: 'Amortization table',
  options: 'Options (Black–Scholes)',
  bond: 'Bond',
};

const n = (s: string) => {
  const t = s.trim().replace(/[−–]/g, '-').replace(/,/g, '');
  return t === '' || !Number.isFinite(Number(t)) ? null : t;
};
/** Percent text → decimal LaTeX, e.g. "6" → "0.06". */
const pct = (s: string) => {
  const v = n(s);
  return v === null ? null : String(Number(v) / 100);
};

function useFields<T extends string>(init: Record<T, string>) {
  const [v, setV] = useState(init);
  const bind = (k: T) => ({
    value: v[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value }),
    inputMode: 'decimal' as const,
  });
  return { v, bind };
}

function Submit({ latex, error }: { latex: string | null; error?: string }) {
  return (
    <>
      {!latex && <p className="hint">{error ?? 'Fill in every field with a number.'}</p>}
      <div className="btn-row">
        <button
          type="button"
          className="btn btn--primary"
          disabled={!latex}
          onClick={() => latex && submitExpression(latex)}
        >
          Calculate
        </button>
      </div>
    </>
  );
}

const op = (name: string, args: (string | null)[]) =>
  args.some((a) => a === null) ? null : `\\operatorname{${name}}\\left(${args.join(',')}\\right)`;

function Tvm() {
  const [solve, setSolve] = useState<'fv' | 'pv' | 'pmt' | 'nper' | 'rate'>('pmt');
  const [ppy, setPpy] = useState(12);
  const { v, bind } = useFields({ rate: '6', nper: '360', pmt: '', pv: '300000', fv: '0' });
  const r = pct(v.rate) === null ? null : `${pct(v.rate)}/${ppy}`;
  const args = {
    fv: [r, n(v.nper), n(v.pmt), n(v.pv)],
    pv: [r, n(v.nper), n(v.pmt), n(v.fv)],
    pmt: [r, n(v.nper), n(v.pv), n(v.fv)],
    nper: [r, n(v.pmt), n(v.pv), n(v.fv)],
    rate: [n(v.nper), n(v.pmt), n(v.pv), n(v.fv)],
  }[solve];
  let latex = op(solve, args);
  if (latex && solve === 'rate') latex = `${latex}\\times${ppy}\\times100`;
  const show = (k: string) => k !== solve;
  return (
    <>
      <Segmented
        label="Solve for"
        value={solve}
        onChange={setSolve}
        options={[
          { value: 'pmt', label: 'payment' },
          { value: 'fv', label: 'FV' },
          { value: 'pv', label: 'PV' },
          { value: 'nper', label: 'periods' },
          { value: 'rate', label: 'rate' },
        ]}
      />
      <Segmented
        label="Periods per year"
        value={ppy}
        onChange={setPpy}
        options={[1, 4, 12, 52].map((x) => ({ value: x, label: String(x) }))}
      />
      <div className="row">
        {show('rate') && (
          <Field label="Annual rate %">
            <input {...bind('rate')} />
          </Field>
        )}
        {show('nper') && (
          <Field label="Number of periods">
            <input {...bind('nper')} />
          </Field>
        )}
        {show('pmt') && (
          <Field label="Payment per period">
            <input {...bind('pmt')} />
          </Field>
        )}
        {show('pv') && (
          <Field label="Present value">
            <input {...bind('pv')} />
          </Field>
        )}
        {show('fv') && (
          <Field label="Future value">
            <input {...bind('fv')} />
          </Field>
        )}
      </div>
      <p className="hint">
        Money you pay out is negative, money you receive is positive.{' '}
        {solve === 'rate' ? 'Result is the annual rate in %.' : ''}
      </p>
      <Submit latex={latex} />
    </>
  );
}

function Npv() {
  const [rate, setRate] = useState('10');
  const [flows, setFlows] = useState('-1000\n300\n400\n500');
  const { values } = parseData(flows);
  const list = values.length ? `\\left[${values.join(',')}\\right]` : null;
  const r = pct(rate);
  const npv =
    list && r !== null && values.length > 1
      ? `${values[0]}+\\operatorname{npv}\\left(${r},\\left[${values.slice(1).join(',')}\\right]\\right)`
      : null;
  const irr = list && values.length > 1 ? `\\operatorname{irr}\\left(${list}\\right)\\times100` : null;
  return (
    <>
      <Field label="Discount rate %">
        <input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" />
      </Field>
      <Field label="Cash flows, starting at time 0" hint={`${values.length} cash flows`}>
        <textarea value={flows} onChange={(e) => setFlows(e.target.value)} spellCheck={false} />
      </Field>
      <div className="btn-row">
        <button type="button" className="btn" disabled={!irr} onClick={() => irr && submitExpression(irr)}>
          IRR %
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={!npv}
          onClick={() => npv && submitExpression(npv)}
        >
          NPV
        </button>
      </div>
    </>
  );
}

function Cagr() {
  const { v, bind } = useFields({ begin: '1000', end: '2000', years: '5' });
  const l = op('cagr', [n(v.begin), n(v.end), n(v.years)]);
  return (
    <>
      <div className="row">
        <Field label="Starting value">
          <input {...bind('begin')} />
        </Field>
        <Field label="Ending value">
          <input {...bind('end')} />
        </Field>
        <Field label="Years">
          <input {...bind('years')} />
        </Field>
      </div>
      <p className="hint">Result is the growth rate in %.</p>
      <Submit latex={l && `${l}\\times100`} />
    </>
  );
}

function Amort() {
  const { v, bind } = useFields({ principal: '300000', rate: '6', years: '30' });
  const [ppy, setPpy] = useState(12);
  const r = pct(v.rate);
  const periods = n(v.years) === null ? null : String(Math.round(Number(v.years) * ppy));
  const latex = op('amort', [n(v.principal), r === null ? null : `${r}/${ppy}`, periods]);
  return (
    <>
      <div className="row">
        <Field label="Loan amount">
          <input {...bind('principal')} />
        </Field>
        <Field label="Annual rate %">
          <input {...bind('rate')} />
        </Field>
        <Field label="Years">
          <input {...bind('years')} />
        </Field>
      </div>
      <Segmented
        label="Payments per year"
        value={ppy}
        onChange={setPpy}
        options={[1, 4, 12].map((x) => ({ value: x, label: String(x) }))}
      />
      <Submit latex={periods && Number(periods) > 1200 ? null : latex} error="At most 1200 payments." />
    </>
  );
}

function Options() {
  const [type, setType] = useState<'call' | 'put'>('call');
  const { v, bind } = useFields({ S: '100', K: '100', T: '1', r: '5', sigma: '20' });
  const latex = op(type === 'call' ? 'bscall' : 'bsput', [n(v.S), n(v.K), n(v.T), pct(v.r), pct(v.sigma)]);
  return (
    <>
      <Segmented
        label="Option"
        value={type}
        onChange={setType}
        options={[
          { value: 'call', label: 'call' },
          { value: 'put', label: 'put' },
        ]}
      />
      <div className="row">
        <Field label="Spot price S">
          <input {...bind('S')} />
        </Field>
        <Field label="Strike K">
          <input {...bind('K')} />
        </Field>
        <Field label="Years to expiry T">
          <input {...bind('T')} />
        </Field>
        <Field label="Risk-free rate %">
          <input {...bind('r')} />
        </Field>
        <Field label="Volatility σ %">
          <input {...bind('sigma')} />
        </Field>
      </div>
      <p className="hint">European option. Shows price and the Greeks (theta per year).</p>
      <Submit latex={latex} />
    </>
  );
}

function Bond() {
  const [what, setWhat] = useState<'bondprice' | 'duration' | 'mduration' | 'convexity'>('bondprice');
  const [freq, setFreq] = useState(2);
  const { v, bind } = useFields({ face: '1000', coupon: '5', ytm: '6', years: '10' });
  const latex = op(what, [n(v.face), pct(v.coupon), pct(v.ytm), n(v.years), String(freq)]);
  return (
    <>
      <Segmented
        label="Calculate"
        value={what}
        onChange={setWhat}
        options={[
          { value: 'bondprice', label: 'price' },
          { value: 'duration', label: 'Macaulay' },
          { value: 'mduration', label: 'modified' },
          { value: 'convexity', label: 'convexity' },
        ]}
      />
      <div className="row">
        <Field label="Face value">
          <input {...bind('face')} />
        </Field>
        <Field label="Coupon rate %">
          <input {...bind('coupon')} />
        </Field>
        <Field label="Yield to maturity %">
          <input {...bind('ytm')} />
        </Field>
        <Field label="Years to maturity">
          <input {...bind('years')} />
        </Field>
      </div>
      <Segmented
        label="Coupons per year"
        value={freq}
        onChange={setFreq}
        options={[1, 2, 4, 12].map((x) => ({ value: x, label: String(x) }))}
      />
      <Submit latex={latex} />
    </>
  );
}

export function FinanceSheet({ form }: { form: Form }) {
  const C = { tvm: Tvm, npv: Npv, cagr: Cagr, amort: Amort, options: Options, bond: Bond }[form];
  return (
    <Sheet title={TITLES[form]}>
      <C />
    </Sheet>
  );
}
