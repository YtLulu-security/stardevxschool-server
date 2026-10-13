import assert from 'node:assert/strict';
import fs from 'node:fs';
import { start } from '../dev/server.js';

fs.rmSync('.devdata', { recursive: true, force: true });
process.env.ADMIN_SECRET = 'rahasia-admin-uji';
process.env.MAX_PUBLISHED = '2';
process.env.MAX_BYTES = String(30 * 1024 * 1024);
const PORT = 3111;
process.env.LOCAL_BASE = `http://localhost:${PORT}`;
const server = await start(PORT);
const B = `http://localhost:${PORT}`;
let pass = 0;
const ok = (name, fn) => fn().then(() => { pass++; console.log('  ✓', name); }, (e) => { console.error('  ✗', name, '\n   ', e.message); process.exitCode = 1; });
const j = async (r) => ({ s: r.status, b: await r.json() });
const call = (p, o = {}, key) => fetch(B + p, { ...o, headers: { ...(key ? { 'X-Device-Key': key } : {}), ...(o.headers || {}) } });

async function chunked(key, buf, meta) {
  const uid = 'u' + Math.random().toString(36).slice(2, 12);
  const size = 3 * 1024 * 1024; let n = 0;
  for (let i = 0; i < buf.length; i += size, n++) {
    const r = await call(`/api/upload?id=${uid}&n=${n}`, { method: 'POST', body: buf.subarray(i, i + size), headers: { 'Content-Type': 'application/octet-stream' } }, key);
    assert.equal(r.status, 200);
  }
  return j(await call('/api/complete', { method: 'POST', body: JSON.stringify({ uploadId: uid, parts: n, ...meta }), headers: { 'Content-Type': 'application/json' } }, key));
}

