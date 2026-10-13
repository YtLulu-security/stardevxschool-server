// Server lokal untuk uji: meniru routing Vercel (/api/*, /p/:id) tanpa perlu Redis/Blob sungguhan.
import http from 'node:http';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { localBlobPath } from '../lib/blob.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
process.env.LOCAL_BASE = process.env.LOCAL_BASE || `http://localhost:${PORT}`;

export function start(port = PORT) {
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    let name = null;
    const m = u.pathname.match(/^\/p\/([^/]+)$/);
    if (m) { name = 'p'; req.url = `/api/p?id=${m[1]}`; }
    else if (/^\/api\/[a-z]+$/.test(u.pathname)) name = u.pathname.slice(5);
    else if (u.pathname.startsWith('/_blob/')) {
      try { return res.end(fs.readFileSync(localBlobPath(decodeURIComponent(u.pathname.slice(7))))); }
      catch { res.statusCode = 404; return res.end(); }
    }
    if (!name || !fs.existsSync(path.resolve('api', name + '.js'))) { res.statusCode = 404; return res.end('not found'); }
    const mod = await import(pathToFileURL(path.resolve('api', name + '.js')).href);
    await mod.default(req, res);
  });
  return new Promise((r) => server.listen(port, () => r(server)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  start().then(() => console.log(`Dev server: http://localhost:${PORT}  (store & blob lokal di .devdata/)`));
}
