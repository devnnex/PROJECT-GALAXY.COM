import { readFile, writeFile } from 'node:fs/promises';

const html = (await readFile('dist/app.html', 'utf8')).replace(/\r+\n/g, '\n');
await writeFile('dist/app.html', html);
await writeFile('dist/index.html', html);
await writeFile('dist/.nojekyll', '');
const { version } = JSON.parse(await readFile('dist/version.json', 'utf8'));
const worker = await readFile('dist/sw.js', 'utf8');
await writeFile('dist/sw.js', worker.replaceAll('__GALAXY_BUILD_ID__', version));
console.log('Static entry created: dist/index.html');
