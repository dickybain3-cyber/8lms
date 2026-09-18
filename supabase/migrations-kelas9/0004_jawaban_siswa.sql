-- 0004_jawaban_siswa.sql
-- jawaban_siswa: 1 row per siswa per mapel, upsert target untuk autosave
-- (lihat strategi autosave di README — kritis untuk beban 600 siswa bersamaan).
-- nilai: diisi setelah koreksi otomatis (Sesi 7).

create table jawaban_siswa (
  siswa_id      uuid not null references siswa (id) on delete cascade,
  mapel_id      uuid not null references mapel (id) on delete cascade,
  jawaban_jsonb jsonb not null default '{}'::jsonb, -- { "soal_id": jawaban }
  submitted_at  timestamptz,
  updated_at    timestamptz not null default now(),
  primary key (siswa_id, mapel_id)
);

create index idx_jawaban_siswa_mapel_id on jawaban_siswa (mapel_id);

create trigger trg_jawaban_siswa_updated_at
  before update on jawaban_siswa
  for each row
  execute function set_updated_at();

create table nilai (
  siswa_id     uuid not null references siswa (id) on delete cascade,
  mapel_id     uuid not null references mapel (id) on delete cascade,
  total_skor   numeric(7, 2) not null default 0,
  detail_jsonb jsonb not null default '{}'::jsonb, -- { "soal_id": skor_didapat }
  dihitung_at  timestamptz not null default now(),
  primary key (siswa_id, mapel_id)
);

create index idx_nilai_mapel_id on nilai (mapel_id);
