-- seed-kelas8.sql — untuk project Supabase KELAS 8.
insert into kelas (tingkat, nama) values
  (8, '8.1'), (8, '8.2'), (8, '8.3'), (8, '8.4'), (8, '8.5'), (8, '8.6');

-- insert into guru (auth_id, nama) values ('<uuid-dari-auth.users>', 'Bu Sari');
-- insert into siswa (auth_id, nama, kelas_id, username)
--   values ('<uuid>', 'Nama Siswa', (select id from kelas where nama = '8.1'), 'username');
