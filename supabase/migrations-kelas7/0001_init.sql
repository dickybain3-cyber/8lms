-- 0001_init.sql
-- Tabel dasar: kelas, siswa, guru.
-- siswa/guru.auth_id menaut ke auth.users(id) milik Supabase Auth.

create extension if not exists "pgcrypto";

create table kelas (
  id         uuid primary key default gen_random_uuid(),
  tingkat    smallint not null check (tingkat in (7, 8, 9)),
  nama       text not null unique, -- "7.1", "7.2", ... "9.6"
  created_at timestamptz not null default now()
);

create table guru (
  id         uuid primary key default gen_random_uuid(),
  auth_id    uuid not null unique references auth.users (id) on delete cascade,
  nama       text not null,
  created_at timestamptz not null default now()
);

create table siswa (
  id         uuid primary key default gen_random_uuid(),
  auth_id    uuid not null unique references auth.users (id) on delete cascade,
  nama       text not null,
  kelas_id   uuid not null references kelas (id) on delete restrict,
  username   text not null unique,
  created_at timestamptz not null default now()
);

create index idx_siswa_kelas_id on siswa (kelas_id);

comment on table siswa is
  'auth_id menaut ke akun Supabase Auth yang dibuat dengan email sintetis '
  '"{username}{NEXT_PUBLIC_SISWA_EMAIL_SUFFIX}" — siswa login pakai username, bukan email.';
