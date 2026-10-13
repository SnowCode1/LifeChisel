import { timingSafeEqual, randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { createServer } from 'node:http';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validPerformanceReport } from '../packages/core/src/performanceModel.ts';

const MAX_BODY = 12 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');
const PNG_END = Buffer.from('0000000049454e44ae426082', 'hex');

export function createPreviewReceiver({
  token,
  directory,
  onSaved = () => {},
}) {
  if (typeof token !== 'string' || token.length < 32)
    throw new Error('Set a preview pairing token of at least 32 characters.');
  const expectedAuth = Buffer.from(`Bearer ${token}`);
  let receiving = false;

  const server = createServer(async (req, res) => {
    const reply = (status, body) => {
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      res.end(JSON.stringify(body));
    };
    // No browser/CORS access; this endpoint is for the paired native dev app.
    const auth = Buffer.from(req.headers.authorization ?? '');
    if (
      req.headers.origin ||
      auth.length !== expectedAuth.length ||
      !timingSafeEqual(auth, expectedAuth)
    ) {
      reply(401, { error: 'Pairing required' });
      return;
    }
    if (req.method === 'GET' && req.url === '/health') {
      reply(200, { ready: true });
      return;
    }
    const performanceReport = req.url === '/performance';
    if (
      req.method !== 'POST' ||
      (!performanceReport && req.url !== '/preview')
    ) {
      reply(404, { error: 'Not found' });
      return;
    }
    if (req.headers['content-type']?.split(';')[0] !== 'application/json') {
      reply(415, { error: 'Expected JSON' });
      return;
    }
    const maximumBody = performanceReport ? 64 * 1024 : MAX_BODY;
    if (Number(req.headers['content-length']) > maximumBody) {
      reply(413, { error: 'Image too large' });
      return;
    }
    if (receiving) {
      reply(429, { error: 'Another preview is being saved; retry shortly' });
      return;
    }
    receiving = true;
    try {
      let size = 0;
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > maximumBody) {
          reply(413, { error: 'Image too large' });
          return;
        }
        chunks.push(chunk);
      }
      let payload;
      try {
        payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        reply(400, { error: 'Invalid JSON' });
        return;
      }
      if (performanceReport) {
        if (!validPerformanceReport(payload)) {
          reply(400, { error: 'Expected anonymous timing metrics' });
          return;
        }
        const target = join(directory, '..', 'performance');
        await mkdir(target, { recursive: true, mode: 0o700 });
        const id = randomUUID();
        const filename = `${new Date().toISOString().replace(/[:.]/g, '-')}-${id}.json`;
        const temporary = join(target, `.${id}.tmp`);
        const json = JSON.stringify(payload, null, 2);
        await writeFile(join(target, filename), json, {
          flag: 'wx',
          mode: 0o600,
        });
        try {
          await writeFile(temporary, json, { flag: 'wx', mode: 0o600 });
          await rename(temporary, join(target, 'latest.json'));
        } finally {
          await rm(temporary, { force: true });
        }
        reply(201, { saved: true, filename });
        onSaved(join(target, filename));
        return;
      }
      const base64 = payload?.png;
      if (
        typeof base64 !== 'string' ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(base64) ||
        base64.length % 4 !== 0
      ) {
        reply(400, { error: 'Expected base64 PNG' });
        return;
      }
      const png = Buffer.from(base64, 'base64');
      if (
        png.length < 45 ||
        !png.subarray(0, 8).equals(PNG_SIGNATURE) ||
        png.toString('ascii', 12, 16) !== 'IHDR' ||
        !png.subarray(-12).equals(PNG_END)
      ) {
        reply(400, { error: 'Expected a complete PNG' });
        return;
      }
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const id = randomUUID();
      const filename = `${new Date().toISOString().replace(/[:.]/g, '-')}-${id}.png`;
      const destination = join(directory, filename);
      const temporary = join(directory, `.${id}.tmp`);
      await writeFile(destination, png, { flag: 'wx', mode: 0o600 });
      try {
        await writeFile(temporary, png, { flag: 'wx', mode: 0o600 });
        await rename(temporary, join(directory, 'latest.png'));
      } finally {
        await rm(temporary, { force: true });
      }
      reply(201, { saved: true, filename });
      onSaved(destination);
    } catch {
      if (!res.headersSent && !res.destroyed)
        reply(500, { error: 'Could not save preview' });
    } finally {
      receiving = false;
    }
  });
  server.requestTimeout = 20000;
  server.headersTimeout = 10000;
  server.timeout = 20000;
  return server;
}
