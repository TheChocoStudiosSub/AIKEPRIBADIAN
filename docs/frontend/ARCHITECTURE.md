# Frontend Architecture

Dokumen ini menjelaskan struktur runtime frontend Choco AI dan batas perubahan yang aman.

## 1. Prinsip utama

1. Frontend menangani presentasi, input, navigasi, state UI, dan komunikasi HTTP yang memang disediakan backend.
2. Frontend tidak mengimplementasikan autentikasi Owner, aturan akses data internal, inferensi AI, atau validasi transaksi.
3. Tidak ada dependency framework runtime untuk halaman utama. Gunakan HTML semantik, CSS, dan JavaScript vanilla.
4. Jangan mengubah ID DOM yang dipakai controller tanpa memperbarui controller dan tes dalam commit yang sama.
5. Jangan mengganti endpoint atau payload berdasarkan asumsi desain. Gunakan dokumen kontrak integrasi.

## 2. Struktur runtime

| Path | Tanggung jawab |
|---|---|
| `public/index.html` | Dokumen HTML, landmark aksesibilitas, markup dan ID kontrak DOM |
| `public/assets/css/tokens.css` | Warna, ukuran layout, tipografi, shadow, dan motion tokens |
| `public/assets/css/base.css` | Reset, body, kontrol form, focus state, dan aturan dasar |
| `public/assets/css/workspace.css` | Sidebar, topbar, chat shell, dan panel konteks |
| `public/assets/css/components.css` | Welcome, message, composer, modal, toast, iklan |
| `public/assets/css/responsive.css` | Breakpoint desktop/tablet/mobile dan reduced motion |
| `public/assets/js/chat-keyboard.js` | Enter mengirim pesan melalui tombol submit yang sama; Shift+Enter tetap membuat baris baru |
| `public/assets/js/ads-loader.js` | Menyiapkan loader iklan setelah persetujuan diminta dan diberikan |
| `public/assets/js/chat-controller.js` | Mengelola chat UI, streaming SSE, cooldown, personalisasi, dan form permintaan lisensi |
| `public/assets/js/site-preferences.js` | Menyimpan pilihan konten iklan pihak ketiga dan memicu loader bila diizinkan |
| `public/assets/js/mobile-sponsor-popup.js` | Perilaku popup sponsor mobile setelah interaksi dan masa tunggu |
| `public/tcs-analytics.js` | Widget analitik yang sudah ada; bukan bagian dari controller chat |
| `public/tcs-community-widget.js` | Widget komunitas TCS yang sudah ada; bukan bagian dari controller chat |

## 3. CSS dan design system

Token visual berpusat pada hitam arang dan champagne gold. Nilai dasar berada di `tokens.css`; hindari menambahkan kode warna baru untuk komponen individual jika token yang sesuai sudah tersedia.

- Base background: `--bg`
- Surface: `--surface`, `--surface-raised`
- Border: `--line`, `--line-strong`
- Accent: `--gold`, `--gold-light`, `--gold-pale`
- Text: `--text`, `--text-soft`, `--muted`
- Fonts: `--font-display`, `--font-body`, `--font-mono`

Urutan link CSS di HTML adalah kontrak: tokens harus dimuat sebelum file yang menggunakannya; responsive dimuat paling akhir agar override breakpoint tetap berlaku.

## 4. DOM hooks yang dipakai JavaScript

| ID / selector | Pemilik | Tujuan |
|---|---|---|
| `#sidebar`, `#sidebarOverlay`, `#menuButton` | Chat controller | Buka/tutup drawer navigasi |
| `[data-new-chat]` | Chat controller | Mulai percakapan kosong pada memori halaman |
| `#recentList` | Chat controller | Menampilkan judul percakapan sesi saat ini |
| `#chatScroll`, `#welcome`, `#welcomeHeading`, `#messages` | Chat controller | Area percakapan dan welcome state |
| `#form`, `#message`, `#send` | Chat controller + keyboard handler | Mengirim input ke API chat |
| `[data-open-panel]`, `[data-close-panel]` | Chat controller | Menampilkan dan menutup modal |
| `#personalityBackdrop` dan preferensi turunannya | Chat controller | Mengatur preferensi respons lokal |
| `#settingsBackdrop` | HTML/modal | Status menu pengaturan umum; saat ini belum tersedia |
| `#sitePreferenceBackdrop` | Site preferences | Persetujuan iklan pihak ketiga |
| `#nativeAdPlacement`, `#sponsorLinkSlot` | Ads scripts | Slot iklan yang dikontrol persetujuan |
| `#mobileAdPopup` dan turunannya | Mobile sponsor popup | Popup sponsor untuk layar mobile |

Perubahan nama/hapus hook di atas harus disertai pembaruan JavaScript, dokumentasi, dan pengujian.

## 5. State dan penyimpanan

- `history`: array JavaScript di memori halaman untuk konteks percakapan request berikutnya.
- `conversationTitle` dan `conversationStarted`: state daftar percakapan lokal selama halaman aktif.
- `preferences`: preferensi UI/response yang disimpan melalui key `chocoPreferences`.
- `cooldownUntil`: jeda pengiriman pesan yang dibagikan melalui key `chocoNextAllowedAt`.
- `tcs_license_request`: data request token sementara di sessionStorage.
- `choco_site_preferences_v1`: persetujuan iklan pada localStorage.

Tidak ada kontrak penyimpanan riwayat percakapan permanen untuk halaman web ini. Tombol Percakapan baru hanya membersihkan konteks percakapan di halaman saat itu; ia tidak menghapus data pada backend.

## 6. Responsive layout

- Desktop lebar: sidebar, workspace chat, dan panel konteks.
- Tablet/desktop sempit: panel konteks disembunyikan; chat mengambil lebar yang tersedia.
- Smartphone: sidebar menjadi drawer, header dan composer dipadatkan, chat menggunakan lebar layar.
- Animasi harus menghormati `prefers-reduced-motion`.
- Jangan menambahkan dependensi berat hanya untuk mengelola layout responsif.

## 7. Hal yang tidak boleh dilakukan oleh frontend

- Jangan menaruh `GROQ_API_KEY`, server key Supabase, atau token rahasia di aset publik.
- Jangan memutuskan sendiri bahwa pengguna adalah Owner.
- Jangan menganggap request lisensi sebagai bukti pembayaran atau persetujuan.
- Jangan menyimpan access token/refresh token pada browser.
- Jangan menganggap riwayat sesi browser sebagai chat history permanen.
- Jangan menampilkan mock sebagai status produksi.


## UI language

The public interface supports three selectable languages: Indonesian (first-visit default), English, and Simplified Chinese (zh-CN). The selector is rendered in the workspace top bar, and the selected language is stored locally under choco-language-v1.

The selector translates interface labels, accessible names, placeholders, and UI status text. The #messages conversation area is intentionally excluded from automatic interface translation so user prompts and assistant responses are not rewritten. Language of model-generated replies remains part of the chat/API language policy and is not guaranteed by this selector alone.
