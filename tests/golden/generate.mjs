// Generates tests/golden/vectors.json. Expected values come from independent
// sources (JS Math, BigInt, closed forms, published spreadsheet values), never
// from the CalSci engine itself. Run: node tests/golden/generate.mjs
import { writeFileSync } from 'node:fs';

const v = [];
const add = (latex, expect, settings) => v.push({ latex, ...expect, ...(settings ? { settings } : {}) });
const num = (x) => (Object.is(x, -0) ? '0' : String(Math.abs(x) < 1e-13 ? 0 : x));
const DEG = { angle: 'deg' };
const RAD = { angle: 'rad' };

// 1. Trig at special angles, degree mode.
const angles = [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330, 360];
for (const a of angles) {
  const r = (a * Math.PI) / 180;
  add(`\\sin(${a})`, { approx: num(Math.sin(r)) }, DEG);
  add(`\\cos(${a})`, { approx: num(Math.cos(r)) }, DEG);
  if (a % 180 !== 90) add(`\\tan(${a})`, { approx: num(Math.tan(r)) }, DEG);
}
// 2. Radian mode.
for (const [l, x] of [['\\frac{\\pi}{6}', Math.PI / 6], ['\\frac{\\pi}{4}', Math.PI / 4], ['\\frac{\\pi}{3}', Math.PI / 3], ['\\frac{\\pi}{2}', Math.PI / 2], ['\\pi', Math.PI], ['\\frac{3\\pi}{2}', 1.5 * Math.PI], ['1', 1], ['2.5', 2.5]]) {
  add(`\\sin\\left(${l}\\right)`, { approx: num(Math.sin(x)) }, RAD);
  add(`\\cos\\left(${l}\\right)`, { approx: num(Math.cos(x)) }, RAD);
}
// Gradian mode.
for (const g of [0, 50, 100, 200, 300]) add(`\\sin(${g})`, { approx: num(Math.sin((g * Math.PI) / 200)) }, { angle: 'grad' });
// 3. Inverse trig.
for (const [x, a] of [['0.5', 30], ['1', 90], ['0', 0], ['-0.5', -30], ['\\frac{\\sqrt{2}}{2}', 45], ['\\frac{\\sqrt{3}}{2}', 60]]) add(`\\arcsin\\left(${x}\\right)`, { approx: String(a) }, DEG);
for (const [x, a] of [['0.5', 60], ['0', 90], ['-1', 180], ['1', 0]]) add(`\\arccos\\left(${x}\\right)`, { approx: String(a) }, DEG);
for (const [x, a] of [['1', 45], ['0', 0], ['-1', -45], ['\\sqrt{3}', 60]]) add(`\\arctan\\left(${x}\\right)`, { approx: String(a) }, DEG);
add('\\arctan(1)', { approx: num(Math.PI / 4) }, RAD);
// 4. Factorials, exact.
let f = 1n;
for (let n = 0; n <= 25; n++) {
  if (n > 0) f *= BigInt(n);
  add(`${n}!`, { exactInteger: f.toString() });
}
// 5. Powers, exact.
for (const [b, e] of [[2, 10], [2, 50], [2, 64], [2, 100], [3, 40], [7, 20], [10, 20], [5, 30], [11, 11], [12, 12]]) {
  add(`${b}^{${e}}`, { exactInteger: (BigInt(b) ** BigInt(e)).toString() });
}
// 6. Logarithms.
for (const k of [1, 2, 3, 5, 10]) add(`\\ln\\left(e^{${k}}\\right)`, { approx: String(k) });
for (const k of [0, 1, 2, 6, 12]) add(`\\log\\left(10^{${k}}\\right)`, { approx: String(k) });
for (const [x, b, r] of [[8, 2, 3], [81, 3, 4], [1024, 2, 10], [125, 5, 3], [1, 7, 0]]) add(`\\log_{${b}}\\left(${x}\\right)`, { approx: String(r) });
add('\\ln(2)', { approxPrefix: '0.69314718055994530941723212145817656807550013436025' });
add('\\ln(10)', { approxPrefix: '2.30258509299404568401799145468436420760110148862877' });
// 7. Roots.
for (const n of [4, 9, 144, 10201, 1e10]) add(`\\sqrt{${n}}`, { approx: String(Math.sqrt(n)) });
for (const n of [8, 27, 1000, -8, -125]) add(`\\sqrt[3]{${n}}`, { approx: String(Math.cbrt(n)) });
add('\\sqrt{2}', { approxPrefix: '1.41421356237309504880168872420969807856967187537694' });
add('\\sqrt{3}', { approxPrefix: '1.73205080756887729352744634150587236694280525381038' });
add('\\sqrt[4]{16}', { approx: '2' });
add('\\sqrt[5]{32}', { approx: '2' });
// 8. Exact arithmetic.
for (const [l, r] of [['0.1+0.2', '0.3'], ['\\frac{1}{3}+\\frac{1}{6}', '0.5'], ['\\frac{2}{3}\\times\\frac{3}{4}', '0.5'], ['1-0.9', '0.1'], ['0.1\\times3', '0.3'], ['\\frac{22}{7}-\\frac{1}{7}', '3'], ['1.1^{2}', '1.21'], ['10\\%', '0.1'], ['50\\%\\times 80', '40'], ['2^{-3}', '0.125'], ['\\left|-7.5\\right|', '7.5'], ['17\\bmod 5', '2'], ['\\lfloor 2.7\\rfloor', '2'], ['\\lceil 2.1\\rceil', '3'], ['1.5\\times10^{3}', '1500'], ['123456789\\times987654321', '121932631112635269']]) add(l, { approx: r });
add('\\frac{1}{7}', { approxPrefix: '0.14285714285714285714285714285714285714285714285714' });
add('\\pi', { approxPrefix: '3.14159265358979323846264338327950288419716939937510' });
add('e', { approxPrefix: '2.71828182845904523536028747135266249775724709369995' });
// 9. Hyperbolic.
for (const x of [0, 0.5, 1, 2]) {
  add(`\\sinh(${x})`, { approx: num(Math.sinh(x)) });
  add(`\\cosh(${x})`, { approx: num(Math.cosh(x)) });
  add(`\\tanh(${x})`, { approx: num(Math.tanh(x)) });
}
add('\\operatorname{arsinh}(1)', { approx: num(Math.asinh(1)) });
// 10. Combinatorics.
for (const [n, k, r] of [[5, 2, 10], [10, 3, 120], [52, 5, 2598960], [20, 10, 184756], [6, 0, 1]]) add(`\\binom{${n}}{${k}}`, { approx: String(r) });
for (const [n, k, r] of [[5, 2, 20], [10, 3, 720], [6, 6, 720]]) add(`\\operatorname{nPr}(${n},${k})`, { approx: String(r) });
add('\\operatorname{nCr}(49,6)', { approx: '13983816' });
// Special functions (double-precision fallback).
add('\\Gamma(5)', { approx: '24' });
add('\\Gamma(0.5)', { approx: num(Math.sqrt(Math.PI)), precision: 'double' });
add('\\operatorname{erf}(1)', { approx: '0.8427007929497149', precision: 'double' });
// 11. Definite integrals, limits, sums.
for (const n of [0, 1, 2, 3, 4, 5, 9]) add(`\\int_0^1 x^{${n}}\\,\\mathrm{d}x`, { approx: num(1 / (n + 1)) });
for (const [l, r] of [
  ['\\int_0^{\\pi}\\sin(x)\\,\\mathrm{d}x', 2],
  ['\\int_0^1 e^{x}\\,\\mathrm{d}x', Math.E - 1],
  ['\\int_1^{e}\\frac{1}{x}\\,\\mathrm{d}x', 1],
  ['\\int_0^{\\infty}e^{-x}\\,\\mathrm{d}x', 1],
  ['\\int_{-1}^{1}\\sqrt{1-x^2}\\,\\mathrm{d}x', Math.PI / 2],
  ['\\int_0^{1}\\frac{1}{1+x^2}\\,\\mathrm{d}x', Math.PI / 4],
  ['\\int_0^{\\infty}e^{-x^2}\\,\\mathrm{d}x', Math.sqrt(Math.PI) / 2],
  ['\\int_0^{2}x e^{x}\\,\\mathrm{d}x', Math.E ** 2 + 1],
  ['\\int_0^{\\frac{\\pi}{2}}\\cos^{2}(x)\\,\\mathrm{d}x', Math.PI / 4],
  ['\\int_1^{2}\\ln(x)\\,\\mathrm{d}x', 2 * Math.log(2) - 1],
]) add(l, { approx: num(r) }, RAD);
for (const [l, r] of [
  ['\\lim_{x\\to0}\\frac{\\sin x}{x}', 1],
  ['\\lim_{x\\to\\infty}\\left(1+\\frac{1}{x}\\right)^{x}', Math.E],
  ['\\lim_{x\\to0}\\frac{e^{x}-1}{x}', 1],
  ['\\lim_{x\\to2}\\frac{x^2-4}{x-2}', 4],
  ['\\lim_{x\\to\\infty}\\frac{3x^2+1}{x^2}', 3],
  ['\\lim_{x\\to0}\\frac{1-\\cos x}{x^2}', 0.5],
]) add(l, { approx: num(r) }, RAD);
for (const [l, r] of [
  ['\\sum_{n=1}^{100}n', 5050],
  ['\\sum_{n=1}^{\\infty}\\frac{1}{n^2}', (Math.PI ** 2) / 6],
  ['\\sum_{k=0}^{10}2^{k}', 2047],
  ['\\prod_{k=1}^{6}k', 720],
  ['\\sum_{n=0}^{\\infty}\\frac{1}{2^{n}}', 2],
]) add(l, { approx: num(r) });
// Derivatives evaluated at a point via user function composition are covered by property tests; here: exact forms.
add('\\frac{\\mathrm{d}}{\\mathrm{d}x}\\left(x^3\\right)', { exactIncludes: '3x^2' });
add('\\frac{\\mathrm{d}}{\\mathrm{d}x}\\left(e^{2x}\\right)', { exactIncludes: 'exp(2x)' });
// 12. Solve.
add('2x+3=7', { approx: '2' });
add('x^2=9', { approxSet: [-3, 3] });
add('x^2-5x+6=0', { approxSet: [2, 3] });
add('x^3=8', { approxSet: [2] });
add('3x-1=2x+4', { approx: '5' });
add('\\operatorname{solve}\\left(x^2-2,x\\right)', { approxSet: [-Math.SQRT2, Math.SQRT2] });
add('\\begin{cases}x+y=3\\\\x-y=1\\end{cases}', { exactIncludes: 'x=2' });
add('x^2+1=0', { error: 'No real solution' });
// 13. Matrices.
const M = (rows) => `\\begin{pmatrix}${rows.map((r) => r.join('&')).join('\\\\')}\\end{pmatrix}`;
add(`\\det${M([[1, 2], [3, 4]])}`, { approx: '-2' });
add(`\\det${M([[2, 0, 0], [0, 3, 0], [0, 0, 4]])}`, { approx: '24' });
add(`\\det${M([[6, 1, 1], [4, -2, 5], [2, 8, 7]])}`, { approx: '-306' });
add(`\\operatorname{rank}\\left(${M([[1, 2], [2, 4]])}\\right)`, { approx: '1' });
add(`\\operatorname{rank}\\left(${M([[1, 0, 0], [0, 1, 0], [0, 0, 1]])}\\right)`, { approx: '3' });
add(`\\operatorname{tr}\\left(${M([[1, 2], [3, 4]])}\\right)`, { approx: '5' });
add(`${M([[1, 2], [3, 4]])}^{-1}`, { approxText: '[[-2, 1], [1.5, -0.5]]' });
add(`${M([[1, 2], [3, 4]])}${M([[5], [6]])}`, { approxText: '[[17], [39]]' });
add(`${M([[1, 2], [3, 4]])}^{\\top}`, { approxText: '[[1, 3], [2, 4]]' });
add(`\\operatorname{lsolve}\\left(${M([[2, 1], [1, 3]])},${M([[3], [5]])}\\right)`, { approxText: '[[0.8], [1.4]]' });
add(`${M([[1, 2], [2, 4]])}^{-1}`, { error: 'singular' });
add(`${M([[1, 2, 3], [4, 5, 6]])}${M([[1, 2, 3], [4, 5, 6]])}`, { error: 'Columns of the first must equal rows of the second' });
// 14. Units and currency (bundled ECB snapshot, EUR base).
for (const [l, r] of [
  ['5\\,\\mathrm{km}\\operatorname{to}\\mathrm{m}', '5000 m'],
  ['1\\,\\mathrm{mi}\\operatorname{to}\\mathrm{km}', '1.609344 km'],
  ['12\\,\\mathrm{in}\\operatorname{to}\\mathrm{cm}', '30.48 cm'],
  ['1\\,\\mathrm{lb}\\operatorname{to}\\mathrm{g}', '453.59237 g'],
  ['1\\,\\mathrm{h}\\operatorname{to}\\mathrm{s}', '3600 s'],
  ['0\\,\\mathrm{degC}\\operatorname{to}\\mathrm{degF}', '32 degF'],
  ['300\\,\\mathrm{K}\\operatorname{to}\\mathrm{degC}', '26.85 degC'],
  ['100\\,\\mathrm{km}/\\mathrm{h}\\operatorname{to}\\mathrm{m}/\\mathrm{s}', null],
  ['1\\,\\mathrm{kWh}\\operatorname{to}\\mathrm{J}', '3600000 J'],
  ['1\\,\\mathrm{GB}\\operatorname{to}\\mathrm{MB}', '1000 MB'],
  ['2\\,\\mathrm{L}\\operatorname{to}\\mathrm{mL}', '2000 mL'],
]) add(l, r ? { approx: r } : { approxNumber: 100 / 3.6 });
add('1\\,\\mathrm{EUR}\\operatorname{to}\\mathrm{USD}', { approxNumber: 1.1269, rates: true });
add('108.6615\\,\\mathrm{INR}\\operatorname{to}\\mathrm{EUR}', { approxNumber: 1, rates: true });
add('5\\,\\mathrm{km}\\operatorname{to}\\mathrm{kg}', { error: "Units don't match" });
// 15. Statistics.
for (const [l, r] of [
  ['\\operatorname{mean}(2,4,4,4,5,5,7,9)', 5],
  ['\\operatorname{median}(3,1,4,1,5)', 3],
  ['\\operatorname{pstd}(2,4,4,4,5,5,7,9)', 2],
  ['\\operatorname{normcdf}(0)', 0.5],
  ['\\operatorname{normcdf}(1.96)', 0.9750021048517795],
  ['\\operatorname{norminv}(0.975)', 1.959963984540054],
  ['\\operatorname{normpdf}(0)', 1 / Math.sqrt(2 * Math.PI)],
  ['\\operatorname{binompdf}(2,5,0.5)', 0.3125],
  ['\\operatorname{poisspdf}(0,2)', Math.exp(-2)],
  ['\\operatorname{tcdf}(0,5)', 0.5],
  ['\\operatorname{corr}\\left(\\left[1,2,3\\right],\\left[2,4,6\\right]\\right)', 1],
]) add(l, { approxNumber: r });
// 16. Finance (spreadsheet reference values).
for (const [l, r] of [
  ['\\operatorname{pmt}(0.05/12,360,300000)', -1610.4648690364],
  ['\\operatorname{fv}(0.06/12,120,-100)', 16387.9346806458],
  ['\\operatorname{npv}\\left(0.1,\\left[-10000,3000,4200,6800\\right]\\right)', 1188.4434123352],
  ['\\operatorname{irr}\\left(\\left[-70000,12000,15000,18000,21000,26000\\right]\\right)', 0.0866309480365],
  ['\\operatorname{rate}(48,-200,8000)', 0.0077014724882],
  ['\\operatorname{cagr}(1000,2000,5)', 0.1486983549970],
  ['\\operatorname{bondprice}(100,0.1,0.1,3,1)', 100],
  ['\\operatorname{duration}(100,0.1,0.1,3,1)', 2.7355371900826],
]) add(l, { approxNumber: r, precision: 'double' });
// 17. Complex mode.
const C = { domain: 'complex' };
add('\\sqrt{-4}', { approxText: '2i' }, C);
add('e^{i\\pi}', { approx: '-1' }, C);
add('(1+i)(1-i)', { approx: '2' }, C);
add('\\left|3+4i\\right|', { approx: '5' }, C);
add('x^2+1=0', { exactIncludes: 'i' }, C);
// 18. Errors.
for (const [l, e] of [
  ['\\frac{1}{0}', 'divide by zero'],
  ['3+', "Couldn't read"],
  ['\\sqrt{-1}', 'complex mode'],
  ['\\operatorname{irr}\\left(\\left[100,200\\right]\\right)', 'negative and one positive'],
  ['\\operatorname{norminv}(2)', 'between 0 and 1'],
]) add(l, { error: e });

writeFileSync(new URL('./vectors.json', import.meta.url), JSON.stringify(v, null, 1));
console.log(`${v.length} golden vectors`);
