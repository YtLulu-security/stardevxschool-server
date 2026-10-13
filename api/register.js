import { randomBytes } from 'node:crypto';
import { handler, send, readJson, sha256, clientIp, HttpError, cfg } from '../lib/http.js';
import { store } from '../lib/store.js';

// POST /api/register  {code?, label?}  -> { key }  (key hanya ditampilkan SEKALI; server hanya menyimpan hash-nya)
export default handler(async (req, res) => {
  const body = await readJson(req);
  const need = process.env.REGISTER_CODE;
  if (need && String(body.code || '') !== need) throw new HttpError(403, 'Kode undangan salah');

  const n = await store.incr('rl:reg:' + sha256(clientIp(req)).slice(0, 16), 86400);
  if (n > 10) throw new HttpError(429, 'Terlalu banyak pendaftaran dari jaringan ini, coba besok');

  const key = 'sdx_' + Array.from(randomBytes(24), (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
  await store.set('dev:' + sha256(key), {
    created: Date.now(),
    label: String(body.label || '').slice(0, 60),
    revoked: false,
  });
  send(res, 200, { ok: true, key, maxPublished: cfg.maxPublished(), maxBytes: cfg.maxBytes() });
}, { methods: ['POST'] });
