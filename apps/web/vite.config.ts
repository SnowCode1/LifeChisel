import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // The sync server behind /sync in development (docs/SYNC.md): the deployed
  // development Worker, or VITE_SYNC_TARGET=http://localhost:8787 (from the
  // shell or .env.local) for `npm run sync:dev`. Same-site requests keep the
  // passkey cookie first-party.
  const syncTarget =
    loadEnv(mode, '.', '').VITE_SYNC_TARGET ||
    'https://onpurpose-sync-dev.onpurpose-dev.workers.dev';
  return {
    plugins: [react()],
    // SQLite ships its own WebAssembly loader; pre-bundling would break its path.
    optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
    worker: { format: 'es' },
    // The landing page's development links point here (apps/landing/src/config.ts).
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/sync': {
          target: syncTarget,
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/sync/, ''),
        },
      },
    },
  };
});
