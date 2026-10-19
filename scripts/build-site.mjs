// Puts the two built sites together as one static site for hosting
// (docs/WEB.md, Hosting): the landing page at the root and the web app under
// /app/. `npm run site:build` builds both first; Vercel runs that command.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = `${root}site-dist`;
const landing = `${root}apps/landing/dist`;
const web = `${root}apps/web/dist`;

for (const dir of [landing, web]) {
  if (!existsSync(dir)) throw new Error(`Missing build output: ${dir}`);
}

rmSync(out, { recursive: true, force: true });
cpSync(landing, out, { recursive: true });
cpSync(web, `${out}/app`, { recursive: true });
console.log(`Site assembled in ${out}`);
