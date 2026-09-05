import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const main = read('../src/main.jsx');
const compatibility = read('../src/browser-compat.css');
const html = read('../app.html');
const vite = read('../vite.config.js');
const root = read('../index.html');
const redirect = read('../redirect.js');
const styles = read('../src/styles.css');
const calendar = read('../src/calendar.css');

describe('Cross-browser visual contract', () => {
  it('self-hosts the real product fonts at every used weight', () => {
    for (const weight of [400, 500, 600, 700]) {
      expect(main).toContain(`@fontsource/dm-sans/latin-${weight}.css`);
    }
    for (const weight of [500, 600]) {
      expect(main).toContain(`@fontsource/manrope/latin-${weight}.css`);
    }
  });

  it('normalizes Safari typography and premium glass effects', () => {
    expect(compatibility).toContain('-webkit-text-size-adjust: 100%');
    expect(compatibility).toContain('-webkit-font-smoothing: antialiased');
    expect(compatibility).toContain('-webkit-backdrop-filter: blur(24px)');
    expect(compatibility).toContain('-webkit-mask-image: radial-gradient');
  });

  it('supports dynamic mobile viewports and Apple safe areas', () => {
    expect(html).toContain('viewport-fit=cover');
    expect(compatibility).toContain('@supports (height: 100dvh)');
    expect(compatibility).toContain('env(safe-area-inset-bottom)');
  });

  it('keeps mobile forms at an iOS-safe text size and the calendar fitted to the viewport', () => {
    expect(styles).toContain('textarea{font-size:16px!important}');
    expect(calendar).toContain('.calendar-weekdays,.calendar-grid{width:100%;min-width:0');
    expect(calendar).toContain('.calendar-cell{min-width:0;min-height:62px');
  });

  it('ships JavaScript and CSS compatible with Safari 14+', () => {
    expect(vite).toContain("target: ['es2020', 'safari14']");
    expect(vite).toContain("cssTarget: 'safari14'");
  });

  it('keeps the root entry usable through Live Server', () => {
    expect(vite).toContain("base: command === 'build' ? './' : '/'");
    expect(root).toContain('./redirect.js');
    expect(redirect).toContain("new URL('./dist/index.html', window.location.href)");
  });
});
