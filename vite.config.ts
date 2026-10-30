import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages uses the repository name as the base path in production.
// Set VITE_BASE=/catalogo/ in the GitHub Actions environment.
export default defineConfig({ plugins: [react()], base: process.env.VITE_BASE || '/' })