let key, key2, link, pid;
const html = Buffer.from('<!doctype html><title>Tes</title><h1>Halo Lotus</h1>' + 'x'.repeat(7 * 1024 * 1024)); // 3 potongan
console.log('Smoke test');
await ok('version publik + CORS preflight', async () => {
  const r = await j(await call('/api/version'));
  assert.equal(r.s, 200); assert.equal(r.b.server, 'stardevxschool');
  const o = await call('/api/register', { method: 'OPTIONS' });
  assert.equal(o.status, 204); assert.equal(o.headers.get('access-control-allow-origin'), '*');
});
await ok('register -> key, tanpa key ditolak, key palsu ditolak', async () => {
  const r = await j(await call('/api/register', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } }));
  assert.equal(r.s, 200); assert.match(r.b.key, /^sdx_[a-z0-9]{24}$/); key = r.b.key;
  assert.equal((await call('/api/publish')).status, 401);
  assert.equal((await call('/api/publish', {}, 'sdx_' + 'a'.repeat(24))).status, 401);
});
await ok('publish 7 MB lewat 3 potongan -> link', async () => {
  const r = await chunked(key, html, { kind: 'publish', title: 'Tes Presentasi' });
  assert.equal(r.s, 200, JSON.stringify(r.b)); assert.equal(r.b.size, html.length);
  assert.match(r.b.link, new RegExp(`^http://localhost:${PORT}/p/[a-z0-9]{8}$`));
  link = r.b.link; pid = r.b.id;
});
await ok('halaman publik /p/<id> + header CSP sandbox', async () => {
  const r = await fetch(link);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-security-policy'), /sandbox/);
  assert.match(await r.text(), /Halo Lotus/);
  assert.equal((await fetch(`${B}/p/zzzzzzzz`)).status, 404);
});
await ok('update link yang sama (id sama) menimpa isi', async () => {
  const r = await chunked(key, Buffer.from('<h1>Versi 2</h1>'), { kind: 'publish', id: pid, title: 'Tes v2' });
  assert.equal(r.s, 200); assert.equal(r.b.id, pid);
  assert.match(await (await fetch(link)).text(), /Versi 2/);
});
await ok('device lain tidak bisa menimpa/menghapus link orang', async () => {
  key2 = (await j(await call('/api/register', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } }))).b.key;
  const r = await chunked(key2, Buffer.from('<h1>bajak</h1>'), { kind: 'publish', id: pid });
  assert.equal(r.s, 403);
  assert.equal((await call(`/api/publish?id=${pid}`, { method: 'DELETE' }, key2)).status, 404);
  assert.match(await (await fetch(link)).text(), /Versi 2/);
});
await ok('batas jumlah link (maks 2)', async () => {
  assert.equal((await chunked(key, Buffer.from('a'), { kind: 'publish', title: 'b' })).s, 200);
  const r = await chunked(key, Buffer.from('a'), { kind: 'publish', title: 'c' });
  assert.equal(r.s, 409);
});
await ok('daftar link + cabut link', async () => {
  const l = await j(await call('/api/publish', {}, key));
  assert.equal(l.b.items.length, 2);
  assert.equal((await call(`/api/publish?id=${pid}`, { method: 'DELETE' }, key)).status, 200);
  assert.equal((await fetch(link)).status, 404);
  assert.equal((await j(await call('/api/publish', {}, key))).b.items.length, 1);
});
await ok('backup: simpan, daftar, ambil url unduh, isi utuh', async () => {
  const data = Buffer.from(JSON.stringify({ title: 'P1', images: [{ u: 'data:...' }], slides: [] }));
  const r = await chunked(key, data, { kind: 'backup', id: 'pres_123', title: 'P1', updatedAt: 1700000000000 });
  assert.equal(r.s, 200, JSON.stringify(r.b));
  const l = await j(await call('/api/backup', {}, key));
  assert.equal(l.b.items[0].id, 'pres_123'); assert.equal(l.b.items[0].updatedAt, 1700000000000);
  const g = await j(await call('/api/backup?id=pres_123', {}, key));
  assert.deepEqual(Buffer.from(await (await fetch(g.b.url)).arrayBuffer()), data);
  assert.equal((await call('/api/backup?id=pres_123', {}, key2)).status, 404); // device lain tak bisa
});
await ok('backup: id jahat ditolak, hapus backup', async () => {
  assert.equal((await chunked(key, Buffer.from('x'), { kind: 'backup', id: '../../x' })).s, 400);
  assert.equal((await call('/api/backup?id=pres_123', { method: 'DELETE' }, key)).status, 200);
  assert.equal((await j(await call('/api/backup', {}, key))).b.items.length, 0);
});
await ok('kuota byte', async () => {
  const r = await chunked(key, Buffer.alloc(31 * 1024 * 1024, 65), { kind: 'backup', id: 'big' });
  assert.equal(r.s, 409);
});
await ok('potongan kurang -> 400; potongan >4,4MB -> 413', async () => {
  const r = await j(await call('/api/complete', { method: 'POST', body: JSON.stringify({ uploadId: 'abcdefgh12', parts: 2, kind: 'backup', id: 'q' }), headers: { 'Content-Type': 'application/json' } }, key));
  assert.equal(r.s, 400);
  const o = await call('/api/upload?id=abcdefgh99&n=0', { method: 'POST', body: Buffer.alloc(5 * 1024 * 1024) }, key);
  assert.equal(o.status, 413);
});
await ok('admin: tanpa secret ditolak, ubah config tampil di /version, revoke key', async () => {
  assert.equal((await call('/api/admin', { method: 'POST', body: '{}' })).status, 401);
  const H = { 'Content-Type': 'application/json', Authorization: 'Bearer rahasia-admin-uji' };
  const c = await call('/api/admin', { method: 'POST', headers: H, body: JSON.stringify({ action: 'config', latestCode: 4, latestName: '1.3', announcement: 'Halo' }) });
  assert.equal(c.status, 200);
  const v = (await j(await call('/api/version'))).b;
  assert.equal(v.latestCode, 4); assert.equal(v.announcement, 'Halo');
  assert.equal((await call('/api/admin', { method: 'POST', headers: H, body: JSON.stringify({ action: 'revoke', key: key2 }) })).status, 200);
  assert.equal((await call('/api/publish', {}, key2)).status, 403);
});
await ok('kode undangan', async () => {
  process.env.REGISTER_CODE = 'lotus';
  const bad = await call('/api/register', { method: 'POST', body: JSON.stringify({ code: 'x' }), headers: { 'Content-Type': 'application/json' } });
  assert.equal(bad.status, 403);
  const good = await call('/api/register', { method: 'POST', body: JSON.stringify({ code: 'lotus' }), headers: { 'Content-Type': 'application/json' } });
  assert.equal(good.status, 200);
  delete process.env.REGISTER_CODE;
});
console.log(`${pass} lulus`);
server.close();
