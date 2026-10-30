-- 0024_checkout_ujian_BATAL.sql
-- Membatalkan 0024_checkout_ujian.sql. Jalankan di project yang ingin
-- dibatalkan. Aman dijalankan berulang.
--
-- YANG HILANG: seluruh catatan checkout siswa di project ini. Jawaban dan
-- nilai tidak tersentuh.

drop function if exists public.checkout_ujian_siswa(uuid, boolean);
drop function if exists public.get_checkout_siswa();
drop table if exists public.checkout_ujian;
alter table public.mapel drop column if exists checkout_wajib;

-- CEK AKHIR — harus menghasilkan 0 baris
select masalah from (
  select 'fungsi ' || p.proname || ' masih ada' as masalah
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('checkout_ujian_siswa', 'get_checkout_siswa')
  union all
  select 'tabel checkout_ujian masih ada'
   where to_regclass('public.checkout_ujian') is not null
  union all
  select 'kolom mapel.checkout_wajib masih ada'
   where exists (
     select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'mapel'
        and column_name = 'checkout_wajib')
) cek;
