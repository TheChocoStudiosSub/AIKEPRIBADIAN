# Developer Handoff

Dokumen ini membagi tanggung jawab agar pekerjaan frontend, backend, dan AI tidak tumpang tindih.

## 1. Aturan kolaborasi

- README utama adalah entry point dan ringkasan status.
- Dokumen arsitektur menjelaskan susunan kode.
- Dokumen kontrak integrasi adalah sumber kebenaran untuk request/response.
- Implementasi yang belum ada harus berstatus pending atau mocked; jangan menampilkan mock sebagai data produksi.
- Perubahan endpoint, payload, storage key, atau ID DOM harus memperbarui dokumentasi dan pengujian pada perubahan yang sama.
- Jangan menulis kredensial rahasia ke dalam file frontend atau dokumentasi publik.

## 2. Pembagian tanggung jawab

| Area | Pemilik | Batas tanggung jawab |
|---|---|---|
| Layout, visual system, responsive behavior | Frontend | Tidak mengubah aturan backend |
| DOM components, modal, composer, navigation | Frontend | Menggunakan ID dan data hooks yang terdokumentasi |
| Chat API adapter dan stream presentation | Frontend | Mengirim kontrak yang disepakati; tidak memanggil provider AI langsung |
| Input validation dan rate limiting server | Backend | Otoritas validasi tetap di server |
| Groq inference dan model selection | AI/backend | Secret dan provider hanya server-side |
| Personality/system prompt | AI/backend | Tidak disimpan sebagai instruksi tepercaya di client |
| RAG / Knowledge Hub retrieval | AI/backend | Hak akses dan filtering ditentukan server |
| Owner authentication and authorization | Backend/security | Frontend hanya menyajikan state yang dikembalikan server |
| License verification and delivery | Backend/Owner | UI tidak menyatakan transaksi lunas tanpa response terverifikasi |
| Database, RLS, migrations, backups | Backend/database | Perubahan schema memerlukan review dan migration |
| API contract documentation | Pemilik endpoint + integrator | Dua pihak menyetujui perubahan sebelum implementasi |

## 3. Status implementasi

Gunakan satu status yang jelas per pekerjaan:

- **Implemented:** fungsi tersedia di kode dan jalur utama sudah dihubungkan.
- **Mocked:** hanya data/response simulasi untuk pengembangan lokal.
- **Pending integration:** UI atau endpoint belum tersambung sepenuhnya.
- **Blocked:** tertahan karena kontrak, izin, atau dependency belum tersedia.
- **Not implemented:** belum ada implementasi.

Jangan menggunakan kata "selesai" untuk UI yang masih memerlukan endpoint produksi.

## 4. Kriteria penerimaan frontend

- Halaman tetap dapat dimuat pada desktop, tablet, dan smartphone.
- Sidebar drawer dapat dibuka dan ditutup.
- Tombol Percakapan baru menghapus konteks sesi pada halaman tanpa menghapus data server.
- Submit melalui tombol dan Enter menggunakan jalur submit yang sama.
- Shift+Enter membuat baris baru.
- Streaming menampilkan potongan jawaban dan menangani stream error.
- Error state tidak menampilkan stack trace atau rahasia server.
- Preferensi respons tetap disimpan pada browser yang sama.
- Consent iklan dihormati.
- Alur lisensi hanya berjalan dengan ID/token sah yang diberikan link.
- Focus state, label input, dan reduced motion tersedia.
- Tidak ada console error baru pada halaman utama.

## 5. Kriteria penerimaan integrasi

- Request dan response cocok dengan [Integration Contracts](INTEGRATION-CONTRACTS.md).
- Endpoint diuji dengan response sukses, error, timeout, dan rate limit.
- Token/secret tidak pernah masuk ke JavaScript publik.
- Hak akses Owner diperiksa backend.
- Kontrak diuji otomatis atau melalui integration test yang terdokumentasi.
- README dan kontrak diperbarui sebelum fitur dinyatakan aktif.

## 6. Checklist sebelum merge ke main

1. Review diff branch terhadap `main`.
2. Jalankan pemeriksaan JavaScript, data pengetahuan, migration, retrieval tests, dan smoke checks.
3. Uji halaman di browser desktop dan smartphone.
4. Uji chat SSE, JSON fallback bila digunakan, error 429/503, personalisasi, consent iklan, dan license handoff pada environment yang dikonfigurasi.
5. Pastikan `vercel.json`, `api/`, `netlify/functions/`, dan environment server tidak berubah tanpa kebutuhan yang disetujui.
6. Pastikan semua status pada README cocok dengan kode aktual.
7. Merge dan deploy hanya setelah review/persetujuan rilis.
