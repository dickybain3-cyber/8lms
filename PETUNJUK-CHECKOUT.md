# Checkout Ujian, Reset Massal, Pantau Ujian untuk Guru

## Langkah wajib: jalankan SQL dulu

Jalankan `supabase/migrations-baru/0024_checkout_ujian.sql` di SQL Editor
ketiga project (kelas 7, 8, 9), lalu deploy aplikasi. CEK AKHIR di ujung
berkas harus menghasilkan 0 baris. Pembatalan: `0024_checkout_ujian_BATAL.sql`.

Sebelum SQL dijalankan, aplikasi tetap normal; jendela checkout saja yang
tidak muncul, dan kolom checkout tampil "—".

## Aturan checkout

- Jendela buka 5 menit sebelum jam tutup mapel. Contoh: tutup 08.30, buka 08.25.
- Hanya untuk siswa yang sudah menekan Mulai Ujian.
- Jendela tidak bisa ditutup kecuali dengan checkout, atau hilang sendiri saat
  jam tutup. Checkout tidak mengumpulkan jawaban.
- Siswa yang sudah mengumpulkan lebih awal melihat pita "JANGAN KELUAR DULU"
  di dashboard sampai jendela buka.
- Tidak checkout: nilai tetap masuk, ada catatan "Belum checkout" di Pantau
  Ujian, Rekap Penilaian, Excel rekap, dan CSV.
- Reset ujian ikut menghapus checkout siswa itu.
- Mapel yang sudah selesai saat SQL dijalankan tidak terkena aturan ini.

## Uji manual

1. Buat mapel dengan jam tutup 10 menit dari sekarang, target satu kelas.
2. Login siswa, mulai ujian, jawab satu soal, kumpulkan. Cek pita tunggu di dashboard.
3. Tepat 5 menit sebelum tutup, jendela checkout harus muncul. Pilih YA, tekan CHECKOUT.
4. Siswa kedua: mulai ujian dan biarkan soal terbuka. Jendela muncul di atas
   soal; setelah checkout soal masih bisa dikerjakan.
5. Siswa ketiga: mulai ujian, lalu tutup aplikasi sampai jam tutup.
6. Admin, Pantau Ujian: cek kolom Checkout dan filter Belum checkout.
   Unduh Rekap Nilai: kolom Catatan siswa ketiga berisi "Belum checkout".
7. Admin: tandai dua siswa, tekan Reset yang ditandai.
8. Guru: buka Pantau Ujian. Tidak boleh ada kotak tanda, tombol Kumpulkan, Reset,
   atau zona reset. Di Rekap Penilaian tombol Reset juga tidak ada.
