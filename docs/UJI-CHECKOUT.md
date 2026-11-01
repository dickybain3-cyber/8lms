# Uji Coba Fitur Checkout

Ada dua tahap. Bot memeriksa aturan di database dalam 1 menit. Uji manual
memeriksa tampilan di HP, yang tidak bisa dilihat bot.

Syarat: `0024_checkout_ujian.sql` sudah dijalankan di database yang diuji.

## Tahap 1: Bot

Jalankan dari folder `lms-cbt`, saat **tidak ada ujian berlangsung**. Ulangi
untuk kelas 7, 8, dan 9.

```
npx tsx scripts/bot-uji-checkout.ts --kelas 8
npx tsx scripts/bot-uji-checkout.ts --kelas 8 --jalankan
```

Perintah pertama hanya menampilkan rencana. Perintah kedua menjalankan uji.

### Yang dilakukan bot

1. Membuat kelas, kegiatan, mapel, dan 4 akun siswa sementara berawalan
   `BOT-UJI-CHECKOUT`.
2. Login sebagai siswa, sama seperti HP siswa.
3. Menguji aturan di bawah. Jam tutup mapel diubah-ubah, jadi tidak perlu
   menunggu 5 menit.
4. Menghapus semua data bot, juga kalau uji gagal di tengah jalan.

Siswa asli tidak melihat apa pun karena mapel bot hanya untuk kelas bot. Selama
bot berjalan, admin bisa melihat kegiatan dan kelas bot sekilas di menu.

### Yang diperiksa

| Keadaan | Hasil yang benar |
|---|---|
| Tanpa login | Ditolak |
| Siswa belum mulai ujian | Tidak diminta checkout, ditolak kalau mencoba |
| Checkout sebelum jendela buka | Ditolak |
| Siswa menulis langsung ke tabel | Ditolak |
| Jendela buka | Tepat 5 menit sebelum jam tutup |
| Checkout saat jendela buka | Diterima |
| Checkout dua kali | Jawaban pertama yang berlaku |
| Siswa sudah kumpul | Tetap diminta checkout |
| Siswa membaca checkout orang lain | Tidak bisa |
| Checkout setelah tutup | Ditolak |
| Tidak checkout | Catatan "Belum checkout", nilai tetap ada |
| Menjawab TIDAK | Diberi catatan |
| Tidak ikut ujian | Tanpa catatan |
| Reset ujian | Checkout ikut terhapus |
| Mapel lama | Checkout tidak berlaku |

### Membaca hasil

Tiap pemeriksaan tertulis `LULUS` atau `GAGAL`. Baris terakhir yang benar:

```
Hasil: 24 lulus, 0 gagal.
```

| Pesan | Artinya |
|---|---|
| `GAGAL` pada satu baris | Aturan itu tidak berjalan. Kirim seluruh hasilnya ke pengembang. |
| `BERHENTI` | Bot tidak bisa melanjutkan. Data bot tetap dihapus. Kirim pesannya ke pengembang. |
| `belum ada di .env.local` | Kunci project itu tidak ada di `.env.local`. |
| `PERINGATAN: masih ada data bot` | Jalankan perintah pembersihan di bawah. |

Pembersihan manual, misalnya kalau komputer mati saat bot berjalan:

```
npx tsx scripts/bot-uji-checkout.ts --kelas 8 --bersihkan
```

Pembersihan hanya menyentuh data berawalan `BOT-UJI-CHECKOUT`.

### Yang tidak diperiksa bot

- Tampilan jendela checkout di HP dan lewat examsafer.
- Tombol Reset yang hilang untuk guru.
- Kotak tanda dan reset massal di layar admin.
- Isi file Excel.

Semua ini diperiksa di Tahap 2.

## Tahap 2: Uji manual

Lakukan setelah aplikasi ter-deploy. Siapkan 3 HP atau 3 akun siswa di satu
kelas, plus satu akun admin dan satu akun guru.

**Persiapan:** buat mapel uji dengan jam tutup 10 menit dari sekarang, tambahkan
satu soal, target satu kelas.

| No | Lakukan | Yang harus terlihat |
|---|---|---|
| 1 | Siswa 1: mulai, jawab, kumpulkan | Dashboard menampilkan pita "JANGAN KELUAR DULU" dan hitung mundur |
| 2 | Siswa 2: mulai, biarkan soal terbuka | Soal bisa dikerjakan seperti biasa |
| 3 | Siswa 3: mulai, lalu tutup aplikasi | Tidak ada |
| 4 | Tunggu sampai 5 menit sebelum tutup | Jendela WAKTUNYA CHECKOUT muncul di HP siswa 1 dan 2 tanpa muat ulang |
| 5 | Coba tutup jendela dengan tombol kembali | Jendela tetap ada |
| 6 | Siswa 1: tekan CHECKOUT tanpa memilih | Tombol belum ada sebelum memilih YA/TIDAK |
| 7 | Siswa 1: pilih YA, tekan CHECKOUT | Muncul CHECKOUT BERHASIL |
| 8 | Siswa 2: pilih TIDAK, tekan CHECKOUT | Soal masih bisa dikerjakan setelah menekan OK |
| 9 | Admin: buka Pantau Ujian | Kolom Checkout terisi jam dan jawaban. Siswa 3 "Belum checkout" |
| 10 | Tunggu jam tutup | Status siswa 3 menjadi "Tidak checkout" |
| 11 | Admin: Unduh Rekap Nilai | Kolom Catatan: siswa 2 dan siswa 3 terisi, siswa 1 kosong |
| 12 | Admin: Tandai semua, Reset yang ditandai | Minta konfirmasi, lalu siswa kembali "Belum mulai" |
| 13 | Guru: buka Pantau Ujian | Hanya jenjang login, tanpa kotak tanda, Kumpulkan, dan Reset |
| 14 | Guru: buka Rekap Penilaian | Tidak ada tombol Reset ujian |

Hapus mapel uji setelah selesai.
