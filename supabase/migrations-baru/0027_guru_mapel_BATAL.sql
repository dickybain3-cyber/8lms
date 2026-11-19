-- 0027_guru_mapel_BATAL.sql
-- Membatalkan 0027_guru_mapel.sql. PERHATIAN: isian mapel semua guru hilang.
-- Aplikasi tetap jalan tanpa kolom ini (mapel diabaikan).

alter table guru
  drop column if exists mapel;

-- CEK AKHIR — harus menghasilkan 0 baris
select 'kolom guru.mapel masih ada' as masalah
where exists (
  select 1
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'guru'
    and column_name = 'mapel'
);
