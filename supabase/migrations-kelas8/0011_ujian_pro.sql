-- 0011_ujian_pro.sql
-- ============================================================================
-- Sesi "Ujian Pro" — migrasi ini WAJIB dijalankan IDENTIK di KETIGA project
-- Supabase (kelas 7, 8, 9). Salin file ini apa adanya ke:
--   supabase/migrations-kelas7/0011_ujian_pro.sql
--   supabase/migrations-kelas8/0011_ujian_pro.sql
--   supabase/migrations-kelas9/0011_ujian_pro.sql
-- Tidak ada perbedaan isi antar jenjang (pola sama seperti 0001–0010).
--
-- Yang ditambahkan:
--   1. guru.is_admin        -> membedakan guru biasa vs admin (monitoring lintas jenjang)
--   2. mapel.durasi_menit   -> timer per-siswa, bukan cuma jendela waktu global
--   3. jawaban_siswa.mulai_at / progress_persen / last_seen_at / soal_aktif
--                           -> monitoring pengerjaan real-time di halaman admin
--   4. RPC mulai_ujian / ping_ujian / get_monitoring_ujian / reset_ujian_siswa
--   5. RLS jawaban_siswa diperketat: tidak bisa menulis setelah deadline pribadi
-- ============================================================================


-- ============================================================================
-- 1. ROLE ADMIN
-- ============================================================================
-- Sebelum ini, SEMUA baris di tabel `guru` diperlakukan sama (middleware.ts
-- cuma cek "ada baris guru dengan auth_id ini?" lalu role = admin). Sekarang
-- dibedakan: guru biasa mengelola soal/mapel di jenjangnya sendiri, admin
-- boleh membuka halaman monitoring lintas jenjang & mereset pekerjaan siswa.
alter table guru add column if not exists is_admin boolean not null default false;

comment on column guru.is_admin is
  'true = boleh buka /admin/monitoring (lintas 3 jenjang), reset ujian siswa, '
  'hapus hasil kerja. Set manual lewat SQL editor Supabase — sengaja tidak ada '
  'UI-nya supaya tidak ada guru yang tidak sengaja menaikkan haknya sendiri.';

create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from guru where auth_id = auth.uid() and is_admin);
$$;

-- --------------------------------------------------------------------------
-- PENTING — kenapa perlu `is_guru_atau_service()`:
--
-- Halaman monitoring admin memanggil RPC di KETIGA project sekaligus lewat
-- service_role key (lihat src/lib/supabase/admin-multi.ts). Saat dipanggil
-- dengan service_role, `auth.uid()` bernilai NULL sehingga `is_guru()` selalu
-- false — artinya semua RPC lama yang menjaga diri dengan
-- `if not is_guru() then raise` akan MENOLAK panggilan admin lintas jenjang.
--
-- Fungsi ini menerima dua jalur: sesi guru yang login normal (anon key + JWT),
-- ATAU service_role (yang hanya bisa dipakai dari server Next.js, keynya tidak
-- pernah sampai ke browser). Anon tanpa login tetap ditolak karena auth.role()
-- untuk anon adalah 'anon', bukan 'service_role'.
-- --------------------------------------------------------------------------
create or replace function is_guru_atau_service()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(auth.role(), '') = 'service_role' or is_guru();
$$;

comment on function is_guru_atau_service is
  'Penjaga akses RPC yang dipanggil BAIK dari sesi guru login MAUPUN dari '
  'service_role (fan-out lintas jenjang di halaman admin). Bukan pelonggaran: '
  'service_role key hanya hidup di server Next.js, tidak pernah dikirim ke browser.';


-- ============================================================================
-- 2. DURASI UJIAN (timer per siswa)
-- ============================================================================
-- Sebelumnya timer siswa = hitung mundur ke `mapel.waktu_selesai` (jendela
-- global). Efeknya tidak adil: siswa yang telat masuk 20 menit kehilangan 20
-- menit pengerjaan. Sekarang:
--
--   waktu_mulai .. waktu_selesai  = JENDELA kapan ujian boleh dibuka
--   durasi_menit                  = LAMA pengerjaan per siswa, dihitung sejak
--                                   siswa menekan "Mulai Ujian"
--
-- Deadline pribadi = min(mulai_at + durasi, waktu_selesai). Jadi siswa yang
-- masuk 10 menit sebelum jendela tutup tetap tidak bisa melewati waktu_selesai.
-- durasi_menit NULL = perilaku lama (pakai waktu_selesai penuh), supaya mapel
-- yang sudah terlanjur dibuat sebelum migrasi ini tidak berubah perilakunya.
alter table mapel add column if not exists durasi_menit integer
  check (durasi_menit is null or durasi_menit between 1 and 600);

