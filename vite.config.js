import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const buildId = Date.now().toString(36);

export default defineConfig(({ command }) => ({
  plugins: [react(), { name: 'galaxy-build-version', generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: buildId }) }); } }],
  define: { __GALAXY_BUILD_ID__: JSON.stringify(buildId) },
  // Relative paths work on GitHub Pages and when the repository is served locally.
  base: command === 'build' ? './' : '/',
  build: {
    target: ['es2020', 'safari14'],
    cssTarget: 'safari14',
    minify: 'oxc',
    sourcemap: false,
    rollupOptions: { input: 'app.html' },
  },
}));
