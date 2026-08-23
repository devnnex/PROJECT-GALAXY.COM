export const PAYMENT_STATES = Object.freeze(['CREATED', 'PENDING', 'DETECTING', 'CONFIRMING', 'CONFIRMED', 'FAILED', 'EXPIRED', 'REFUNDED', 'CANCELLED']);
export const WITHDRAWAL_STATES = Object.freeze(['REQUESTED', 'PENDING', 'APPROVED', 'PROCESSING', 'COMPLETED', 'REJECTED', 'CANCELLED']);

export function calculateCommission(gross, platformRate, referralRate = 0) {
  if (![gross, platformRate, referralRate].every(Number.isFinite)) throw new TypeError('Inputs must be finite numbers');
  if (gross < 0 || platformRate < 0 || referralRate < 0 || platformRate + referralRate > 1) throw new RangeError('Invalid commission rule');
  const round = (value) => Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
  const platform = round(gross * platformRate); const referral = round(gross * referralRate);
  return { gross: round(gross), platform, referral, seller: round(gross - platform - referral) };
}

export function canTransitionPayment(from, to) {
  const transitions = {
    CREATED: ['PENDING', 'CANCELLED'], PENDING: ['DETECTING', 'EXPIRED', 'CANCELLED'],
    DETECTING: ['CONFIRMING', 'FAILED', 'EXPIRED'], CONFIRMING: ['CONFIRMED', 'FAILED'],
    CONFIRMED: ['REFUNDED'], FAILED: [], EXPIRED: [], REFUNDED: [], CANCELLED: [],
  };
  return Boolean(transitions[from]?.includes(to));
}

export function ownsResource(sessionUser, resource, ownerKey = 'userId') {
  return Boolean(sessionUser && resource && (sessionUser.role === 'ADMIN' || resource[ownerKey] === sessionUser.id));
}
