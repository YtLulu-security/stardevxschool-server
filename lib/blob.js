// File besar: Vercel Blob di produksi, folder .devdata/blob kalau token belum diisi (dev lokal).
import fs from 'node:fs';
import path from 'node:path';

const local = !process.env.BLOB_READ_WRITE_TOKEN;
const LOCAL_DIR = path.join(process.cwd(), '.devdata', 'blob');
export const localBase = () => process.env.LOCAL_BASE || 'http://localhost:3000';

export async function putBlob(p, buf, contentType) {
  if (local) {
    const f = path.join(LOCAL_DIR, p);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, buf);
    return `${localBase()}/_blob/${p}`;
  }
  const { put } = await import('@vercel/blob');
  const r = await put(p, buf, {
    access: 'public', contentType, addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60,
  });
  return r.url;
}

export async function getBlob(url) {
  if (local) {
    const p = decodeURIComponent(new URL(url).pathname.replace(/^\/_blob\//, ''));
    return fs.readFileSync(path.join(LOCAL_DIR, p));
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error('Blob tidak terbaca: ' + r.status);
  return Buffer.from(await r.arrayBuffer());
}

export async function delBlob(urls) {
  const list = (Array.isArray(urls) ? urls : [urls]).filter(Boolean);
  if (!list.length) return;
  if (local) {
    for (const u of list) {
      try { fs.unlinkSync(path.join(LOCAL_DIR, decodeURIComponent(new URL(u).pathname.replace(/^\/_blob\//, '')))); } catch {}
    }
    return;
  }
  const { del } = await import('@vercel/blob');
  await del(list);
}

export function localBlobPath(p) { return path.join(LOCAL_DIR, p); }
