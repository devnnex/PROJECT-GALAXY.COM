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

const ELITE_BADGE_EMAILS = new Set([
  'elkin56ty@gmail.com',
  'jairgomez@gmail.com',
  'edsonarias000@gmail.com',
]);

const ELITE_BADGE_USERNAMES = new Set(['elkin56ty', 'jairgomez', 'edsonarias000']);

export function membershipBadgeTier(membership) {
  const badgeTier = Number(membership?.badgeTier || membership?.badge_tier);
  if (Number.isInteger(badgeTier) && badgeTier >= 1 && badgeTier <= 5) return badgeTier;
  const planCode = String(membership?.planCode || membership?.plan_code || '').trim().toUpperCase();
  const status = String(membership?.status || '').trim().toUpperCase();
  const active = membership?.isActive === true || membership?.is_active === true || status === 'ACTIVE' || status === 'ADMIN' || planCode === 'ADMIN';
  if (!active) return null;
  return MEMBERSHIP_BADGE_TIER[planCode] || null;
}

export function membershipForAvatar(account) {
  if (!account || account.isGuest || account.is_guest) return account?.membership || { isActive: false };
  const email = String(account.email || '').trim().toLowerCase();
  const username = String(account.username || account.senderUsername || '').trim().toLowerCase().replace(/^@/, '');
  if (account.role === 'ADMIN' || email === 'elkin56ty@gmail.com') return ADMIN_MEMBERSHIP;
  if (ELITE_BADGE_EMAILS.has(email) || ELITE_BADGE_USERNAMES.has(username)) return { ...(account.membership || { isActive: false }), badgeTier: 5 };
  return account.membership || { isActive: false };
}
