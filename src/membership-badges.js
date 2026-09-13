export const MEMBERSHIP_EMOJI = Object.freeze({ MONTHLY: '🟣', QUARTERLY: '💠', SEMESTER: '🌟', ANNUAL: '💎', VIP_ANNUAL: '👑' });

export const MEMBERSHIP_BADGE_TIER = Object.freeze({
  MONTHLY: 1,
  QUARTERLY: 2,
  SEMESTER: 3,
  ANNUAL: 4,
  VIP_ANNUAL: 5,
  ADMIN: 5,
});

export const ADMIN_MEMBERSHIP = Object.freeze({
  isActive: true,
  isLifetime: true,
  status: 'ADMIN',
  planCode: 'ADMIN',
  planName: 'Acceso administrativo',
});

export function membershipBadgeTier(membership) {
  const planCode = String(membership?.planCode || membership?.plan_code || '').trim().toUpperCase();
  const status = String(membership?.status || '').trim().toUpperCase();
  const active = membership?.isActive === true || membership?.is_active === true || status === 'ACTIVE' || status === 'ADMIN' || planCode === 'ADMIN';
  if (!active) return null;
  return MEMBERSHIP_BADGE_TIER[planCode] || null;
}

export function membershipForAvatar(account) {
  if (!account || account.isGuest || account.is_guest) return account?.membership || { isActive: false };
  if (account.role === 'ADMIN' || String(account.email || '').trim().toLowerCase() === 'elkin56ty@gmail.com') return ADMIN_MEMBERSHIP;
  return account.membership || { isActive: false };
}
