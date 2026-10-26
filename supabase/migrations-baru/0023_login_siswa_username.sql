-- 0023_login_siswa_username.sql
-- Jalankan di KETIGA project (kelas 7, 8, dan 9). Isinya identik.
-- Prasyarat: 0001-0022. Aman dijalankan berulang (idempoten).
-- Pembatalan: 0023_login_siswa_username_BATAL.sql
--
-- =============================================================================
-- APA INI
-- =============================================================================
-- Login siswa diganti dari "pilih nama + tanggal" menjadi USERNAME + PASSWORD:
--
--   username = dari nama, pendek   mis. "rizki", "rizkip", "rizki2"
--   password = 3 huruf + 3 angka   mis. "kmr482"
--
-- Aturan pembentukannya SAMA PERSIS dengan src/lib/akun.ts
-- (usernameDasarDariNama, kandidatUsernameSiswa, buatPasswordSiswa). Kalau
-- salah satu diubah, ubah keduanya.
--
-- Isi file ini:
--   1. siswa.auth_id boleh kosong: baris siswa boleh di-insert lewat SQL dulu,
--      akun loginnya dibuat belakangan oleh siapkan_akun_siswa().
--   2. Trigger: insert siswa TANPA username -> username otomatis dari nama.
--   3. siapkan_akun_siswa(): membuat / mereset akun login siswa lalu
--      MENAMPILKAN daftar username + password.
--   4. RPC get_siswa_untuk_pilih_nama ditutup untuk anon/authenticated:
--      daftar nama siswa tidak lagi terbuka di halaman login.
--
-- =============================================================================
-- CARA PAKAI (setelah file ini dijalankan)
-- =============================================================================
-- Jalankan di LUAR jam ujian: sesi login lama siswa yang diproses ikut
-- diputus, jadi semua siswa itu harus masuk ulang dengan akun barunya.
--
--   -- 1) Semua siswa yang belum punya akun username + password:
--   select * from siapkan_akun_siswa();
--
--   -- Hanya satu kelas:
--   select * from siapkan_akun_siswa(p_kelas => '7.1');
--
--   -- Buat ulang SEMUA akun (password lama hangus, username dibentuk ulang):
--   select * from siapkan_akun_siswa(p_ulang => true);
--
--   -- Reset password saja, username yang sudah ada dipertahankan:
--   select * from siapkan_akun_siswa(p_ulang => true, p_pertahankan_username => true);
--
-- Hasilnya tabel: kelas | nama | username | password.
-- SIMPAN SEKARANG (tombol Export > CSV di SQL Editor): password hanya
-- tersimpan sebagai hash setelah ini, tidak bisa dilihat lagi. Kalau hilang,
-- jalankan ulang untuk kelas itu dengan p_ulang => true.
--
-- Menjalankan ulang TANPA p_ulang aman: akun yang sudah dibuat (dari SQL ini
-- maupun dari panel admin /admin/siswa) tidak disentuh.
--
--   -- 2) Menambah siswa baru lewat SQL, lalu buatkan akunnya:
--   insert into siswa (nama, kelas_id)
--   select 'Ahmad Fauzi', id from kelas where nama = '7.1';
--   select * from siapkan_akun_siswa();

create extension if not exists pgcrypto with schema extensions;

-- =============================================================================
-- 1. auth_id boleh kosong
-- =============================================================================
alter table siswa alter column auth_id drop not null;

comment on column siswa.username is
  'Username login siswa (dibentuk dari nama, lihat lms_username_dasar). Akun '
  'Supabase Auth-nya ber-email "{username}{NEXT_PUBLIC_SISWA_EMAIL_SUFFIX}".';

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'siswa'
                and column_name = 'tanggal_lahir') then
    comment on column siswa.tanggal_lahir is
      'Tanggal lahir siswa. Sejak 0023 TIDAK lagi dipakai untuk login.';
  end if;
end;
$$;

-- =============================================================================
-- 2. Aturan username & password (cermin src/lib/akun.ts)
-- =============================================================================

