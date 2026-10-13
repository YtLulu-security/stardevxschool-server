import { handler, send, readJson, baseUrl, rid, HttpError, cfg } from '../lib/http.js';
import { store } from '../lib/store.js';
import { putBlob, getBlob, delBlob } from '../lib/blob.js';
import { usageOf } from '../lib/usage.js';

const safeId = (s) => /^[A-Za-z0-9_-]{1,64}$/.test(s || '');

// POST /api/complete {uploadId, parts, kind:'publish'|'backup', id?, title?, updatedAt?}
// Menyatukan potongan -> file akhir. publish: hasilkan link /p/<id>. backup: simpan JSON presentasi.
export default handler(async (req, res, { h }) => {
  const b = await readJson(req);
  const uid = String(b.uploadId || '');
  if (!/^[a-z0-9]{8,32}$/.test(uid)) throw new HttpError(400, 'uploadId tidak valid');
  const kind = b.kind;
  if (kind !== 'publish' && kind !== 'backup') throw new HttpError(400, 'kind harus publish atau backup');
  const parts = parseInt(b.parts, 10);
  if (!(parts >= 1 && parts <= 40)) throw new HttpError(400, 'jumlah potongan tidak valid');

  const rec = await store.hgetall(`up:${h}:${uid}`);
  const urls = [];
  let total = 0;
  for (let i = 0; i < parts; i++) {
    const p = rec[String(i)];
    if (!p) throw new HttpError(400, `Potongan ${i} belum terunggah`);
    urls.push(p.url); total += p.size;
  }
  if (total > cfg.maxUpload) { await cleanup(h, uid, urls, parts); throw new HttpError(413, 'File terlalu besar'); }

  const title = String(b.title || 'Presentasi').slice(0, 120);
  const u = await usageOf(h);

  try {
    const buf = Buffer.concat(await Promise.all(urls.map(getBlob)));

    if (kind === 'publish') {
      let pid = b.id ? String(b.id) : '';
      let old = null;
      if (pid) {
        if (!/^[a-z0-9]{6,16}$/.test(pid)) throw new HttpError(400, 'id link tidak valid');
        old = await store.get('pub:' + pid);
        if (old && old.owner !== h) throw new HttpError(403, 'Link ini bukan milik key kamu');
      }
      if (!old) {
        if (u.published >= u.maxPublished) throw new HttpError(409, `Batas link tercapai (${u.maxPublished}). Hapus salah satu dulu.`);
        pid = pid || rid(8);
      }
      const delta = buf.length - (old ? old.size : 0);
      if (u.bytes + delta > u.maxBytes) throw new HttpError(409, 'Kuota penyimpanan penuh');
      const url = await putBlob(`pub/${pid}.html`, buf, 'text/html; charset=utf-8');
      const now = Date.now();
      await store.set('pub:' + pid, { owner: h, title, url, size: buf.length, created: old ? old.created : now, updated: now });
      await store.hset('pubs:' + h, pid, { title, size: buf.length, updated: now });
      send(res, 200, { ok: true, id: pid, link: `${baseUrl(req)}/p/${pid}`, size: buf.length, updated: now });
    } else {
      const id = String(b.id || '');
      if (!safeId(id)) throw new HttpError(400, 'id presentasi tidak valid');
      const old = u.baks[id];
      const delta = buf.length - (old ? old.size : 0);
      if (u.bytes + delta > u.maxBytes) throw new HttpError(409, 'Kuota penyimpanan penuh');
      const url = await putBlob(`bak/${h}/${id}.json`, buf, 'application/json');
      const updatedAt = Number(b.updatedAt) || Date.now();
      await store.hset('baks:' + h, id, { title, size: buf.length, updatedAt, url, saved: Date.now() });
      send(res, 200, { ok: true, id, size: buf.length, updatedAt });
    }
  } finally {
    await cleanup(h, uid, urls, parts);
  }
}, { auth: true, methods: ['POST'] });

async function cleanup(h, uid, urls, parts) {
  try { await delBlob(urls); } catch {}
  await store.del(`up:${h}:${uid}`);
}
