import { beforeAll, describe, expect, it } from 'vitest';
import {
  FreeSymbolError,
  serializeToMathjs,
  SymbolicHeadError,
  type SerializeOptions,
} from '../../src/engine/numeric/serialize';
import { parseLatex } from '../../src/engine/symbolic';
import { loadHandle } from '../helpers/node-cas';

const opts = (o: Partial<SerializeOptions> = {}): SerializeOptions => ({
  angle: 'rad',
  isBound: (n) => n === 'a' || n === 'Ans',
  isUnit: (n) => ['km', 'mi', 'h', 'm', 's', 'USD'].includes(n),
  isCurrency: (n) => n === 'USD',
  ...o,
});
const ser = (latex: string, o?: Partial<SerializeOptions>) => serializeToMathjs(parseLatex(latex), opts(o));

describe('MathJSON → math.js serializer', () => {
  it('basic arithmetic', () => expect(ser('2+3\\times4').text).toBe('14'));
  it('applies degree conversion to trig input and inverse trig output', () => {
    expect(ser('\\sin(x+a)', { isBound: () => true, angle: 'deg' }).text).toContain('* pi / 180');
    expect(ser('\\arcsin(a)', { angle: 'deg' }).text).toBe('(asin(a) * 180 / pi)');
  });
  it('maps unit markers and flags currency', () => {
    const r = ser('3\\,\\mathrm{USD}');
    expect(r.usesUnits).toBe(true);
    expect(r.usesCurrency).toBe(true);
  });
  it('free symbols are reported, not passed through', () =>
    expect(() => ser('x+1')).toThrow(FreeSymbolError));
  it('symbolic heads are routed elsewhere', () =>
    expect(() => ser('\\int x\\,\\mathrm{d}x', { isBound: () => true })).toThrow(SymbolicHeadError));
  it('unknown functions are errors, not passthrough', () => {
    expect(() => serializeToMathjs(['evaluate', "'1+1'"], opts())).toThrow();
    expect(() => serializeToMathjs(['import', 'x'], opts({ isBound: () => false }))).toThrow(
      /Unknown function/,
    );
    expect(() => serializeToMathjs(['Add', "'text'"], opts())).toThrow(/Text/);
  });
});

describe('SymPy bridge never runs user text as code', () => {
  beforeAll(async () => {
    await loadHandle();
  }, 120_000);
  const run = async (payload: object) => JSON.parse((await loadHandle())(JSON.stringify(payload)));
  it('rejects unknown heads', async () => {
    const r = await run({ op: 'eval', args: [['__import__', 'os']] });
    expect(r.error.code).toBe('unsupported');
  });
  it('rejects symbol names that are not identifiers', async () => {
    const r = await run({ op: 'eval', args: ["x; __import__('os').system('echo hi')"] });
    expect(r.error.message).toMatch(/Invalid symbol/);
  });
  it('rejects quoted strings', async () => {
    const r = await run({ op: 'eval', args: [['Add', "'1+1'", 1]] });
    expect(r.error.code).toBe('unsupported');
  });
  it('rejects malformed numbers', async () => {
    const r = await run({ op: 'eval', args: [{ num: '1e5; import os' }] });
    expect(r.error.code).toBe('unsupported');
  });
});
