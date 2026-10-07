import { beforeAll, describe, expect, it } from 'vitest';
import { evaluateLatex, expandFunctions } from '../../src/engine/router';
import { makeCalc } from '../helpers/context';
import { loadHandle, offlineCas } from '../helpers/node-cas';

beforeAll(async () => {
  await loadHandle();
}, 120_000);

const M = '\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}';

describe('route table', () => {
  const cases: [latex: string, route: RegExp, engine: string][] = [
    ['2+3', /^numeric$/, 'mathjs'],
    ['\\sin(30)', /^numeric$/, 'mathjs'],
    [`\\det${M}`, /^numeric$/, 'mathjs'],
    ['\\operatorname{pmt}(0.01,12,1000)', /^numeric$/, 'finance'],
    ['\\operatorname{normcdf}(1.96)', /^numeric$/, 'jstat'],
    ['x^2+2x+1', /^ce:simplify$/, 'ce'],
    ['\\operatorname{factor}\\left(x^2-1\\right)', /^ce:factor$/, 'ce'],
    ['\\frac{\\mathrm{d}}{\\mathrm{d}x}\\left(x^3\\right)', /^ce:eval$/, 'ce'],
    ['\\int x\\,\\mathrm{d}x', /^sympy:integrate$/, 'sympy'],
    ['\\lim_{x\\to0}\\frac{\\sin x}{x}', /^sympy:limit$/, 'sympy'],
    ['2x+3=7', /^sympy:solve$/, 'sympy'],
    ["y''+y=0", /^sympy:dsolve$/, 'sympy'],
    ['\\sum_{n=1}^{10}n', /^ce:eval$/, 'ce'],
  ];
  for (const [latex, route, engine] of cases) {
    it(`${latex} → ${route.source}`, async () => {
      const { run } = makeCalc();
      const r = await run(latex);
      expect(r.route).toMatch(route);
      expect(r.engine).toBe(engine);
    });
  }
});

describe('results', () => {
  it('every result carries engine, exact, approx and precision', async () => {
    const r = await makeCalc().run('\\frac{\\sqrt{2}}{2}');
    expect(r).toMatchObject({ engine: 'mathjs', precision: 'arbitrary' });
    expect(r.exactLatex).toBe('\\frac{\\sqrt{2}}{2}');
    expect(r.approx.startsWith('0.70710678118654752440084436210484903928')).toBe(true);
  });
  it('0.1 + 0.2 is exactly 0.3', async () => expect((await makeCalc().run('0.1+0.2')).approx).toBe('0.3'));
  it('angle modes', async () => {
    expect((await makeCalc({ angle: 'deg' }).run('\\sin(30)')).approx).toBe('0.5');
    expect((await makeCalc({ angle: 'rad' }).run('\\sin\\left(\\frac{\\pi}{6}\\right)')).approx).toBe('0.5');
    expect((await makeCalc({ angle: 'grad' }).run('\\cos(100)')).approx).toBe('0');
    expect((await makeCalc({ angle: 'deg' }).run('\\arctan(1)')).approx).toBe('45');
  });
  it('sin(10^22) uses exact argument reduction', async () => {
    const r = await makeCalc({ angle: 'rad' }).run('\\sin\\left(10^{22}\\right)');
    expect(r.approx.startsWith('-0.8522008497671888017727')).toBe(true);
  });
  it('precision setting is honoured', async () => {
    const r = await makeCalc({ precision: 100 }).run('\\sqrt{2}');
    expect(r.approx.replace('.', '').length).toBeGreaterThanOrEqual(97);
  });
});

describe('BigNumber fallback (§5.4)', () => {
  it('gamma falls back to double and says so', async () => {
    const r = await makeCalc().run('\\Gamma(0.5)');
    expect(r.precision).toBe('double');
    expect(Number(r.approx)).toBeCloseTo(Math.sqrt(Math.PI), 12);
  });
  it('plain arithmetic stays arbitrary', async () =>
    expect((await makeCalc().run('2^{100}')).precision).toBe('arbitrary'));
  it('complex results are marked double', async () => {
    const r = await makeCalc({ domain: 'complex' }).run('\\sqrt{-4}');
    expect(r.approxLatex).toBe('2i');
    expect(r.precision).toBe('double');
  });
});

