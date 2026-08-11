import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHARED_DIR = path.resolve(__dirname, '../shared');

export default defineConfig({
  resolve: {
    alias: {
      '@shared/constants': path.join(SHARED_DIR, 'constants.ts'),
      '@shared/protocol': path.join(SHARED_DIR, 'protocol.ts'),
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': { target: 'http://localhost:8787', ws: false, changeOrigin: true },
      '/ws':  { target: 'ws://localhost:8787',  ws: true,  changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
});
