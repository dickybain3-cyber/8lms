-- 0005_rls_policies.sql
-- Helper functions (security definer, jadi bebas dari RLS tabel yang mereka
-- baca sendiri — supaya tidak terjadi RLS-checking-RLS yang berputar) +
-- kebijakan RLS untuk semua tabel.

create or replace function is_guru()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from guru where auth_id = auth.uid());
$$;

create or replace function current_siswa_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from siswa where auth_id = auth.uid();
$$;

create or replace function current_siswa_kelas_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select kelas_id from siswa where auth_id = auth.uid();
$$;

alter table kelas enable row level security;
alter table guru enable row level security;
alter table siswa enable row level security;
alter table event enable row level security;
alter table mapel enable row level security;
alter table mapel_kelas enable row level security;
alter table soal enable row level security;
alter table jawaban_siswa enable row level security;
alter table nilai enable row level security;

-- kelas: referensi umum, boleh dibaca siapa saja yang sudah login.
create policy kelas_select_authenticated on kelas
  for select using (auth.uid() is not null);
create policy kelas_write_guru on kelas
  for all using (is_guru()) with check (is_guru());

-- guru: guru bisa lihat sesama guru (atribusi "dibuat oleh"); insert/update
-- akun guru sengaja TIDAK dibuka lewat RLS — dikelola lewat service role
-- (provisioning akun guru, di luar scope RLS anon/authenticated).
create policy guru_select_guru on guru
  for select using (is_guru());

-- siswa: siswa baca data dirinya sendiri; guru baca semua siswa (perlu
-- untuk statistik & daftar kelas). Insert akun siswa lewat service role.
create policy siswa_select_own on siswa
  for select using (auth_id = auth.uid());
create policy siswa_select_guru on siswa
  for select using (is_guru());

-- event: guru penuh; siswa hanya event yang jenjangnya (kelas_utama) sama
-- dengan tingkat kelas mereka sendiri.
create policy event_all_guru on event
  for all using (is_guru()) with check (is_guru());
create policy event_select_siswa on event
  for select using (
    kelas_utama = (select tingkat from kelas where id = current_siswa_kelas_id())
  );

-- mapel: guru penuh; siswa hanya mapel yang ditarget ke kelas mereka
-- (lewat mapel_kelas) — terlepas dari jam mulai, supaya "dimulai jam ..."
-- bisa ditampilkan sebelum waktunya. Akses ke SOAL (bukan metadata mapel)
-- yang baru dibatasi jam mulai, lihat kebijakan `soal` di bawah.
create policy mapel_all_guru on mapel
  for all using (is_guru()) with check (is_guru());
create policy mapel_select_siswa on mapel
  for select using (
    exists (
      select 1 from mapel_kelas mk
      where mk.mapel_id = mapel.id
        and mk.kelas_id = current_siswa_kelas_id()
    )
  );

-- mapel_kelas: guru penuh; siswa boleh baca baris kelasnya sendiri (perlu
-- untuk join di atas & di client).
create policy mapel_kelas_all_guru on mapel_kelas
  for all using (is_guru()) with check (is_guru());
create policy mapel_kelas_select_siswa on mapel_kelas
  for select using (kelas_id = current_siswa_kelas_id());

-- soal: HANYA guru yang boleh SELECT langsung dari tabel ini.
-- Siswa TIDAK diberi policy SELECT di sini secara sengaja — konten_jsonb
-- soal menyimpan kunci jawaban (field "benar"/"jawaban_benar"/dst), jadi
-- kalau siswa bisa SELECT langsung, kunci jawaban bocor ke client biarpun
-- UI tidak menampilkannya. Siswa mengambil soal lewat RPC
-- `get_soal_untuk_siswa()` (lihat 0006_soal_siswa_rpc.sql) yang men-strip
-- kunci jawaban sebelum data keluar dari database.
create policy soal_all_guru on soal
  for all using (is_guru()) with check (is_guru());

-- jawaban_siswa: siswa hanya boleh baca/tulis barisnya sendiri, dan hanya
-- selama mapel sedang berlangsung serta belum submit final. Guru read-only
-- (untuk statistik/koreksi), tidak boleh menulis jawaban siswa.
create policy jawaban_select_own on jawaban_siswa
  for select using (siswa_id = current_siswa_id());
create policy jawaban_select_guru on jawaban_siswa
  for select using (is_guru());
create policy jawaban_insert_own on jawaban_siswa
  for insert with check (
    siswa_id = current_siswa_id()
    and exists (
      select 1 from mapel m
      where m.id = jawaban_siswa.mapel_id
        and now() between m.waktu_mulai and m.waktu_selesai
    )
  );
create policy jawaban_update_own on jawaban_siswa
  for update using (
    siswa_id = current_siswa_id()
    and submitted_at is null
  ) with check (
    siswa_id = current_siswa_id()
  );

-- nilai: guru penuh (diisi sistem koreksi otomatis di sesi berikutnya);
-- siswa hanya boleh baca nilainya sendiri.
create policy nilai_all_guru on nilai
  for all using (is_guru()) with check (is_guru());
create policy nilai_select_own on nilai
  for select using (siswa_id = current_siswa_id());
