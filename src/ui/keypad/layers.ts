import type { LayerId, SheetKind } from '../../store';

/** Layers drawn as a key grid; `convert` is its own panel. */
export type KeypadLayer = Exclude<LayerId, 'convert'>;

export type KeyRole = 'digit' | 'op' | 'fn' | 'eq' | 'action' | 'blank';

export type KeyAction =
  | { type: 'insert'; latex: string }
  | { type: 'command'; command: string | [string, ...unknown[]] }
  | { type: 'evaluate' }
  | { type: 'clear' }
  | { type: 'backspace' }
  | { type: 'shift' }
  | { type: 'hyp' }
  | { type: 'sheet'; sheet: SheetKind }
  | { type: 'refresh-rates' };

export interface KeyFace {
  label: string;
  aria: string;
  action: KeyAction;
}

export interface KeyDef extends KeyFace {
  id: string;
  role: KeyRole;
  /** Shown small in the top-right corner and used while Shift is on. */
  shift?: KeyFace;
  /** Used while Hyp is on (hyperbolic functions). */
  hyp?: KeyFace;
  shiftHyp?: KeyFace;
  span?: 2;
  icon?: 'backspace' | 'left' | 'right';
}

const ins = (latex: string): KeyAction => ({ type: 'insert', latex });
const cmd = (command: string): KeyAction => ({ type: 'command', command });
const sheet = (s: SheetKind): KeyAction => ({ type: 'sheet', sheet: s });

const digit = (d: string): KeyDef => ({ id: `d${d}`, role: 'digit', label: d, aria: d, action: ins(d) });
const op = (id: string, label: string, aria: string, latex: string): KeyDef => ({
  id,
  role: 'op',
  label,
  aria,
  action: ins(latex),
});
const fn = (id: string, label: string, aria: string, latex: string, extra: Partial<KeyDef> = {}): KeyDef => ({
  id,
  role: 'fn',
  label,
  aria,
  action: ins(latex),
  ...extra,
});
const face = (label: string, aria: string, latex: string): KeyFace => ({ label, aria, action: ins(latex) });
const opname = (name: string, args = '#0') => `\\operatorname{${name}}\\left(${args}\\right)`;

const BACKSPACE: KeyDef = {
  id: 'bksp',
  role: 'action',
  label: '⌫',
  aria: 'delete',
  action: { type: 'backspace' },
  icon: 'backspace',
};
const LEFT: KeyDef = {
  id: 'left',
  role: 'action',
  label: '←',
  aria: 'move left',
  action: cmd('moveToPreviousChar'),
  icon: 'left',
};
const RIGHT: KeyDef = {
  id: 'right',
  role: 'action',
  label: '→',
  aria: 'move right',
  action: cmd('moveToNextChar'),
  icon: 'right',
};
const COMMA: KeyDef = op('comma', ',', 'comma', ',');
const OPEN: KeyDef = op('open', '(', 'open parenthesis', '(');
const CLOSE: KeyDef = op('close', ')', 'close parenthesis', ')');

const basic: KeyDef[] = [
  { id: 'ac', role: 'action', label: 'AC', aria: 'clear all', action: { type: 'clear' } },
  OPEN,
  CLOSE,
  op('div', '÷', 'divide', '\\div'),
  BACKSPACE,
  digit('7'),
  digit('8'),
  digit('9'),
  op('mul', '×', 'times', '\\times'),
  op('pct', '%', 'percent', '\\%'),
  digit('4'),
  digit('5'),
  digit('6'),
  op('sub', '−', 'minus', '-'),
  fn('neg', '(−)', 'negative', '-'),
  digit('1'),
  digit('2'),
  digit('3'),
  op('add', '+', 'plus', '+'),
  fn('ans', 'Ans', 'previous answer', '\\operatorname{Ans}'),
  digit('0'),
  { id: 'dot', role: 'digit', label: '.', aria: 'decimal point', action: ins('.') },
  fn('exp10', '×10ˣ', 'times ten to the power', '\\times10^{#?}'),
  { id: 'eq', role: 'eq', label: '=', aria: 'equals, evaluate', action: { type: 'evaluate' }, span: 2 },
];

