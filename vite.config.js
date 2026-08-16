import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/PROJECT-GALAXY.COM/dist/' : '/',
  build: {
    target: ['es2020', 'safari14'],
    cssTarget: 'safari14',
    minify: 'oxc',
    sourcemap: false,
    rollupOptions: { input: 'app.html' },
  },
}));
