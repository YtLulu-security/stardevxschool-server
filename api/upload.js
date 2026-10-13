import { handler, send, readRaw, query, HttpError } from '../lib/http.js';
import { store } from '../lib/store.js';
import { putBlob } from '../lib/blob.js';

// POST /api/upload?id=<uploadId>&n=<nomor potongan>   body: bytes mentah (maks ~4 MB)
// Vercel membatasi body fungsi ~4,5 MB, jadi file besar dikirim berpotong-potong lalu disatukan di /api/complete.
export default handler(async (req, res, { h }) => {
  const q = query(req);
  if (!/^[a-z0-9]{8,32}$/.test(q.id || '')) throw new HttpError(400, 'id upload tidak valid');
  const n = parseInt(q.n, 10);
  if (!(n >= 0 && n < 40)) throw new HttpError(400, 'nomor potongan tidak valid');
  const buf = await readRaw(req);
  if (!buf.length) throw new HttpError(400, 'Potongan kosong');
  const url = await putBlob(`tmp/${h}/${q.id}/${n}`, buf, 'application/octet-stream');
  await store.hset(`up:${h}:${q.id}`, String(n), { url, size: buf.length });
  send(res, 200, { ok: true, n, size: buf.length });
}, { auth: true, methods: ['POST'] });
