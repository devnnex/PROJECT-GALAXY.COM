import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const schema = read('../supabase/schema.sql');
const app = read('../src/App.jsx');
const productData = read('../src/data.js');
const api = read('../src/services/api.js');
const experience = read('../src/components/MembershipExperience.jsx');
const paymentConfig = read('../src/payment-config.js');
const turnFunction = read('../supabase/functions/turn-credentials/index.ts');
const downloadFunction = read('../supabase/functions/scanner-download/index.ts');
const registrationManagement = read('../src/components/RegistrationManagement.jsx');
const registrationStyles = read('../src/registration.css');

describe('open Galaxy meetings and manual commerce', () => {
  it('defines the four membership plans and Scanner product', () => {
    expect(schema).toContain("('MONTHLY','Órbita mensual',1,80");
    expect(schema).toContain("('QUARTERLY','Nexo trimestral',3,250");
    expect(schema).toContain("('SEMESTER','Horizonte semestral',6,499");
    expect(schema).toContain("('ANNUAL','Constelación anual',12,999");
    expect(schema).toContain("('SCANNER_POWER_ELITE','Scanner Power Elite'");
    expect(schema).toContain(",650,'premium-downloads','SCANNER-POWER-ELITE.pine'");
  });

  it('opens member commerce and messaging while retaining administrator-only areas', () => {
    expect(schema).toContain('function public.require_active_membership()');
    expect(schema).toMatch(/function public\.create_meeting[\s\S]*public\.require_admin\(\)/);
    expect(schema).toMatch(/function public\.join_meeting[\s\S]*public\.require_active_membership\(\)/);
    expect(schema).toMatch(/function public\.has_active_membership[\s\S]*status='ACTIVE'/);
    expect(app).toContain("['marketplace', 'meetings', 'calendar', 'messages', 'wallet', 'orders', 'profile'].includes(id)");
    expect(app).toContain('(isAdmin ? navigation : memberNavigation).map');
    expect(app).toContain('useEffect(() => { reloadMembership().catch(() => {}); }, [user.id])');
    expect(app).toContain('canCreate={isAdmin}');
    expect(app).toContain("page === 'meetings' ? 'active' : 'background'");
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

  it('shows the Scanner for purchase while restricting its download to the owner account', () => {
    expect(schema).toContain("values('premium-downloads','premium-downloads',false");
    expect(app).toContain("const SCANNER_OWNER_EMAIL = 'elkin56ty@gmail.com'");
    expect(app).toContain('const catalogFor = () => products');
    expect(app).toContain("product.kind === 'scanner' && isScannerOwner(user)");
    expect(app).toContain('product.image ? <img className="product-image"');
    expect(productData).toContain("import powerEliteImage from './assets/PowerElite.png'");
    expect(productData).toContain('image: powerEliteImage');
    expect(productData).toContain('originalPrice: 1000, price: 650, promotionCycleHours: 24');
    expect(app).toContain('Se renueva cada 24 horas');
    expect(app).toContain('Total promocional');
    expect(schema).toMatch(/function public\.get_crypto_store[\s\S]*viewer\.id=me\.id and viewer\.status='ACTIVE'/);
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

  it('presents a member purchase as a confirmed positive payment', () => {
    expect(registrationManagement).toContain("purchase ? Math.abs(Number(entry.grossAmount ?? entry.amount))");
    expect(registrationManagement).toContain("purchase ? 'PAGO CONFIRMADO'");
    expect(registrationManagement).not.toContain("Number(entry.amount) >= 0 ? '+' : ''");
    expect(registrationStyles).toContain('.membership-ledger-row.membership-payment');
  });
});
