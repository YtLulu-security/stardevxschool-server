import { store } from './store.js';
import { cfg } from './http.js';

export async function usageOf(h) {
  const pubs = await store.hgetall('pubs:' + h);
  const baks = await store.hgetall('baks:' + h);
  const sum = (o) => Object.values(o).reduce((a, v) => a + (v?.size || 0), 0);
  return {
    published: Object.keys(pubs).length,
    backups: Object.keys(baks).length,
    bytes: sum(pubs) + sum(baks),
    maxPublished: cfg.maxPublished(),
    maxBytes: cfg.maxBytes(),
    pubs, baks,
  };
}
