import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Start the browser app (5173) and the landing page (5175) together, so the
// web app's brand link and the landing page's "Open the web app" links both
// reach a running server in development. Each port is strict: a busy port
// stops that server instead of moving it to one the links do not point at,
// and the other keeps running (the busy port is usually that same server
// already started in another terminal).
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const vite = join(
  dirname(require.resolve('vite/package.json')),
  'bin',
  'vite.js',
);

const children = ['apps/web', 'apps/landing'].map((folder) => {
  const child = spawn(process.execPath, [vite], {
    cwd: join(root, folder),
    stdio: 'inherit',
  });
  child.on('error', (error) => {
    console.error(`Could not start ${folder}: ${error.message}`);
    process.exitCode = 1;
  });
  child.on('exit', (code) => {
    if (code) process.exitCode = code;
  });
  return child;
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    for (const child of children) child.kill(signal);
  });
