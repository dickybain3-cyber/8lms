-- seed-kelas7.sql — untuk project Supabase KELAS 7.
-- Beda dari migrasi (identik di ketiga project by design), file seed
-- ini SENGAJA cuma isi kelas 7.1-7.6 — project ini tidak akan pernah
-- punya siswa kelas 8/9, jadi tidak perlu baris kelas jenjang lain.

insert into kelas (tingkat, nama) values
  (7, '7.1'), (7, '7.2'), (7, '7.3'), (7, '7.4'), (7, '7.5'), (7, '7.6');

-- Contoh langkah lanjutan setelah bikin user lewat dashboard Supabase Auth
-- (Authentication > Users > Add user) di PROJECT KELAS 7 ini:
--
-- insert into guru (auth_id, nama)
--   values ('<uuid-dari-auth.users>', 'Bu Sari');
--
-- insert into siswa (auth_id, nama, kelas_id, username)
--   values (
--     '<uuid-dari-auth.users>',
--     'Ahmad Fauzi',
--     (select id from kelas where nama = '7.1'),
--     'ahmad.fauzi'
--   );
