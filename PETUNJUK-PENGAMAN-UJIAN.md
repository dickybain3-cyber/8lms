# Pengaman Ujian: Layar Penuh, Pelanggaran, Kode Pengaman

## Langkah wajib: jalankan SQL dulu

Jalankan `supabase/migrations-baru/0026_pengaman_ujian.sql` di SQL Editor
ketiga project (kelas 7, 8, 9), lalu deploy aplikasi. CEK AKHIR di ujung
berkas harus menghasilkan 0 baris. Pembatalan: `0026_pengaman_ujian_BATAL.sql`.

Tiap project membuat rahasia acaknya sendiri saat SQL pertama dijalankan,
jadi kode kelas 7, 8, dan 9 selalu berbeda.

Sebelum SQL dijalankan: peringatan tetap muncul (dicatat di HP saja), tetapi
kunci tidak bisa dibuka dan menu Kode Pengaman menampilkan galat. Jadi
jalankan SQL sebelum deploy.

## Aturan

- Tekan Mulai Ujian = HP masuk layar penuh. Siswa yang memuat ulang halaman
  melihat layar "Lanjutkan dalam layar penuh" (browser hanya mengizinkan
  layar penuh dari ketukan).
- Dicatat pelanggaran:
  - keluar layar penuh (seketika)
  - membagi layar / split screen di HP/tablet (seketika)
  - pindah tab/aplikasi lebih dari 10 detik
- Satu kejadian dihitung satu kali, walau memicu beberapa deteksi.
- Pelanggaran 1 dan 2: peringatan. Pelanggaran 3: ujian terkunci.
- Buka kunci: kode 6 angka dari menu **Kode Pengaman** (admin saja), sesuai
  jenjang siswa. Kode berganti tiap 5 menit; kode sebelumnya masih diterima.
- Setelah dibuka, pelanggaran berikutnya langsung mengunci lagi.
- Salah kode 5 kali dalam 1 menit: tunggu 1 menit.
- Kunci tersimpan di database: refresh, hapus data browser, atau pindah HP
  tidak membuka kunci.
- Waktu habis tetap mengumpulkan otomatis walau siswa sedang terkunci.
- Pantau Ujian menampilkan jumlah pelanggaran dan status terkunci; ikut di
  unduhan Excel.
- Reset ujian ikut menghapus catatan pelanggaran.

## Dibuka dari ExamSafer

Dikenali dari user agent `ExamSaferSMPN8/`. Di dalam aplikasi: tidak minta
layar penuh dan tidak cek layar terbagi (aplikasi sudah menyematkan layar dan
menangkap layar terbagi sendiri). Cek pindah aplikasi >10 detik dan kunci
kode tetap berlaku, sama seperti sebelum fitur ini.

## Batasan yang perlu diketahui

- iPhone (Safari) tidak mendukung layar penuh untuk halaman web. Di iPhone
  yang dipantau hanya pindah aplikasi dan layar terbagi.
- Kunci adalah kunci tampilan. Siswa yang terkunci tidak bisa menjawab lewat
  halaman ujian, tetapi database belum menolak simpanan jawaban selama
  terkunci.
- Browser memberi notifikasi layar penuh sendiri ("Tekan untuk keluar") di
  awal; itu bawaan browser.

## Uji manual (HP Android, Chrome)

1. Admin: buka menu Kode Pengaman. Tiga kartu kode tampil dan berbeda per
   jenjang; hitung mundur berjalan, kode berganti saat 0:00.
2. Siswa: buka ujian, tekan Mulai Ujian. Layar harus penuh.
3. Usap/tekan kembali untuk keluar layar penuh: peringatan 1 dari 3. Tekan
   Mengerti: kembali layar penuh.
4. Buka split screen: peringatan 2 dari 3.
5. Pindah ke aplikasi lain lebih dari 10 detik lalu kembali: ujian terkunci.
6. Refresh halaman: tetap terkunci.
7. Masukkan kode jenjang lain: ditolak. Masukkan kode jenjang yang benar:
   terbuka, kembali layar penuh.
8. Admin, Pantau Ujian: siswa tadi tampil "3 pelanggaran".
9. Keluar layar penuh sekali lagi: langsung terkunci.
