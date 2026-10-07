import { describe, expect, it } from 'vitest';
import { formatDecimal, plainDecimal } from '../../src/engine/format';

const intl = { digits: 12, grouping: 'international' as const };
describe('formatDecimal', () => {
  it('groups digits', () => {
    expect(formatDecimal('1234567.891', intl).text).toBe('1,234,567.891');
    expect(formatDecimal('1234567.891', { ...intl, grouping: 'indian' }).text).toBe('12,34,567.891');
    expect(formatDecimal('100000000', { ...intl, grouping: 'indian' }).text).toBe('10,00,00,000');
  });
  it('rounds to significant digits without going through a double', () => {
    expect(formatDecimal('0.333333333333333333333333', intl).text).toBe('0.333333333333');
    expect(formatDecimal('2.00000000000000000000001', intl).text).toBe('2');
  });
  it('switches to scientific outside 1e-6..1e12', () => {
    expect(formatDecimal('1267650600228229401496703205376', intl).latex).toBe('1.26765060023\\times10^{30}');
    expect(formatDecimal('0.0000001234', intl).text).toBe('1.234 × 10^-7');
  });
  it('negative numbers use a real minus sign in text', () =>
    expect(formatDecimal('-5', intl).text).toBe('−5'));
  it('plainDecimal trims noise', () =>
    expect(plainDecimal('29.99999999999999999999999999999999', 30)).toBe('30'));
});
