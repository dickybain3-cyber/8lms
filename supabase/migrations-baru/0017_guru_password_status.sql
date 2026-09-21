-- 0017_guru_password_status.sql
-- Jalankan di KETIGA project (kelas 7, 8, dan 9). Isinya identik.
--
-- =============================================================================
-- KENAPA MIGRASI INI ADA
-- =============================================================================
-- Unduhan "Detail Guru" (Tahap 2) perlu tahu apakah password akun guru
-- masih yang awal (`guru123456`, bisa ditulis apa adanya di file unduhan)
-- atau sudah tidak berlaku lagi. `password_diganti_at` (migrasi 0016) sudah
-- menjawab SEBAGIAN — tapi cuma untuk kasus "guru mengganti sendiri lewat
-- /admin/profil". Tombol "Reset Password" di /admin/guru (`resetPasswordGuru`,
-- sudah ada sejak sebelum migrasi ini) mengganti password lewat
-- `admin.auth.admin.updateUserById()` TANPA menyentuh baris `guru` sama
-- sekali — jadi sampai sekarang tidak ada cara membedakan "masih password
-- awal" dari "sudah pernah direset admin" hanya dari `password_diganti_at`.
--
-- =============================================================================
-- KENAPA ADA NILAI 'tidak_diketahui', BUKAN LANGSUNG DIANGGAP 'awal'
-- =============================================================================
-- Untuk akun guru yang SUDAH ADA sebelum migrasi ini, kita tidak benar-benar
-- tahu riwayatnya. Menganggap semua yang `password_diganti_at IS NULL`
-- sebagai `'awal'` berarti MENGKLAIM sesuatu yang tidak kita ketahui — akun
-- itu bisa saja sudah pernah direset admin bulan lalu, dan unduhan yang
-- menulis "guru123456" untuk akun itu keliru sekaligus berbahaya (admin bisa
-- membagikan password yang sudah tidak berlaku, atau lebih buruk, salah
-- kira password itu MASIH berlaku padahal sudah diganti diam-diam ke nilai
-- lain lewat reset). Baris lama karena itu ditandai `'tidak_diketahui'` —
-- bukan `'awal'` — dan unduhan (Tahap 2) menampilkannya dengan keterangan
-- eksplisit, bukan menuliskan password.
--
-- Pengecualian: akun yang `password_diganti_at` SUDAH terisi memang kita
-- tahu ceritanya (guru pernah ganti sendiri) — itu di-backfill ke
-- `'diganti_guru'`, bukan ikut ditandai tidak diketahui begitu saja.
--
-- Untuk akun BARU (dibuat setelah migrasi ini lewat import/tambah manual),
-- `DEFAULT 'awal'` tetap berlaku seperti biasa — ceritanya memang diketahui
-- sejak awal dibuat.
--
-- =============================================================================
-- KAPAN NILAINYA BERUBAH SETELAH INI (lihat kode masing-masing)
-- =============================================================================
--   'awal'           -> saat akun dibuat (DEFAULT, importGuruBatch/tambahGuruManual)
--   'direset_admin'  -> saat resetPasswordGuru() dipanggil (src/app/admin/guru/actions.ts)
--   'diganti_guru'   -> saat guru mengganti sendiri (terapkanPassword() di profil-guru.ts,
--                       jalur yang sama yang sudah mengisi password_diganti_at sejak 0016)
--   'tidak_diketahui'-> HANYA hasil backfill migrasi ini, tidak pernah ditulis kode manapun
--                       setelah migrasi ini jalan — begitu status sebuah akun diketahui
--                       (direset atau diganti), nilainya pindah dan tidak pernah kembali
--                       ke 'tidak_diketahui'.
--
-- Aman dijalankan berulang kali: kolom baru pakai `if not exists`, backfill
-- hanya menyentuh baris yang `password_status` masih NULL, dan constraint
-- dibuat lewat blok DO supaya tidak error kalau sudah ada.

alter table guru
  add column if not exists password_status text;

-- Backfill HANYA untuk baris yang belum pernah disentuh migrasi ini (supaya
-- aman dijalankan ulang, dan supaya tidak menimpa status yang sudah sempat
-- ditulis kode aplikasi kalau migrasi ini ketinggalan dijalankan setelah
-- kode barunya sudah aktif).
update guru
   set password_status = case
         when password_diganti_at is not null then 'diganti_guru'
         else 'tidak_diketahui'
       end
 where password_status is null;

alter table guru
  alter column password_status set default 'awal';

alter table guru
  alter column password_status set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'guru_password_status_check'
  ) then
    alter table guru
      add constraint guru_password_status_check
      check (password_status in ('awal', 'direset_admin', 'diganti_guru', 'tidak_diketahui'));
  end if;
end $$;

comment on column guru.password_status is
  'Status password akun guru saat ini. ''awal'' = masih guru123456 (default '
  'akun baru). ''direset_admin'' = tombol Reset Password pernah dipakai, '
  'password acak baru hanya tampil sekali saat reset. ''diganti_guru'' = '
  'guru mengganti sendiri lewat /admin/profil (lihat juga password_diganti_at). '
  '''tidak_diketahui'' = HANYA dari backfill migrasi 0017 untuk akun yang '
  'sudah ada sebelumnya dan riwayatnya tidak tercatat — jangan diperlakukan '
  'sebagai ''awal''. Dipakai unduhan detail guru (/admin/guru) untuk '
  'memutuskan apakah kolom Password boleh menuliskan guru123456.';

-- Cek hasil backfill:
--
--   select password_status, count(*) from guru group by password_status;
--
--   select nama, nip, username, password_status, password_diganti_at
--     from guru
--    order by password_status, nama;
