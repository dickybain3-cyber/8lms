-- 0025_ai_kuota.sql
-- Jalankan di KETIGA project (kelas 7, 8, dan 9). Isinya identik.
-- Prasyarat: 0001 (tabel guru), 0014_bank_soal.sql (opsional: kolom paket_nama
-- hanya ditambahkan kalau tabel bank_soal sudah ada).
-- Aman dijalankan berulang (idempoten). Pembatalan: 0025_ai_kuota_BATAL.sql
--
-- =============================================================================
-- APA INI
-- =============================================================================
-- Kuota fitur "Buat Soal dengan AI": tiap guru boleh generate 1 kali per hari
-- (tanggal WIB). Kalau ingin lagi, guru mengajukan permintaan; admin
-- menyetujui (+1 kali untuk hari itu) atau menolak dari dashboard admin.
-- Akun admin (guru.is_admin) tidak dibatasi.
--
--   ai_kuota_harian      jatah & pemakaian per guru per tanggal
--   ai_sesi_generate     "tiket" satu kali generate. Satu generate terdiri
--                        dari beberapa panggilan batch ke /api/ai/soal; tiket
--                        membatasi jumlah panggilan itu supaya satu kuota
--                        tidak bisa dipakai berulang-ulang.
--   ai_permintaan_kuota  permintaan tambahan kuota dari guru ke admin
--   bank_soal.paket_nama nama kumpulan soal saat hasil AI disimpan ke bank
--
-- =============================================================================
-- KEAMANAN
-- =============================================================================
-- Ketiga tabel RLS AKTIF TANPA POLICY (pola sama dengan ai_kunci): guru tidak
-- bisa menambah jatahnya sendiri lewat DevTools. Semua baca/tulis lewat
-- service_role di server Next.js, dan fungsi di bawah hanya boleh dijalankan
-- service_role.

create table if not exists ai_kuota_harian (
  guru_id uuid not null references guru(id) on delete cascade,
  tanggal date not null,
  jatah int not null default 1 check (jatah >= 0),
  terpakai int not null default 0 check (terpakai >= 0),
  primary key (guru_id, tanggal)
);

create table if not exists ai_sesi_generate (
  id uuid primary key default gen_random_uuid(),
  guru_id uuid not null references guru(id) on delete cascade,
  maks_panggilan int not null check (maks_panggilan > 0),
  dipakai int not null default 0,
  dibuat_at timestamptz not null default now(),
  kedaluwarsa_at timestamptz not null
);
create index if not exists ai_sesi_generate_guru on ai_sesi_generate (guru_id, dibuat_at desc);

create table if not exists ai_permintaan_kuota (
  id uuid primary key default gen_random_uuid(),
  guru_id uuid not null references guru(id) on delete cascade,
  guru_nama text,
  alasan text,
  tanggal date not null,
  status text not null default 'menunggu',
  dibuat_at timestamptz not null default now(),
  diputus_at timestamptz,
  diputus_oleh_nama text
);

alter table ai_permintaan_kuota drop constraint if exists ai_permintaan_kuota_status_valid;
alter table ai_permintaan_kuota add constraint ai_permintaan_kuota_status_valid
  check (status in ('menunggu', 'disetujui', 'ditolak'));

-- Satu guru paling banyak punya satu permintaan yang masih menunggu.
create unique index if not exists ai_permintaan_kuota_satu_menunggu
  on ai_permintaan_kuota (guru_id) where status = 'menunggu';
create index if not exists ai_permintaan_kuota_status
  on ai_permintaan_kuota (status, dibuat_at desc);

alter table ai_kuota_harian enable row level security;
alter table ai_sesi_generate enable row level security;
alter table ai_permintaan_kuota enable row level security;
revoke all on table ai_kuota_harian from anon, authenticated;
revoke all on table ai_sesi_generate from anon, authenticated;
revoke all on table ai_permintaan_kuota from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Pakai satu kuota secara atomik. Mengembalikan 1 baris (terpakai, jatah)
-- kalau berhasil, 0 baris kalau kuota hari itu sudah habis.
-- -----------------------------------------------------------------------------
create or replace function ai_pakai_kuota(p_guru_id uuid, p_tanggal date)
returns table (terpakai int, jatah int)
language sql
security definer
set search_path = public
as $$
  insert into ai_kuota_harian as k (guru_id, tanggal, jatah, terpakai)
  values (p_guru_id, p_tanggal, 1, 1)
  on conflict (guru_id, tanggal) do update
    set terpakai = k.terpakai + 1
    where k.terpakai < k.jatah
  returning k.terpakai, k.jatah;
$$;

