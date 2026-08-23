import { describe, expect, it } from 'vitest';
import { calculateCommission, canTransitionPayment, ownsResource } from '../src/domain';

describe('financial invariants', () => {
  it('calculates configurable commissions without losing value', () => {
    expect(calculateCommission(100, 0.1)).toEqual({ gross: 100, platform: 10, referral: 0, seller: 90 });
    expect(calculateCommission(99.99, 0.12, 0.03)).toEqual({ gross: 99.99, platform: 11.9988, referral: 2.9997, seller: 84.9915 });
  });
  it('rejects rules exceeding the gross amount', () => expect(() => calculateCommission(10, .9, .2)).toThrow(RangeError));
  it('does not allow a client to jump directly to confirmed', () => {
    expect(canTransitionPayment('PENDING', 'CONFIRMED')).toBe(false);
    expect(canTransitionPayment('CONFIRMING', 'CONFIRMED')).toBe(true);
    expect(canTransitionPayment('CONFIRMED', 'CONFIRMED')).toBe(false);
  });
});

describe('resource authorization', () => {
  const alice = { id: 'alice', role: 'USER' }; const bobOrder = { buyerId: 'bob' };
  it('blocks another user resource', () => expect(ownsResource(alice, bobOrder, 'buyerId')).toBe(false));
  it('allows its owner and explicit admin role', () => {
    expect(ownsResource(alice, { buyerId: 'alice' }, 'buyerId')).toBe(true);
    expect(ownsResource({ id: 'root', role: 'ADMIN' }, bobOrder, 'buyerId')).toBe(true);
  });
  it('does not trust a role stored on the resource', () => expect(ownsResource(alice, { buyerId: 'bob', role: 'ADMIN' }, 'buyerId')).toBe(false));
});
