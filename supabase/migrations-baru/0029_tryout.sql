-- 0029_tryout.sql
-- Jalankan HANYA di project KELAS 9. Project kelas 7 dan 8 tidak memakai
-- tryout; blok penjaga di bawah menolak berjalan di project lain.
-- Prasyarat: 0011_ujian_pro.sql, 0018_event_jenis.sql, 0024_checkout_ujian.sql,
-- 0028_log_lewati_service_role.sql.
-- Aman dijalankan berulang (idempoten). Pembatalan: 0029_tryout_BATAL.sql
--
-- =============================================================================
-- APA INI
-- =============================================================================
-- Jenis kegiatan baru `tryout` (khusus kelas 9):
--
--   event (jenis = 'tryout')        satu periode tryout, satu link
--     └─ tryout_paket               "Paket Tryout 1", token sendiri
--          └─ mapel (subtes)        Bahasa Indonesia, Matematika, ...
--               └─ soal             sama persis dengan asesmen (unggah JSON)
--
-- Siswa TIDAK login. Alur: buka link -> masukkan token paket -> pilih kelas
-- 9.x -> pilih nama -> pilih subtes (urutan bebas) -> kerjakan. Waktu
-- dihitung per subtes. Tiap subtes hanya sekali; keluar di tengah jalan tidak
-- menghentikan waktu, dan saat waktu habis jawaban otomatis terkumpul.
--
-- =============================================================================
-- KEPUTUSAN DESAIN
-- =============================================================================
-- 1. Subtes = baris `mapel` biasa (+ kolom tryout_paket_id, tryout_subtes).
--    Soal, unggah JSON + gambar, koreksi otomatis (hitung_nilai 0007),
--    jawaban_siswa, nilai, dan analisis butir soal (0012) dipakai apa adanya.
-- 2. Subtes tryout TIDAK punya baris mapel_kelas (dicegah trigger). Akibatnya
--    halaman ujian biasa, get_soal_untuk_siswa, mulai_ujian, dan RLS
--    mapel_select_siswa tidak pernah melihat subtes tryout. Siswa login tidak
--    bisa mengerjakan tryout lewat jalur ujian biasa.
-- 3. Karena siswa tryout tidak punya sesi Supabase Auth, semua RPC pengerjaan
--    hanya boleh dipanggil service_role (server Next.js). Server memverifikasi
--    cookie sesi tryout bertanda tangan lalu meneruskan siswa_id. Kunci
--    jawaban tetap dibuang di database (soal_tanpa_kunci) sebelum keluar.
-- 4. Policy RESTRICTIVE di jawaban_siswa menolak siswa login menulis baris
--    subtes tryout lewat anon key (policy lama jawaban_insert_own tidak
--    memeriksa mapel_kelas). Service_role melewati RLS, jadi RPC tetap jalan.
-- 5. Jendela waktu ada di paket (waktu_mulai/waktu_selesai). Trigger menyalin
--    jendela itu ke mapel.waktu_mulai/waktu_selesai, jadi deadline_ujian()
--    (0011) dan monitoring lama tetap memakai SATU definisi deadline:
--    min(mulai_at + durasi_menit, waktu_selesai).
-- 6. Subtes yang lewat deadline + 3 menit tanpa dikumpulkan ditutup oleh
--    tryout_tutup_kedaluwarsa(). Tidak ada cron: fungsi ini dipanggil setiap
--    kali status paket, rekap guru, atau nilai siswa dibuka.
--    submitted_at diisi = deadline, lalu trigger 0007 menghitung nilai.
-- 7. Nilai 0-100 = total_skor / jumlah skor maksimal soal x 100 (bobot sesuai
--    kolom soal.skor; bila semua skor sama, tiap soal bernilai rata).
-- 8. Salah token 10 kali dalam 5 menit dari satu perangkat/IP = tunggu.
--    `kunci_klien` adalah hash yang dibuat server, bukan IP mentah.
-- 9. Setiap masuk (token + nama) dicatat di tryout_masuk, bahan bukti bila
--    nanti ada siswa memakai nama anak lain.
-- 10. hitung_nilai (0007) dipanggil trigger dalam konteks service_role:
--    penjaganya `not is_guru() and p_siswa_id <> current_siswa_id()` bernilai
--    NULL (current_siswa_id() NULL), jadi tidak menolak. Ini sama dengan
--    jalur paksa_kumpulkan yang sudah ada; 0007 tidak diubah.

-- -----------------------------------------------------------------------------
-- 0. Penjaga: hanya project kelas 9
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from kelas where tingkat = 9)
     or exists (select 1 from kelas where tingkat in (7, 8)) then
    raise exception '0029_tryout.sql hanya untuk project KELAS 9. Dihentikan.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. event.jenis: tambah 'tryout' (khusus kelas_utama = 9)
-- -----------------------------------------------------------------------------
alter table event drop constraint if exists event_jenis_check;
alter table event
  add constraint event_jenis_check
  check (jenis in ('asesmen_akhir', 'kuis_harian', 'assignment', 'forum', 'tryout'));

alter table event drop constraint if exists event_tryout_kelas9;
alter table event
  add constraint event_tryout_kelas9
  check (jenis <> 'tryout' or kelas_utama = 9);

