import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base: './'` + hash routing means the same build works from any URL:
// a domain root, a GitHub Pages project path (/repo-name/), Netlify, Vercel, S3...
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 700,
  },
});
