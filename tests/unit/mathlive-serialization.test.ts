// Inputs here are copied from what MathLive's getValue('latex') actually returns
// after pressing keypad keys, not hand-written LaTeX. Hand-written forms hid a bug
// where MathLive rewrote \operatorname{to} as \operatorname{\mathrm{to}}.
import { describe, expect, it } from 'vitest';
import { makeCalc } from '../helpers/context';

describe('conversions as MathLive serializes them', () => {
  const cases: [latex: string, expected: RegExp][] = [
    ['5{\\mathrm{km}}\\operatorname{\\mathrm{to}}{\\mathrm{mi}}', /^3\.10685596118/],
    ['5\\,{\\mathrm{km}}\\,\\operatorname{\\mathrm{to}}\\,{\\mathrm{mi}}', /^3\.10685596118/],
    ['5\\,\\mathrm{km}\\operatorname{\\mathrm{to}}\\,\\mathrm{mi}', /^3\.10685596118/],
    ['100{\\mathrm{INR}}\\operatorname{\\mathrm{to}}{\\mathrm{USD}}', /^1\.03/],
    ['17000{\\mathrm{mi}}/{\\mathrm{h}}\\operatorname{\\mathrm{to}}{\\mathrm{m}}/{\\mathrm{s}}', /^7599\.68/],
    ['20{\\mathrm{degC}}\\operatorname{\\mathrm{to}}{\\mathrm{degF}}', /^68/],
    ['2{\\mathrm{L}}\\operatorname{\\mathrm{to}}{\\mathrm{gal}}', /^0\.52834/],
  ];
  for (const [latex, expected] of cases) {
    it(latex, async () => {
      const r = await makeCalc().run(latex);
      expect(r.approx).toMatch(expected);
    });
  }

  it('digits typed after a braced unit stay separate', async () => {
    const r = await makeCalc().run(
      '2{\\mathrm{km}}+500{\\mathrm{m}}\\operatorname{\\mathrm{to}}{\\mathrm{m}}',
    );
    expect(r.approx).toBe('2500 m');
  });
});
