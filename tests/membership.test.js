import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const schema = read('../supabase/schema.sql');
const app = read('../src/App.jsx');
const api = read('../src/services/api.js');
const experience = read('../src/components/MembershipExperience.jsx');
const paymentFunction = read('../supabase/functions/membership-payments/index.ts');
const webhook = read('../supabase/functions/nowpayments-webhook/index.ts');

describe('verified Galaxy memberships', () => {
  it('defines the requested plans and exact prices', () => {
    expect(schema).toContain("('MONTHLY','Órbita mensual',1,80");
    expect(schema).toContain("('QUARTERLY','Nexo trimestral',3,250");
    expect(schema).toContain("('SEMESTER','Horizonte semestral',6,499");
    expect(schema).toContain("('ANNUAL','Constelación anual',12,7999");
  });

  it('enforces membership in PostgreSQL and realtime, not only React', () => {
    expect(schema).toContain('function public.require_active_membership()');
    expect(schema).toMatch(/function public\.create_meeting[\s\S]*public\.require_active_membership\(\)/);
    expect(schema).toMatch(/function public\.join_meeting[\s\S]*public\.require_active_membership\(\)/);
    expect(schema).toContain('public.has_active_membership((select auth.uid())) and exists');
    expect(schema).toContain('alter table public.memberships enable row level security');
    expect(app).toContain('membershipActive ? <MeetingStudio');
    expect(app).toContain('membershipActive ? <LivePage');
  });

  it('activates only a complete, correctly matched final provider payment', () => {
    expect(schema).toContain("coalesce(auth.role(),'')<>'service_role'");
    expect(schema).toContain("if v_status='FINISHED' then");
    expect(schema).toContain("lower(coalesce(p_payload->>'pay_currency',''))<>v_currency");
    expect(schema).toContain("coalesce(p_payload->>'order_id','')<>v_order.id::text");
    expect(schema).toContain("nullif(p_payload->>'parent_payment_id','') is not null");
    expect(schema).toContain('coalesce(p_actually_paid,0)<coalesce(v_order.pay_amount,0)');
    expect(schema).toContain("grant execute on function public.activate_membership_from_payment");
    expect(schema).toContain('to service_role;');
  });

  it('keeps gateway secrets on Edge Functions and validates signed IPN callbacks', () => {
    expect(paymentFunction).toContain("requiredEnv('NOWPAYMENTS_API_KEY')");
    expect(paymentFunction).toContain("TRC20: 'usdttrc20'");
    expect(paymentFunction).toContain("ERC20: 'usdterc20'");
    expect(webhook).toContain("request.headers.get('x-nowpayments-sig')");
    expect(webhook).toContain("hash: 'SHA-512'");
    expect(webhook).toContain("requiredEnv('NOWPAYMENTS_IPN_SECRET')");
    expect(api).not.toMatch(/NOWPAYMENTS_(?:API_KEY|IPN_SECRET)/);
  });

  it('shows premium checkout, activation confirmation and expiring profile access', () => {
    expect(experience).toContain('MembershipCheckoutModal');
    expect(experience).toContain('MembershipActivationModal');
    expect(experience).toContain('MembershipProfileCard');
    expect(experience).toContain('MembershipCountdown');
    expect(experience).toContain('Envía únicamente USDT por');
    expect(experience).toContain('Tu membresía está activa.');
  });
});
