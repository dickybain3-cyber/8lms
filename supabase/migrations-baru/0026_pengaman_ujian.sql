-- 0026_pengaman_ujian.sql
-- Jalankan di KETIGA project (kelas 7, 8, dan 9). Isinya identik.
-- Prasyarat: 0011_ujian_pro.sql (kolom jawaban_siswa.mulai_at).
-- Aman dijalankan berulang (idempoten). Pembatalan: 0026_pengaman_ujian_BATAL.sql
--
-- =============================================================================
-- APA INI
-- =============================================================================
-- Pengganti aplikasi ujian (exambrowser) untuk siswa yang membuka ujian lewat
-- browser biasa. Halaman ujian meminta layar penuh; keluar dari layar penuh,
-- pindah aplikasi, atau membagi layar (split screen) dicatat sebagai
-- pelanggaran. Pelanggaran ke-3 mengunci ujian. Kunci dibuka dengan kode
-- pengaman 6 angka yang berganti tiap 5 menit, dilihat admin di menu
-- "Kode Pengaman".
--
-- =============================================================================
-- KEPUTUSAN DESAIN
-- =============================================================================
-- 1. Kode TIDAK pernah dikirim ke siswa. Kode dihitung di database dari
--    rahasia acak per project + nomor slot 5 menit. Tiap project membuat
--    rahasianya sendiri saat migrasi ini pertama jalan, jadi kode kelas 7,
--    8, dan 9 selalu berbeda walau berkas SQL-nya identik.
-- 2. Kode slot sebelumnya masih diterima. Admin yang membacakan kode di
--    detik terakhir slot tidak membuat siswa gagal. Masa berlaku efektif
--    5-10 menit.
-- 3. Hitungan pelanggaran di tabel sendiri, ditulis hanya lewat RPC.
--    Refresh halaman, hapus data browser, atau pindah HP tidak membuka kunci.
-- 4. Salah kode 5 kali dalam 1 menit = tunggu 1 menit. Menebak 6 angka
--    lewat DevTools jadi tidak praktis (maks ~50 tebakan per masa kode).
-- 5. FK ke jawaban_siswa ON DELETE CASCADE: reset ujian ikut menghapus
--    catatan pelanggaran, tanpa mengubah jalur reset yang sudah ada.
-- 6. Batas 3 di sini harus sama dengan BATAS_PERINGATAN di
--    src/lib/pengawasan-ujian.ts. Jeda 5 menit harus sama dengan
--    MENIT_KODE_PENGAMAN di file yang sama.

-- -----------------------------------------------------------------------------
-- Rahasia per project (satu baris). Tanpa policy dan tanpa grant: hanya
-- fungsi security definer di bawah yang bisa membacanya.
-- -----------------------------------------------------------------------------
create table if not exists pengaman_ujian_rahasia (
  id boolean primary key default true check (id),
  rahasia text not null,
  dibuat_at timestamptz not null default now()
);

insert into pengaman_ujian_rahasia (id, rahasia)
values (
  true,
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
)
on conflict (id) do nothing;

alter table pengaman_ujian_rahasia enable row level security;
revoke all on table pengaman_ujian_rahasia from anon, authenticated;

comment on table pengaman_ujian_rahasia is
  'Rahasia acak per project untuk kode pengaman ujian. Jangan dibaca/dibagikan.';

-- -----------------------------------------------------------------------------
-- Catatan pelanggaran per siswa per mapel
-- -----------------------------------------------------------------------------
create table if not exists pelanggaran_ujian (
  siswa_id uuid not null,
  mapel_id uuid not null,
  jumlah integer not null default 0,
  terkunci boolean not null default false,
  jenis_terakhir text,
  pelanggaran_terakhir_at timestamptz,
  dibuka_at timestamptz,
  gagal_kode integer not null default 0,
  gagal_kode_at timestamptz,
  primary key (siswa_id, mapel_id),
  constraint pelanggaran_ujian_jawaban_fk
    foreign key (siswa_id, mapel_id)
    references jawaban_siswa (siswa_id, mapel_id)
    on delete cascade
);

create index if not exists idx_pelanggaran_ujian_mapel_id
  on pelanggaran_ujian (mapel_id);

comment on table pelanggaran_ujian is
  'Pelanggaran layar penuh/pindah aplikasi/layar terbagi. Ditulis hanya lewat '
  'RPC catat_pelanggaran_ujian dan buka_kunci_pelanggaran.';

alter table pelanggaran_ujian enable row level security;
revoke all on table pelanggaran_ujian from anon, authenticated;
grant select on table pelanggaran_ujian to authenticated;

