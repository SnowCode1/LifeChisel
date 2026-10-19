const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  { ignores: ['**/dist/**', '.expo/**', '.dev/**', '**/.wrangler/**'] },
  {
    // Cloudflare's runtime provides cloudflare:* modules; there is no file.
    files: ['apps/sync/**'],
    rules: { 'import/no-unresolved': ['error', { ignore: ['^cloudflare:'] }] },
  },
]);
