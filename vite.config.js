import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [react()],
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
