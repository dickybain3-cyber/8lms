-- 0012_statistik_lanjutan.sql
-- ============================================================================
-- Salin IDENTIK ke migrations-kelas7 / kelas8 / kelas9, sama seperti 0011.
-- Jalankan SETELAH 0011 (butuh is_guru_atau_service() dari file itu).
--
-- Memindahkan logika statistik yang di sistem lama dihitung di browser
-- (renderAnalisisButirSoal di admin_baru.html: matriks benar/salah/kosong per
-- butir, kategori mudah/sedang/sulit, distribusi jawaban) ke dalam database.
--
-- Kenapa dipindah ke DB, bukan ditiru apa adanya di React?
--   1. Sistem lama menarik SELURUH detail koreksi semua siswa ke browser lalu
--      mem-parse JSON satu per satu. Untuk 600 siswa × 40 soal itu ratusan
--      ribu operasi di HP guru — sumber lag yang sudah terasa di sistem lama.
--   2. Halaman admin lintas jenjang memanggil RPC yang sama ke 3 project
--      sekaligus; kalau agregasinya di client, kodenya harus dijalankan 3×
--      dan hasilnya digabung manual.
--   3. detail_jsonb (skor per soal) sudah ada sejak 0007 — bahan mentahnya
--      lengkap, tinggal diagregasi.
-- ============================================================================


