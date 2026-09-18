-- 0003_soal.sql
-- Satu tabel `soal` untuk semua tipe, dibedakan lewat kolom `tipe`.
-- Bentuk konten_jsonb berbeda per tipe (didokumentasikan di bawah dan di
-- docs/skema-database.md). Divalidasi di layer aplikasi (Sesi 3), bukan
-- lewat CHECK constraint per tipe, supaya skema tetap gampang dikembangkan.

create type tipe_soal as enum (
  'pilgan_biasa',
  'pilgan_kompleks',
  'uraian_singkat',
  'benar_salah',
  'multi_benar_salah',
  'menjodohkan'
);

create table soal (
  id           uuid primary key default gen_random_uuid(),
  mapel_id     uuid not null references mapel (id) on delete cascade,
  tipe         tipe_soal not null,
  urutan       integer not null,
  skor         numeric(6, 2) not null default 2,
  konten_jsonb jsonb not null default '{}'::jsonb,
  gambar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (mapel_id, urutan)
);

create index idx_soal_mapel_id on soal (mapel_id);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_soal_updated_at
  before update on soal
  for each row
  execute function set_updated_at();

/*
Bentuk konten_jsonb per tipe (referensi untuk form dinamis Sesi 3):

pilgan_biasa / pilgan_kompleks:
  { "pertanyaan": "...", "gambar_pertanyaan_url": "...",
    "opsi": [ { "id": "o1", "teks": "...", "gambar_url": "...", "benar": true } ] }
  -- pilgan_biasa: tepat satu opsi benar. pilgan_kompleks: bisa lebih dari satu.

uraian_singkat:
  { "pertanyaan": "...", "gambar_pertanyaan_url": "...",
    "kunci_jawaban": ["kata1", "kata2"] }
  -- dicocokkan per kata, case-insensitive (lihat scoring.ts, Sesi 7).

benar_salah:
  { "pertanyaan": "...", "gambar_pertanyaan_url": "...", "jawaban_benar": true }

multi_benar_salah:
  { "instruksi": "...",
    "pernyataan": [ { "id": "p1", "teks": "...", "jawaban_benar": true } ] }

menjodohkan:
  { "instruksi": "...",
    "soal": [ { "id": "s1", "teks": "...", "gambar_url": "..." } ],
    "jawaban": [ { "id": "j1", "teks": "..." } ],
    "pasangan_benar": { "s1": "j1" } }
  -- jumlah "jawaban" boleh lebih banyak dari "soal"; soal boleh tanpa pasangan.
*/