const trig = (name: 'sin' | 'cos' | 'tan'): KeyDef => {
  const words = { sin: 'sine', cos: 'cosine', tan: 'tangent' }[name];
  return fn(name, name, words, `\\${name}\\left(#0\\right)`, {
    shift: face(`${name}⁻¹`, `inverse ${words}`, `\\arc${name}\\left(#0\\right)`),
    hyp: face(`${name}h`, `hyperbolic ${words}`, `\\${name}h\\left(#0\\right)`),
    shiftHyp: face(
      `${name}h⁻¹`,
      `inverse hyperbolic ${words}`,
      `\\operatorname{ar${name}h}\\left(#0\\right)`,
    ),
  });
};

const functions: KeyDef[] = [
  {
    id: 'shift',
    role: 'action',
    label: 'shift',
    aria: 'shift for inverse functions',
    action: { type: 'shift' },
  },
  { id: 'hyp', role: 'action', label: 'hyp', aria: 'hyperbolic functions', action: { type: 'hyp' } },
  fn('pi', 'π', 'pi', '\\pi'),
  fn('e', 'e', 'e, Euler’s number', 'e'),
  fn('i', 'i', 'imaginary unit', '\\imaginaryI'),
  trig('sin'),
  trig('cos'),
  trig('tan'),
  fn('ln', 'ln', 'natural logarithm', '\\ln\\left(#0\\right)', {
    shift: face('eˣ', 'e to the power', 'e^{#0}'),
  }),
  fn('log', 'log', 'logarithm base 10', '\\log\\left(#0\\right)', {
    shift: face('10ˣ', 'ten to the power', '10^{#0}'),
  }),
  fn('sq', 'x²', 'square', '#@^{2}', { shift: face('x³', 'cube', '#@^{3}') }),
  fn('pow', 'xʸ', 'power', '#@^{#?}'),
  fn('sqrt', '√', 'square root', '\\sqrt{#0}'),
  fn('cbrt', '∛', 'cube root', '\\sqrt[3]{#0}'),
  fn('nroot', 'ⁿ√', 'nth root', '\\sqrt[#?]{#0}'),
  fn('expe', 'eˣ', 'e to the power', 'e^{#0}'),
  fn('exp10b', '10ˣ', 'ten to the power', '10^{#0}'),
  fn('logn', 'logₙ', 'logarithm base n', '\\log_{#?}\\left(#0\\right)'),
  fn('abs', '|x|', 'absolute value', '\\left|#0\\right|'),
  fn('fact', 'n!', 'factorial', '!'),
  fn('npr', 'nPr', 'permutations', opname('nPr', '#?,#?')),
  fn('ncr', 'nCr', 'combinations', opname('nCr', '#?,#?')),
  fn('inv', '1/x', 'reciprocal', '\\frac{1}{#@}'),
  COMMA,
  fn('assign', ':=', 'define as', '\\coloneq'),
];

const calculus: KeyDef[] = [
  fn('ddx', 'd/dx', 'derivative', '\\frac{\\mathrm{d}}{\\mathrm{d}x}\\left(#0\\right)'),
  fn('int', '∫', 'integral', '\\int #0\\,\\mathrm{d}x'),
  fn('defint', '∫ₐᵇ', 'definite integral', '\\int_{#?}^{#?} #0\\,\\mathrm{d}x'),
  fn('lim', 'lim', 'limit', '\\lim_{x\\to #?} #0'),
  fn('sum', 'Σ', 'sum', '\\sum_{n=#?}^{#?} #0'),
  fn('prod', 'Π', 'product', '\\prod_{k=#?}^{#?} #0'),
  fn('series', 'series', 'Taylor series', opname('series', '#0,x,0,6')),
  fn('solve', 'solve', 'solve', opname('solve')),
  fn('simplify', 'simplify', 'simplify', opname('simplify')),
  fn('expand', 'expand', 'expand', opname('expand')),
  fn('factor', 'factor', 'factor', opname('factor')),
  fn('laplace', 'ℒ', 'Laplace transform', opname('laplace', '#0,t,s')),
  fn('prime', 'y′', 'y prime', 'y^{\\prime}'),
  fn('dprime', 'y″', 'y double prime', 'y^{\\prime\\prime}'),
  op('equals', '=', 'equation equals sign', '='),
  fn('x', 'x', 'x', 'x'),
  fn('y', 'y', 'y', 'y'),
  fn('z', 'z', 'z', 'z'),
  fn('t', 't', 't', 't'),
  fn('assign2', ':=', 'define as', '\\coloneq'),
  OPEN,
  CLOSE,
  COMMA,
  LEFT,
  RIGHT,
];

