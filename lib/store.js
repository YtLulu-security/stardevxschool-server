// Penyimpanan metadata: Upstash Redis di produksi, memori (+ file JSON) kalau env belum diisi (dev lokal).
import fs from 'node:fs';
import path from 'node:path';

const hasRedis = !!((process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) ||
                    (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN));

function memoryStore() {
  const file = path.join(process.cwd(), '.devdata', 'store.json');
  let db = {};
  try { db = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  const flush = () => { try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(db)); } catch {} };
  const alive = (k) => { const e = db[k]; if (e && e.exp && e.exp < Date.now()) { delete db[k]; return null; } return e || null; };
  return {
    kind: 'memory',
    async get(k) { const e = alive(k); return e ? e.v : null; },
    async set(k, v) { db[k] = { v }; flush(); },
    async del(k) { delete db[k]; flush(); },
    async hget(k, f) { const e = alive(k); return e && e.v[f] !== undefined ? e.v[f] : null; },
    async hset(k, f, v) { const e = alive(k) || (db[k] = { v: {} }); e.v[f] = v; flush(); },
    async hdel(k, f) { const e = alive(k); if (e) { delete e.v[f]; flush(); } },
    async hgetall(k) { const e = alive(k); return e ? { ...e.v } : {}; },
    async incr(k, ttlSec) {
      let e = alive(k);
      if (!e) e = db[k] = { v: 0, exp: Date.now() + ttlSec * 1000 };
      e.v += 1; flush(); return e.v;
    },
  };
}

async function redisStore() {
  const { Redis } = await import('@upstash/redis');
  const r = process.env.UPSTASH_REDIS_REST_URL
    ? Redis.fromEnv()
    : new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
  return {
    kind: 'redis',
    get: (k) => r.get(k),
    set: (k, v) => r.set(k, v),
    del: (k) => r.del(k),
    hget: (k, f) => r.hget(k, f),
    hset: (k, f, v) => r.hset(k, { [f]: v }),
    hdel: (k, f) => r.hdel(k, f),
    hgetall: async (k) => (await r.hgetall(k)) || {},
    async incr(k, ttlSec) { const n = await r.incr(k); if (n === 1) await r.expire(k, ttlSec); return n; },
  };
}

let impl = null;
async function get() { return impl || (impl = hasRedis ? await redisStore() : memoryStore()); }

// Proxy tipis supaya pemanggil cukup `store.get(...)`
export const store = new Proxy({}, {
  get: (_, name) => async (...a) => (await get())[name](...a),
});
