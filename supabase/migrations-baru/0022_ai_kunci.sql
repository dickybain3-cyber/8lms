-- 0022_ai_kunci.sql
-- Jalankan di KETIGA project (kelas 7, 8, dan 9). Isinya identik.
-- Prasyarat: tidak ada (tabel berdiri sendiri).
-- Aman dijalankan berulang (idempoten). Pembatalan: 0022_ai_kunci_BATAL.sql
--
-- =============================================================================
-- APA INI
-- =============================================================================
-- Tempat menyimpan kunci API untuk fitur "Generate Soal AI" PER PROJECT
-- (jadi tiap kelas punya 10 kuncinya sendiri):
--
--   penyedia = 'gemini'        -> kunci Google AI Studio (boleh banyak, dipakai bergiliran)
--   penyedia = 'pollinations'  -> (opsional) kunci gambar Pollinations; kosong = mode gratis
--
-- Aplikasi membaca tabel ini lewat service_role di server, lalu
-- menggabungkannya dengan env GEMINI_API_KEYS_{7,8,9} kalau ada. Hasil
-- baca disimpan di memori server 5 menit, jadi kunci baru/nonaktif
-- berlaku paling lambat 5 menit kemudian.
--
-- =============================================================================
-- KEAMANAN
-- =============================================================================
-- RLS AKTIF dan SENGAJA TANPA POLICY APA PUN: guru dan siswa (anon /
-- authenticated) tidak bisa membaca satu baris pun, bahkan lewat DevTools.
-- Hanya service_role (dipakai server Next.js) yang bisa. Jangan pernah
-- menambahkan policy SELECT di tabel ini.

create table if not exists ai_kunci (
  id uuid primary key default gen_random_uuid(),
  penyedia text not null default 'gemini',
  kunci text not null,
  label text,
  aktif boolean not null default true,
  dibuat_at timestamptz not null default now()
);

alter table ai_kunci drop constraint if exists ai_kunci_penyedia_valid;
alter table ai_kunci add constraint ai_kunci_penyedia_valid
  check (penyedia in ('gemini', 'pollinations'));

alter table ai_kunci drop constraint if exists ai_kunci_kunci_tidak_kosong;
alter table ai_kunci add constraint ai_kunci_kunci_tidak_kosong
  check (length(btrim(kunci)) > 10);

create unique index if not exists ai_kunci_unik on ai_kunci (penyedia, kunci);

alter table ai_kunci enable row level security;
revoke all on table ai_kunci from anon, authenticated;

comment on table ai_kunci is
  'Kunci API fitur AI (Gemini/Pollinations) untuk project jenjang ini. '
  'RLS aktif TANPA policy: hanya service_role yang bisa membaca. Jangan '
  'tambahkan policy SELECT.';

-- =============================================================================
-- CARA MENGISI (contoh — ganti teks KUNCI_... dengan kunci asli, lalu jalankan)
-- =============================================================================
-- insert into ai_kunci (penyedia, kunci, label) values
--   ('gemini', 'KUNCI_GEMINI_1', 'akun 1'),
--   ('gemini', 'KUNCI_GEMINI_2', 'akun 2')
-- on conflict (penyedia, kunci) do nothing;
--
-- Menonaktifkan satu kunci tanpa menghapusnya:
--   update ai_kunci set aktif = false where label = 'akun 2';

-- =============================================================================
-- CEK AKHIR — harus menghasilkan 0 baris
-- =============================================================================
select 'tabel ai_kunci belum ada' as masalah
where to_regclass('public.ai_kunci') is null
union all
select 'RLS ai_kunci belum aktif'
from pg_class
where oid = to_regclass('public.ai_kunci') and not relrowsecurity
union all
select 'ai_kunci punya policy (seharusnya tidak ada): ' || policyname
from pg_policies
where schemaname = 'public' and tablename = 'ai_kunci'
union all
select 'role ' || grantee || ' masih punya hak ' || privilege_type || ' di ai_kunci'
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'ai_kunci'
  and grantee in ('anon', 'authenticated');