const matrix: KeyDef[] = [
  { id: 'msize', role: 'fn', label: 'm×n', aria: 'insert matrix', action: sheet({ kind: 'matrix-size' }) },
  { id: 'addrow', role: 'fn', label: '+row', aria: 'add row', action: cmd('addRowAfter') },
  { id: 'addcol', role: 'fn', label: '+col', aria: 'add column', action: cmd('addColumnAfter') },
  { id: 'delrow', role: 'fn', label: '−row', aria: 'remove row', action: cmd('removeRow') },
  { id: 'delcol', role: 'fn', label: '−col', aria: 'remove column', action: cmd('removeColumn') },
  fn('det', 'det', 'determinant', '\\det\\left(#0\\right)'),
  fn('minv', 'A⁻¹', 'inverse', '#@^{-1}'),
  fn('mt', 'Aᵀ', 'transpose', '#@^{\\top}'),
  fn('rank', 'rank', 'rank', opname('rank')),
  fn('tr', 'tr', 'trace', opname('tr')),
  fn('lu', 'LU', 'LU decomposition', opname('lu')),
  fn('qr', 'QR', 'QR decomposition', opname('qr')),
  fn('eig', 'eig', 'eigenvalues', opname('eig')),
  fn('lsolve', 'Ax=b', 'solve A x equals b', opname('lsolve', '#?,#?')),
  fn('lstsq', 'lstsq', 'least squares', opname('lstsq', '#?,#?')),
  fn('mA', 'A', 'A', 'A'),
  fn('mB', 'B', 'B', 'B'),
  fn('mC', 'C', 'C', 'C'),
  fn('m22', '2×2', 'two by two matrix', '\\begin{pmatrix}#?&#?\\\\#?&#?\\end{pmatrix}'),
  fn('m33', '3×3', 'three by three matrix', '\\begin{pmatrix}#?&#?&#?\\\\#?&#?&#?\\\\#?&#?&#?\\end{pmatrix}'),
  OPEN,
  CLOSE,
  COMMA,
  LEFT,
  RIGHT,
];

const stats: KeyDef[] = [
  { id: 'data', role: 'fn', label: 'data', aria: 'edit data lists', action: sheet({ kind: 'stats-data' }) },
  fn('mean', 'mean', 'mean', opname('mean')),
  fn('median', 'median', 'median', opname('median')),
  fn('pstd', 'σ', 'population standard deviation', opname('pstd')),
  fn('std', 's', 'sample standard deviation', opname('std')),
  fn('var', 'var', 'sample variance', opname('var')),
  fn('sumx', 'Σx', 'sum of values', opname('sum')),
  fn('count', 'n', 'count', opname('count')),
  fn('linreg', 'linreg', 'linear regression', opname('linreg', '#?,#?')),
  fn('corr', 'corr', 'correlation', opname('corr', '#?,#?')),
  fn('normpdf', 'normpdf', 'normal p d f', opname('normpdf', '#?,0,1')),
  fn('normcdf', 'normcdf', 'normal c d f', opname('normcdf', '#?,0,1')),
  fn('norminv', 'norminv', 'inverse normal', opname('norminv', '#?,0,1')),
  fn('tcdf', 'tcdf', 't distribution c d f', opname('tcdf', '#?,#?')),
  fn('tinv', 'tinv', 'inverse t distribution', opname('tinv', '#?,#?')),
  fn('chi2cdf', 'χ²cdf', 'chi squared c d f', opname('chi2cdf', '#?,#?')),
  fn('binompdf', 'binompdf', 'binomial p m f', opname('binompdf', '#?,#?,#?')),
  fn('binomcdf', 'binomcdf', 'binomial c d f', opname('binomcdf', '#?,#?,#?')),
  fn('poisspdf', 'poisspdf', 'Poisson p m f', opname('poisspdf', '#?,#?')),
  fn('poisscdf', 'poisscdf', 'Poisson c d f', opname('poisscdf', '#?,#?')),
  fn('ztest', 'z-test', 'one sample z test', opname('ztest', '#?,#?,#?')),
  fn('ttest', 't-test', 'one sample t test', opname('ttest', '#?,#?')),
  {
    id: 'dist',
    role: 'fn',
    label: 'dist…',
    aria: 'distribution picker',
    action: sheet({ kind: 'distributions' }),
  },
  fn('l1', 'L₁', 'list L 1', 'L_1'),
  fn('list', '[ ]', 'list brackets', '\\left[#0\\right]'),
];

