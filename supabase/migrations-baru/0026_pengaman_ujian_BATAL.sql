-- 0026_pengaman_ujian_BATAL.sql
-- Membatalkan 0026_pengaman_ujian.sql. Jalankan di project yang ingin
-- dibatalkan. Aman dijalankan berulang.
--
-- YANG HILANG: seluruh catatan pelanggaran siswa dan rahasia kode pengaman
-- di project ini. Jawaban dan nilai tidak tersentuh. Kalau 0026 dijalankan
-- lagi, rahasia baru dibuat dan kodenya berbeda dari sebelumnya.

drop function if exists public.buka_kunci_pelanggaran(uuid, text);
drop function if exists public.catat_pelanggaran_ujian(uuid, text);
drop function if exists public.get_kode_pengaman();
drop function if exists public.slot_kode_pengaman(timestamptz);
drop function if exists public.kode_pengaman_slot(bigint);
drop table if exists public.pelanggaran_ujian;
drop table if exists public.pengaman_ujian_rahasia;

-- CEK AKHIR — harus menghasilkan 0 baris
select masalah from (
  select 'fungsi ' || p.proname || ' masih ada' as masalah
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('buka_kunci_pelanggaran', 'catat_pelanggaran_ujian',
                       'get_kode_pengaman', 'slot_kode_pengaman', 'kode_pengaman_slot')
  union all
  select 'tabel pelanggaran_ujian masih ada'
   where to_regclass('public.pelanggaran_ujian') is not null
  union all
  select 'tabel pengaman_ujian_rahasia masih ada'
   where to_regclass('public.pengaman_ujian_rahasia') is not null
) cek;
