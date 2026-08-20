import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const schema = read('../supabase/schema.sql');
const app = read('../src/App.jsx');
const api = read('../src/services/api.js');
const experience = read('../src/components/MembershipExperience.jsx');
const paymentConfig = read('../src/payment-config.js');
const turnFunction = read('../supabase/functions/turn-credentials/index.ts');
const downloadFunction = read('../supabase/functions/scanner-download/index.ts');

describe('open Galaxy meetings and manual commerce', () => {
  it('defines the four membership plans and Scanner product', () => {
    expect(schema).toContain("('MONTHLY','Órbita mensual',1,80");
    expect(schema).toContain("('QUARTERLY','Nexo trimestral',3,250");
    expect(schema).toContain("('SEMESTER','Horizonte semestral',6,499");
    expect(schema).toContain("('ANNUAL','Constelación anual',12,999");
    expect(schema).toContain("('SCANNER_POWER_ELITE','Scanner Power Elite'");
    expect(schema).toContain(",1000,'premium-downloads','SCANNER-POWER-ELITE.pine'");
  });

  it('opens meetings and LIVE to every active registered account', () => {
    expect(schema).toContain('function public.require_active_membership()');
    expect(schema).toMatch(/function public\.create_meeting[\s\S]*public\.require_active_membership\(\)/);
    expect(schema).toMatch(/function public\.join_meeting[\s\S]*public\.require_active_membership\(\)/);
    expect(schema).toContain('Temporary community-open mode');
    expect(schema).toMatch(/function public\.has_active_membership[\s\S]*status='ACTIVE'/);
    expect(app).toContain("const membershipActive = user.status === 'ACTIVE'");
    expect(app).toContain("content = <MeetingStudio");
    expect(app).toContain("content = <LivePage");
  });

  it('shows direct manual USDT instructions without invoking payment verification', () => {
    expect(paymentConfig).toContain('TMuo1PDArFyXDyrdXUhRHt8qtKy94CmLsM');
    expect(paymentConfig).toContain('0xbf9402215a700b339c8922d573697d3500abaf33');
    expect(paymentConfig).toContain("import trc20Qr from '../USDT-TRC-20.jpeg'");
    expect(paymentConfig).toContain("import erc20Qr from '../USDT-ERC-20.jpeg'");
    expect(experience).toContain('Mostrar wallet y QR');
    expect(experience).toContain('Confirmación manual');
    expect(experience).not.toContain('api.createCryptoPayment');
    expect(experience).not.toContain('api.verifyCryptoPayment');
    expect(api).not.toContain('createCryptoPayment:');
    expect(api).not.toContain('verifyCryptoPayment:');
  });

  it('keeps the Scanner private and restricted to the owner account', () => {
    expect(schema).toContain("values('premium-downloads','premium-downloads',false");
    expect(app).toContain("const SCANNER_OWNER_EMAIL = 'elkin56ty@gmail.com'");
    expect(app).toContain("product.kind !== 'scanner' || isScannerOwner(user)");
    expect(downloadFunction).toContain("toLowerCase() !== 'elkin56ty@gmail.com'");
    expect(downloadFunction).toContain('createSignedUrl(product.storage_path, 60');
    expect(experience).toContain('ScannerCheckoutModal');
    expect(experience).toContain('Descargar SCANNER-POWER-ELITE.pine');
  });

  it('generates ephemeral TURN credentials only for admitted meeting participants', () => {
    expect(turnFunction).toContain("supabase.rpc('get_meeting_state'");
    expect(turnFunction).toContain("requiredEnv('CLOUDFLARE_TURN_KEY_ID')");
    expect(turnFunction).toContain("requiredEnv('CLOUDFLARE_TURN_API_TOKEN')");
    expect(turnFunction).toContain('credentials/generate-ice-servers');
    expect(api).not.toMatch(/CLOUDFLARE_TURN_(?:KEY_ID|API_TOKEN)/);
  });

  it('keeps permanent administrator identity and labels the checkout as manual', () => {
    expect(schema).toContain("insert into public.admin_access_allowlist(email) values ('elkin56ty@gmail.com')");
    expect(experience).toContain('Acceso permanente habilitado');
    expect(experience).toContain('Pago directo y confirmación manual');
    expect(experience).not.toContain('HASH DE LA TRANSACCIÓN');
  });
});
