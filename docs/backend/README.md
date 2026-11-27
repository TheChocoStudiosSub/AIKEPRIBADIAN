# Choco AI Backend

Dokumen ini mencatat komponen server yang menghidupkan workspace Choco AI. Kontrak publik tetap berada di [Integration Contracts](../frontend/INTEGRATION-CONTRACTS.md); implementasi backend tidak boleh mengganti endpoint, format SSE, storage key, atau bentuk payload tanpa perubahan kontrak yang disetujui.

## Runtime

- `POST /api/chat` dijalankan melalui `api/chat.js` dan adapter Vercel menuju `netlify/functions/chat.js`.
- Inferensi menggunakan Groq. API key, pemilihan model, validasi, pembatasan penggunaan, dan prompt tetap berada di server.
- RAG publik menggunakan RPC `tcs_public_search_knowledge` pada project Knowledge Hub Choco AI.
- Retrieval internal menggunakan `tcs_owner_search_knowledge` hanya setelah cookie sesi Owner lolos verifikasi server.
- `POST /api/license` adalah gateway token ke Edge Function `tcs-license` di project TCS Backend. Endpoint ini tidak memverifikasi pembayaran sendiri dan tidak membuat kunci lisensi.

## Dua koneksi Supabase yang berbeda

Jangan menukar kedua kelompok variabel ini:

| Environment | Tujuan |
|---|---|
| `TCS_KNOWLEDGE_SUPABASE_URL` | Choco AI Knowledge Hub dan Owner authentication |
| `TCS_KNOWLEDGE_PUBLISHABLE_KEY` | Publishable key untuk RPC Knowledge Hub |
| `TCS_OWNER_AUTH_SERVER_KEY` | Secret server-only untuk Owner RPC dan rate-limit RPC |
| `TCS_SUPABASE_URL` | TCS Backend, upstream gateway lisensi |
| `TCS_SUPABASE_PUBLISHABLE_KEY` | Publishable key untuk Edge Function `tcs-license` |
| `GROQ_API_KEY` | Inference chat utama |
| `GROQ_MODEL` | Model Groq server-side; default code `openai/gpt-oss-20b` |

Semua variabel harus dipasang di environment server Vercel, tidak di aset browser dan tidak di repository. `GROQ_API_KEY_APP` hanya diperlukan untuk jalur client aplikasi terpisah yang memakai `client: "app"`.

## Pembatasan penggunaan chat

Default adalah 20 request per 10 menit per alamat klien. Production limiter menggunakan RPC `tcs_chat_consume_rate_limit` dan tabel privat `private.tcs_chat_rate_limits`. Sistem hanya menyimpan hash SHA-256 dari alamat klien, bukan alamat mentah, prompt, atau isi percakapan.

Migration `20261127193000_choco_ai_distributed_chat_rate_limit.sql` harus diterapkan pada **project Supabase Choco AI Knowledge Hub** sebelum limiter terdistribusi aktif. Migration `20261127194000_harden_private_owner_auth_tables.sql` juga mengaktifkan RLS pada tabel autentikasi Owner yang berada di schema privat; fungsi internal yang dimiliki role `postgres` tetap dapat mengaksesnya melalui hak `BYPASSRLS`, sedangkan role browser tidak mendapat hak tabel langsung. Jangan menerapkannya ke project TCS Backend yang menjalankan `tcs-license`.

Jika RPC rate limit belum tersedia atau sedang gagal, runtime memakai limiter lokal per-instance sebagai fallback sementara agar chat tidak langsung mati. Fallback ini bukan pengganti limiter terdistribusi dan tidak memberi batas global lintas instance. Periksa konfigurasi migration dan Owner server key sebelum menyatakan proteksi global aktif.

## Privasi dan status percakapan

Frontend saat ini menyimpan riwayat hanya dalam memori halaman dan mengirimkannya sebagai konteks request berikutnya. Backend tidak menyimpan transkrip chat, tidak membuat akun umum, dan tidak mengklaim memori lintas sesi. Permintaan percakapan baru hanya memulai konteks baru di browser.

## Verifikasi

Jalankan:

```bash
node --check netlify/functions/chat.js
node --check netlify/functions/core/rate-limit.mjs
node --check api/license.js
node --test tests/*.test.mjs
node scripts/validate-migrations.mjs
```

Pengujian otomatis tidak menggantikan smoke test deployment. Setelah migration dan environment dipasang, uji chat JSON, SSE, respons 400/429/502/503, verifikasi Owner, retrieval publik/internal, dan ketiga action `/api/license` pada Preview yang terproteksi sebelum rilis.
