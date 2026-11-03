-- 0025_ai_kuota_BATAL.sql
-- Membatalkan 0025_ai_kuota.sql. Jalankan di project yang ingin dibatalkan.
-- PERHATIAN: riwayat kuota & permintaan ikut terhapus, dan nama paket di
-- bank_soal hilang (soalnya sendiri tetap ada).
-- Setelah dibatalkan, guru biasa tidak bisa memakai Buat Soal AI sampai
-- 0025 dijalankan lagi (admin tetap bisa).

drop function if exists ai_putuskan_permintaan(uuid, boolean, date, text);
drop function if exists ai_pakai_sesi(uuid, uuid);
drop function if exists ai_pakai_kuota(uuid, date);
drop table if exists ai_permintaan_kuota;
drop table if exists ai_sesi_generate;
drop table if exists ai_kuota_harian;

do $$
begin
  if to_regclass('public.bank_soal') is not null then
    alter table bank_soal drop column if exists paket_nama;
  end if;
end $$;

-- CEK AKHIR — harus menghasilkan 0 baris
select 'tabel ' || t || ' masih ada' as masalah
from unnest(array['ai_kuota_harian', 'ai_sesi_generate', 'ai_permintaan_kuota']) as t
where to_regclass('public.' || t) is not null
union all
select 'fungsi ' || f || ' masih ada'
from unnest(array['ai_pakai_kuota', 'ai_pakai_sesi', 'ai_putuskan_permintaan']) as f
where exists (select 1 from pg_proc where proname = f)
union all
select 'kolom bank_soal.paket_nama masih ada'
where exists (
  select 1 from information_schema.columns
   where table_schema = 'public' and table_name = 'bank_soal'
     and column_name = 'paket_nama'
);
