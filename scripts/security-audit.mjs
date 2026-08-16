import { readFile, readdir } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const distRoot = resolve(projectRoot, 'dist');

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  }));
  return files.flat();
}

function assert(condition, message) {
  if (!condition) throw new Error(`Security audit failed: ${message}`);
}

const files = await walk(distRoot);
const publicPaths = files.map((file) => relative(distRoot, file).replaceAll('\\', '/'));
const forbiddenExtensions = new Set(['.env', '.gs', '.jsx', '.map', '.sql', '.ts', '.tsx']);

for (const file of publicPaths) {
  assert(!forbiddenExtensions.has(extname(file)), `forbidden public file: ${file}`);
}

const html = await readFile(resolve(distRoot, 'index.html'), 'utf8');
const csp = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i)?.[1] || '';
for (const directive of ["default-src 'self'", "script-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'self'"]) {
  assert(csp.includes(directive), `missing CSP directive: ${directive}`);
}
assert(!csp.includes("'unsafe-eval'"), 'CSP allows unsafe-eval');
assert(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), 'production HTML contains inline JavaScript');
assert(!/\/(?:src|supabase)\//i.test(html), 'production HTML references source files');

const rootHtml = await readFile(resolve(projectRoot, 'index.html'), 'utf8');
assert(rootHtml.includes('Content-Security-Policy'), 'root redirect has no CSP');
assert(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(rootHtml), 'root redirect contains inline JavaScript');

for (const file of files.filter((item) => ['.js', '.css', '.html'].includes(extname(item)))) {
  const content = await readFile(file, 'utf8');
  assert(!/sourceMappingURL\s*=/.test(content), `sourcemap reference in ${relative(distRoot, file)}`);
  assert(!/sb_secret_[A-Za-z0-9_-]+/.test(content), `Supabase secret key in ${relative(distRoot, file)}`);
}

const runtime = await readFile(resolve(projectRoot, 'src/runtime-config.js'), 'utf8');
assert(!/SERVICE_ROLE|SUPABASE_SECRET|sb_secret_/i.test(runtime), 'privileged Supabase key marker in runtime config');
const jwt = runtime.match(/SUPABASE_ANON_KEY:\s*['"]([^'"]+)['"]/)?.[1];
assert(jwt, 'public Supabase key is missing');
const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
assert(payload.role === 'anon', `browser key has unexpected role: ${payload.role || 'missing'}`);

console.log(`Security audit passed: ${publicPaths.length} production files, strict CSP, no sourcemaps or privileged keys.`);