drop policy if exists pelanggaran_select_guru on pelanggaran_ujian;
create policy pelanggaran_select_guru on pelanggaran_ujian
  for select using (is_guru());

drop policy if exists pelanggaran_select_own on pelanggaran_ujian;
create policy pelanggaran_select_own on pelanggaran_ujian
  for select using (siswa_id = current_siswa_id());

-- -----------------------------------------------------------------------------
-- Kode untuk satu slot 5 menit. Internal: tidak boleh dipanggil siapa pun
-- selain fungsi lain di berkas ini.
-- -----------------------------------------------------------------------------
create or replace function kode_pengaman_slot(p_slot bigint)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select lpad(
    (
      ('x' || substr(encode(sha256(convert_to(r.rahasia || ':' || p_slot::text, 'UTF8')), 'hex'), 1, 7))
        ::bit(28)::integer % 1000000
    )::text,
    6,
    '0'
  )
  from pengaman_ujian_rahasia r
  where r.id;
$$;

create or replace function slot_kode_pengaman(p_at timestamptz)
returns bigint
language sql
immutable
as $$
  select floor(extract(epoch from p_at) / 300)::bigint;
$$;

-- Untuk halaman admin "Kode Pengaman". Dipanggil server Next.js dengan
-- service_role (fan-out ke 3 project), jadi hanya service_role yang boleh.
create or replace function get_kode_pengaman()
returns table (
  kode           text,
  berlaku_mulai  timestamptz,
  berlaku_sampai timestamptz,
  server_now     timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    kode_pengaman_slot(slot_kode_pengaman(now())),
    to_timestamp(slot_kode_pengaman(now()) * 300),
    to_timestamp((slot_kode_pengaman(now()) + 1) * 300),
    now();
$$;

-- -----------------------------------------------------------------------------
-- Siswa: catat satu pelanggaran
-- -----------------------------------------------------------------------------
-- Dua kejadian dalam 5 detik dihitung satu (keluar layar penuh biasanya
-- disusul blur/visibilitychange). Klien juga menyaring, ini lapis kedua.
create or replace function catat_pelanggaran_ujian(
  p_mapel_id uuid,
  p_jenis text
)
returns table (jumlah integer, terkunci boolean)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_siswa_id uuid;
  v_selesai  timestamptz;
  v_row      pelanggaran_ujian%rowtype;
begin
  v_siswa_id := current_siswa_id();
  if v_siswa_id is null then
    raise exception 'Hanya siswa yang bisa dicatat.';
  end if;
  if p_jenis is null or p_jenis not in ('keluar_layar_penuh', 'pindah_aplikasi', 'layar_terbagi') then
    raise exception 'Jenis pelanggaran tidak dikenal.';
  end if;

  select m.waktu_selesai into v_selesai
  from jawaban_siswa js
  join mapel m on m.id = js.mapel_id
  where js.siswa_id = v_siswa_id
    and js.mapel_id = p_mapel_id
    and js.mulai_at is not null
    and js.submitted_at is null;

  if not found then
    raise exception 'Ujian ini tidak sedang kamu kerjakan.';
  end if;
  if now() > v_selesai + interval '1 minute' then
    raise exception 'Ujian sudah ditutup.';
  end if;

  insert into pelanggaran_ujian (siswa_id, mapel_id)
  values (v_siswa_id, p_mapel_id)
  on conflict (siswa_id, mapel_id) do nothing;

  select * into v_row
  from pelanggaran_ujian p
  where p.siswa_id = v_siswa_id and p.mapel_id = p_mapel_id
  for update;

  if v_row.pelanggaran_terakhir_at is null
     or v_row.pelanggaran_terakhir_at < now() - interval '5 seconds' then
    update pelanggaran_ujian p
       set jumlah = p.jumlah + 1,
           terkunci = p.terkunci or p.jumlah + 1 >= 3,
           jenis_terakhir = p_jenis,
           pelanggaran_terakhir_at = now()
     where p.siswa_id = v_siswa_id and p.mapel_id = p_mapel_id
    returning * into v_row;
  end if;

  return query select v_row.jumlah, v_row.terkunci;
end;
$$;

-- -----------------------------------------------------------------------------
-- Siswa: buka kunci dengan kode pengaman
-- -----------------------------------------------------------------------------
create or replace function buka_kunci_pelanggaran(
  p_mapel_id uuid,
  p_kode text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_siswa_id uuid;
  v_row      pelanggaran_ujian%rowtype;
  v_slot     bigint;
  v_kode     text;
begin
  v_siswa_id := current_siswa_id();
  if v_siswa_id is null then
    raise exception 'Hanya siswa yang bisa membuka kunci.';
  end if;

  if not exists (
    select 1 from jawaban_siswa js
     where js.siswa_id = v_siswa_id
       and js.mapel_id = p_mapel_id
       and js.mulai_at is not null
  ) then
    raise exception 'Kamu belum memulai ujian ini.';
  end if;

  insert into pelanggaran_ujian (siswa_id, mapel_id)
  values (v_siswa_id, p_mapel_id)
  on conflict (siswa_id, mapel_id) do nothing;

  select * into v_row
  from pelanggaran_ujian p
  where p.siswa_id = v_siswa_id and p.mapel_id = p_mapel_id
  for update;

  if v_row.gagal_kode >= 5 and v_row.gagal_kode_at > now() - interval '1 minute' then
    raise exception 'Terlalu banyak kode salah. Tunggu 1 menit lalu coba lagi.';
  end if;

  v_kode := regexp_replace(coalesce(p_kode, ''), '\s', '', 'g');
  v_slot := slot_kode_pengaman(now());

  if v_kode <> '' and v_kode in (kode_pengaman_slot(v_slot), kode_pengaman_slot(v_slot - 1)) then
    update pelanggaran_ujian p
       set terkunci = false,
           dibuka_at = now(),
           gagal_kode = 0,
           gagal_kode_at = null
     where p.siswa_id = v_siswa_id and p.mapel_id = p_mapel_id;
    return true;
  end if;

  update pelanggaran_ujian p
     set gagal_kode = case
           when p.gagal_kode_at is null or p.gagal_kode_at < now() - interval '1 minute' then 1
           else p.gagal_kode + 1
         end,
         gagal_kode_at = now()
   where p.siswa_id = v_siswa_id and p.mapel_id = p_mapel_id;
  return false;
end;
$$;

revoke all on function kode_pengaman_slot(bigint) from public, anon, authenticated;
revoke all on function get_kode_pengaman() from public, anon, authenticated;
grant execute on function get_kode_pengaman() to service_role;
revoke all on function catat_pelanggaran_ujian(uuid, text) from public, anon;
revoke all on function buka_kunci_pelanggaran(uuid, text) from public, anon;
grant execute on function catat_pelanggaran_ujian(uuid, text) to authenticated;
grant execute on function buka_kunci_pelanggaran(uuid, text) to authenticated;

-- CEK AKHIR — harus menghasilkan 0 baris
select masalah from (
  select 'rahasia kode pengaman belum ada' as masalah
   where not exists (select 1 from pengaman_ujian_rahasia where id and length(rahasia) >= 32)
  union all
  select 'RLS pelanggaran_ujian belum aktif'
   where not exists (
     select 1 from pg_class
      where oid = 'public.pelanggaran_ujian'::regclass and relrowsecurity)
  union all
  select 'FK cascade ke jawaban_siswa belum ada'
   where not exists (
     select 1 from pg_constraint
      where conname = 'pelanggaran_ujian_jawaban_fk' and confdeltype = 'c')
  union all
  select 'siswa/guru masih bisa menulis langsung ke pelanggaran_ujian'
   where has_table_privilege('authenticated', 'public.pelanggaran_ujian', 'INSERT')
      or has_table_privilege('authenticated', 'public.pelanggaran_ujian', 'UPDATE')
      or has_table_privilege('authenticated', 'public.pelanggaran_ujian', 'DELETE')
  union all
  select 'rahasia masih bisa dibaca siswa/guru'
   where has_table_privilege('authenticated', 'public.pengaman_ujian_rahasia', 'SELECT')
      or has_table_privilege('anon', 'public.pengaman_ujian_rahasia', 'SELECT')
  union all
  select 'siswa/guru masih bisa meminta kode langsung'
   where has_function_privilege('authenticated', 'public.get_kode_pengaman()', 'EXECUTE')
      or has_function_privilege('authenticated', 'public.kode_pengaman_slot(bigint)', 'EXECUTE')
      or has_function_privilege('anon', 'public.get_kode_pengaman()', 'EXECUTE')
      or has_function_privilege('anon', 'public.kode_pengaman_slot(bigint)', 'EXECUTE')
  union all
  select 'anon masih bisa memanggil RPC pelanggaran'
   where has_function_privilege('anon', 'public.catat_pelanggaran_ujian(uuid, text)', 'EXECUTE')
      or has_function_privilege('anon', 'public.buka_kunci_pelanggaran(uuid, text)', 'EXECUTE')
  union all
  select 'kode pengaman bukan 6 angka'
   where (select kode from get_kode_pengaman()) !~ '^[0-9]{6}$'
) cek;
