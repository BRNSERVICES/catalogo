import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// VITE_BASE é definido no workflow do GitHub Pages (/<nome-do-repositório>/).
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
