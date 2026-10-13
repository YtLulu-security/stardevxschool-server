import { createHash, randomBytes } from 'node:crypto';
import { store } from './store.js';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const sha256 = (s) => createHash('sha256').update(s).digest('hex');
export const rid = (n = 8) => randomBytes(n).toString('base64url').replace(/[-_]/g, 'x').slice(0, n).toLowerCase();

export function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Device-Key, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

export function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

export function baseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/+$/, '');
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  const proto = req.headers['x-forwarded-proto'] || (/^localhost|^127\./.test(host) ? 'http' : 'https');
  return `${proto}://${host}`;
}

export function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'x').split(',')[0].trim();
}

export async function readRaw(req, max = 4.4 * 1024 * 1024) {
  const b = req.body;
  if (b !== undefined && b !== null) {
    if (Buffer.isBuffer(b)) return b;
    if (typeof b === 'string') return Buffer.from(b);
    return Buffer.from(JSON.stringify(b));
  }
  const chunks = []; let n = 0, over = false;
  for await (const c of req) {   // tetap dibaca sampai habis (dibuang) supaya koneksi tidak putus di tengah
    n += c.length;
    if (n > max) over = true;
    else chunks.push(c);
  }
  if (over) throw new HttpError(413, 'Body terlalu besar (maks ~4 MB per potongan)');
  return Buffer.concat(chunks);
}

export async function readJson(req) {
  const b = req.body;
  if (b && typeof b === 'object' && !Buffer.isBuffer(b)) return b;
  const raw = await readRaw(req, 1024 * 1024);
  if (!raw.length) return {};
  try { return JSON.parse(raw.toString('utf8')); }
  catch { throw new HttpError(400, 'JSON tidak valid'); }
}

export function query(req) {
  return Object.fromEntries(new URL(req.url, 'http://x').searchParams);
}

/** Cek header X-Device-Key -> { h (hash), dev } */
export async function authDevice(req) {
  const key = String(req.headers['x-device-key'] || '');
  if (!/^sdx_[a-z0-9]{24}$/.test(key)) throw new HttpError(401, 'Key tidak ada / format salah');
  const h = sha256(key);
  const dev = await store.get('dev:' + h);
  if (!dev) throw new HttpError(401, 'Key tidak dikenal');
  if (dev.revoked) throw new HttpError(403, 'Key dicabut');
  return { h, dev };
}

export function handler(fn, { auth = false, methods } = {}) {
  return async (req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
    try {
      if (methods && !methods.includes(req.method)) throw new HttpError(405, 'Method tidak didukung');
      const ctx = auth ? await authDevice(req) : {};
      await fn(req, res, ctx);
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.error(e);
      // 5xx: sertakan pesan asli supaya penyebab kelihatan di app (matikan dengan env HIDE_ERRORS=1)
      const msg = e.status && status < 500 ? e.message
        : process.env.HIDE_ERRORS ? (e.status ? e.message : 'Kesalahan server')
        : 'Kesalahan server: ' + String(e.message || e).slice(0, 300);
      send(res, status, { ok: false, error: msg });
    }
  };
}

export const cfg = {
  maxPublished: () => parseInt(process.env.MAX_PUBLISHED || '30', 10),
  maxBytes: () => parseInt(process.env.MAX_BYTES || String(200 * 1024 * 1024), 10),
  maxUpload: 64 * 1024 * 1024,
};
