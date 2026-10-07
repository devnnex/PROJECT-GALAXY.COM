import { expect, it } from 'vitest';
import { parsePnlAmount } from '../src/pnl-amount.js';

it('accepts a comma or a point as the PNL decimal separator', () => {
  expect(parsePnlAmount('125,50')).toBe(125.5);
  expect(parsePnlAmount('-48,00')).toBe(-48);
  expect(parsePnlAmount('125.50')).toBe(125.5);
  expect(parsePnlAmount(' ,75 ')).toBe(0.75);
});

it('rejects ambiguous or out-of-range PNL amounts', () => {
  for (const value of ['', '1,234', '1,234.56', '1.234,56', '100000000', '12x']) {
    expect(parsePnlAmount(value)).toBeNull();
  }
});