-- -----------------------------------------------------------------------------
-- 2. Tabel paket tryout
-- -----------------------------------------------------------------------------
create table if not exists tryout_paket (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references event (id) on delete cascade,
  nama          text not null check (length(btrim(nama)) between 1 and 100),
  urutan        integer not null default 1 check (urutan between 1 and 999),
  token         text not null check (token ~ '^[A-Z0-9]{4,12}$'),
  waktu_mulai   timestamptz not null,
  waktu_selesai timestamptz not null,
  aktif         boolean not null default true,
  created_by    uuid references guru (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint tryout_paket_waktu_valid check (waktu_selesai > waktu_mulai),
  constraint tryout_paket_urutan_unik unique (event_id, urutan),
  constraint tryout_paket_token_unik unique (event_id, token)
);

create index if not exists idx_tryout_paket_event_id on tryout_paket (event_id);

comment on table tryout_paket is
  'Paket tryout di dalam event jenis tryout. Token per paket (huruf besar/angka, '
  '4-12 karakter). Jendela waktu paket disalin ke semua subtesnya (mapel).';

drop trigger if exists trg_tryout_paket_updated_at on tryout_paket;
create trigger trg_tryout_paket_updated_at
  before update on tryout_paket
  for each row
  execute function set_updated_at();

-- Paket hanya boleh di event jenis tryout.
create or replace function cegah_paket_di_event_bukan_tryout()
returns trigger
language plpgsql
as $$
declare
  v_jenis text;
begin
  select jenis into v_jenis from event where id = new.event_id;
  if v_jenis is distinct from 'tryout' then
    raise exception 'Paket tryout hanya bisa dibuat di kegiatan berjenis Tryout.';
  end if;
  new.token := upper(btrim(new.token));
  return new;
end;
$$;

drop trigger if exists trg_cegah_paket_di_event_bukan_tryout on tryout_paket;
create trigger trg_cegah_paket_di_event_bukan_tryout
  before insert or update of event_id, token on tryout_paket
  for each row
  execute function cegah_paket_di_event_bukan_tryout();

-- -----------------------------------------------------------------------------
-- 3. Kolom subtes di mapel
-- -----------------------------------------------------------------------------
alter table mapel
  add column if not exists tryout_paket_id uuid references tryout_paket (id) on delete cascade;

alter table mapel
  add column if not exists tryout_subtes text;

alter table mapel drop constraint if exists mapel_tryout_subtes_format;
alter table mapel
  add constraint mapel_tryout_subtes_format
  check (tryout_subtes is null or tryout_subtes ~ '^[a-z][a-z0-9_]{1,39}$');

create index if not exists idx_mapel_tryout_paket_id
  on mapel (tryout_paket_id) where tryout_paket_id is not null;

create unique index if not exists uq_mapel_tryout_paket_subtes
  on mapel (tryout_paket_id, tryout_subtes) where tryout_paket_id is not null;

comment on column mapel.tryout_paket_id is
  'Terisi = mapel ini subtes tryout. NULL = mapel asesmen/kuis biasa.';
comment on column mapel.tryout_subtes is
  'Kode subtes (mis. bahasa_indonesia, matematika). Dipakai membandingkan '
  'nilai subtes yang sama antar paket untuk grafik peningkatan.';

-- 3a. Trigger 0018 diganti: izinkan mapel di event tryout.
create or replace function cegah_mapel_di_event_bukan_ujian()
returns trigger
language plpgsql
as $$
declare
  v_jenis text;
begin
  select jenis into v_jenis from event where id = new.event_id;

  if v_jenis not in ('asesmen_akhir', 'kuis_harian', 'tryout') then
    raise exception
      'Event berjenis % tidak memakai mapel/soal — assignment memakai tabel tugas, forum memakai tabel forum_topik.',
      v_jenis;
  end if;

  return new;
end;
$$;

-- 3b. Aturan subtes tryout + sinkron jendela waktu dari paket.
create or replace function atur_mapel_tryout()
returns trigger
language plpgsql
as $$
declare
  v_jenis text;
  v_paket record;
begin
  select jenis into v_jenis from event where id = new.event_id;

  if v_jenis = 'tryout' then
    if new.tryout_paket_id is null then
      raise exception 'Subtes tryout wajib berada di dalam paket.';
    end if;

    select tp.event_id, tp.waktu_mulai, tp.waktu_selesai
      into v_paket
    from tryout_paket tp
    where tp.id = new.tryout_paket_id;

    if not found or v_paket.event_id <> new.event_id then
      raise exception 'Paket tryout tidak cocok dengan kegiatan subtes ini.';
    end if;
    if new.tryout_subtes is null then
      raise exception 'Kode subtes tryout wajib diisi.';
    end if;
    if new.durasi_menit is null then
      raise exception 'Durasi subtes tryout wajib diisi (menit).';
    end if;

    new.waktu_mulai    := v_paket.waktu_mulai;
    new.waktu_selesai  := v_paket.waktu_selesai;
    new.checkout_wajib := false;
  else
    if new.tryout_paket_id is not null or new.tryout_subtes is not null then
      raise exception 'Kolom subtes tryout hanya untuk kegiatan berjenis Tryout.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_atur_mapel_tryout on mapel;
create trigger trg_atur_mapel_tryout
  before insert or update on mapel
  for each row
  execute function atur_mapel_tryout();

-- 3c. Jendela paket berubah -> ikut ke semua subtesnya.
create or replace function sinkron_waktu_paket_ke_mapel()
returns trigger
language plpgsql
as $$
begin
  if new.waktu_mulai is distinct from old.waktu_mulai
     or new.waktu_selesai is distinct from old.waktu_selesai then
    update mapel
       set waktu_mulai = new.waktu_mulai,
           waktu_selesai = new.waktu_selesai
     where tryout_paket_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sinkron_waktu_paket_ke_mapel on tryout_paket;
create trigger trg_sinkron_waktu_paket_ke_mapel
  after update of waktu_mulai, waktu_selesai on tryout_paket
  for each row
  execute function sinkron_waktu_paket_ke_mapel();

-- 3d. Subtes tryout tidak boleh punya mapel_kelas (lihat keputusan 2).
create or replace function mapel_adalah_tryout(p_mapel_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from mapel where id = p_mapel_id and tryout_paket_id is not null
  );
$$;

comment on function mapel_adalah_tryout is
  'true = mapel ini subtes tryout. Dipakai trigger mapel_kelas dan policy '
  'restrictive jawaban_siswa. Hanya mengembalikan boolean.';

create or replace function cegah_mapel_kelas_tryout()
returns trigger
language plpgsql
as $$
begin
  if mapel_adalah_tryout(new.mapel_id) then
    raise exception 'Subtes tryout tidak memakai kelas target; siswa masuk lewat link dan token.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cegah_mapel_kelas_tryout on mapel_kelas;
create trigger trg_cegah_mapel_kelas_tryout
  before insert or update on mapel_kelas
  for each row
  execute function cegah_mapel_kelas_tryout();

-- -----------------------------------------------------------------------------
-- 4. Log masuk & pembatas salah token
-- -----------------------------------------------------------------------------
create table if not exists tryout_masuk (
  id          bigint generated always as identity primary key,
  paket_id    uuid not null references tryout_paket (id) on delete cascade,
  siswa_id    uuid not null references siswa (id) on delete cascade,
  kunci_klien text,
  masuk_at    timestamptz not null default now()
);

create index if not exists idx_tryout_masuk_paket_siswa
  on tryout_masuk (paket_id, siswa_id);

comment on table tryout_masuk is
  'Setiap kali siswa memasukkan token + memilih nama. kunci_klien = hash '
  'perangkat/IP dari server (bukan IP mentah). Bukti bila ada nama dipakai orang lain.';

create table if not exists tryout_gagal_token (
  kunci_klien text primary key,
  jumlah      integer not null default 0,
  mulai_at    timestamptz not null default now()
);

comment on table tryout_gagal_token is
  'Hitungan salah token per kunci_klien dalam jendela 5 menit. Hanya RPC yang menulis.';

-- -----------------------------------------------------------------------------
-- 5. RLS
-- -----------------------------------------------------------------------------
alter table tryout_paket enable row level security;
alter table tryout_masuk enable row level security;
alter table tryout_gagal_token enable row level security;

drop policy if exists tryout_paket_guru_all on tryout_paket;
create policy tryout_paket_guru_all on tryout_paket
  for all using (is_guru()) with check (is_guru());

drop policy if exists tryout_masuk_select_guru on tryout_masuk;
create policy tryout_masuk_select_guru on tryout_masuk
  for select using (is_guru());

revoke all on table tryout_masuk from anon, authenticated;
grant select on table tryout_masuk to authenticated;
revoke all on table tryout_gagal_token from anon, authenticated;
revoke all on table tryout_paket from anon;

-- Siswa login tidak boleh menulis jawaban subtes tryout lewat anon key.
drop policy if exists jawaban_tolak_tryout_insert on jawaban_siswa;
create policy jawaban_tolak_tryout_insert on jawaban_siswa
  as restrictive
  for insert to authenticated
  with check (not mapel_adalah_tryout(mapel_id));

drop policy if exists jawaban_tolak_tryout_update on jawaban_siswa;
create policy jawaban_tolak_tryout_update on jawaban_siswa
  as restrictive
  for update to authenticated
  using (not mapel_adalah_tryout(mapel_id))
  with check (not mapel_adalah_tryout(mapel_id));

-- -----------------------------------------------------------------------------
-- 6. Helper: buang kunci jawaban dari konten soal
-- -----------------------------------------------------------------------------
-- Logika sama dengan get_soal_untuk_siswa (0006), ditambah coalesce supaya
-- array kosong tidak membuat konten jadi NULL.
create or replace function soal_tanpa_kunci(p_tipe tipe_soal, p_konten jsonb)
returns jsonb
language sql
immutable
as $$
  select case p_tipe
    when 'pilgan_biasa' then
      jsonb_set(p_konten, '{opsi}', coalesce(
        (select jsonb_agg(o - 'benar') from jsonb_array_elements(coalesce(p_konten->'opsi', '[]'::jsonb)) o),
        '[]'::jsonb))
    when 'pilgan_kompleks' then
      jsonb_set(p_konten, '{opsi}', coalesce(
        (select jsonb_agg(o - 'benar') from jsonb_array_elements(coalesce(p_konten->'opsi', '[]'::jsonb)) o),
        '[]'::jsonb))
    when 'uraian_singkat' then
      p_konten - 'kunci_jawaban'
    when 'benar_salah' then
      p_konten - 'jawaban_benar'
    when 'multi_benar_salah' then
      jsonb_set(p_konten, '{pernyataan}', coalesce(
        (select jsonb_agg(p - 'jawaban_benar') from jsonb_array_elements(coalesce(p_konten->'pernyataan', '[]'::jsonb)) p),
        '[]'::jsonb))
    when 'menjodohkan' then
      p_konten - 'pasangan_benar'
    else
      p_konten
  end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Helper validasi akses (internal, dipanggil RPC di bawah)
-- -----------------------------------------------------------------------------
create or replace function tryout_validasi(
  p_paket_id uuid,
  p_siswa_id uuid,
  p_mapel_id uuid,
  out o_durasi_menit integer,
  out o_waktu_mulai timestamptz,
  out o_waktu_selesai timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not exists (
    select 1 from siswa s join kelas k on k.id = s.kelas_id
    where s.id = p_siswa_id and k.tingkat = 9
  ) then
    raise exception 'Siswa tidak terdaftar di kelas 9.';
  end if;

  if p_mapel_id is null then
    select null::integer, tp.waktu_mulai, tp.waktu_selesai
      into o_durasi_menit, o_waktu_mulai, o_waktu_selesai
    from tryout_paket tp
    join event e on e.id = tp.event_id
    where tp.id = p_paket_id and tp.aktif and e.jenis = 'tryout' and e.ditutup_at is null;
  else
    select m.durasi_menit, m.waktu_mulai, m.waktu_selesai
      into o_durasi_menit, o_waktu_mulai, o_waktu_selesai
    from mapel m
    join tryout_paket tp on tp.id = m.tryout_paket_id
    join event e on e.id = tp.event_id
    where m.id = p_mapel_id and tp.id = p_paket_id
      and tp.aktif and e.jenis = 'tryout' and e.ditutup_at is null;
  end if;

  if not found or o_waktu_selesai is null then
    raise exception 'Paket atau subtes tryout tidak tersedia.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. Tutup subtes yang lewat waktu (lihat keputusan 6)
-- -----------------------------------------------------------------------------
create or replace function tryout_tutup_kedaluwarsa(
  p_event_id uuid default null,
  p_siswa_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  if not (
    is_guru_atau_service()
    or (p_siswa_id is not null and p_siswa_id = current_siswa_id())
  ) then
    raise exception 'Tidak berwenang.';
  end if;

  update jawaban_siswa js
     set submitted_at = deadline_ujian(js.mulai_at, m.durasi_menit, m.waktu_selesai)
    from mapel m
   where m.id = js.mapel_id
     and m.tryout_paket_id is not null
     and js.submitted_at is null
     and now() > deadline_ujian(js.mulai_at, m.durasi_menit, m.waktu_selesai) + interval '3 minutes'
     and (p_event_id is null or m.event_id = p_event_id)
     and (p_siswa_id is null or js.siswa_id = p_siswa_id);

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. RPC pengerjaan (HANYA service_role)
-- -----------------------------------------------------------------------------

-- 9a. Cek token. Mengembalikan status, bukan exception, supaya hitungan
--     salah token tidak ikut di-rollback.
create or replace function tryout_cek_token(
  p_event_id uuid,
  p_token text,
  p_kunci_klien text
)
returns table (
  status        text,
  paket_id      uuid,
  paket_nama    text,
  waktu_mulai   timestamptz,
  waktu_selesai timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_kunci text := coalesce(nullif(btrim(p_kunci_klien), ''), 'tanpa-kunci');
  v_token text := upper(regexp_replace(coalesce(p_token, ''), '\s', '', 'g'));
  v_gagal record;
  v_paket record;
begin
  select g.jumlah, g.mulai_at into v_gagal
  from tryout_gagal_token g where g.kunci_klien = v_kunci;

  if found and v_gagal.mulai_at > now() - interval '5 minutes' and v_gagal.jumlah >= 10 then
    return query select 'diblokir'::text, null::uuid, null::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  select tp.id, tp.nama, tp.waktu_mulai, tp.waktu_selesai, e.ditutup_at
    into v_paket
  from tryout_paket tp
  join event e on e.id = tp.event_id
  where tp.event_id = p_event_id
    and e.jenis = 'tryout'
    and tp.aktif
    and tp.token = v_token;

  if not found then
    insert into tryout_gagal_token as g (kunci_klien, jumlah, mulai_at)
    values (v_kunci, 1, now())
    on conflict (kunci_klien) do update
      set jumlah   = case when g.mulai_at > now() - interval '5 minutes' then g.jumlah + 1 else 1 end,
          mulai_at = case when g.mulai_at > now() - interval '5 minutes' then g.mulai_at else now() end;
    return query select 'salah'::text, null::uuid, null::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  delete from tryout_gagal_token g where g.kunci_klien = v_kunci;

  return query select
    case
      when v_paket.ditutup_at is not null then 'sudah_ditutup'
      when now() < v_paket.waktu_mulai then 'belum_dibuka'
      when now() > v_paket.waktu_selesai then 'sudah_ditutup'
      else 'ok'
    end::text,
    v_paket.id, v_paket.nama, v_paket.waktu_mulai, v_paket.waktu_selesai;
end;
$$;

-- 9b. Daftar nama siswa kelas 9 untuk dropdown (tanpa username).
create or replace function tryout_daftar_siswa(p_kelas_nama text)
returns table (id uuid, nama text)
language sql
security definer
set search_path = public
stable
as $$
  select s.id, s.nama
  from siswa s
  join kelas k on k.id = s.kelas_id
  where k.tingkat = 9 and k.nama = p_kelas_nama
  order by s.nama;
$$;

-- 9c. Catat masuk (setelah token benar + nama dipilih).
create or replace function tryout_masuk_paket(
  p_paket_id uuid,
  p_siswa_id uuid,
  p_kunci_klien text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
begin
  select * into v from tryout_validasi(p_paket_id, p_siswa_id, null);
  if now() < v.o_waktu_mulai then
    raise exception 'Paket tryout belum dibuka.';
  end if;
  if now() > v.o_waktu_selesai then
    raise exception 'Paket tryout sudah ditutup.';
  end if;

  insert into tryout_masuk (paket_id, siswa_id, kunci_klien)
  values (p_paket_id, p_siswa_id, nullif(btrim(p_kunci_klien), ''));
end;
$$;

-- 9d. Status semua subtes paket untuk satu siswa (halaman pilih subtes).
create or replace function tryout_status_paket(p_paket_id uuid, p_siswa_id uuid)
returns table (
  mapel_id      uuid,
  nama          text,
  subtes        text,
  durasi_menit  integer,
  jumlah_soal   integer,
  status        text,
  mulai_at      timestamptz,
  deadline      timestamptz,
  submitted_at  timestamptz,
  nilai_100     numeric,
  server_now    timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  perform tryout_validasi(p_paket_id, p_siswa_id, null);
  perform tryout_tutup_kedaluwarsa(null, p_siswa_id);

  return query
  select
    m.id,
    m.nama,
    m.tryout_subtes,
    m.durasi_menit,
    (select count(*)::integer from soal so where so.mapel_id = m.id),
    case
      when js.submitted_at is not null then 'selesai'
      when js.mulai_at is not null then 'mengerjakan'
      else 'belum'
    end,
    js.mulai_at,
    case when js.mulai_at is null then null
         else deadline_ujian(js.mulai_at, m.durasi_menit, m.waktu_selesai) end,
    js.submitted_at,
    case when js.submitted_at is null then null
         else round(coalesce(n.total_skor, 0) * 100
                    / nullif((select sum(so.skor) from soal so where so.mapel_id = m.id), 0), 2)
    end,
    now()
  from mapel m
  left join jawaban_siswa js on js.mapel_id = m.id and js.siswa_id = p_siswa_id
  left join nilai n on n.mapel_id = m.id and n.siswa_id = p_siswa_id
  where m.tryout_paket_id = p_paket_id
  order by m.nama;
end;
$$;

-- 9e. Mulai / lanjutkan subtes. mulai_at tidak pernah ditimpa.
create or replace function tryout_mulai_subtes(
  p_paket_id uuid,
  p_siswa_id uuid,
  p_mapel_id uuid
)
returns table (
  deadline      timestamptz,
  server_now    timestamptz,
  mulai_at      timestamptz,
  submitted_at  timestamptz,
  jawaban_jsonb jsonb
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v   record;
  v_r record;
begin
  select * into v from tryout_validasi(p_paket_id, p_siswa_id, p_mapel_id);

  if not exists (
    select 1 from jawaban_siswa js
    where js.siswa_id = p_siswa_id and js.mapel_id = p_mapel_id
  ) then
    if now() < v.o_waktu_mulai then
      raise exception 'Paket tryout belum dibuka.';
    end if;
    if now() > v.o_waktu_selesai then
      raise exception 'Paket tryout sudah ditutup.';
    end if;
    if not exists (select 1 from soal so where so.mapel_id = p_mapel_id) then
      raise exception 'Subtes ini belum berisi soal.';
    end if;
  end if;

  insert into jawaban_siswa as js (siswa_id, mapel_id, jawaban_jsonb, mulai_at, last_seen_at)
  values (p_siswa_id, p_mapel_id, '{}'::jsonb, now(), now())
  on conflict (siswa_id, mapel_id) do update
    set mulai_at     = coalesce(js.mulai_at, now()),
        last_seen_at = now();

  perform tryout_tutup_kedaluwarsa(null, p_siswa_id);

  select js.mulai_at, js.submitted_at, js.jawaban_jsonb into v_r
  from jawaban_siswa js
  where js.siswa_id = p_siswa_id and js.mapel_id = p_mapel_id;

  return query select
    deadline_ujian(v_r.mulai_at, v.o_durasi_menit, v.o_waktu_selesai),
    now(),
    v_r.mulai_at,
    v_r.submitted_at,
    case when v_r.submitted_at is null then v_r.jawaban_jsonb else '{}'::jsonb end;
end;
$$;

-- 9f. Ambil soal tanpa kunci. Hanya selama subtes sedang dikerjakan.
create or replace function tryout_soal(
  p_paket_id uuid,
  p_siswa_id uuid,
  p_mapel_id uuid
)
returns table (
  id           uuid,
  tipe         tipe_soal,
  urutan       integer,
  skor         numeric,
  konten_jsonb jsonb,
  gambar_url   text
)
language plpgsql
security definer
set search_path = public
stable
as $$
#variable_conflict use_column
declare
  v record;
begin
  select * into v from tryout_validasi(p_paket_id, p_siswa_id, p_mapel_id);

  if not exists (
    select 1 from jawaban_siswa js
    where js.siswa_id = p_siswa_id and js.mapel_id = p_mapel_id
      and js.mulai_at is not null
      and js.submitted_at is null
      and now() <= deadline_ujian(js.mulai_at, v.o_durasi_menit, v.o_waktu_selesai) + interval '3 minutes'
  ) then
    raise exception 'Subtes tidak sedang dikerjakan.';
  end if;

  return query
  select s.id, s.tipe, s.urutan, s.skor, soal_tanpa_kunci(s.tipe, s.konten_jsonb), s.gambar_url
  from soal s
  where s.mapel_id = p_mapel_id
  order by s.urutan;
end;
$$;

-- 9g. Simpan jawaban (autosave) + detak monitoring.
create or replace function tryout_simpan_jawaban(
  p_paket_id   uuid,
  p_siswa_id   uuid,
  p_mapel_id   uuid,
  p_jawaban    jsonb,
  p_progress   smallint,
  p_soal_aktif integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v   record;
  v_n integer;
begin
  if p_jawaban is null or jsonb_typeof(p_jawaban) <> 'object' then
    raise exception 'Format jawaban tidak valid.';
  end if;
  if pg_column_size(p_jawaban) > 262144 then
    raise exception 'Jawaban terlalu besar.';
  end if;

  select * into v from tryout_validasi(p_paket_id, p_siswa_id, p_mapel_id);

  update jawaban_siswa js
     set jawaban_jsonb   = p_jawaban,
         last_seen_at    = now(),
         progress_persen = greatest(0, least(100, coalesce(p_progress, 0))),
         soal_aktif      = p_soal_aktif
   where js.siswa_id = p_siswa_id
     and js.mapel_id = p_mapel_id
     and js.submitted_at is null
     and js.mulai_at is not null
     and now() <= deadline_ujian(js.mulai_at, v.o_durasi_menit, v.o_waktu_selesai) + interval '3 minutes';

  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

-- 9h. Kumpulkan. Jawaban terakhir (opsional) disimpan dulu bila masih dalam
--     batas waktu; lewat batas, yang tersimpan terakhir yang dinilai.
create or replace function tryout_kumpulkan(
  p_paket_id uuid,
  p_siswa_id uuid,
  p_mapel_id uuid,
  p_jawaban  jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
begin
  select * into v from tryout_validasi(p_paket_id, p_siswa_id, p_mapel_id);

  if p_jawaban is not null then
    perform tryout_simpan_jawaban(p_paket_id, p_siswa_id, p_mapel_id, p_jawaban, 100::smallint, null);
  end if;

  update jawaban_siswa js
     set submitted_at = least(now(), deadline_ujian(js.mulai_at, v.o_durasi_menit, v.o_waktu_selesai))
   where js.siswa_id = p_siswa_id
     and js.mapel_id = p_mapel_id
     and js.submitted_at is null
     and js.mulai_at is not null;
end;
$$;

-- -----------------------------------------------------------------------------
-- 10. Statistik
-- -----------------------------------------------------------------------------

-- 10a. Rekap lengkap untuk guru: semua siswa kelas 9 x semua subtes.
--      p_event_id NULL = semua kegiatan tryout (statistik angkatan).
--      Siswa yang belum mengerjakan tetap muncul (status 'belum').
create or replace function tryout_rekap_nilai(p_event_id uuid default null)
returns table (
  event_id      uuid,
  event_nama    text,
  paket_id      uuid,
  paket_nama    text,
  paket_urutan  integer,
  paket_mulai   timestamptz,
  mapel_id      uuid,
  subtes        text,
  subtes_nama   text,
  siswa_id      uuid,
  siswa_nama    text,
  kelas_nama    text,
  status        text,
  total_skor    numeric,
  skor_maks     numeric,
  nilai_100     numeric,
  mulai_at      timestamptz,
  submitted_at  timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not is_guru_atau_service() then
    raise exception 'Hanya guru yang boleh mengakses statistik tryout.';
  end if;

  perform tryout_tutup_kedaluwarsa(p_event_id, null);

  return query
  with daftar_subtes as (
    select
      e.id as event_id, e.nama as event_nama,
      tp.id as paket_id, tp.nama as paket_nama, tp.urutan as paket_urutan,
      tp.waktu_mulai as paket_mulai,
      m.id as mapel_id, m.tryout_subtes, m.nama as subtes_nama,
      coalesce((select sum(so.skor) from soal so where so.mapel_id = m.id), 0) as skor_maks
    from event e
    join tryout_paket tp on tp.event_id = e.id
    join mapel m on m.tryout_paket_id = tp.id
    where e.jenis = 'tryout'
      and (p_event_id is null or e.id = p_event_id)
  ),
  peserta as (
    select s.id, s.nama, k.nama as kelas_nama
    from siswa s join kelas k on k.id = s.kelas_id
    where k.tingkat = 9
  )
  select
    st.event_id, st.event_nama, st.paket_id, st.paket_nama, st.paket_urutan, st.paket_mulai,
    st.mapel_id, st.tryout_subtes, st.subtes_nama,
    p.id, p.nama, p.kelas_nama,
    case
      when js.submitted_at is not null then 'selesai'
      when js.mulai_at is not null then 'mengerjakan'
      else 'belum'
    end,
    case when js.submitted_at is null then null else coalesce(n.total_skor, 0) end,
    st.skor_maks,
    case when js.submitted_at is null then null
         else round(coalesce(n.total_skor, 0) * 100 / nullif(st.skor_maks, 0), 2) end,
    js.mulai_at,
    js.submitted_at
  from daftar_subtes st
  cross join peserta p
  left join jawaban_siswa js on js.mapel_id = st.mapel_id and js.siswa_id = p.id
  left join nilai n on n.mapel_id = st.mapel_id and n.siswa_id = p.id
  order by st.event_nama, st.paket_urutan, st.subtes_nama, p.kelas_nama, p.nama;
end;
$$;

-- 10b. Nilai milik siswa yang login (menu siswa). Hanya nilai, tanpa
--      jawaban/kunci/pembahasan. Hanya subtes yang sudah terkumpul.
create or replace function tryout_nilai_saya()
returns table (
  event_id      uuid,
  event_nama    text,
  paket_id      uuid,
  paket_nama    text,
  paket_urutan  integer,
  paket_mulai   timestamptz,
  subtes        text,
  subtes_nama   text,
  nilai_100     numeric,
  submitted_at  timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_siswa_id uuid := current_siswa_id();
begin
  if v_siswa_id is null then
    raise exception 'Hanya siswa yang bisa melihat nilai tryout sendiri.';
  end if;

  perform tryout_tutup_kedaluwarsa(null, v_siswa_id);

  return query
  select
    e.id, e.nama, tp.id, tp.nama, tp.urutan, tp.waktu_mulai,
    m.tryout_subtes, m.nama,
    round(coalesce(n.total_skor, 0) * 100
          / nullif((select sum(so.skor) from soal so where so.mapel_id = m.id), 0), 2),
    js.submitted_at
  from jawaban_siswa js
  join mapel m on m.id = js.mapel_id
  join tryout_paket tp on tp.id = m.tryout_paket_id
  join event e on e.id = tp.event_id
  left join nilai n on n.mapel_id = js.mapel_id and n.siswa_id = js.siswa_id
  where js.siswa_id = v_siswa_id
    and js.submitted_at is not null
  order by tp.waktu_mulai, tp.urutan, m.nama;
end;
$$;

-- -----------------------------------------------------------------------------
-- 11. Hak eksekusi
-- -----------------------------------------------------------------------------
revoke all on function soal_tanpa_kunci(tipe_soal, jsonb) from public, anon, authenticated;
revoke all on function tryout_validasi(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function tryout_cek_token(uuid, text, text) from public, anon, authenticated;
revoke all on function tryout_daftar_siswa(text) from public, anon, authenticated;
revoke all on function tryout_masuk_paket(uuid, uuid, text) from public, anon, authenticated;
revoke all on function tryout_status_paket(uuid, uuid) from public, anon, authenticated;
revoke all on function tryout_mulai_subtes(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function tryout_soal(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function tryout_simpan_jawaban(uuid, uuid, uuid, jsonb, smallint, integer) from public, anon, authenticated;
revoke all on function tryout_kumpulkan(uuid, uuid, uuid, jsonb) from public, anon, authenticated;

grant execute on function soal_tanpa_kunci(tipe_soal, jsonb) to service_role;
grant execute on function tryout_validasi(uuid, uuid, uuid) to service_role;
grant execute on function tryout_cek_token(uuid, text, text) to service_role;
grant execute on function tryout_daftar_siswa(text) to service_role;
grant execute on function tryout_masuk_paket(uuid, uuid, text) to service_role;
grant execute on function tryout_status_paket(uuid, uuid) to service_role;
grant execute on function tryout_mulai_subtes(uuid, uuid, uuid) to service_role;
grant execute on function tryout_soal(uuid, uuid, uuid) to service_role;
grant execute on function tryout_simpan_jawaban(uuid, uuid, uuid, jsonb, smallint, integer) to service_role;
grant execute on function tryout_kumpulkan(uuid, uuid, uuid, jsonb) to service_role;

-- Guru (sesi login) & service_role; penjaga di dalam fungsi.
revoke all on function tryout_tutup_kedaluwarsa(uuid, uuid) from public, anon;
grant execute on function tryout_tutup_kedaluwarsa(uuid, uuid) to authenticated, service_role;
revoke all on function tryout_rekap_nilai(uuid) from public, anon;
grant execute on function tryout_rekap_nilai(uuid) to authenticated, service_role;

-- Siswa login.
revoke all on function tryout_nilai_saya() from public, anon;
grant execute on function tryout_nilai_saya() to authenticated;

-- Dipakai policy jawaban_siswa (dievaluasi sebagai authenticated).
revoke all on function mapel_adalah_tryout(uuid) from public, anon;
grant execute on function mapel_adalah_tryout(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- CEK AKHIR — harus menghasilkan 0 baris
-- -----------------------------------------------------------------------------
select masalah from (
  select 'event_jenis_check belum memuat tryout' as masalah
   where not exists (
     select 1 from pg_constraint
      where conname = 'event_jenis_check'
        and pg_get_constraintdef(oid) like '%tryout%')
  union all
  select 'constraint event_tryout_kelas9 belum ada'
   where not exists (select 1 from pg_constraint where conname = 'event_tryout_kelas9')
  union all
  select 'tabel tryout_paket belum ada'
   where to_regclass('public.tryout_paket') is null
  union all
  select 'kolom mapel.tryout_paket_id / tryout_subtes belum ada'
   where (select count(*) from information_schema.columns
           where table_schema = 'public' and table_name = 'mapel'
             and column_name in ('tryout_paket_id', 'tryout_subtes')) <> 2
  union all
  select 'trigger ' || t || ' belum ada'
    from unnest(array['trg_atur_mapel_tryout', 'trg_cegah_mapel_kelas_tryout',
                      'trg_cegah_paket_di_event_bukan_tryout',
                      'trg_sinkron_waktu_paket_ke_mapel']) t
   where not exists (select 1 from pg_trigger where tgname = t and not tgisinternal)
  union all
  select 'trigger 0018 belum mengizinkan tryout'
   where not exists (
     select 1 from pg_proc
      where proname = 'cegah_mapel_di_event_bukan_ujian' and prosrc like '%tryout%')
  union all
  select 'RLS ' || r || ' belum aktif'
    from unnest(array['tryout_paket', 'tryout_masuk', 'tryout_gagal_token']) r
   where not exists (
     select 1 from pg_class
      where oid = ('public.' || r)::regclass and relrowsecurity)
  union all
  select 'policy restrictive jawaban_siswa belum ada'
   where (select count(*) from pg_policy
           where polrelid = 'public.jawaban_siswa'::regclass
             and polname in ('jawaban_tolak_tryout_insert', 'jawaban_tolak_tryout_update')
             and not polpermissive) <> 2
  union all
  select 'anon/authenticated masih bisa memanggil ' || f
    from unnest(array[
      'tryout_cek_token(uuid, text, text)',
      'tryout_daftar_siswa(text)',
      'tryout_masuk_paket(uuid, uuid, text)',
      'tryout_status_paket(uuid, uuid)',
      'tryout_mulai_subtes(uuid, uuid, uuid)',
      'tryout_soal(uuid, uuid, uuid)',
      'tryout_simpan_jawaban(uuid, uuid, uuid, jsonb, smallint, integer)',
      'tryout_kumpulkan(uuid, uuid, uuid, jsonb)',
      'tryout_validasi(uuid, uuid, uuid)']) f
   where has_function_privilege('anon', ('public.' || f)::regprocedure, 'EXECUTE')
      or has_function_privilege('authenticated', ('public.' || f)::regprocedure, 'EXECUTE')
  union all
  select 'anon masih bisa memanggil ' || f
    from unnest(array['tryout_rekap_nilai(uuid)', 'tryout_nilai_saya()',
                      'tryout_tutup_kedaluwarsa(uuid, uuid)']) f
   where has_function_privilege('anon', ('public.' || f)::regprocedure, 'EXECUTE')
  union all
  select 'tryout_gagal_token masih bisa dibaca/ditulis siswa/guru'
   where has_table_privilege('authenticated', 'public.tryout_gagal_token', 'SELECT')
      or has_table_privilege('authenticated', 'public.tryout_gagal_token', 'INSERT')
      or has_table_privilege('anon', 'public.tryout_gagal_token', 'SELECT')
  union all
  select 'soal_tanpa_kunci masih membocorkan kunci'
   where soal_tanpa_kunci('pilgan_biasa',
           '{"opsi":[{"id":"o1","teks":"a","benar":true}]}'::jsonb)::text like '%benar%'
      or soal_tanpa_kunci('multi_benar_salah',
           '{"pernyataan":[{"id":"p1","teks":"a","jawaban_benar":true}]}'::jsonb)::text like '%jawaban_benar%'
      or soal_tanpa_kunci('menjodohkan',
           '{"pasangan_benar":{"s1":"j1"}}'::jsonb) ? 'pasangan_benar'
      or soal_tanpa_kunci('pilgan_biasa', '{"opsi":[]}'::jsonb) is null
) cek;
