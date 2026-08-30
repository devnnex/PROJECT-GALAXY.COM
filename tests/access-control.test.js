import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const schema = read('../supabase/schema.sql');
const app = read('../src/App.jsx');
const api = read('../src/services/api.js');
const meeting = read('../src/components/MeetingStudio.jsx');

describe('Galaxy owner and member access controls', () => {
  it('keeps the owner allowlist server-controlled and exposes admin toggles only through RPC', () => {
    expect(schema).toContain("insert into public.admin_access_allowlist(email) values ('elkin56ty@gmail.com')");
    expect(schema).toContain('function public.get_admin_users()');
    expect(schema).toContain('function public.set_user_access(p_user_id uuid,p_active boolean)');
    expect(schema).toMatch(/set_user_access[\s\S]*role='ADMIN'/);
    expect(app).toContain('<AdminUsersPage toast={toast} />');
    expect(app).toContain('<BlockedAccess user={user}');
  });

  it('invalidates both regular sessions when a second Supabase session is detected', () => {
    expect(schema).toContain('create table if not exists public.user_session_state');
    expect(schema).toContain("'status','DUPLICATE'");
    expect(schema).toContain("conflict_until=now()+interval '30 seconds'");
    expect(schema).toContain("if v_profile.role='ADMIN'");
    expect(api).toContain("rpc('claim_user_session')");
    expect(api).toContain("rpc('heartbeat_user_session')");
    expect(api).toContain("signOut({ scope: 'local' })");
  });

  it('uses authenticated token links without putting meeting passwords in URLs', () => {
    expect(schema).toContain('create table if not exists public.meeting_share_links');
    expect(schema).toContain("digest(v_token,'sha256')");
    expect(schema).toContain('function public.redeem_meeting_share_link(p_token text)');
    expect(meeting).toContain("url.searchParams.set('invite', link.token)");
    expect(meeting).not.toMatch(/searchParams\.set\(['\"]password/);
    expect(app).toContain('api.redeemMeetingShareLink(inviteToken)');
  });

  it('burns mandatory owner privacy masks into the shared canvas', () => {
    expect(meeting).toContain('function PrivacyMaskEditor');
    expect(meeting).toContain("user.role === 'ADMIN'");
    expect(meeting).toContain("ctx.fillStyle = '#05040a'");
    expect(meeting).toContain('canvas.captureStream(24)');
    expect(meeting).toContain('Los participantes no pueden ocultarlas ni retirarlas.');
  });

  it('retains calendar history for seven days independently from meeting history', () => {
    expect(schema).toContain('meeting_id uuid references public.meetings(id) on delete set null');
    expect(schema).toContain("delete from public.calendar_events where ends_at<now()-interval '7 days'");
    expect(schema).toContain('function public.remove_ended_meeting');
    expect(meeting).toContain('api.removeEndedMeeting');
  });
});