comment on column mapel.durasi_menit is
  'Lama pengerjaan per siswa dalam menit, dihitung sejak siswa menekan Mulai '
  'Ujian. NULL = tanpa batas durasi, siswa punya waktu sampai waktu_selesai.';


-- ============================================================================
-- 3. KOLOM MONITORING DI jawaban_siswa
-- ============================================================================
alter table jawaban_siswa add column if not exists mulai_at timestamptz;
alter table jawaban_siswa add column if not exists progress_persen smallint not null default 0;
alter table jawaban_siswa add column if not exists last_seen_at timestamptz;
alter table jawaban_siswa add column if not exists soal_aktif integer;

comment on column jawaban_siswa.mulai_at is
  'Kapan siswa menekan "Mulai Ujian" (diisi RPC mulai_ujian, sekali saja). '
  'Titik nol timer pribadi siswa.';
comment on column jawaban_siswa.progress_persen is
  'Persentase soal terjawab, dikirim berkala oleh ExamClient lewat ping_ujian. '
  'Murni untuk monitoring guru — TIDAK dipakai untuk penilaian.';
comment on column jawaban_siswa.last_seen_at is
  'Ping terakhir dari perangkat siswa. Dipakai halaman monitoring untuk '
  'menentukan indikator online/terputus (ambang 6 menit, lihat get_monitoring_ujian).';
comment on column jawaban_siswa.soal_aktif is
  'Nomor soal (1-based) yang sedang dibuka siswa. Supaya guru bisa lihat '
  '"sedang mengerjakan nomor berapa" tanpa membuka jawabannya.';


-- ============================================================================
-- 4. DEADLINE PRIBADI
-- ============================================================================
create or replace function deadline_ujian(
  p_mulai_at      timestamptz,
  p_durasi_menit  integer,
  p_waktu_selesai timestamptz
)
returns timestamptz
language sql
immutable
as $$
  select case
    when p_durasi_menit is null or p_mulai_at is null then p_waktu_selesai
    else least(p_mulai_at + make_interval(mins => p_durasi_menit), p_waktu_selesai)
  end;
$$;

comment on function deadline_ujian is
  'Deadline pribadi satu siswa: min(mulai_at + durasi, waktu_selesai). Dipakai '
  'bersama oleh RLS, RPC mulai_ujian, dan halaman monitoring supaya hanya ada '
  'SATU definisi deadline di seluruh sistem.';


