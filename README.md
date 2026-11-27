# Choco AI

Choco AI adalah asisten AI utama dan representasi digital Choco dalam ekosistem The Choco Studios (TCS). Produk ini berbeda dari Sara, asisten dukungan yang berjalan di Choco AI Help Center, dan berbeda dari TCS LinkGuard.

> **Status redesign:** implementasi frontend baru sedang dikerjakan pada branch `redesign/choco-ai-premium-workspace`. Perubahan pada branch ini belum menjadi rilis produksi sampai ditinjau, digabungkan ke `main`, dan melewati deployment serta pengujian yang sesuai.

## Daftar isi

- [Identitas dan ruang lingkup](#identitas-dan-ruang-lingkup)
- [Status fitur](#status-fitur)
- [Arsitektur aplikasi](#arsitektur-aplikasi)
- [Frontend: tanggung jawab dan struktur](#frontend-tanggung-jawab-dan-struktur)
- [Kontrak integrasi](#kontrak-integrasi)
- [Data lokal dan privasi](#data-lokal-dan-privasi)
- [Keamanan](#keamanan)
- [Pengembangan dan pengujian](#pengembangan-dan-pengujian)
- [Deployment dan rilis](#deployment-dan-rilis)
- [Dokumentasi lanjutan](#dokumentasi-lanjutan)

## Identitas dan ruang lingkup

The Choco Studios adalah studio kreatif independen multisektor yang didirikan, dimiliki, dan dikelola secara mandiri oleh Hasby Prasetya Saprudin. TCS bukan kolektif kreator dan bukan marketplace. Fokus strategisnya adalah open-source, pengembangan teknologi, dokumentasi, pemeliharaan proyek, dan kolaborasi terstruktur.

Choco AI ditujukan untuk membantu pertanyaan umum, penulisan, perencanaan, analisis, pemecahan masalah teknis, penjelasan proyek TCS, dan navigasi dokumentasi yang tersedia. Kapabilitas yang memerlukan integrasi atau tindakan eksternal tidak boleh diklaim aktif sebelum implementasi dan pengujiannya terbukti.

Situs publik: [https://chocoai.thechocostudios.bond/](https://chocoai.thechocostudios.bond/)

## Status fitur

Status di bawah ini menggambarkan implementasi yang ditemukan dan pekerjaan pada branch redesign. Status UI tidak otomatis berarti sebuah kemampuan backend tersedia.

| Area | Status | Keterangan |
|---|---|---|
| Workspace chat | Implemented in redesign branch | Layout desktop, sidebar, konteks produk, composer, dan welcome screen |
| Responsive layout | Implemented in redesign branch | Sidebar drawer dan composer untuk layar kecil |
| Chat API | Existing integration retained | Menggunakan `POST /api/chat` |
| Streaming response | Existing integration retained | Membaca SSE kompatibel OpenAI/Groq |
| New conversation | Implemented in redesign branch | Menghapus konteks percakapan di memori halaman; bukan penghapusan data server |
| Personalization | Existing integration retained | Preferensi respons disimpan di browser |
| Persistent chat history | Not implemented | Riwayat tidak dipulihkan setelah halaman dimuat ulang |
| Full Markdown renderer | Limited | Renderer saat ini menangani tautan, bold, dan inline code; belum menjadi renderer Markdown lengkap |
| Generic settings screen | Unavailable | Modal pengaturan umum yang ada masih menampilkan status tidak tersedia |
| License request handoff | Existing integration retained | Menggunakan token permintaan dan `/api/license` |
| Site advertising consent | Existing integration retained | Iklan pihak ketiga hanya dimuat setelah persetujuan |
| Owner-only knowledge | Server-controlled | Backend harus memverifikasi sesi Owner; frontend tidak memutuskan hak akses |

**Arti status:**

- **Implemented in redesign branch:** kode UI tersedia di branch redesign, tetapi belum otomatis berarti sudah masuk produksi.
- **Existing integration retained:** alur yang sudah ada dipertahankan; perubahan UI tidak boleh mengubah kontraknya.
- **Not implemented / unavailable:** jangan membuat tombol atau pesan UI yang mengesankan fitur tersebut sudah aktif.

## Arsitektur aplikasi

Aplikasi web saat ini menggunakan HTML, CSS, dan JavaScript vanilla. Tidak ada runtime React/Vue dan tidak diperlukan bundler untuk halaman utama.

```text
Browser
  |
  +-- public/index.html
  |     +-- public/assets/css/
  |     +-- public/assets/js/
  |     +-- public/assets/
  |
  +-- POST /api/chat
  |     +-- api/chat.js
  |           +-- netlify/functions/chat.js
  |                 +-- Groq inference
  |                 +-- TCS Knowledge Hub retrieval
  |                 +-- Owner-session validation
  |
  +-- POST /api/license
        +-- api/license.js
              +-- Supabase Edge Function tcs-license
```

Vercel menyajikan aset statis dari direktori `public/` dan menjalankan endpoint serverless di direktori `api/`. File API dan konfigurasi deployment bukan bagian dari styling frontend.

## Frontend: tanggung jawab dan struktur

HTML utama mempertahankan ID DOM yang dipakai controller. CSS dan JavaScript aplikasi dipisah menjadi berkas runtime di bawah `public/assets/`.

```text
public/
├── index.html
├── assets/
│   ├── choco-app-icon.png
│   ├── css/
│   │   ├── tokens.css
│   │   ├── base.css
│   │   ├── workspace.css
│   │   ├── components.css
│   │   └── responsive.css
│   └── js/
│       ├── chat-keyboard.js
│       ├── ads-loader.js
│       ├── chat-controller.js
│       ├── site-preferences.js
│       └── mobile-sponsor-popup.js
├── tcs-analytics.js
└── tcs-community-widget.js
```

**Urutan stylesheet:** tokens → base/reset → workspace/layout → components → responsive overrides.

**Urutan JavaScript:** keyboard handler → ad loader → chat controller → site preferences → mobile sponsor popup. Analytics dan community widget tetap dimuat melalui berkas terpisah dengan atribut `defer`.

Rincian tiap modul, ID DOM, state UI, serta aturan perubahan tersedia di [Frontend Architecture](docs/frontend/ARCHITECTURE.md).

## Kontrak integrasi

Frontend tidak boleh menebak endpoint atau membuat bentuk response sendiri. Integrasi utama:

- `POST /api/chat`: request percakapan, konteks riwayat, preferensi respons, dan streaming.
- `POST /api/license`: pemeriksaan status, pengiriman referensi transaksi, dan pengambilan lisensi setelah verifikasi.
- `GET/POST` di luar endpoint tersebut tidak boleh diasumsikan tersedia hanya karena dibutuhkan oleh desain.

Kontrak request, response, SSE, error, penyimpanan token, dan kondisi lisensi dijelaskan di [Integration Contracts](docs/frontend/INTEGRATION-CONTRACTS.md).

Perubahan pada kontrak backend harus dibicarakan dan didokumentasikan sebelum frontend menggunakannya. Jika integrasi belum tersedia, gunakan mock yang diberi label development dan jangan menampilkan mock sebagai data produksi.

## Data lokal dan privasi

| Key | Penyimpanan | Tujuan |
|---|---|---|
| `chocoPreferences` | localStorage | Preferensi respons dan efek UI |
| `chocoNextAllowedAt` | localStorage | Waktu berakhir jeda pengiriman pesan |
| `choco_site_preferences_v1` | localStorage | Persetujuan konten iklan pihak ketiga |
| `tcs_license_request` | sessionStorage | Token permintaan lisensi sementara pada browser |
| `chocoCurrentConversationV1` | localStorage key lama | Dihapus saat halaman dimuat; bukan penyimpanan riwayat aktif |

Riwayat percakapan aktif disimpan di memori JavaScript halaman dan dikirim sebagai konteks pada request chat berikutnya. Riwayat tersebut tidak dijamin bertahan setelah refresh atau berpindah perangkat. Jangan menyebutnya sebagai fitur sinkronisasi atau memori permanen.

## Keamanan

- Kunci Groq, kunci server Supabase, dan secret lain hanya boleh berada di environment server.
- Access/refresh token Supabase tidak boleh dikirim ke browser oleh alur autentikasi Owner.
- Frontend tidak menentukan status Owner. Semua keputusan hak akses dan pengambilan pengetahuan internal dilakukan backend.
- Jangan memasukkan password, token privat, atau data transaksi sensitif ke localStorage, log, atau URL analytics.
- Pengiriman referensi pembelian hanya mengikuti validasi backend dan tidak membuktikan bahwa pembayaran sudah diterima.
- Konten iklan pihak ketiga tidak boleh dimuat sebelum pengguna memberi persetujuan.

## Pengembangan dan pengujian

Persyaratan Node.js mengikuti `package.json` (Node 24.x). Pemeriksaan repository yang digunakan GitHub Actions antara lain:

```bash
node scripts/check-inline-scripts.mjs
node scripts/validate-knowledge.mjs
node scripts/validate-migrations.mjs
node --test tests/*.test.mjs
node scripts/evaluate-retrieval.mjs
node scripts/smoke-check.mjs
```

Pemeriksaan frontend memastikan seluruh script lokal yang dirujuk HTML tersedia dan dapat diparse oleh Node.js. Pemeriksaan sintaks tidak menggantikan pengujian browser. Uji desktop, tablet, smartphone, persetujuan iklan, pengiriman chat, SSE, respons error, personalisasi, dan alur lisensi pada environment yang memiliki konfigurasi backend.

Untuk melihat aset statis saja secara lokal:

```bash
python -m http.server 4173 --directory public
```

Server statis tersebut tidak menyediakan endpoint `/api/*`; pengujian integrasi memerlukan environment backend yang dikonfigurasi.

## Deployment dan rilis

- Output statis Vercel: `public/`.
- Konfigurasi routing dan keamanan: `vercel.json`.
- Route API: `api/`.
- Jangan mengubah rewrites, redirects, headers, adapter Vercel, atau variabel environment sebagai bagian dari redesign visual tanpa alasan dan pengujian terpisah.
- Branch redesign ini bukan rilis produksi. Integrasi ke `main` harus dilakukan setelah review dan pengujian; deployment produksi mengikuti konfigurasi Vercel yang sudah ada.

## Dokumentasi lanjutan

- [Arsitektur frontend](docs/frontend/ARCHITECTURE.md)
- [Kontrak API dan integrasi](docs/frontend/INTEGRATION-CONTRACTS.md)
- [Developer handoff dan pembagian tanggung jawab](docs/frontend/DEVELOPER-HANDOFF.md)
- [Panduan folder frontend](frontend/README.md)


## Bahasa antarmuka

Choco AI menyediakan pemilih bahasa Indonesia (utama/default), English, dan Mandarin Sederhana. Pilihan bahasa disimpan secara lokal di browser. Pemilih ini mengubah teks antarmuka, bukan mengubah atau menerjemahkan isi percakapan pengguna dan jawaban AI secara otomatis. Bahasa jawaban AI tetap mengikuti instruksi dan kebijakan pada alur chat/backend.