-- Nama -> {dasar, inisial}. "Muhammad Rizki Pratama" -> {rizki, p}.
create or replace function public.lms_username_dasar(p_nama text)
returns text[]
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  awalan constant text[] := array[
    'muhammad', 'muhamad', 'muhammat', 'mohammad', 'mohamad', 'mohammed',
    'muhammed', 'mochammad', 'mochamad', 'mochamat', 'moch', 'moh', 'muh',
    'mhd', 'mohd', 'md', 'm', 'siti'
  ];
  kata text[];
  n int;
  i int := 1;
  dasar text := '';
  inisial text := '';
begin
  kata := array_remove(
    regexp_split_to_array(
      regexp_replace(lower(coalesce(p_nama, '')), '[''`’]', '', 'g'),
      '[^a-z]+'
    ),
    ''
  );
  n := coalesce(array_length(kata, 1), 0);
  if n = 0 then
    return array['siswa', ''];
  end if;

  while i < n and kata[i] = any (awalan) loop
    i := i + 1;
  end loop;

  while i <= n and length(dasar) < 3 loop
    dasar := dasar || kata[i];
    i := i + 1;
  end loop;
  dasar := left(dasar, 8);

  while i <= n and length(inisial) < 2 loop
    inisial := inisial || left(kata[i], 1);
    i := i + 1;
  end loop;

  return array[dasar, inisial];
end;
$$;

-- 3 huruf kecil (tanpa i, l, o) + 3 angka, acak kriptografis. Mis. "kmr482".
create or replace function public.lms_password_siswa()
returns text
language plpgsql
volatile
set search_path = public, extensions, pg_temp
as $$
declare
  huruf constant text := 'abcdefghjkmnpqrstuvwxyz';
  b bytea := gen_random_bytes(12);
  hasil text := '';
begin
  for k in 0..2 loop
    hasil := hasil || substr(huruf, 1 + (get_byte(b, 2 * k) * 256 + get_byte(b, 2 * k + 1)) % 23, 1);
  end loop;
  for k in 3..5 loop
    hasil := hasil || ((get_byte(b, 2 * k) * 256 + get_byte(b, 2 * k + 1)) % 10)::text;
  end loop;
  return hasil;
end;
$$;

-- Suffix email siswa yang dipakai project ini: diambil dari akun siswa yang
-- sudah ada (= nilai NEXT_PUBLIC_SISWA_EMAIL_SUFFIX saat akun itu dibuat).
create or replace function public.lms_suffix_email_siswa()
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(
    (select lower(substring(u.email from '@.*$'))
       from siswa s
       join auth.users u on u.id = s.auth_id
      where u.email like '%@%'
      group by 1
      order by count(*) desc
      limit 1),
    '@siswa.lms-cbt.local'
  );
$$;

-- Username belum dipakai siswa lain DAN email-nya belum dipakai akun auth lain.
create or replace function public.lms_username_bebas(
  p_username text,
  p_siswa_id uuid,
  p_auth_id uuid,
  p_suffix text
)
returns boolean
language sql
set search_path = public, pg_temp
as $$
  select not exists (
           select 1 from siswa s
            where lower(s.username) = p_username
              and s.id is distinct from p_siswa_id)
     and not exists (
           select 1 from auth.users u
            where lower(u.email) = p_username || p_suffix
              and u.id is distinct from p_auth_id);
$$;

-- Calon pertama yang bebas: "rizki", "rizkip", "rizki2", "rizki3", ...
create or replace function public.lms_username_siswa(
  p_nama text,
  p_siswa_id uuid default null,
  p_auth_id uuid default null,
  p_suffix text default null
)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  d text[] := lms_username_dasar(p_nama);
  v_suffix text := coalesce(lower(p_suffix), lms_suffix_email_siswa());
  calon text;
begin
  if lms_username_bebas(d[1], p_siswa_id, p_auth_id, v_suffix) then
    return d[1];
  end if;
  if d[2] <> '' and lms_username_bebas(d[1] || d[2], p_siswa_id, p_auth_id, v_suffix) then
    return d[1] || d[2];
  end if;
  for n in 2..999 loop
    calon := d[1] || n;
    if lms_username_bebas(calon, p_siswa_id, p_auth_id, v_suffix) then
      return calon;
    end if;
  end loop;
  raise exception 'Tidak ada username tersisa untuk nama %', p_nama;
end;
$$;

