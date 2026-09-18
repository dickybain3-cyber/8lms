-- seed-kelas9.sql — untuk project Supabase KELAS 9.
insert into kelas (tingkat, nama) values
  (9, '9.1'), (9, '9.2'), (9, '9.3'), (9, '9.4'), (9, '9.5'), (9, '9.6');

-- insert into guru (auth_id, nama) values ('<uuid-dari-auth.users>', 'Bu Sari');
-- insert into siswa (auth_id, nama, kelas_id, username)
--   values ('<uuid>', 'Nama Siswa', (select id from kelas where nama = '9.1'), 'username');
