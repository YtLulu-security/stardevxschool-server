import { handler, send, query, HttpError, baseUrl } from '../lib/http.js';
import { store } from '../lib/store.js';
import { delBlob } from '../lib/blob.js';
import { usageOf } from '../lib/usage.js';

// GET    /api/publish          -> daftar link milik device + pemakaian kuota
// DELETE /api/publish?id=abc   -> cabut link
export default handler(async (req, res, { h }) => {
  if (req.method === 'GET') {
    const u = await usageOf(h);
    const items = Object.entries(u.pubs).map(([id, v]) => ({ id, title: v.title, size: v.size, updated: v.updated, link: `${baseUrl(req)}/p/${id}` }))
      .sort((a, b) => b.updated - a.updated);
    return send(res, 200, { ok: true, items, usage: { published: u.published, backups: u.backups, bytes: u.bytes, maxPublished: u.maxPublished, maxBytes: u.maxBytes } });
  }
  const id = query(req).id || '';
  if (!/^[a-z0-9]{6,16}$/.test(id)) throw new HttpError(400, 'id tidak valid');
  const m = await store.get('pub:' + id);
  if (!m || m.owner !== h) throw new HttpError(404, 'Link tidak ditemukan');
  try { await delBlob(m.url); } catch {}
  await store.del('pub:' + id);
  await store.hdel('pubs:' + h, id);
  send(res, 200, { ok: true });
}, { auth: true, methods: ['GET', 'DELETE'] });
