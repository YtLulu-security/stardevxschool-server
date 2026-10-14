import { cors } from '../lib/http.js';
import { store } from '../lib/store.js';
import { getBlob } from '../lib/blob.js';

// GET /p/<id>  (rewrite -> /api/p?id=<id>)  Halaman publik presentasi.
// CSP sandbox tanpa allow-same-origin: skrip di dalam presentasi tetap jalan, tapi terisolasi dari domain server.
const page = (title, msg) => `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>${title}</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#06162f;color:#eef3ff;font-family:system-ui,sans-serif;text-align:center"><div><h1 style="font-weight:600">${title}</h1><p style="color:#a9b8d8">${msg}</p></div>`;

export default async function (req, res) {
  cors(res);
  const id = new URL(req.url, 'http://x').searchParams.get('id') || '';
  try {
    const m = /^[a-z0-9]{6,16}$/.test(id) ? await store.get('pub:' + id) : null;
    if (!m) {
      res.statusCode = 404; res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(page('Presentasi tidak ditemukan', 'Link ini salah atau sudah dicabut oleh pemiliknya.'));
    }
    const buf = await getBlob(m.url);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Security-Policy', 'sandbox allow-scripts allow-popups allow-forms');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=3600, stale-while-revalidate=300');
    res.end(buf);
  } catch (e) {
    console.error(e);
    res.statusCode = 500; res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(page('Gagal memuat', 'Coba lagi sebentar.'));
  }
}
