import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

it('keeps every PNL entry private to its authenticated owner', () => {
  const migration = read('../supabase/migrations/20261003100000_daily_trading_pnl.sql');
  expect(migration).toContain('primary key (user_id,trading_date)');
  expect(migration).toContain('user_id=auth.uid()');
  expect(migration).toContain('public.require_registered_member()');
  expect(migration).toContain("lower(account.email)='elkin56ty@gmail.com'");
  expect(migration).toContain("if v_target<>v_requester and not v_controller");
  expect(migration).toContain("where entry.user_id=v_target");
  expect(migration).toContain("where not profile.is_guest");
  expect(migration).toContain("extract(isodow from p_trading_date) not between 1 and 5");
  expect(migration).toContain('p_trading_date>current_date');
  expect(migration).toContain("'history',coalesce");
});

it('exposes the honest daily calendar, weekly totals and month history', () => {
  const app = read('../src/App.jsx');
  const api = read('../src/services/api.js');
  const page = read('../src/components/ProfitCalendarPage.jsx');
  expect(app).toContain("['pnl', 'PNL / Profit', CircleDollarSign]");
  expect(app).toContain("page === 'pnl'");
  expect(api).toContain("getTradingPnl: (month, userId) => rpc('get_trading_pnl'");
  expect(api).toContain("saveTradingPnl: (payload) => rpc('save_trading_pnl'");
  expect(page).toContain('REVISIÓN ADMINISTRATIVA PRIVADA');
  expect(page).toContain('Solo la cuenta elkin56ty@gmail.com puede abrir estos historiales.');
  expect(page).toContain('const readOnly = targetUserId !== user.id || viewingUser.isSelf === false');
  expect(page).toContain('Registro honesto');
  expect(page).toContain('Resultado semanal');
  expect(page).toContain('Meses anteriores');
});

it('uses presentation-only mobile meeting rules without hiding animated reactions and clips profile photos inside badges', () => {
  const meeting = read('../src/components/MeetingStudio.jsx');
  const meetingCss = read('../src/meeting-live.css');
  const avatarCss = read('../src/registration.css');
  expect(meeting).toContain("presentationStream ? 'mobile-presentation-only' : ''");
  expect(meetingCss).toContain('.meeting-page.mobile-presentation-only .meeting-side');
  expect(meetingCss).toContain('.meeting-page.mobile-presentation-only .video-surface.presentation { bottom:58px; height:auto; }');
  expect(meetingCss).not.toMatch(/mobile-presentation-only \.reaction-layer[^\{]*\{\s*display\s*:\s*none/i);
  expect(meetingCss).not.toMatch(/mobile-presentation-only \.cosmic-reaction-launcher[^\{]*\{\s*display\s*:\s*none/i);
  expect(avatarCss).toContain('.constellation-avatar.profile-photo.has-membership-badge>img');
  expect(avatarCss).toContain('clip-path:circle(50%)');
});
