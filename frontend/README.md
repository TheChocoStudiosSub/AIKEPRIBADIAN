# Frontend Choco AI

Folder ini adalah pintu masuk dokumentasi frontend. Runtime halaman utama saat ini disajikan langsung dari direktori `public/` karena `vercel.json` menetapkan `outputDirectory: "public"`.

## Sumber kode runtime

- HTML: `public/index.html`
- CSS: `public/assets/css/`
- JavaScript browser: `public/assets/js/`
- Asset visual: `public/assets/`

Folder `frontend/chat` yang telah ada sebelumnya berisi placeholder dokumentasi. Jangan menganggap folder placeholder tersebut sebagai source runtime aktif. Jangan membuat salinan file runtime di dua lokasi tanpa menambahkan proses build yang jelas.

## Prinsip

1. Gunakan HTML/CSS/JavaScript vanilla untuk workspace web saat ini.
2. Jangan menambahkan framework atau dependency besar hanya untuk styling/layout.
3. Pertahankan kontrak DOM yang dicatat pada [Frontend Architecture](../docs/frontend/ARCHITECTURE.md).
4. Pertahankan endpoint sesuai [Integration Contracts](../docs/frontend/INTEGRATION-CONTRACTS.md).
5. README root adalah ringkasan proyek; dokumen ini adalah panduan teknis frontend.

## Status

Implementasi visual pada branch redesign memakai struktur CSS/JS eksternal. Pengujian browser dan integrasi di environment backend tetap wajib dilakukan sebelum perubahan dianggap siap produksi.
