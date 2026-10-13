import { handler, send, query, HttpError } from '../lib/http.js';
import { store } from '../lib/store.js';
import { delBlob } from '../lib/blob.js';
import { usageOf } from '../lib/usage.js';

// GET    /api/backup           -> daftar backup {id,title,size,updatedAt}
// GET    /api/backup?id=xyz    -> {url} alamat unduh langsung dari Blob (app fetch sendiri; tidak lewat batas 4,5 MB)
// DELETE /api/backup?id=xyz    -> hapus backup
export default handler(async (req, res, { h }) => {
  const id = query(req).id || '';
  if (req.method === 'GET' && !id) {
    const u = await usageOf(h);
    const items = Object.entries(u.baks).map(([k, v]) => ({ id: k, title: v.title, size: v.size, updatedAt: v.updatedAt, saved: v.saved }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    return send(res, 200, { ok: true, items, usage: { published: u.published, backups: u.backups, bytes: u.bytes, maxPublished: u.maxPublished, maxBytes: u.maxBytes } });
  }
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new HttpError(400, 'id tidak valid');
  const rec = await store.hget('baks:' + h, id);
  if (!rec) throw new HttpError(404, 'Backup tidak ditemukan');
  if (req.method === 'GET') return send(res, 200, { ok: true, id, title: rec.title, size: rec.size, updatedAt: rec.updatedAt, url: rec.url });
  try { await delBlob(rec.url); } catch {}
  await store.hdel('baks:' + h, id);
  send(res, 200, { ok: true });
}, { auth: true, methods: ['GET', 'DELETE'] });
