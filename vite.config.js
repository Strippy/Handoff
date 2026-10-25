import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(root, 'src') },
  },
  server: {
    // `npm run dev:api` serves the API functions locally on 8787.
    proxy: { '/api': process.env.API_PROXY_TARGET || 'http://127.0.0.1:8787' },
  },
});