-- =============================================================================
-- 3. Trigger: insert siswa tanpa username -> otomatis dari nama
-- =============================================================================
create or replace function public.lms_isi_username_siswa()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.username is null or btrim(new.username) = '' then
    new.username := lms_username_siswa(new.nama, new.id, new.auth_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_siswa_isi_username on siswa;
create trigger trg_siswa_isi_username
  before insert on siswa
  for each row execute function lms_isi_username_siswa();

-- =============================================================================
-- 4. siapkan_akun_siswa(): buat / reset akun dan tampilkan password-nya
-- =============================================================================
-- Siswa yang diproses: yang belum punya akun auth, atau akunnya belum bertanda
-- login username (raw_app_meta_data.lms_login = 'username' — tanda yang sama
-- dipasang panel admin, lihat PENANDA_AKUN_SISWA di src/lib/akun.ts).
-- p_ulang => true memproses semua siswa (dalam p_kelas kalau diisi).
--
-- Akun auth ditulis langsung ke auth.users (hash bcrypt dari pgcrypto, sama
-- dengan yang dipakai Supabase Auth), jadi syarat panjang password di setelan
-- Authentication tidak berlaku untuk jalur ini.
create or replace function public.siapkan_akun_siswa(
  p_kelas text default null,
  p_ulang boolean default false,
  p_pertahankan_username boolean default false,
  p_suffix text default null
)
returns table (kelas text, nama text, username text, password text)
language plpgsql
set search_path = public, extensions, pg_temp
as $$
#variable_conflict use_column
declare
  v_suffix text := coalesce(nullif(lower(btrim(p_suffix)), ''), lms_suffix_email_siswa());
  r record;
  v_username text;
  v_password text;
  v_email text;
  v_uid uuid;
begin
  if left(v_suffix, 1) <> '@' then
    raise exception 'p_suffix harus diawali "@", mis. ''@siswa.lms-cbt.local''';
  end if;

  for r in
    select s.id,
           s.nama      as s_nama,
           s.username  as s_username,
           k.nama      as k_nama,
           u.id        as u_id
      from siswa s
      join kelas k on k.id = s.kelas_id
      left join auth.users u on u.id = s.auth_id
     where (p_kelas is null or k.nama = p_kelas)
       and (p_ulang
            or u.id is null
            or coalesce(u.raw_app_meta_data ->> 'lms_login', '') <> 'username')
     order by k.nama, s.nama
       for update of s
  loop
    v_username := null;
    if p_pertahankan_username then
      v_username := nullif(regexp_replace(lower(coalesce(r.s_username, '')), '[^a-z0-9._-]', '', 'g'), '');
      if v_username is not null
         and not lms_username_bebas(v_username, r.id, r.u_id, v_suffix) then
        v_username := null;
      end if;
    end if;
    if v_username is null then
      v_username := lms_username_siswa(r.s_nama, r.id, r.u_id, v_suffix);
    end if;

    v_email := v_username || v_suffix;
    v_password := lms_password_siswa();

    if r.u_id is not null then
      v_uid := r.u_id;
      update auth.users
         set email = v_email,
             encrypted_password = crypt(v_password, gen_salt('bf', 10)),
             email_confirmed_at = coalesce(email_confirmed_at, now()),
             raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                                 || jsonb_build_object('lms_login', 'username'),
             updated_at = now()
       where id = v_uid;

      update auth.identities
         set identity_data = identity_data
                             || jsonb_build_object('email', v_email, 'email_verified', true),
             updated_at = now()
       where user_id = v_uid
         and provider = 'email';

      -- Putus sesi lama (dibuat dengan login tanggal lahir): refresh token
      -- ikut terhapus lewat cascade, akses berakhir paling lambat saat JWT
      -- yang sedang dipegang kedaluwarsa (bawaan 1 jam).
      delete from auth.sessions where user_id = v_uid;
    else
      v_uid := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change
      ) values (
        '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
        v_email, crypt(v_password, gen_salt('bf', 10)),
        now(),
        jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'),
                           'lms_login', 'username'),
        jsonb_build_object('username', v_username),
        now(), now(),
        '', '', '', ''
      );
    end if;

    if not exists (select 1 from auth.identities i where i.user_id = v_uid and i.provider = 'email') then
      insert into auth.identities (provider_id, user_id, identity_data, provider,
                                   last_sign_in_at, created_at, updated_at)
      values (v_uid::text, v_uid,
              jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true),
              'email', now(), now(), now());
    end if;

    update siswa set username = v_username, auth_id = v_uid where id = r.id;

    kelas := r.k_nama;
    nama := r.s_nama;
    username := v_username;
    password := v_password;
    return next;
  end loop;