const finance: KeyDef[] = [
  {
    id: 'tvm',
    role: 'fn',
    label: 'TVM',
    aria: 'time value of money form',
    action: sheet({ kind: 'finance', form: 'tvm' }),
  },
  {
    id: 'npvf',
    role: 'fn',
    label: 'NPV/IRR',
    aria: 'net present value form',
    action: sheet({ kind: 'finance', form: 'npv' }),
  },
  {
    id: 'cagrf',
    role: 'fn',
    label: 'CAGR',
    aria: 'compound annual growth rate form',
    action: sheet({ kind: 'finance', form: 'cagr' }),
  },
  {
    id: 'amortf',
    role: 'fn',
    label: 'amort.',
    aria: 'amortization table form',
    action: sheet({ kind: 'finance', form: 'amort' }),
  },
  {
    id: 'optf',
    role: 'fn',
    label: 'options',
    aria: 'Black–Scholes form',
    action: sheet({ kind: 'finance', form: 'options' }),
  },
  {
    id: 'bondf',
    role: 'fn',
    label: 'bond',
    aria: 'bond form',
    action: sheet({ kind: 'finance', form: 'bond' }),
  },
  fn('fv', 'fv', 'future value', opname('fv', '#?,#?,#?,#?')),
  fn('pv', 'pv', 'present value', opname('pv', '#?,#?,#?,#?')),
  fn('pmt', 'pmt', 'payment', opname('pmt', '#?,#?,#?')),
  fn('nper', 'nper', 'number of periods', opname('nper', '#?,#?,#?')),
  fn('rate', 'rate', 'interest rate', opname('rate', '#?,#?,#?')),
  fn('npv', 'npv', 'net present value', opname('npv', '#?,\\left[#?\\right]')),
  fn('irr', 'irr', 'internal rate of return', opname('irr', '\\left[#?\\right]')),
  fn('cagr', 'cagr', 'compound annual growth rate', opname('cagr', '#?,#?,#?')),
  fn('amort', 'amort', 'amortization table', opname('amort', '#?,#?,#?')),
  fn('bscall', 'call', 'Black–Scholes call', opname('bscall', '#?,#?,#?,#?,#?')),
  fn('bsput', 'put', 'Black–Scholes put', opname('bsput', '#?,#?,#?,#?,#?')),
  fn('bondprice', 'bond $', 'bond price', opname('bondprice', '#?,#?,#?,#?,2')),
  fn('duration', 'dur', 'Macaulay duration', opname('duration', '#?,#?,#?,#?,2')),
  fn('convexity', 'conv', 'convexity', opname('convexity', '#?,#?,#?,#?,2')),
  fn('list2', '[ ]', 'list brackets', '\\left[#0\\right]'),
  OPEN,
  CLOSE,
  COMMA,
  LEFT,
];

export const LAYER_KEYS: Record<KeypadLayer, KeyDef[]> = {
  basic,
  functions,
  calculus,
  matrix,
  stats,
  finance,
};

export const LAYER_LABELS: Record<LayerId, string> = {
  basic: 'Basic',
  functions: 'Functions',
  calculus: 'Calculus',
  matrix: 'Matrix',
  stats: 'Stats',
  convert: 'Convert',
  finance: 'Finance',
};
