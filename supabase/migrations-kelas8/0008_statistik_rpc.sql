-- 0008_statistik_rpc.sql
-- RPC untuk /admin/statistik. Dibuat sebagai fungsi DB (bukan beberapa
-- query terpisah dari Next.js) supaya agregasi (jumlah siswa target lewat
-- mapel_kelas -> kelas -> siswa, rata-rata dari tabel nilai, dst) jalan
-- sekali di DB, dan supaya gampang dijaga aksesnya hanya untuk guru lewat
-- satu pengecekan is_guru() (function ini security definer, jadi tidak
-- lewat RLS tabel-tabel yang dibaca).

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
  if not is_guru() then
    raise exception 'Hanya guru yang boleh mengakses statistik.';
  end if;

  return query
  select
    m.id,
    m.nama,
    m.event_id,
    e.nama,
    m.waktu_mulai,
    m.waktu_selesai,
    (
      select count(distinct s.id)
      from mapel_kelas mk
      join siswa s on s.kelas_id = mk.kelas_id
      where mk.mapel_id = m.id
    ) as jumlah_target,
    (
      select count(*)
      from jawaban_siswa js
      where js.mapel_id = m.id and js.submitted_at is not null
    ) as jumlah_submit,
    (
      select coalesce(sum(so.skor), 0)
      from soal so
      where so.mapel_id = m.id
    ) as skor_maksimal,
    (select round(avg(n.total_skor), 2) from nilai n where n.mapel_id = m.id),
    (select min(n.total_skor) from nilai n where n.mapel_id = m.id),
    (select max(n.total_skor) from nilai n where n.mapel_id = m.id)
  from mapel m
  join event e on e.id = m.event_id
  order by e.tgl_mulai desc, m.waktu_mulai;
end;
$$;

comment on function get_statistik_mapel is
  'Ringkasan statistik per mapel untuk /admin/statistik. Guru saja — '
  'dipanggil lewat supabase.rpc("get_statistik_mapel").';

-- Distribusi nilai (persentase dari skor maksimal mapel) per mapel,
-- dipanggil lazy (saat guru buka detail satu mapel di halaman statistik)
-- supaya halaman utama tidak perlu hitung ini untuk semua mapel sekaligus.
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
  if not is_guru() then
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

comment on function get_distribusi_nilai is
  'Distribusi jumlah siswa per rentang persentase skor (dari skor '
  'maksimal mapel), 5 bucket. Guru saja.';
