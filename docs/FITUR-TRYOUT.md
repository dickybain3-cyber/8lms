# Fitur Tryout Kelas 9

## Pasang
1. Project Supabase **kelas 9** → SQL Editor → jalankan `supabase/migrations-baru/0029_tryout.sql`.
   CEK AKHIR harus 0 baris. Prasyarat: 0011, 0018, 0024, 0028 sudah jalan.
2. Deploy aplikasi.
3. Batal: `0029_tryout_BATAL.sql` (menghapus semua data tryout).

## Alur guru
- Menu **Kegiatan → Tryout Kelas 9** (atau Buat Kegiatan → jenis Tryout, jenjang 9).
- Buat tryout → buat paket (token otomatis/manual, jam buka–tutup WIB, subtes BI + MTK langsung dibuat).
- Paket → subtes → **Kelola Soal / Unggah JSON** (halaman soal yang sama dengan asesmen, termasuk gambar .docx).
- Bagikan link tryout (satu link untuk semua paket) + token paket.
- **Statistik**: Ringkasan, Peringkat (angkatan/kelas, rata-rata/per subtes, 3 tertinggi tiap subtes),
  Per Kelas, Per Siswa (naik/turun), Analisis Butir, Unduh Excel. **Statistik Angkatan** = semua tryout.
- Halaman siswa (klik nama): grafik peningkatan, peringkat, tombol **Reset** subtes.

## Alur siswa
- Link → token → kelas 9.x → nama → pilih subtes (urutan bebas) → kerjakan.
- Waktu per subtes. Keluar tidak menghentikan waktu; waktu habis = otomatis terkumpul.
- Tiap subtes sekali. Boleh keluar setelah satu subtes, masuk lagi pakai token untuk subtes lain.
- Akun siswa (login biasa) → kartu **Nilai Tryout** di dashboard: nilai + grafik. Tanpa kunci/pembahasan.

## Uji manual (pemilik)
1. Buat tryout + paket dengan jam buka sekarang. Unggah 3–5 soal JSON ke BI dan MTK.
2. Buka link di HP (jendela penyamaran). Token salah → pesan salah. Token benar → pilih kelas & nama.
3. Mulai BI, jawab 2 soal, tekan **Keluar dulu**. Buka link lagi + token → BI "Sisa mm:ss" → Lanjutkan, jawaban masih ada.
4. Kumpulkan BI → nilai tampil. Mulai MTK, tutup tab, tunggu durasi habis (+3 menit) → buka lagi → MTK selesai otomatis.
5. Statistik guru: nilai muncul, peringkat, per kelas, per siswa, analisis butir, Excel.
6. Login akun siswa yang sama → Nilai Tryout → nilai sama dengan di portal.
7. Coba login siswa biasa: subtes tryout TIDAK muncul di daftar ujian.

## Catatan teknis
- Subtes = baris `mapel` (+`tryout_paket_id`, `tryout_subtes`), tanpa `mapel_kelas`.
- Siswa tryout tanpa Supabase Auth: cookie `lms_tryout` bertanda tangan HMAC (kunci turunan service role kelas 9),
  RPC pengerjaan hanya untuk service_role. Kunci jawaban dibuang di DB (`soal_tanpa_kunci`).
- Kode: `src/app/tryout/*`, `src/app/admin/tryout/*`, `src/lib/tryout*.ts`, uji `src/lib/__tests__/tryout.test.ts`.
