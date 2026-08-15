import { copyFile, writeFile } from 'node:fs/promises';

await copyFile('dist/app.html', 'dist/index.html');
await writeFile('dist/.nojekyll', '');
console.log('Static entry created: dist/index.html');
