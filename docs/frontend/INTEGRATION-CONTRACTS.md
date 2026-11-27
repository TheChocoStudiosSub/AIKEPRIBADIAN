# Integration Contracts

Dokumen ini adalah kesepakatan antara frontend Choco AI dan endpoint backend yang sudah ada. Endpoint di bawah berasal dari implementasi repository, bukan endpoint baru yang dibuat untuk memenuhi kebutuhan desain.

## 1. Chat

### Endpoint

- Method: `POST`
- Path: `/api/chat`
- Content-Type request: `application/json`
- Handler: `api/chat.js` → adapter Vercel → `netlify/functions/chat.js`
- Model provider: Groq, dipanggil oleh server. API key tidak pernah dikirim dari browser.

### Request body yang digunakan UI

```json
{
  "message": "Halo Choco AI",
  "history": [],
  "memories": [],
  "preferences": {
    "responseLength": "balanced",
    "typingEffect": true,
    "timeGreeting": true,
    "tonePreference": "adaptive",
    "detailPreference": "adaptive",
    "humorPreference": true,
    "emojiPreference": false
  },
  "modelMode": "standard",
  "client": "chatbot",
  "stream": true
}
```

Keterangan:

- `message`: teks terbaru; batas backend saat ini 4.000 karakter.
- `history`: pesan sebelumnya dengan `role` bernilai `user` atau `assistant` dan `content` string. Backend membatasi jumlah serta total karakter; frontend harus tetap mengirim konteks sesi secara berurutan.
- `memories`: array string. Jangan mengarang memori; halaman saat ini mengirim array kosong.
- `preferences`: preferensi respons. Backend menggunakan `responseLength`, `tonePreference`, `detailPreference`, `humorPreference`, dan `emojiPreference`. `typingEffect` dan `timeGreeting` adalah preferensi presentasi frontend.
- `modelMode`: nilai yang dikirim UI saat ini adalah `standard`. Jangan menampilkan pemilih model aktif sampai backend mendukung kontrak tersebut.
- `client`: `chatbot` untuk web chat reguler.
- `stream`: `true` meminta streaming.

### Streaming response

Saat response memiliki Content-Type `text/event-stream`, UI membaca SSE. Payload data mengikuti struktur chunk chat completion kompatibel OpenAI/Groq, khususnya:

```json
{
  "choices": [
    {
      "delta": {
        "content": "potongan jawaban"
      }
    }
  ]
}
```

Stream berakhir dengan penanda `data: [DONE]` dari provider. Parser harus menangani chunk jaringan yang memotong satu baris/event menjadi beberapa potongan buffer; jangan mengasumsikan satu `reader.read()` sama dengan satu event.

### JSON response dan error

Mode non-stream yang dipertahankan oleh backend mengembalikan objek seperti:

```json
{
  "reply": "Jawaban Choco AI",
  "model": "nama-model",
  "truncated": false
}
```

Alur verifikasi Owner dapat mengembalikan `authAttempt: true` bersama `reply`. Jangan pernah menaruh token sesi, password, atau server secret pada object UI/log browser.

Error API menggunakan object JSON dengan properti `error` dan HTTP status yang sesuai, misalnya 400, 429, 502, atau 503. UI harus menampilkan pesan yang aman dan tidak menganggap error sebagai jawaban AI.

## 2. License request

### Endpoint

- Method: `POST`
- Path: `/api/license`
- Content-Type: `application/json`
- Handler: `api/license.js`
- Upstream: Supabase Edge Function `tcs-license`

### Cara request dikenali halaman

Halaman memeriksa parameter `license_request` dan `license_token` pada query string atau fragment URL. Jika keduanya valid, data disimpan sementara di sessionStorage dengan key `tcs_license_request`, lalu parameter dihapus dari address bar menggunakan `history.replaceState`.

Frontend tidak boleh menciptakan request ID atau token sendiri.

### Action: status

```json
{
  "action": "status",
  "requestId": "UUID-dari-link",
  "requestToken": "token-dari-link"
}
```

Response sukses mencakup `ok`, `requestId`, `productId`, `productSku`, `status`, `verificationStatus`, `paymentStatus`, `verificationNote`, `buyerDetailsReceived`, dan `expiresAt`.

### Action: submit_purchase_reference

Request memuat properti wajib:

- `action`: `submit_purchase_reference`
- `requestId`: UUID dari request yang valid
- `requestToken`: token dari request yang valid
- `buyerUsername`: 3–80 karakter, hanya huruf, angka, titik, underscore, atau tanda hubung
- `transactionReference`: 4–120 karakter

Response sukses memiliki `ok: true`, `submitted`, `requestId`, dan `productSku`. Referensi yang terkirim bukan bukti pembayaran telah diterima; pemeriksaan tetap manual oleh Owner.

### Action: deliver

Request memuat `action: "deliver"`, `requestId`, dan `requestToken`. UI hanya meminta delivery setelah status `approved` dan `verificationStatus === "verified"`.

Response sukses harus memiliki `ok: true`, `productId` yang sesuai, dan `licenseKey` string nonkosong. Jangan menampilkan atau menyimpan kunci yang tidak benar-benar dikembalikan endpoint.

## 3. Preferensi situs dan iklan

- Key: `choco_site_preferences_v1`
- Value: object berisi `adsAllowed` boolean dan `savedAt` ISO timestamp.
- Script iklan native dan smartlink tidak boleh dimuat sebelum `adsAllowed === true`.
- Menolak iklan menyembunyikan slot. Script pihak ketiga yang telah dimuat tidak dapat dijamin dapat dibongkar dari halaman yang sedang berjalan.
- Popup sponsor mobile hanya berjalan setelah persetujuan dan mengikuti aturan interaksi/waktu pada modul mobile.

## 4. Preferensi respons

- Key: `chocoPreferences`
- Storage: localStorage pada browser yang sama.
- Field UI saat ini: `ageGroup`, `responseLength`, `typingEffect`, `timeGreeting`, `tonePreference`, `detailPreference`, `humorPreference`, `emojiPreference`.
- Backend membaca preferensi respons yang relevan; field presentasi hanya mengubah perilaku UI.
- Nilai baru harus divalidasi pada backend sebelum dianggap berpengaruh pada AI.

## 5. Cooldown

- Key: `chocoNextAllowedAt`
- Storage: localStorage.
- Digunakan sebagai waktu epoch milidetik hingga pesan boleh dikirim lagi.
- Cooldown UI bukan mekanisme keamanan atau rate limiting server. Backend tetap menjadi otoritas rate limit.

## 6. Integrasi yang belum tersedia

Jangan mengasumsikan endpoint untuk:
- Menyimpan/memulihkan riwayat chat permanen.
- Sinkronisasi percakapan lintas perangkat.
- Mengelola memori pengguna melalui UI.
- Mengubah model aktif dari client.
- Menyimpan pengaturan ke akun pengguna umum.

Jika kebutuhan baru muncul, backend owner harus menentukan endpoint, otorisasi, skema request/response, error handling, dan uji sebelum UI mengintegrasikannya.