end;
$$;

comment on function public.siapkan_akun_siswa(text, boolean, boolean, text) is
  'Buat/reset akun login siswa (username dari nama + password 3 huruf 3 angka) '
  'dan tampilkan daftarnya SEKALI. Hanya untuk SQL Editor, tidak bisa dipanggil '
  'anon/authenticated. Lihat 0023_login_siswa_username.sql.';

-- Hanya untuk SQL Editor (postgres): tutup dari PostgREST.
revoke all on function public.lms_username_dasar(text) from public, anon, authenticated;
revoke all on function public.lms_password_siswa() from public, anon, authenticated;
revoke all on function public.lms_suffix_email_siswa() from public, anon, authenticated;
revoke all on function public.lms_username_bebas(text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.lms_username_siswa(text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.lms_isi_username_siswa() from public, anon, authenticated;
revoke all on function public.siapkan_akun_siswa(text, boolean, boolean, text) from public, anon, authenticated;

-- =============================================================================
-- 5. Daftar nama siswa tidak lagi terbuka untuk umum
-- =============================================================================
do $$
begin
  if to_regprocedure('public.get_siswa_untuk_pilih_nama(text)') is not null then
    revoke execute on function public.get_siswa_untuk_pilih_nama(text) from public, anon, authenticated;
  end if;
end;
$$;

-- =============================================================================
-- CEK AKHIR — harus menghasilkan 0 baris
-- =============================================================================
select masalah from (
  select 'pgcrypto belum terpasang' as masalah
   where not exists (select 1 from pg_extension where extname = 'pgcrypto')
  union all
  select 'siswa.auth_id masih NOT NULL'
   where exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'siswa'
                    and column_name = 'auth_id' and is_nullable = 'NO')
  union all
  select 'fungsi siapkan_akun_siswa belum ada'
   where to_regprocedure('public.siapkan_akun_siswa(text,boolean,boolean,text)') is null
  union all
  select 'trigger trg_siswa_isi_username belum ada'
   where not exists (select 1 from pg_trigger
                      where tgname = 'trg_siswa_isi_username'
                        and tgrelid = 'public.siswa'::regclass)
  union all
  select 'role ' || r.rolname || ' masih bisa memanggil siapkan_akun_siswa'
    from pg_roles r
   where r.rolname in ('anon', 'authenticated')
     and has_function_privilege(r.oid, to_regprocedure('public.siapkan_akun_siswa(text,boolean,boolean,text)'), 'execute')
  union all
  select 'role ' || r.rolname || ' masih bisa membaca daftar nama (get_siswa_untuk_pilih_nama)'
    from pg_roles r
   where r.rolname in ('anon', 'authenticated')
     and has_function_privilege(r.oid, to_regprocedure('public.get_siswa_untuk_pilih_nama(text)'), 'execute')
  union all
  select 'lms_username_dasar tidak sama dengan src/lib/akun.ts untuk "' || c.nama || '"'
    from (values
      ('Muhammad Rizki Pratama', array['rizki', 'p']),
      ('Siti Nur Aisyah',        array['nur', 'a']),
      ('Al Fatih Ramadhan',      array['alfatih', 'r']),
      ('Ma''ruf Amin',           array['maruf', 'a']),
      ('Kurniawati Dwi Lestari', array['kurniawa', 'dl']),
      ('Muhammad',               array['muhammad', '']),
      ('',                       array['siswa', ''])
    ) as c(nama, harapan)
   where lms_username_dasar(c.nama) is distinct from c.harapan
  union all
  select 'lms_password_siswa tidak berpola 3 huruf + 3 angka'
   where lms_password_siswa() !~ '^[a-hj-km-np-z]{3}[0-9]{3}$'
) cek;
