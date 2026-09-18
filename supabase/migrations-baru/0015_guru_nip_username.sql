-- 0015_guru_nip_username.sql
-- Jalankan di KETIGA project (kelas 7, 8, dan 9). Isinya identik.
--
-- =============================================================================
-- KENAPA MIGRASI INI ADA
-- =============================================================================
-- Sampai sekarang guru login pakai EMAIL ASLI. Di lapangan itu menyulitkan:
-- banyak guru tidak hafal (atau tidak punya) email sekolah, salah ketik satu
-- huruf di bagian domain sudah cukup untuk gagal masuk, dan admin harus
-- mengarang alamat email untuk guru yang tidak punya.
--
-- Sekarang identitas login guru adalah NIP — angka yang memang sudah dihafal
-- dan tercetak di banyak dokumen sekolah. `username` dibuat sebagai kolom
-- terpisah (bukan langsung memakai `nip` sebagai kolom login) karena:
--
--   a. Ada guru honorer/GTT yang belum punya NIP. Mereka tetap butuh akun,
--      jadi username-nya bisa diisi hal lain (mis. "guru.budi") sementara
--      `nip` dibiarkan kosong.
--   b. NIP adalah data kepegawaian yang ikut dicetak di laporan; username
--      adalah kredensial. Menggabung keduanya ke satu kolom berarti
--      mengganti NIP yang salah ketik = mengganti cara orangnya login.
--
-- Untuk kebanyakan guru keduanya akan berisi nilai yang sama, dan itu memang
-- yang dilakukan form "Tambah Guru" (username otomatis diisi dari NIP).
--
-- =============================================================================
-- EMAIL TETAP ADA, TAPI JADI SINTETIS
-- =============================================================================
-- Supabase Auth mewajibkan email untuk setiap akun, jadi email tidak bisa
-- dibuang. Yang berubah: untuk akun guru baru, emailnya dirakit sendiri oleh
-- aplikasi dari username — "{username}@guru.lms-cbt.local" — persis pola yang
-- sudah dipakai siswa sejak 0001_init.sql. Guru tidak pernah melihat atau
-- mengetik alamat itu.
--
-- Akun guru LAMA yang terlanjur dibuat dengan email asli TIDAK rusak dan
-- TIDAK perlu dibuat ulang: mereka tetap bisa login dengan emailnya seperti
-- biasa, dan begitu kolom `username` mereka diisi (lewat perintah di bagian
-- bawah file ini, atau lewat panel admin), mereka bisa login dengan username
-- juga. Resolusi username -> email dilakukan di server (lihat
-- `resolveLoginGuru` di src/app/login/Action.ts).

alter table guru
  add column if not exists nip text;

alter table guru
  add column if not exists username text;

comment on column guru.nip is
  'NIP guru. Boleh NULL untuk guru honorer/GTT yang belum punya NIP. '
  'Unik kalau terisi — dua guru tidak boleh punya NIP yang sama.';

comment on column guru.username is
  'Identitas login guru. Untuk guru ber-NIP, nilainya = NIP (diisi otomatis '
  'oleh form Tambah Guru). Akun Supabase Auth-nya dibuat dengan email '
  'sintetis "{username}@guru.lms-cbt.local" — guru tidak pernah mengetik '
  'email itu. NULL berarti akun lama yang masih login pakai email asli.';

-- Unik HANYA untuk baris yang terisi (partial unique index). Kalau dipakai
-- `unique` biasa, di Postgres NULL memang tidak saling bentrok — tapi partial
-- index ini menegaskan maksudnya dan sekaligus lebih ramping karena baris
-- ber-NULL tidak ikut diindeks sama sekali.
create unique index if not exists idx_guru_nip_unik
  on guru (nip)
  where nip is not null;

-- `lower(username)` supaya "196504121990031005" dan variasi huruf besar/kecil
-- (untuk username non-angka seperti "Guru.Budi") dianggap orang yang sama.
-- Aplikasi sendiri sudah menormalkan ke huruf kecil sebelum menyimpan; index
-- ini yang menjamin tidak ada jalan masuk lain yang melewatkannya.
create unique index if not exists idx_guru_username_unik
  on guru (lower(username))
  where username is not null;

-- =============================================================================
-- siswa.tanggal_lahir — kolom yang selama ini DIBACA kode tapi tidak pernah ada
-- =============================================================================
-- `src/app/login/Action.ts` (fungsi `siapkanLoginSiswa`) menyeleksi kolom
-- `siswa.tanggal_lahir`, tapi tidak ada satu pun migrasi 0001-0014 yang
-- membuatnya. Selama ini tidak ketahuan karena fungsi itu belum dipakai
-- LoginForm. Begitu form "Tambah Siswa" manual dipakai, kolom ini perlu ada:
-- tanggal lahir adalah kata sandi siswa, dan admin yang menambahkan siswa
-- baru harus bisa mencatatnya sekalian.
--
-- Bertipe `date`, bukan `text`: Postgres yang memvalidasi "31 Februari"
-- ditolak, bukan kode aplikasi.
alter table siswa
  add column if not exists tanggal_lahir date;

comment on column siswa.tanggal_lahir is
  'Tanggal lahir siswa. Dipakai sebagai kata sandi login (format DDMMYYYY) — '
  'lihat src/app/login/LoginForm.tsx. Boleh NULL untuk baris siswa lama yang '
  'akunnya sudah dibuat sebelum kolom ini ada; login mereka tidak terpengaruh '
  'karena kata sandi sungguhannya ada di auth.users, bukan di sini.';

-- =============================================================================
-- LANGKAH MANUAL (opsional) — mengisi username untuk guru yang SUDAH ADA
-- =============================================================================
-- Guru lama tetap bisa login pakai email tanpa menjalankan apa pun di bawah
-- ini. Jalankan hanya kalau mau mereka ikut bisa login pakai NIP.
--
-- 1. Isi NIP-nya dulu satu per satu (ganti nama & NIP-nya):
--
--      update guru set nip = '196504121990031005' where nama = 'Budi Santoso';
--
-- 2. Lalu samakan username dengan NIP untuk semua yang sudah punya NIP:
--
--      update guru
--         set username = nip
--       where nip is not null
--         and username is null;
--
-- 3. Periksa hasilnya:
--
--      select g.nama, g.nip, g.username, u.email, g.is_admin
--        from guru g join auth.users u on u.id = g.auth_id
--       order by g.nama;
--
-- CATATAN: mengisi `username` di sini TIDAK mengubah kata sandi guru tersebut
-- dan TIDAK membuat akun Supabase Auth baru. Yang terjadi cuma: mulai saat itu
-- dia bisa mengetik NIP-nya di kolom "Username / NIP" dan server akan
-- menerjemahkannya ke email akun yang sudah dia punya. Kata sandinya tetap
-- yang lama. Kalau lupa, reset lewat tombol di /admin/guru.
