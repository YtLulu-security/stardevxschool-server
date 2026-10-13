import { timingSafeEqual } from 'node:crypto';
import { handler, send, readJson, sha256, HttpError } from '../lib/http.js';
import { store } from '../lib/store.js';
import { delBlob } from '../lib/blob.js';

// POST /api/admin   Authorization: Bearer <ADMIN_SECRET>
//  {action:'config', latestCode, latestName, minCode, updateUrl, announcement}  -> ubah info versi/pengumuman tanpa redeploy
//  {action:'revoke', key}      -> cabut key device (atau 'unrevoke')
//  {action:'unpublish', id}    -> hapus link publik (moderasi)
export default handler(async (req, res) => {
  const secret = process.env.ADMIN_SECRET || '';
  const got = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(got), b = Buffer.from(secret);
  if (!secret || a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(401, 'Admin ditolak');

  const body = await readJson(req);
  if (body.action === 'config') {
    const c = (await store.get('config')) || {};
    for (const k of ['latestCode', 'minCode']) if (body[k] !== undefined) c[k] = parseInt(body[k], 10) || 0;
    for (const k of ['latestName', 'updateUrl', 'announcement']) if (body[k] !== undefined) c[k] = String(body[k]).slice(0, 500);
    await store.set('config', c);
    return send(res, 200, { ok: true, config: c });
  }
  if (body.action === 'revoke' || body.action === 'unrevoke') {
    const k = 'dev:' + sha256(String(body.key || ''));
    const d = await store.get(k);
    if (!d) throw new HttpError(404, 'Key tidak ditemukan');
    d.revoked = body.action === 'revoke';
    await store.set(k, d);
    return send(res, 200, { ok: true, revoked: d.revoked });
  }
  if (body.action === 'unpublish') {
    const id = String(body.id || '');
    const m = /^[a-z0-9]{6,16}$/.test(id) ? await store.get('pub:' + id) : null;
    if (!m) throw new HttpError(404, 'Link tidak ditemukan');
    try { await delBlob(m.url); } catch {}
    await store.del('pub:' + id);
    await store.hdel('pubs:' + m.owner, id);
    return send(res, 200, { ok: true });
  }
  throw new HttpError(400, 'action tidak dikenal');
}, { methods: ['POST'] });
