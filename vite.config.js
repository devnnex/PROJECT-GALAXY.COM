import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/PROJECT-GALAXY.COM/dist/' : '/',
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: { input: 'app.html' },
  },
}));
