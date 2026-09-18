-- 0009_log_aktivitas.sql
-- Riwayat/log aktivitas admin (Sesi 9, kandidat #2 dari PROMPT-SESI-7.md,
-- digeser dua kali sebelum akhirnya dikerjakan di sini).
--
-- =============================================================================
-- KEPUTUSAN DESAIN: trigger DB vs catat manual di Server Action?
-- =============================================================================
-- Jawabannya CAMPURAN, bukan salah satu penuh — dua pola dipilih untuk dua
-- kasus yang beda karakternya:
--
-- 1) CRUD lurus di `event`, `mapel`, `soal` (create/update/delete lewat
--    Server Action Sesi 2-3-6) -> TRIGGER DB. Alasan: konsisten dengan pola
--    `hitung_nilai` Sesi 5 (satu-satunya jalur koreksi nilai adalah trigger,
--    supaya tidak ada jalur lain yang bisa "lupa" memicu) — di sini pun,
--    tabel-tabel ini HANYA pernah ditulis oleh guru (RLS `..._all_guru`
--    di 0005), jadi generic AFTER INSERT/UPDATE/DELETE aman mewakili
--    "satu baris berubah = satu aksi guru", tidak ada penulis lain (siswa/
--    sistem) yang perlu dikecualikan.
--
-- 2) `nilai` -> TRIGGER DB, TAPI BERSYARAT (cuma kalau `is_override = true`).
--    Alasan: tabel ini ditulis oleh DUA jalur yang beda maknanya secara
--    bisnis walau sama-sama INSERT/UPDATE SQL: (a) koreksi otomatis lewat
--    `hitung_nilai()` yang dipicu trigger submit siswa DAN tombol "Hitung
--    Ulang Nilai" guru (0007_scoring.sql, keduanya set `is_override =
--    false`), (b) override manual guru lewat `overrideNilai` (set
--    `is_override = true`). Generic trigger tanpa syarat akan mencatat
--    RATUSAN baris "aktivitas guru" palsu setiap kali siswa submit ujian
--    (padahal itu aksi siswa, bukan guru) — salah secara akuntabilitas.
--    Filter `new.is_override is true` membuat trigger ini HANYA menyala
--    untuk jalur (b), yang memang satu-satunya jalur yang benar-benar
--    "guru mengubah nilai secara manual".
--
-- 3) Aksi MASSAL (`hitung_ulang_semua_nilai`, `importSiswaBatch`,
--    `importGuruBatch`) -> DICATAT MANUAL (panggil `catat_log_aktivitas`
--    langsung dari Server Action/RPC), BUKAN trigger. Alasan: satu aksi
--    guru di sini mengubah BANYAK baris sekaligus (mis. hitung ulang nilai
--    100 siswa, atau import 200 akun) — kalau dipasang trigger generik di
--    `nilai`/`siswa`/`guru`, hasilnya 100 atau 200 baris log terpisah untuk
--    SATU keputusan guru, bikin halaman /admin/log penuh noise dan susah
--    dibaca ("siapa menghapus/mengubah apa" jadi tenggelam). Satu aksi
--    bisnis = satu baris log (dengan ringkasan jumlah di `detail_jsonb`)
--    lebih berguna untuk akuntabilitas daripada satu baris per row DB.
--    (`importSiswaBatch`/`importGuruBatch` sendiri sudah dipecah per batch
--    50 baris dari sisi client — jadi granularitas "satu log per batch"
--    ini konsisten dengan granularitas proses yang sudah ada, bukan
--    granularitas baru.)
--
-- Konsekuensi dari keputusan ini: `log_aktivitas` TIDAK mencatat apa pun
-- yang dilakukan siswa (submit ujian, autosave jawaban) — itu memang di
-- luar cakupan "log aktivitas ADMIN" yang diminta di PROMPT-SESI-7.md.

-- =============================================================================
-- Tabel log_aktivitas
-- =============================================================================
create table log_aktivitas (
  id           uuid primary key default gen_random_uuid(),
  -- `on delete set null`, BUKAN cascade: kalau baris guru yang bersangkutan
  -- suatu saat terhapus (saat ini belum ada fitur hapus akun guru dari UI,
  -- tapi bisa saja terjadi manual lewat dashboard), riwayat log-nya TETAP
  -- HARUS ada untuk akuntabilitas historis. Nama guru di titik waktu itu
  -- juga disnapshot ke `detail_jsonb` (key `oleh_nama`, lihat fungsi
  -- `catat_log_aktivitas` di bawah) justru supaya nama tetap terbaca di UI
  -- walau `guru_id` sudah jadi null.
  guru_id      uuid references guru (id) on delete set null,
  -- Nilai bebas (bukan enum Postgres) sengaja dipilih: 'insert' / 'update' /
  -- 'delete' (dari trigger generik) atau aksi bernama bebas seperti
  -- 'override_nilai', 'hitung_ulang_nilai', 'import_siswa', 'import_guru'
  -- (dari pemanggilan manual) — enum akan berarti migrasi baru tiap kali
  -- ada jenis aksi baru, sementara nilai ini murni deskriptif untuk
  -- ditampilkan di UI, tidak dipakai logika apa pun yang butuh validasi
  -- ketat di level DB.
  aksi         text not null,
  -- 'event' | 'mapel' | 'soal' | 'nilai' | 'siswa' | 'guru' — sama alasannya
  -- dengan `aksi`, bebas (bukan enum) supaya entitas baru di masa depan
  -- tidak perlu migrasi skema log.
  entitas      text not null,
  -- Nullable SENGAJA: aksi massal (import/hitung ulang) tidak punya SATU
  -- id yang mewakili (itu justru alasan kenapa aksi itu dicatat manual
  -- sebagai satu baris, bukan per-row) — untuk aksi itu, `entitas_id`
  -- dibiarkan null dan detailnya (jumlah baris, dst) ada di `detail_jsonb`.
  entitas_id   uuid,
  detail_jsonb jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index idx_log_aktivitas_created_at on log_aktivitas (created_at desc);
create index idx_log_aktivitas_entitas on log_aktivitas (entitas, entitas_id);
create index idx_log_aktivitas_guru_id on log_aktivitas (guru_id);

comment on table log_aktivitas is
  'Riwayat aktivitas admin/guru (Sesi 9) — lihat komentar panjang di atas '
  'CREATE TABLE ini untuk keputusan trigger-vs-manual per tabel sumber. '
  'Append-only: tidak ada kebijakan RLS UPDATE/DELETE sama sekali (lihat '
  'bagian RLS di bawah) — kalau retensi/pembersihan dibutuhkan nanti, itu '
  'keputusan yang sengaja ditunda ke sesi mendatang (belum ada requirement '
  'eksplisit untuk itu saat sesi ini dikerjakan).';

alter table log_aktivitas enable row level security;

-- Hanya SELECT yang dibuka lewat RLS, dan hanya untuk guru. TIDAK ada
-- policy INSERT/UPDATE/DELETE sama sekali — baris log HANYA bisa masuk
-- lewat fungsi `catat_log_aktivitas()` (security definer, dimiliki role
-- super yang otomatis melewati RLS tabel yang ia sendiri tulis, konsisten
-- dengan cara `hitung_nilai()` menulis ke `nilai` di 0007). Ini keputusan
-- sengaja: kalau ada policy INSERT langsung untuk guru, guru (atau bug di
-- kode client) bisa menulis baris log_aktivitas sembarangan yang tidak
-- lewat validasi `is_guru()` + snapshot nama di fungsi tsb — jalur tunggal
-- lewat fungsi membuat log lebih bisa dipercaya sebagai bukti audit.
create policy log_aktivitas_select_guru on log_aktivitas
  for select using (is_guru());

-- =============================================================================
-- current_guru_id(): helper kecil, pola sama dengan current_siswa_id() di
-- 0005_rls_policies.sql, belum ada versi guru-nya sampai sesi ini.
-- =============================================================================
create or replace function current_guru_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from guru where auth_id = auth.uid();
$$;

-- =============================================================================
-- catat_log_aktivitas: satu-satunya jalur INSERT ke log_aktivitas. Dipakai
-- oleh trigger generik di bawah MAUPUN dipanggil langsung lewat
-- `supabase.rpc("catat_log_aktivitas", ...)` dari Server Action untuk aksi
-- massal (lihat poin 3 di catatan keputusan desain atas).
-- =============================================================================
create or replace function catat_log_aktivitas(
  p_aksi text,
  p_entitas text,
  p_entitas_id uuid,
  p_detail jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guru_id   uuid;
  v_guru_nama text;
  v_id        uuid;
begin
  -- Hanya guru yang boleh mencatat aktivitas. Dalam praktiknya ini tidak
  -- pernah gagal untuk trigger di event/mapel/soal/nilai (RLS tabel itu
  -- sendiri sudah mensyaratkan is_guru() untuk menulis ke sana duluan),
  -- tapi tetap ditegakkan di sini juga supaya pemanggilan manual lewat rpc
  -- dari client tidak bisa disalahgunakan siswa untuk mengotori log.
  if not is_guru() then
    raise exception 'Hanya guru yang boleh mencatat aktivitas.';
  end if;

  select id, nama into v_guru_id, v_guru_nama
  from guru where auth_id = auth.uid();

  insert into log_aktivitas (guru_id, aksi, entitas, entitas_id, detail_jsonb)
  values (
    v_guru_id,
    p_aksi,
    p_entitas,
    p_entitas_id,
    -- Snapshot nama guru ikut disimpan di detail_jsonb (key 'oleh_nama'),
    -- BUKAN cuma mengandalkan join ke `guru_id` saat baca — supaya nama
    -- tetap terbaca kalau baris guru itu suatu saat dihapus (lihat
    -- komentar `guru_id on delete set null` di atas). `||` menimpa key
    -- 'oleh_nama' kalau pemanggil kebetulan sudah menaruh key yang sama
    -- di p_detail (tidak diharapkan terjadi, tapi tidak berbahaya).
    coalesce(p_detail, '{}'::jsonb) || jsonb_build_object('oleh_nama', v_guru_nama)
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function catat_log_aktivitas is
  'Satu-satunya jalur INSERT ke log_aktivitas — dipanggil trigger generik '
  '(event/mapel/soal/nilai-override) maupun manual dari Server Action '
  'untuk aksi massal (import batch, hitung ulang nilai). security definer '
  'supaya bisa menulis ke log_aktivitas walau tabel itu tidak punya '
  'policy INSERT untuk siapa pun (lihat komentar RLS di atas).';

-- =============================================================================
-- Trigger generik untuk event/mapel: satu fungsi dipakai dua tabel lewat
-- kolom yang sama-sama ada (id, nama) — cukup sederhana untuk tidak perlu
-- dipecah per tabel, beda dengan soal (bentuknya lebih spesifik, lihat di
-- bawah).
-- =============================================================================
create or replace function trg_log_event_mapel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id     uuid;
  v_detail jsonb;
begin
  if TG_OP = 'DELETE' then
    v_id := old.id;
  else
    v_id := new.id;
  end if;

  if TG_TABLE_NAME = 'event' then
    v_detail := jsonb_build_object(
      'nama', coalesce(new.nama, old.nama),
      'tgl_mulai', coalesce(new.tgl_mulai, old.tgl_mulai),
      'tgl_selesai', coalesce(new.tgl_selesai, old.tgl_selesai)
    );
  else -- mapel
    v_detail := jsonb_build_object(
      'nama', coalesce(new.nama, old.nama),
      'event_id', coalesce(new.event_id, old.event_id),
      'waktu_mulai', coalesce(new.waktu_mulai, old.waktu_mulai),
      'waktu_selesai', coalesce(new.waktu_selesai, old.waktu_selesai)
    );
  end if;

  perform catat_log_aktivitas(lower(TG_OP), TG_TABLE_NAME, v_id, v_detail);
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_event_log on event;
create trigger trg_event_log
  after insert or update or delete on event
  for each row execute function trg_log_event_mapel();

drop trigger if exists trg_mapel_log on mapel;
create trigger trg_mapel_log
  after insert or update or delete on mapel
  for each row execute function trg_log_event_mapel();

-- =============================================================================
-- Trigger soal: fungsi terpisah karena bentuknya beda (tidak ada kolom
-- `nama`, isi soal ada di `konten_jsonb` yang bentuknya beda per `tipe`).
-- =============================================================================
create or replace function trg_log_soal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id      uuid;
  v_konten  jsonb;
  v_preview text;
  v_detail  jsonb;
begin
  if TG_OP = 'DELETE' then
    v_id := old.id;
  else
    v_id := new.id;
  end if;

  v_konten := coalesce(new.konten_jsonb, old.konten_jsonb);
  -- Cuplikan singkat teks pertanyaan/instruksi (bukan dump konten_jsonb
  -- penuh) supaya baris log tetap ringkas dibaca sekilas di /admin/log —
  -- kalau guru butuh detail lengkap (termasuk kunci jawaban), tabel `soal`
  -- itu sendiri tetap bisa dibuka langsung (guru selalu punya akses penuh
  -- ke situ, lihat soal_all_guru di 0005), jadi tidak ada informasi yang
  -- hilang, cuma tidak diduplikasi di sini.
  v_preview := left(
    coalesce(v_konten ->> 'pertanyaan', v_konten ->> 'instruksi', ''),
    120
  );

  v_detail := jsonb_build_object(
    'mapel_id', coalesce(new.mapel_id, old.mapel_id),
    'tipe', coalesce(new.tipe, old.tipe),
    'preview', v_preview,
    -- Menjawab langsung salah satu requirement PROMPT-SESI-7.md: "siapa
    -- mengubah kunci jawaban soal Y". Flag boolean sederhana (bukan diff
    -- lengkap old vs new per tipe, yang butuh logika berbeda untuk tiap
    -- 6 tipe soal dan berisiko keliru tanpa `tsc`/testing tambahan) —
    -- cukup untuk menjawab "apakah isi soal (termasuk kunci) berubah di
    -- aksi ini", sementara isi persis before/after tetap bisa ditelusuri
    -- manual lewat riwayat lain (mis. backup DB) kalau benar-benar perlu.
    'konten_berubah',
      TG_OP = 'INSERT' or TG_OP = 'DELETE'
      or (TG_OP = 'UPDATE' and new.konten_jsonb is distinct from old.konten_jsonb),
    'skor_berubah',
      TG_OP = 'UPDATE' and new.skor is distinct from old.skor
  );

  perform catat_log_aktivitas(lower(TG_OP), 'soal', v_id, v_detail);
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_soal_log on soal;
create trigger trg_soal_log
  after insert or update or delete on soal
  for each row execute function trg_log_soal();

-- =============================================================================
-- Trigger nilai — BERSYARAT, cuma untuk override manual guru (lihat poin 2
-- di catatan keputusan desain paling atas file ini).
-- =============================================================================
create or replace function trg_log_override_nilai()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_override is true then
    perform catat_log_aktivitas(
      'override_nilai',
      'nilai',
      new.mapel_id, -- `nilai` tidak punya kolom `id` sendiri (PK komposit
                     -- siswa_id+mapel_id, lihat 0004) — mapel_id dipilih
                     -- sebagai entitas_id (bukan siswa_id) supaya halaman
                     -- /admin/log bisa difilter "semua override nilai di
                     -- mapel X"; siswa_id yang kena tetap ada di
                     -- detail_jsonb di bawah.
      jsonb_build_object(
        'siswa_id', new.siswa_id,
        'mapel_id', new.mapel_id,
        'total_skor', new.total_skor
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_nilai_override_log on nilai;
create trigger trg_nilai_override_log
  after insert or update on nilai
  for each row execute function trg_log_override_nilai();