-- ============================================================================
-- 5. RPC mulai_ujian — dipanggil saat siswa menekan tombol "Mulai Ujian"
-- ============================================================================
-- Mengembalikan deadline DAN waktu server. Client memakai selisih waktu server
-- vs jam lokal sebagai offset, supaya siswa yang jam HP-nya salah (sering
-- terjadi di lab sekolah) tetap dapat hitung mundur yang benar — ini alasan
-- utama kenapa deadline TIDAK boleh dihitung di browser.
create or replace function mulai_ujian(p_mapel_id uuid)
returns table (
  deadline     timestamptz,
  server_now   timestamptz,
  mulai_at     timestamptz,
  submitted_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_siswa_id uuid;
  v_mapel    record;
  v_row      record;
begin
  v_siswa_id := current_siswa_id();
  if v_siswa_id is null then
    raise exception 'Hanya siswa yang bisa memulai ujian.';
  end if;

  select m.id, m.waktu_mulai, m.waktu_selesai, m.durasi_menit
    into v_mapel
  from mapel m
  where m.id = p_mapel_id;

  if not found then
    raise exception 'Ujian tidak ditemukan.';
  end if;

  -- Validasi kelas target — sama seperti get_soal_untuk_siswa (0006), diulang
  -- di sini supaya RPC ini aman dipanggil sendiri tanpa urutan tertentu.
  if not exists (
    select 1 from mapel_kelas mk
    where mk.mapel_id = p_mapel_id
      and mk.kelas_id = current_siswa_kelas_id()
  ) then
    raise exception 'Ujian ini tidak ditujukan untuk kelasmu.';
  end if;

  if now() < v_mapel.waktu_mulai then
    raise exception 'Ujian belum dibuka.';
  end if;
  if now() > v_mapel.waktu_selesai then
    raise exception 'Jendela waktu ujian sudah ditutup.';
  end if;

  -- Buat baris kalau belum ada; kalau sudah ada, mulai_at TIDAK ditimpa —
  -- itu yang mencegah siswa "me-reset" timernya sendiri dengan refresh atau
  -- membuka ujian dari perangkat kedua.
  insert into jawaban_siswa (siswa_id, mapel_id, jawaban_jsonb, mulai_at, last_seen_at)
  values (v_siswa_id, p_mapel_id, '{}'::jsonb, now(), now())
  on conflict (siswa_id, mapel_id) do update
    set mulai_at     = coalesce(jawaban_siswa.mulai_at, now()),
        last_seen_at = now();

  select js.mulai_at, js.submitted_at into v_row
  from jawaban_siswa js
  where js.siswa_id = v_siswa_id and js.mapel_id = p_mapel_id;

  return query
  select
    deadline_ujian(v_row.mulai_at, v_mapel.durasi_menit, v_mapel.waktu_selesai),
    now(),
    v_row.mulai_at,
    v_row.submitted_at;
end;
$$;

comment on function mulai_ujian is
  'Menandai awal pengerjaan siswa (idempotent — refresh/ganti perangkat tidak '
  'mereset timer) dan mengembalikan deadline pribadi + waktu server.';


-- ============================================================================
-- 6. RPC ping_ujian — detak monitoring dari perangkat siswa
-- ============================================================================
-- Dipisah dari upsert jawaban biasa supaya: (a) tetap terkirim walau siswa
-- lama tidak mengubah jawaban (kalau tidak, guru akan melihatnya "offline"
-- padahal sedang membaca soal panjang); (b) payload-nya kecil (dua angka),
-- aman dipanggil tiap menit oleh ratusan siswa sekaligus.
create or replace function ping_ujian(
  p_mapel_id   uuid,
  p_progress   smallint,
  p_soal_aktif integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_siswa_id uuid;
begin
  v_siswa_id := current_siswa_id();
  if v_siswa_id is null then
    return; -- bukan siswa: diam saja, ping bukan operasi kritis
  end if;

  update jawaban_siswa
    set last_seen_at     = now(),
        progress_persen  = greatest(0, least(100, coalesce(p_progress, 0))),
        soal_aktif       = p_soal_aktif
  where siswa_id = v_siswa_id
    and mapel_id = p_mapel_id
    and submitted_at is null;
end;
$$;

comment on function ping_ujian is
  'Detak monitoring (online + progress + nomor soal aktif). Tidak menyentuh '
  'jawaban_jsonb sama sekali, jadi tidak bisa dipakai memanipulasi jawaban.';


-- ============================================================================
-- 7. RLS: tulis jawaban dibatasi deadline PRIBADI (bukan lagi waktu_selesai)
-- ============================================================================
-- GRACE 3 menit: auto-submit saat waktu habis sengaja disebar 0–15 detik per
-- siswa (jitterSubmitMs di autosave-lokal.ts) supaya 600 submit tidak menumpuk
-- di detik yang sama, ditambah kemungkinan jaringan lambat. Tanpa grace,
-- justru submit otomatis yang telat beberapa detik akan ditolak RLS dan
-- jawaban siswa tidak pernah tercatat submit — kebalikan dari yang diinginkan.
-- Grace ini TIDAK memberi waktu menjawab lebih lama: input di client sudah
-- terkunci tepat saat deadline (setWaktuHabis), grace hanya untuk pengiriman.
drop policy if exists jawaban_update_own on jawaban_siswa;
create policy jawaban_update_own on jawaban_siswa
  for update using (
    siswa_id = current_siswa_id()
    and submitted_at is null
    and exists (
      select 1 from mapel m
      where m.id = jawaban_siswa.mapel_id
        and now() <= deadline_ujian(
              jawaban_siswa.mulai_at, m.durasi_menit, m.waktu_selesai
            ) + interval '3 minutes'
    )
  ) with check (
    siswa_id = current_siswa_id()
  );


-- ============================================================================
-- 8. RPC get_monitoring_ujian — isi tabel halaman /admin/monitoring
-- ============================================================================
create or replace function get_monitoring_ujian(p_mapel_id uuid)
returns table (
  siswa_id         uuid,
  siswa_nama       text,
  siswa_username   text,
  kelas_nama       text,
  status           text,
  progress_persen  smallint,
  soal_aktif       integer,
  mulai_at         timestamptz,
  deadline         timestamptz,
  last_seen_at     timestamptz,
  submitted_at     timestamptz,
  total_skor       numeric,
  skor_maksimal    numeric,
  is_online        boolean,
  server_now       timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_mapel record;
  v_maks  numeric;
begin
  if not is_guru_atau_service() then
    raise exception 'Hanya guru/admin yang boleh membuka monitoring ujian.';
  end if;

  select m.waktu_mulai, m.waktu_selesai, m.durasi_menit into v_mapel
  from mapel m where m.id = p_mapel_id;

  if not found then
    return;
  end if;

  select coalesce(sum(so.skor), 0) into v_maks from soal so where so.mapel_id = p_mapel_id;

  return query
  select
    s.id,
    s.nama,
    s.username,
    k.nama,
    case
      when js.submitted_at is not null then 'selesai'
      when js.mulai_at is null         then 'belum_mulai'
      when now() > deadline_ujian(js.mulai_at, v_mapel.durasi_menit, v_mapel.waktu_selesai)
                                       then 'waktu_habis'
      else 'mengerjakan'
    end,
    coalesce(js.progress_persen, 0::smallint),
    js.soal_aktif,
    js.mulai_at,
    deadline_ujian(js.mulai_at, v_mapel.durasi_menit, v_mapel.waktu_selesai),
    js.last_seen_at,
    js.submitted_at,
    n.total_skor,
    v_maks,
    -- Ambang 6 menit: ExamClient ping tiap ±1 menit (dengan jitter), jadi 6
    -- menit memberi ruang beberapa ping gagal berturut-turut sebelum seorang
    -- siswa ditandai terputus — mengurangi alarm palsu saat wifi sekolah
    -- sedang padat, sesuai pola yang sudah dipakai sistem lama.
    (js.last_seen_at is not null and js.last_seen_at > now() - interval '6 minutes'),
    now()
  from siswa s
  join kelas k on k.id = s.kelas_id
  join mapel_kelas mk on mk.kelas_id = s.kelas_id and mk.mapel_id = p_mapel_id
  left join jawaban_siswa js on js.siswa_id = s.id and js.mapel_id = p_mapel_id
  left join nilai n on n.siswa_id = s.id and n.mapel_id = p_mapel_id
  order by k.nama, s.nama;
end;
$$;

comment on function get_monitoring_ujian is
  'Satu baris per SISWA TARGET mapel (bukan per baris jawaban) — siswa yang '
  'belum membuka ujian pun ikut tampil dengan status belum_mulai, supaya guru '
  'tahu siapa yang belum masuk, bukan cuma siapa yang sudah.';


-- ============================================================================
-- 9. RPC daftar mapel untuk pemilih di halaman monitoring
-- ============================================================================
create or replace function get_daftar_mapel_monitoring()
returns table (
  mapel_id       uuid,
  mapel_nama     text,
  event_id       uuid,
  event_nama     text,
  waktu_mulai    timestamptz,
  waktu_selesai  timestamptz,
  durasi_menit   integer,
  jumlah_target  bigint,
  jumlah_mulai   bigint,
  jumlah_submit  bigint,
  sedang_aktif   boolean
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not is_guru_atau_service() then
    raise exception 'Hanya guru/admin yang boleh membuka monitoring ujian.';
  end if;

  return query
  select
    m.id, m.nama, m.event_id, e.nama,
    m.waktu_mulai, m.waktu_selesai, m.durasi_menit,
    (select count(distinct s.id)
       from mapel_kelas mk join siswa s on s.kelas_id = mk.kelas_id
      where mk.mapel_id = m.id),
    (select count(*) from jawaban_siswa js
      where js.mapel_id = m.id and js.mulai_at is not null),
    (select count(*) from jawaban_siswa js
      where js.mapel_id = m.id and js.submitted_at is not null),
    (now() between m.waktu_mulai and m.waktu_selesai)
  from mapel m
  join event e on e.id = m.event_id
  order by (now() between m.waktu_mulai and m.waktu_selesai) desc,
           m.waktu_mulai desc;
end;
$$;


-- ============================================================================
-- 10. RESET & HAPUS HASIL KERJA
-- ============================================================================
-- Menghapus BARIS jawaban + nilai, bukan sekadar mengosongkan jawaban_jsonb.
-- Alasannya: dengan barisnya hilang, mulai_at ikut hilang, sehingga siswa
-- benar-benar mulai dari nol (timer penuh lagi) saat menekan Mulai Ujian —
-- itu yang dimaksud guru saat bilang "reset ujian siswa ini".
create or replace function reset_ujian_siswa(p_siswa_id uuid, p_mapel_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_guru_atau_service() then
    raise exception 'Hanya guru/admin yang boleh mereset ujian siswa.';
  end if;

  delete from nilai         where siswa_id = p_siswa_id and mapel_id = p_mapel_id;
  delete from jawaban_siswa where siswa_id = p_siswa_id and mapel_id = p_mapel_id;
end;
$$;

-- Reset massal satu mapel. Dipakai kalau guru salah pasang soal dan seluruh
-- kelas harus mengulang — jauh lebih aman daripada menghapus mapelnya
-- (yang akan ikut membuang soal-soalnya lewat ON DELETE CASCADE).
create or replace function reset_ujian_mapel(p_mapel_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not is_guru_atau_service() then
    raise exception 'Hanya guru/admin yang boleh mereset ujian.';
  end if;

  select count(*) into v_count from jawaban_siswa where mapel_id = p_mapel_id;

  delete from nilai         where mapel_id = p_mapel_id;
  delete from jawaban_siswa where mapel_id = p_mapel_id;

  return v_count;
end;
$$;

-- Paksa kumpulkan: untuk siswa yang koneksinya putus di tengah ujian dan
-- jawabannya sudah tersimpan di server tapi submitted_at masih kosong.
-- Padanan fitur "Tarik Nilai dari AutoSave" di sistem lama — bedanya di sini
-- tidak perlu menyalin data ke mana-mana, cukup mengisi submitted_at dan
-- trigger koreksi otomatis (0007) langsung menyala sendiri.
create or replace function paksa_kumpulkan(p_siswa_id uuid, p_mapel_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_guru_atau_service() then
    raise exception 'Hanya guru/admin yang boleh memaksa pengumpulan.';
  end if;

  update jawaban_siswa
     set submitted_at = now()
   where siswa_id = p_siswa_id
     and mapel_id = p_mapel_id
     and submitted_at is null;

  -- Trigger trg_jawaban_siswa_scoring sudah menghitung nilai otomatis saat
  -- submitted_at terisi. Dipanggil ulang di sini HANYA sebagai jaring
  -- pengaman kalau barisnya ternyata sudah pernah submit (update di atas
  -- tidak kena baris apa pun) tapi nilainya hilang karena reset parsial.
  perform hitung_nilai(p_siswa_id, p_mapel_id);
end;
$$;


-- ============================================================================
-- 11. Perbaikan penjaga akses RPC lama supaya bisa dipanggil lintas jenjang
-- ============================================================================
-- hitung_ulang_semua_nilai (0007) memakai `if not is_guru() then raise`, yang
-- akan menolak panggilan service_role dari halaman admin lintas jenjang.
-- Bodinya tidak berubah sama sekali, hanya penjaganya.
create or replace function hitung_ulang_semua_nilai(p_mapel_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row   record;
  v_count integer := 0;
begin
  if not is_guru_atau_service() then
    raise exception 'Hanya guru yang boleh menghitung ulang nilai secara massal.';
  end if;

  for v_row in
    select siswa_id
    from jawaban_siswa
    where mapel_id = p_mapel_id and submitted_at is not null
  loop
    perform hitung_nilai(v_row.siswa_id, p_mapel_id);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;
