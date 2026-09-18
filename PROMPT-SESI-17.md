Lanjutkan project LMS + CBT Sekolah (lihat zip terlampir — hasil Sesi
16: arsitektur dipecah jadi 3 project Supabase terpisah per jenjang
7/8/9, plus autosave ujian ditulis ulang total jadi local-first +
sinkron jeda acak + jitter submit saat waktu habis).

**PRIORITAS UTAMA Sesi 17: uji beban sungguhan.** Ini belum pernah
dilakukan sama sekali untuk arsitektur baru ini — semuanya masih "benar
di atas kertas" (`tsc --noEmit` bersih, logika sudah ditelusuri manual),
TAPI belum ada satu pun request sungguhan dikirim ke project Supabase
manapun sejak Sesi 13. Sebelum menambah fitur baru apa pun, kerjakan
dulu:

1. **Setup 3 project Supabase sungguhan** (bukan simulasi) — ikuti
   `README.md` bagian 2a-2e. Boleh pakai data dummy/kecil dulu (mis. 20
   siswa per jenjang), tidak perlu 600 sungguhan untuk verifikasi awal
   alur benar jalan.
2. **Verifikasi alur dasar end-to-end** di ketiga project:
   - Login siswa & guru dengan jenjang yang benar dipilih di dropdown.
   - Coba login dengan jenjang yang SALAH (pilih kelas 8 tapi akunnya
     ada di project kelas 7) — pastikan pesan error masuk akal, bukan
     crash aneh.
   - Buka halaman ujian siswa, ubah beberapa jawaban, tutup tab paksa
     TANPA nunggu interval sinkron (harus di bawah 70 detik), buka lagi
     — pastikan jawaban yang belum sempat sinkron ke server muncul
     kembali dari `localStorage` (`bacaJawabanLokal`).
   - Biarkan satu autosave siklus penuh jalan (tunggu sampai jeda acak
     70-180 detik lewat), cek di tabel `jawaban_siswa` Supabase apakah
     benar-benar ke-upsert.
   - Set `waktu_selesai` mapel test ke beberapa detik dari sekarang,
     amati auto-submit: input harus terkunci INSTAN saat waktu habis
     (banner "sedang dikumpulkan otomatis" muncul), baru beberapa detik
     kemudian (jitter) baris `jawaban_siswa.submitted_at` benar-benar
     terisi.
   - Coba `LogoutButton` di admin & siswa — pastikan sesi benar-benar
     hilang (reload halaman /admin harus lempar ke /login lagi, bukan
     "nyangkut" logged in).
3. **Load test** — pakai k6 atau Artillery (gratis, bisa dijalankan
   dari laptop sendiri), simulasikan:
   - 200 login bersamaan ke satu project (test rate limit token
     endpoint — apakah perlu dinaikkan manual di Dashboard →
     Authentication → Rate Limits sebelum hari-H).
   - 200 upsert `jawaban_siswa` bersamaan (simulasi puncak autosave
     kalau kebetulan banyak siswa jatuh di jeda acak yang berdekatan).
   - 200 update `submitted_at` dalam window 15 detik (simulasi
     jitter submit saat waktu habis).
   - Catat angka nyata (response time, error rate) di README bagian
     Status Sesi 17 — GANTI kalimat "kemungkinan besar aman" dari sesi
     sebelumnya dengan angka sungguhan, siapa pun bacanya nanti.

**Kalau load test di atas beres dan hasilnya baik**, baru lanjut ke
kandidat fitur (urutan prioritas, boleh disesuaikan hasil temuan step
di atas):

1. Halaman admin lintas-jenjang untuk guru yang megang beberapa kelas
   (mis. kepala sekolah) — query 3 project sekaligus, gabung di kode.
   Ini fitur baru, belum ada sama sekali.
2. Optimasi gambar Cloudinary — resize otomatis lewat parameter URL
   Cloudinary (`f_auto,q_auto,w_600` dst), lazy-load cuma gambar soal
   yang aktif dibuka (bukan semua soal di mapel itu sekaligus). Dibahas
   di obrolan soal hemat kuota data siswa, belum dikerjakan sama sekali.
3. Semua item nunggak lama (lihat daftar di README.md bagian Status
   Sesi 16, paragraf terakhir) — sekarang bertambah kompleks karena
   perlu diuji di 3 project, bukan 1.

Setelah selesai:
- Update bagian "Status" di README.md (tambah baris "Sesi 17 selesai",
  jangan hapus riwayat sesi sebelumnya).
- Tulis `PROMPT-SESI-18.md` baru.
- Zip ulang seluruh project dan sampaikan sebagai file yang bisa
  diunduh.

Catatan teknis penting:
- Jangan ubah pola "createClient()/createAdminClient() tanpa argumen,
  resolve jenjang otomatis dari cookie" yang dipakai sejak Sesi 16 —
  ini keputusan desain sengaja supaya ~30 file lain tidak perlu tahu
  soal multi-project sama sekali. Kalau nambah file baru yang perlu
  akses Supabase, ikuti pola yang sama, jangan thread parameter
  `jenjang` manual kecuali benar-benar perlu override (langka).
- `.env.local.example` sudah py 3 set kredensial (`_7`/`_8`/`_9`) —
  kalau nambah env var baru yang perlu beda per jenjang, ikuti pola
  penamaan yang sama dan HARUS ditulis literal per-cabang di
  `src/lib/supabase/config.ts` (bukan akses dinamis) — lihat komentar
  panjang di file itu soal kenapa.
