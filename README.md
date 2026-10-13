# StarDevXSchool Server

Server untuk app **StarDevXSchool Offline**: bagikan presentasi lewat link, backup/restore, dan cek update.
App tetap offline-first; server hanya dipanggil saat tombolnya ditekan.

Stack: Vercel (serverless Node) + Upstash Redis (metadata) + Vercel Blob (file besar).

## Deploy (GitHub + Vercel)

1. Buat repo GitHub baru (mis. `stardevxschool-server`), upload isi folder ini, commit, push.
2. Vercel → **Add New Project** → pilih repo itu → Deploy (tanpa setting build apa pun).
3. Di project Vercel → tab **Storage**:
   - **Create → Blob** (connect ke project; `BLOB_READ_WRITE_TOKEN` terisi otomatis).
   - **Create → Upstash Redis** dari Marketplace (connect ke project; env Redis terisi otomatis).
4. **Settings → Environment Variables**, tambahkan `ADMIN_SECRET` (string panjang acak). Opsional: `REGISTER_CODE`, `ANNOUNCEMENT`, `MAX_PUBLISHED`, `MAX_BYTES` (lihat `.env.example`).
5. **Redeploy** (Deployments → ⋯ → Redeploy) supaya env terbaca.
6. Cek: buka `https://<project>.vercel.app/api/version` → harus muncul JSON `{"ok":true,...}`.

## Jalankan lokal (tanpa Redis/Blob sungguhan)

```
npm install
npm run dev     # http://localhost:3000, data di .devdata/
npm test        # smoke test 14 skenario
```

## Cara kerja upload

Vercel membatasi body fungsi ±4,5 MB, padahal presentasi berfoto bisa puluhan MB. Jadi file dikirim **berpotong-potong (maks 3 MB)** lalu disatukan:

1. `POST /api/upload?id=<uploadId>&n=0..N-1` (body = bytes mentah) untuk tiap potongan. `uploadId` dibuat app sendiri: 8–32 karakter `a-z0-9`.
2. `POST /api/complete` JSON `{uploadId, parts:N, kind, ...}` → server menyatukan, menyimpan, membalas hasil.

## API (semua balasan JSON `{ok:true,...}` atau `{ok:false,error}`)

| Endpoint | Auth | Fungsi |
|---|---|---|
| `GET /api/version` | – | `latestCode, latestName, minCode, updateUrl, announcement, registerNeedsCode`. Juga dipakai sebagai "Tes koneksi". |
| `POST /api/register` `{code?, label?}` | – | Buat key `sdx_xxxxxxxxxxxxxxxxxxxxxxxx`. **Tampil sekali**; server hanya menyimpan hash. Maks 10 daftar/hari per IP. Kalau `REGISTER_CODE` diisi, `code` wajib. |
| `POST /api/upload?id=&n=` | key | Unggah satu potongan. |
| `POST /api/complete` | key | `kind:"publish"` `{id?, title}` → `{id, link}`; `id` dikirim = update link yang sama. `kind:"backup"` `{id, title, updatedAt}` → simpan JSON presentasi. |
| `GET /api/publish` | key | Daftar link milik device + pemakaian kuota. |
| `DELETE /api/publish?id=` | key | Cabut link. |
| `GET /api/backup` | key | Daftar backup `{id,title,size,updatedAt}`. |
| `GET /api/backup?id=` | key | `{url}` alamat unduh langsung dari Blob (app `fetch` sendiri). |
| `DELETE /api/backup?id=` | key | Hapus backup. |
| `GET /p/<id>` | – | Halaman publik presentasi. |
| `POST /api/admin` | `Bearer ADMIN_SECRET` | `{action:"config", latestCode, latestName, minCode, updateUrl, announcement}`, `{action:"revoke"/"unrevoke", key}`, `{action:"unpublish", id}`. |

Key dikirim lewat header `X-Device-Key`. CORS dibuka (`*`) karena app berjalan dari `file://` (origin `null`).

### Contoh admin (ubah pengumuman tanpa redeploy)

```
curl -X POST https://<project>.vercel.app/api/admin \
  -H "Authorization: Bearer $ADMIN_SECRET" -H "Content-Type: application/json" \
  -d '{"action":"config","latestCode":4,"latestName":"1.3","announcement":"Update baru tersedia"}'
```

## Keamanan & batas

- Key tidak disimpan polos; server hanya menyimpan SHA-256-nya. Key hilang = tidak bisa dipulihkan (backup tidak bisa dibuka device lain tanpa key itu).
- `/p/<id>` dikirim dengan `Content-Security-Policy: sandbox allow-scripts`: skrip presentasi tetap jalan, tapi tidak bisa menyentuh domain server.
- Link publik = siapa pun yang punya link bisa membuka (id acak 8 karakter). Belum ada kata sandi per link.
- Kuota default per device: 30 link, 200 MB (`MAX_PUBLISHED`, `MAX_BYTES`). Satu unggahan maks 64 MB.
- File backup berada di Blob publik dengan path berisi hash key (tidak bisa ditebak), tetapi bukan terenkripsi. Kalau perlu, enkripsi bisa ditambah di sisi app.
- Potongan unggahan yang tidak pernah di-`complete` (app mati di tengah jalan) tertinggal di `tmp/` di Blob. Bersihkan manual atau tambahkan cron bila mulai menumpuk.