describe('variables and functions', () => {
  it('assigns, uses Ans, defines and calls functions', async () => {
    const { run } = makeCalc();
    await run('a\\coloneq 5');
    expect((await run('a^2')).approx).toBe('25');
    expect((await run('\\operatorname{Ans}+1')).approx).toBe('26');
    await run('f(x)\\coloneq x^2+1');
    expect((await run('f(3)')).approx).toBe('10');
    expect((await run('f(a)+f(1)')).approx).toBe('28');
  });
  it('symbolic routes see stored variables', async () => {
    const { run } = makeCalc();
    await run('k\\coloneq 3');
    const r = await run('\\int_0^1 k x^2\\,\\mathrm{d}x');
    expect(r.approx).toBe('1');
  });
  it('rejects reserved names', async () => {
    await expect(makeCalc().run('\\pi\\coloneq 3')).rejects.toThrow(/name/);
  });
  it('detects runaway recursion', () => {
    const fns = new Map([['f', { name: 'f', params: ['x'], body: ['f', 'x'], latex: '' }]]);
    expect(() => expandFunctions(['f', 1], fns)).toThrow(/recursion/);
  });
});

describe('units and currency', () => {
  it('converts speed', async () => {
    const r = await makeCalc().run(
      '17000\\,\\mathrm{mi}/\\mathrm{h}\\operatorname{to}\\mathrm{m}/\\mathrm{s}',
    );
    expect(r.approx).toBe('7599.68 m / s');
  });
  it('converts temperature', async () => {
    const r = await makeCalc().run('100\\,\\mathrm{degF}\\operatorname{to}\\mathrm{degC}');
    expect(Number(r.approx.split(' ')[0])).toBeCloseTo(37.7777777778, 9);
  });
  it('currency carries the rates date', async () => {
    const r = await makeCalc().run('2500\\,\\mathrm{INR}\\operatorname{to}\\mathrm{USD}');
    expect(r.ratesDate).toBe('2026-10-06');
    expect(r.approxLatex).toMatch(/^25\.93/);
  });
  it('mismatched units explain themselves', async () => {
    await expect(makeCalc().run('5\\,\\mathrm{km}\\operatorname{to}\\mathrm{kg}')).rejects.toThrow(
      /Units don't match/,
    );
  });
});

describe('errors say what happened', () => {
  const cases: [string, RegExp][] = [
    ['\\frac{1}{0}', /divide by zero/],
    ['3+', /Couldn't read/],
    ['\\sqrt{-4}', /complex mode/],
    ['x^2+1=0', /No real solution\. Switch to complex mode/],
    [
      '\\begin{pmatrix}1&2&3\\\\4&5&6\\end{pmatrix}\\begin{pmatrix}1&2&3\\\\4&5&6\\end{pmatrix}',
      /Columns of the first must equal rows of the second/,
    ],
    [`\\begin{pmatrix}1&2\\\\2&4\\end{pmatrix}^{-1}`, /singular|determinant is zero/],
  ];
  for (const [latex, msg] of cases) {
    it(latex, async () => {
      await expect(makeCalc().run(latex)).rejects.toThrow(msg);
    });
  }
});

describe('CAS fallback', () => {
  it('uses Compute Engine when SymPy is unavailable', async () => {
    const { ctx, deps } = makeCalc({}, offlineCas);
    const r = await evaluateLatex('\\int_0^1 x^2\\,\\mathrm{d}x', ctx, deps);
    expect(r.engine).toBe('ce');
    expect(Number(r.approx)).toBeCloseTo(1 / 3, 10);
  });
  it('complex mode shows complex roots', async () => {
    const r = await makeCalc({ domain: 'complex' }).run('x^2+1=0');
    expect(r.exactLatex).toMatch(/i/);
  });
});
