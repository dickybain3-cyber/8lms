-- 0016_guru_profil.sql
-- Jalankan di KETIGA project (kelas 7, 8, dan 9). Isinya identik.
--
-- =============================================================================
-- KENAPA MIGRASI INI ADA
-- =============================================================================
-- Halaman baru /admin/profil membiarkan guru mengganti foto, username, dan
-- kata sandinya sendiri. Perubahan itu disebarkan ke SEMUA project tempat guru
-- yang sama terdaftar, dengan NIP sebagai penanda "ini orang yang sama"
-- (lihat src/lib/profil-guru.ts). Dua kolom baru di bawah ini yang dibutuhkan.
--
-- Tidak ada policy RLS baru, dan itu disengaja: tabel `guru` memang tidak
-- punya policy UPDATE untuk siapa pun (lihat 0005_rls_policies.sql), dan
-- perubahan profil dikerjakan Server Action lewat service_role setelah
-- memastikan pemanggilnya hanya menyentuh baris miliknya sendiri. Membuka
-- policy UPDATE di tabel ini demi fitur profil berarti membuka jalan bagi
-- guru mana pun untuk mengubah `is_admin` miliknya sendiri lewat DevTools.
--
-- Aman dijalankan berulang kali (`if not exists`).

alter table guru
  add column if not exists foto_url text;

comment on column guru.foto_url is
  'URL foto profil (Cloudinary, sudah dipotong persegi di browser sebelum '
  'diunggah). NULL = pakai avatar bulat bawaan. Nilainya sama di semua project '
  'untuk guru ber-NIP yang sama — disinkronkan oleh aksi profil.';

alter table guru
  add column if not exists password_diganti_at timestamptz;

comment on column guru.password_diganti_at is
  'Kapan guru ini TERAKHIR mengganti kata sandinya sendiri lewat /admin/profil. '
  'NULL = belum pernah, artinya kata sandinya masih yang diberikan admin '
  '(awal atau hasil reset). Dipakai unduhan detail guru untuk menandai akun '
  'yang kata sandi awalnya sudah tidak berlaku.';

-- Cek hasilnya:
--
--   select nama, nip, username, foto_url, password_diganti_at
--     from guru
--    order by nama;
