-- 0022_ai_kunci_BATAL.sql
-- Membatalkan 0022_ai_kunci.sql. Jalankan di project yang ingin dibatalkan.
-- PERHATIAN: semua kunci AI yang tersimpan di tabel ini ikut terhapus.
-- Fitur AI tetap bisa jalan kalau kunci dipasang lewat env GEMINI_API_KEYS_{7,8,9}.

drop table if exists ai_kunci;

-- CEK AKHIR — harus menghasilkan 0 baris
select 'tabel ai_kunci masih ada' as masalah
where to_regclass('public.ai_kunci') is not null;
