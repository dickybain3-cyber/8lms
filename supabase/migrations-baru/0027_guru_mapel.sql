-- 0027_guru_mapel.sql
-- Kolom mata pelajaran yang diampu guru (diisi dari impor Excel / form
-- manual di /admin/guru, pilihan tetap DAFTAR_MAPEL di src/lib/akun-impor.ts).
--
-- Jalankan di KETIGA project (kelas 7, 8, 9). Idempoten: aman diulang.
-- Aplikasi tetap jalan sebelum migrasi ini (mapel diabaikan dengan aman).
-- Pembatalan: 0027_guru_mapel_BATAL.sql

alter table guru
  add column if not exists mapel text;

comment on column guru.mapel is
  'Mata pelajaran yang diampu (ejaan tetap dari DAFTAR_MAPEL aplikasi). NULL = belum diisi.';

-- CEK AKHIR — harus menghasilkan 0 baris
select 'kolom guru.mapel belum ada' as masalah
where not exists (
  select 1
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'guru'
    and column_name = 'mapel'
);
