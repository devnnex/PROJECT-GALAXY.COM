import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

await mkdir('artifacts', { recursive: true });
const baseUrl = process.env.VISUAL_BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
const errors = [];
const previewUser = { id: 'visual_user', name: 'Alex Morgan', username: 'alex', email: 'alex@example.com', role: 'CREATOR', level: 12 };
async function mockApi(page) {
  await page.route('https://script.google.com/**', async (route) => { let body = {}; try { body = JSON.parse(route.request().postData() || '{}'); } catch {} let response;
    if (body.action === 'login') response = { ok: true, data: { token: 'visual-session', user: previewUser, expiresAt: Date.now() + 3600000 } };
    else if (body.action === 'getBootstrapData') response = { ok: true, data: { user: body.sessionToken ? previewUser : null } };
    else if (body.action === 'getMyMeetings') response = { ok: true, data: [] };
    else response = { ok: false, error: { message: 'Inicia sesión para continuar.' } };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
  });
}
const desktop = await browser.newPage({ viewport: { width: 1440, height: 980 }, deviceScaleFactor: 1 });
await mockApi(desktop);
desktop.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
desktop.on('pageerror', (error) => errors.push(error.message));
await desktop.goto(baseUrl, { waitUntil: 'networkidle' });
await desktop.screenshot({ path: 'artifacts/landing-desktop.png', fullPage: true });
await desktop.getByRole('button', { name: /Entrar a la plataforma/i }).click();
await desktop.screenshot({ path: 'artifacts/auth-desktop.png', fullPage: true });
await desktop.getByLabel('Correo electrónico').fill('alex@example.com'); await desktop.locator('input[name="password"]').fill('password1234');
await desktop.getByRole('button', { name: /Entrar al ecosistema/i }).click();
await desktop.getByText('Bienvenido de vuelta').waitFor();
await desktop.screenshot({ path: 'artifacts/dashboard-desktop.png', fullPage: true });
await desktop.locator('.sidebar nav').getByRole('button', { name: 'Marketplace', exact: true }).click();
await desktop.screenshot({ path: 'artifacts/marketplace-desktop.png', fullPage: true });
await desktop.locator('.product-card').first().click();
await desktop.getByRole('button', { name: /Adquirir/i }).click();
await desktop.getByRole('button', { name: /TRON/i }).click();
await desktop.getByRole('button', { name: /Crear solicitud/i }).click();
await desktop.getByText(/pagos están desactivados/i).waitFor();
await desktop.locator('.modal-close').click();
await desktop.locator('.sidebar nav').getByRole('button', { name: 'Reuniones', exact: true }).click();
await desktop.getByText('Reuniones privadas para tu comunidad').waitFor();
await desktop.screenshot({ path: 'artifacts/meeting-lobby-desktop.png', fullPage: true });
for (const destination of ['Descubrir', 'En vivo', 'Mensajes', 'Wallet', 'Órdenes', 'Perfil', 'Inicio']) {
  await desktop.locator('.sidebar nav button').filter({ hasText: destination }).click();
  await desktop.locator('.page-content').waitFor();
}

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
await mockApi(mobile);
mobile.on('pageerror', (error) => errors.push(error.message));
await mobile.goto(baseUrl, { waitUntil: 'networkidle' });
await mobile.evaluate(() => localStorage.clear());
await mobile.reload({ waitUntil: 'networkidle' });
await mobile.screenshot({ path: 'artifacts/landing-mobile.png', fullPage: true });
await mobile.getByRole('button', { name: /Entrar a la plataforma/i }).click();
await mobile.getByLabel('Correo electrónico').fill('alex@example.com'); await mobile.locator('input[name="password"]').fill('password1234');
await mobile.getByRole('button', { name: /Entrar al ecosistema/i }).click();
await mobile.getByText('Bienvenido de vuelta').waitFor();
await mobile.screenshot({ path: 'artifacts/dashboard-mobile.png', fullPage: true });
await mobile.locator('.bottom-nav button').filter({ hasText: 'Reuniones' }).click();
await mobile.getByText('Reuniones privadas para tu comunidad').waitFor();
await mobile.screenshot({ path: 'artifacts/meeting-mobile.png', fullPage: true });
await browser.close();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('Visual routes rendered at 1440px and 390px without uncaught browser errors.');