-- ============================================================================
-- 1. Penjaga akses statistik lama -> izinkan service_role (lintas jenjang)
-- ============================================================================
-- Bodi kedua fungsi ini SAMA PERSIS dengan 0008, hanya `is_guru()` pada baris
-- penjaga yang diganti `is_guru_atau_service()`. Ditulis ulang utuh karena
-- Postgres tidak punya cara menambal sebagian isi fungsi.
create or replace function get_statistik_mapel()
returns table (
  mapel_id       uuid,
  mapel_nama     text,
  event_id       uuid,
  event_nama     text,
  waktu_mulai    timestamptz,
  waktu_selesai  timestamptz,
  jumlah_target  bigint,
  jumlah_submit  bigint,
  skor_maksimal  numeric,
  rata_rata      numeric,
  skor_min       numeric,
  skor_max       numeric
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not is_guru_atau_service() then
    raise exception 'Hanya guru yang boleh mengakses statistik.';
  end if;

  return query
  select
    m.id, m.nama, m.event_id, e.nama, m.waktu_mulai, m.waktu_selesai,
    (select count(distinct s.id)
       from mapel_kelas mk join siswa s on s.kelas_id = mk.kelas_id
      where mk.mapel_id = m.id) as jumlah_target,
    (select count(*) from jawaban_siswa js
      where js.mapel_id = m.id and js.submitted_at is not null) as jumlah_submit,
    (select coalesce(sum(so.skor), 0) from soal so where so.mapel_id = m.id) as skor_maksimal,
    (select round(avg(n.total_skor), 2) from nilai n where n.mapel_id = m.id),
    (select min(n.total_skor) from nilai n where n.mapel_id = m.id),
    (select max(n.total_skor) from nilai n where n.mapel_id = m.id)
  from mapel m
  join event e on e.id = m.event_id
  order by e.tgl_mulai desc, m.waktu_mulai;
end;
$$;

create or replace function get_distribusi_nilai(p_mapel_id uuid)
returns table (rentang text, jumlah bigint)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_maks numeric;
begin
  if not is_guru_atau_service() then
    raise exception 'Hanya guru yang boleh mengakses statistik.';
  end if;

  select coalesce(sum(skor), 0) into v_maks from soal where mapel_id = p_mapel_id;
  if v_maks = 0 then
    return;
  end if;

  return query
  select bucket.rentang, count(n.total_skor)
  from (
    values
      ('0–19%', 0, 19),
      ('20–39%', 20, 39),
      ('40–59%', 40, 59),
      ('60–79%', 60, 79),
      ('80–100%', 80, 100)
  ) as bucket(rentang, batas_bawah, batas_atas)
  left join nilai n
    on n.mapel_id = p_mapel_id
    and (n.total_skor / v_maks * 100) >= bucket.batas_bawah
    and (n.total_skor / v_maks * 100) <= bucket.batas_atas
  group by bucket.rentang, bucket.batas_bawah
  order by bucket.batas_bawah;
end;
$$;


-- ============================================================================
-- 2. ANALISIS BUTIR SOAL
-- ============================================================================
-- Padanan "Matriks Analisis Butir Soal" di sistem lama. Status per (siswa,
-- soal) diturunkan dari detail_jsonb (skor yang didapat) dibanding soal.skor:
--
--   skor == skor_maks  -> benar
--   0 < skor < maks    -> sebagian  (multi_benar_salah & menjodohkan memang
--                                    dinilai proporsional, lihat 0007)
--   skor == 0 & dijawab-> salah
--   tidak ada jawaban  -> kosong
--
-- Ambang kategori mengikuti sistem lama supaya guru tidak perlu belajar
-- ambang baru: >70% mudah, 30–70% sedang, <30% sulit. (Ini "tingkat
-- kesukaran" empiris — proporsi siswa yang menjawab benar — bukan
-- daya pembeda; keduanya beda ukuran dan jangan dibaca tertukar.)
create or replace function get_analisis_butir_soal(p_mapel_id uuid)
returns table (
  soal_id          uuid,
  urutan           integer,
  tipe             text,
  skor_maks        numeric,
  jumlah_peserta   bigint,
  jumlah_benar     bigint,
  jumlah_sebagian  bigint,
  jumlah_salah     bigint,
  jumlah_kosong    bigint,
  rata_skor        numeric,
  persen_benar     numeric,
  kategori         text
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not is_guru_atau_service() then
    raise exception 'Hanya guru yang boleh mengakses statistik.';
  end if;

  return query
  with peserta as (
    -- Hanya siswa yang SUDAH submit — siswa yang belum mengerjakan tidak
    -- boleh ikut menurunkan persentase benar suatu butir, itu akan membuat
    -- semua soal terlihat "sulit" padahal sebagian kelas belum ujian.
    select js.siswa_id, js.jawaban_jsonb, n.detail_jsonb
    from jawaban_siswa js
    left join nilai n on n.siswa_id = js.siswa_id and n.mapel_id = js.mapel_id
    where js.mapel_id = p_mapel_id and js.submitted_at is not null
  ),
  per_soal as (
    select
      so.id            as soal_id,
      so.urutan        as urutan,
      so.tipe::text    as tipe,
      so.skor          as skor_maks,
      p.siswa_id,
      coalesce((p.detail_jsonb ->> so.id::text)::numeric, 0) as skor_didapat,
      (p.jawaban_jsonb ? so.id::text
        and p.jawaban_jsonb -> so.id::text <> 'null'::jsonb) as dijawab
    from soal so
    cross join peserta p
    where so.mapel_id = p_mapel_id
  )
  select
    ps.soal_id,
    ps.urutan,
    ps.tipe,
    ps.skor_maks,
    count(*)                                                              as jumlah_peserta,
    count(*) filter (where ps.skor_didapat >= ps.skor_maks and ps.skor_maks > 0) as jumlah_benar,
    count(*) filter (where ps.skor_didapat > 0 and ps.skor_didapat < ps.skor_maks) as jumlah_sebagian,
    count(*) filter (where ps.skor_didapat = 0 and ps.dijawab)            as jumlah_salah,
    count(*) filter (where not ps.dijawab)                                as jumlah_kosong,
    round(avg(ps.skor_didapat), 2)                                        as rata_skor,
    case when count(*) = 0 then 0
         else round(
           count(*) filter (where ps.skor_didapat >= ps.skor_maks and ps.skor_maks > 0)::numeric
           * 100 / count(*), 1)
    end                                                                   as persen_benar,
    case
      when count(*) = 0 then 'belum ada data'
      when count(*) filter (where ps.skor_didapat >= ps.skor_maks and ps.skor_maks > 0)::numeric
           * 100 / count(*) > 70 then 'mudah'
      when count(*) filter (where ps.skor_didapat >= ps.skor_maks and ps.skor_maks > 0)::numeric
           * 100 / count(*) >= 30 then 'sedang'
      else 'sulit'
    end                                                                   as kategori
  from per_soal ps
  group by ps.soal_id, ps.urutan, ps.tipe, ps.skor_maks
  order by ps.urutan;
end;
$$;

comment on function get_analisis_butir_soal is
  'Analisis per butir soal (benar/sebagian/salah/kosong + tingkat kesukaran '
  'empiris). Hanya menghitung siswa yang sudah submit.';


-- ============================================================================
-- 3. REKAP NILAI SIAP-EXPORT
-- ============================================================================
-- Satu baris per siswa TARGET (termasuk yang belum mengerjakan, ditandai
-- status 'belum_mengerjakan') — supaya file Excel yang diunduh guru bisa
-- langsung dipakai sebagai daftar hadir sekaligus daftar nilai, persis
-- kebiasaan di sistem lama yang menandai siswa belum mengerjakan dengan
-- baris berwarna kuning.
create or replace function get_rekap_nilai_mapel(p_mapel_id uuid)
returns table (
  siswa_id       uuid,
  siswa_nama     text,
  siswa_username text,
  kelas_nama     text,
  total_skor     numeric,
  skor_maksimal  numeric,
  nilai_100      numeric,
  jumlah_benar   integer,
  jumlah_soal    integer,
  status         text,
  is_override    boolean,
  submitted_at   timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_maks       numeric;
  v_jml_soal   integer;
begin
  if not is_guru_atau_service() then
    raise exception 'Hanya guru yang boleh mengakses rekap nilai.';
  end if;

  select coalesce(sum(skor), 0), count(*) into v_maks, v_jml_soal
  from soal where mapel_id = p_mapel_id;

  return query
  select
    s.id,
    s.nama,
    s.username,
    k.nama,
    n.total_skor,
    v_maks,
    case when v_maks > 0 and n.total_skor is not null
         then round(n.total_skor / v_maks * 100, 1) end,
    -- "Benar" di sini = soal yang mendapat skor penuh. Soal dengan skor
    -- sebagian sengaja TIDAK dihitung benar, beda dari sistem lama yang
    -- memasukkan status 'sebagian' ke kolom benar — cara lama membuat
    -- jumlah benar tidak konsisten dengan nilai akhirnya.
    (select count(*)::integer
       from soal so
      where so.mapel_id = p_mapel_id
        and coalesce((n.detail_jsonb ->> so.id::text)::numeric, 0) >= so.skor
        and so.skor > 0),
    v_jml_soal,
    case
      when js.submitted_at is not null then 'selesai'
      when js.mulai_at is not null     then 'sedang_mengerjakan'
      else 'belum_mengerjakan'
    end,
    coalesce(n.is_override, false),
    js.submitted_at
  from siswa s
  join kelas k on k.id = s.kelas_id
  join mapel_kelas mk on mk.kelas_id = s.kelas_id and mk.mapel_id = p_mapel_id
  left join jawaban_siswa js on js.siswa_id = s.id and js.mapel_id = p_mapel_id
  left join nilai n on n.siswa_id = s.id and n.mapel_id = p_mapel_id
  order by k.nama, s.nama;
end;
$$;


-- ============================================================================
-- 4. DAFTAR AKUN SIAP-EXPORT (siswa & guru)
-- ============================================================================
-- Dipakai tombol "Export Excel" di /admin/siswa dan /admin/guru. Dibuat
-- sebagai RPC supaya export bisa mengambil SELURUH baris — halaman daftarnya
-- sendiri dibatasi 200 baris demi kecepatan render, dan sebelumnya export
-- ikut terbatas 200 baris itu (lihat catatan di ExportAkunCsvButton.tsx).
create or replace function get_daftar_siswa_export()
returns table (
  siswa_id   uuid,
  nama       text,
  username   text,
  kelas_nama text,
  tingkat    smallint,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not is_guru_atau_service() then
    raise exception 'Hanya guru yang boleh mengekspor data akun.';
  end if;

  return query
  select s.id, s.nama, s.username, k.nama, k.tingkat, s.created_at
  from siswa s
  join kelas k on k.id = s.kelas_id
  order by k.nama, s.nama;
end;
$$;

create or replace function get_daftar_guru_export()
returns table (
  guru_id    uuid,
  nama       text,
  email      text,
  is_admin   boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not is_guru_atau_service() then
    raise exception 'Hanya guru yang boleh mengekspor data akun.';
  end if;

  -- Email diambil dari auth.users — tabel `guru` sendiri tidak menyimpan
  -- email (guru login pakai email asli, lihat komentar di csv.ts). Aman
  -- dilakukan di sini karena fungsi ini security definer dan hanya
  -- mengembalikan kolom email, bukan kolom sensitif lain dari auth.users.
  return query
  select g.id, g.nama, u.email::text, g.is_admin, g.created_at
  from guru g
  join auth.users u on u.id = g.auth_id
  order by g.nama;
end;
$$;
