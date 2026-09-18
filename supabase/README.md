# Struktur database — 3 project Supabase terpisah

Sejak Sesi 16, project ini tidak lagi satu database untuk semua siswa —
dipecah jadi **3 project Supabase terpisah, satu per jenjang** (kelas 7,
8, 9). Alasan lengkap ada di riwayat obrolan pengembangan (README.md
utama, bagian Status Sesi 16), ringkasnya: satu project gratisan Supabase
dikhawatirkan kewalahan kalau 600 siswa (3 jenjang) ujian bersamaan —
dipecah 3 berarti tiap project cuma nanggung ±200 siswa.

## Kenapa foldernya 3x lipat isinya identik?

`migrations-kelas7/`, `migrations-kelas8/`, `migrations-kelas9/` isinya
**sama persis** (9 file `.sql` yang sama, byte-for-byte) — ini BUKAN
kesalahan copy-paste. Skema, RLS, dan RPC-nya memang harus identik di
ketiga project (satu jenjang tidak butuh struktur beda dari jenjang
lain) — yang membedakan cuma project Supabase mana yang menjalankannya,
bukan isi filenya. Dipisah jadi 3 folder murni supaya waktu kamu buka
SQL Editor di masing-masing project, jelas folder mana yang harus
disalin ke project mana — tidak ada acara "loh ini file yang sama
dipakai buat 3 project, jangan sampai jalanin ke project yang salah"
yang membingungkan.

Yang **beda** cuma file seed:

| File | Isi |
|---|---|
| `seed-kelas7.sql` | Cuma insert kelas 7.1–7.6 |
| `seed-kelas8.sql` | Cuma insert kelas 8.1–8.6 |
| `seed-kelas9.sql` | Cuma insert kelas 9.1–9.6 |

Ini bedanya SENGAJA: project kelas 7 tidak akan pernah punya siswa kelas
8 atau 9, jadi tidak perlu baris kelas jenjang lain nongkrong di sana.

## Urutan setup (ulangi 3x, satu kali per project)

Untuk MASING-MASING dari 3 project Supabase yang kamu buat (lihat
README.md utama bagian setup untuk cara bikin project baru):

1. Buka SQL Editor di project itu.
2. Jalankan isi `migrations-kelas{N}/0001_init.sql` sampai
   `0009_log_aktivitas.sql`, **urut angkanya**, N sesuai jenjang project
   itu.
3. Jalankan `seed-kelas{N}.sql`.
4. Bikin akun guru & siswa lewat Authentication > Users di project ITU
   JUGA (akun di project kelas 7 tidak otomatis ada di project kelas 8 —
   lihat catatan "data admin dan guru sama persis" di README.md utama
   soal ini).

## Kalau nanti mau ubah skema (menambah kolom, dst)

Ubah dan tambahkan file migrasi baru **di ketiga folder sekaligus**
dengan isi yang sama persis, lalu jalankan di ketiga project. Belum ada
otomasi untuk ini (mis. script yang copy migrasi baru ke 3 folder
otomatis) — kandidat kerjaan sesi mendatang kalau dirasa mulai
merepotkan menjaga 3 folder tetap sinkron manual.
