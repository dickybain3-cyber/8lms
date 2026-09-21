-- 0018_event_jenis.sql
-- Jalankan di KETIGA project (kelas 7, 8, dan 9). Isinya identik.
--
-- =============================================================================
-- KENAPA MIGRASI INI ADA
-- =============================================================================
-- Sampai sekarang `event` selalu berarti "asesmen": wadah yang isinya mapel
-- -> soal -> jawaban -> nilai. Tahap 3 memperkenalkan tiga jenis kegiatan
-- baru (kuis harian, tugas, forum) yang berbagi wadah `event` yang sama
-- tapi TIDAK semuanya memakai mesin mapel/soal:
--
--   asesmen_akhir  -> mesin yang sudah ada (mapel/soal/jawaban/nilai)
--   kuis_harian    -> mesin YANG SAMA, cuma beda label & default durasi
--   assignment     -> tabel `tugas` (Tahap 4, BELUM ADA di migrasi ini)
--   forum          -> tabel `forum_topik` (Tahap 5, BELUM ADA di migrasi ini)
--
-- `event.jenis` menandai yang mana. Event LAMA (dibuat sebelum migrasi
-- ini) semuanya `DEFAULT 'asesmen_akhir'` — itu memang satu-satunya jenis
-- yang ada sampai sekarang, jadi backfill-nya tidak ambigu sama sekali
-- (beda dari kasus `guru.password_status` di 0017 yang riwayatnya
-- memang tidak diketahui).
--
-- `event.ditutup_at` adalah penutupan MANUAL — dipakai forum (Tahap 5)
-- supaya guru bisa menutup diskusi sebelum `tgl_selesai`, tapi kolomnya
-- ditambah sekarang (bukan ditunda ke Tahap 5) supaya semua jenis event
-- bisa memakainya kalau perlu, dan supaya tidak ada migrasi susulan kecil
-- lagi khusus satu kolom ini.
--
-- =============================================================================
-- KENAPA ADA TRIGGER DI `mapel`, BUKAN CUMA VALIDASI DI SERVER ACTION
-- =============================================================================
-- Server Action (`createMapel` di src/app/admin/event/actions.ts) sudah
-- menolak menambah mapel ke event berjenis `assignment`/`forum` — tapi
-- Server Action bisa dilewati (RPC ujian pro & pemanggilan admin lewat
-- service_role di admin-multi.ts, kalau suatu saat ada yang menambah
-- fungsi tulis `mapel` baru di sana tanpa ingat aturan ini). Triggernya
-- murah (satu SELECT by primary key per INSERT/UPDATE mapel, jarang
-- terjadi) dan jadi jaring pengaman terakhir yang tidak bisa lupa
-- ditambahkan di pemanggil baru.

alter table event
  add column if not exists jenis text;

update event set jenis = 'asesmen_akhir' where jenis is null;

alter table event
  alter column jenis set default 'asesmen_akhir';

alter table event
  alter column jenis set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'event_jenis_check'
  ) then
    alter table event
      add constraint event_jenis_check
      check (jenis in ('asesmen_akhir', 'kuis_harian', 'assignment', 'forum'));
  end if;
end $$;

comment on column event.jenis is
  'Jenis kegiatan. asesmen_akhir & kuis_harian memakai mesin mapel/soal yang '
  'sudah ada (kuis_harian cuma beda label & default durasi di UI, BUKAN mesin '
  'kedua). assignment -> tabel tugas (Tahap 4). forum -> tabel forum_topik '
  '(Tahap 5). Event lama semuanya asesmen_akhir (satu-satunya jenis yang ada '
  'sebelum migrasi ini, backfill tidak ambigu).';

alter table event
  add column if not exists ditutup_at timestamptz;

comment on column event.ditutup_at is
  'Penutupan manual oleh guru (tombol, bukan cron) — independen dari '
  'tgl_selesai. Dipakai forum (Tahap 5) supaya diskusi bisa ditutup lebih '
  'awal; kolomnya ditambah sekarang supaya jenis kegiatan lain juga bisa '
  'memakainya tanpa migrasi susulan. NULL berarti belum ditutup manual.';

-- ---------------------------------------------------------------------------
-- Jaring pengaman: tolak baris `mapel` untuk event yang jenisnya bukan
-- asesmen_akhir/kuis_harian, di level database.
-- ---------------------------------------------------------------------------

create or replace function cegah_mapel_di_event_bukan_ujian()
returns trigger
language plpgsql
as $$
declare
  v_jenis text;
begin
  select jenis into v_jenis from event where id = new.event_id;

  if v_jenis not in ('asesmen_akhir', 'kuis_harian') then
    raise exception
      'Event berjenis % tidak memakai mapel/soal — assignment memakai tabel tugas, forum memakai tabel forum_topik.',
      v_jenis;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_cegah_mapel_di_event_bukan_ujian on mapel;

create trigger trg_cegah_mapel_di_event_bukan_ujian
  before insert on mapel
  for each row
  execute function cegah_mapel_di_event_bukan_ujian();

-- Catatan: TIDAK ada trigger untuk UPDATE event.jenis yang mengubah jenis
-- event yang SUDAH punya mapel jadi assignment/forum (mis. race atau bug
-- di masa depan) — kolom `jenis` sengaja tidak pernah diekspos untuk
-- diedit lewat UI manapun (lihat EventEditForm.tsx), jadi risikonya cuma
-- muncul lewat SQL manual. Kalau nanti ada jalur edit jenis, tambahkan
-- pengecekan "event ini masih boleh ganti jenis kalau belum punya mapel"
-- di titik itu.

-- Cek hasil:
--   select jenis, count(*) from event group by jenis;