-- -----------------------------------------------------------------------------
-- Pakai satu panggilan dari tiket generate. true = boleh lanjut.
-- -----------------------------------------------------------------------------
create or replace function ai_pakai_sesi(p_id uuid, p_guru_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  with u as (
    update ai_sesi_generate
       set dipakai = dipakai + 1
     where id = p_id and guru_id = p_guru_id
       and dipakai < maks_panggilan
       and kedaluwarsa_at > now()
    returning 1
  )
  select exists (select 1 from u);
$$;

-- -----------------------------------------------------------------------------
-- Putuskan permintaan. Setuju = jatah tanggal p_tanggal bertambah 1.
-- Mengembalikan false kalau permintaan sudah diputus sebelumnya.
-- -----------------------------------------------------------------------------
create or replace function ai_putuskan_permintaan(
  p_id uuid, p_setuju boolean, p_tanggal date, p_oleh text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guru uuid;
begin
  update ai_permintaan_kuota
     set status = case when p_setuju then 'disetujui' else 'ditolak' end,
         diputus_at = now(),
         diputus_oleh_nama = p_oleh
   where id = p_id and status = 'menunggu'
  returning guru_id into v_guru;

  if v_guru is null then
    return false;
  end if;

  if p_setuju then
    insert into ai_kuota_harian as k (guru_id, tanggal, jatah, terpakai)
    values (v_guru, p_tanggal, 2, 0)
    on conflict (guru_id, tanggal) do update set jatah = k.jatah + 1;
  end if;
  return true;
end;
$$;

revoke all on function ai_pakai_kuota(uuid, date) from public, anon, authenticated;
revoke all on function ai_pakai_sesi(uuid, uuid) from public, anon, authenticated;
revoke all on function ai_putuskan_permintaan(uuid, boolean, date, text) from public, anon, authenticated;
grant execute on function ai_pakai_kuota(uuid, date) to service_role;
grant execute on function ai_pakai_sesi(uuid, uuid) to service_role;
grant execute on function ai_putuskan_permintaan(uuid, boolean, date, text) to service_role;

-- -----------------------------------------------------------------------------
-- Nama paket di Bank Soal (hasil AI yang disimpan langsung ke bank).
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.bank_soal') is not null and not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'bank_soal'
       and column_name = 'paket_nama'
  ) then
    alter table bank_soal add column paket_nama text;
  end if;
end $$;

comment on table ai_kuota_harian is
  'Kuota Buat Soal AI per guru per tanggal WIB. RLS tanpa policy: service_role saja.';
comment on table ai_sesi_generate is
  'Tiket satu kali generate soal AI. RLS tanpa policy: service_role saja.';
comment on table ai_permintaan_kuota is
  'Permintaan tambahan kuota AI dari guru ke admin. RLS tanpa policy: service_role saja.';

-- =============================================================================
-- CEK AKHIR — harus menghasilkan 0 baris
-- =============================================================================
select 'tabel ' || t || ' belum ada' as masalah
from unnest(array['ai_kuota_harian', 'ai_sesi_generate', 'ai_permintaan_kuota']) as t
where to_regclass('public.' || t) is null
union all
select 'RLS ' || c.relname || ' belum aktif'
from pg_class c
where c.oid in (
  to_regclass('public.ai_kuota_harian'),
  to_regclass('public.ai_sesi_generate'),
  to_regclass('public.ai_permintaan_kuota')
) and not c.relrowsecurity
union all
select 'tabel ' || tablename || ' punya policy (seharusnya tidak ada): ' || policyname
from pg_policies
where schemaname = 'public'
  and tablename in ('ai_kuota_harian', 'ai_sesi_generate', 'ai_permintaan_kuota')
union all
select 'role ' || grantee || ' masih punya hak ' || privilege_type || ' di ' || table_name
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('ai_kuota_harian', 'ai_sesi_generate', 'ai_permintaan_kuota')
  and grantee in ('anon', 'authenticated')
union all
select 'fungsi ' || f || ' belum ada'
from unnest(array['ai_pakai_kuota', 'ai_pakai_sesi', 'ai_putuskan_permintaan']) as f
where not exists (select 1 from pg_proc where proname = f)
union all
select 'fungsi ' || p.proname || ' masih bisa dijalankan ' || r.rolname
from pg_proc p
cross join (select rolname from pg_roles where rolname in ('anon', 'authenticated')) r
where p.proname in ('ai_pakai_kuota', 'ai_pakai_sesi', 'ai_putuskan_permintaan')
  and has_function_privilege(r.rolname, p.oid, 'execute')
union all
select 'kolom bank_soal.paket_nama belum ada'
where to_regclass('public.bank_soal') is not null and not exists (
  select 1 from information_schema.columns
   where table_schema = 'public' and table_name = 'bank_soal'
     and column_name = 'paket_nama'
);
