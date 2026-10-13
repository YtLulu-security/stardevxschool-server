import { handler, send } from '../lib/http.js';
import { store } from '../lib/store.js';

// GET /api/version  -> info versi terbaru + pengumuman. Publik (tanpa key), dipakai juga sebagai "Tes koneksi".
export default handler(async (req, res) => {
  const c = (await store.get('config')) || {};
  const env = process.env;
  send(res, 200, {
    ok: true,
    server: 'stardevxschool',
    time: Date.now(),
    latestCode: c.latestCode ?? parseInt(env.APP_LATEST_CODE || '0', 10),
    latestName: c.latestName ?? (env.APP_LATEST_NAME || ''),
    minCode: c.minCode ?? parseInt(env.APP_MIN_CODE || '0', 10),
    updateUrl: c.updateUrl ?? (env.APP_UPDATE_URL || ''),
    announcement: c.announcement ?? (env.ANNOUNCEMENT || ''),
    registerNeedsCode: !!env.REGISTER_CODE,
  });
}, { methods: ['GET'] });
