-- 0002_event_mapel.sql
-- event: kumpulan ujian dalam satu periode (mis. PTS, PAS), ditarget ke satu jenjang.
-- mapel: satu mata pelajaran/sesi ujian di dalam event, dengan jadwal & kelas target.

create table event (
  id          uuid primary key default gen_random_uuid(),
  nama        text not null,
  tgl_mulai   date not null,
  tgl_selesai date not null,
  kelas_utama smallint not null check (kelas_utama in (7, 8, 9)),
  created_by  uuid references guru (id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint event_tanggal_valid check (tgl_selesai >= tgl_mulai)
);

create table mapel (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references event (id) on delete cascade,
  nama         text not null,
  waktu_mulai  timestamptz not null,
  waktu_selesai timestamptz not null,
  created_at   timestamptz not null default now(),
  constraint mapel_waktu_valid check (waktu_selesai > waktu_mulai)
);

create index idx_mapel_event_id on mapel (event_id);

-- Many-to-many: satu mapel bisa ditarget ke beberapa kelas spesifik
-- (mis. cuma 7.1, 7.3, 7.5), independen dari kelas_utama di level event.
create table mapel_kelas (
  mapel_id uuid not null references mapel (id) on delete cascade,
  kelas_id uuid not null references kelas (id) on delete cascade,
  primary key (mapel_id, kelas_id)
);

create index idx_mapel_kelas_kelas_id on mapel_kelas (kelas_id);
