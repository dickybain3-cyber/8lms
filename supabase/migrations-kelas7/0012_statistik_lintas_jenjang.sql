-- 0012_statistik_lintas_jenjang.sql
-- Membuka statistik untuk dibaca lewat `service_role` (dashboard admin
-- gabungan 3 jenjang), TANPA mengubah sedikit pun aturan yang berlaku
-- untuk guru biasa.
--
-- =============================================================================
-- MASALAHNYA
-- =============================================================================
-- `get_statistik_mapel()` (0008) diawali `if not is_guru() then raise`.
-- `is_guru()` bertumpu pada `auth.uid()`, dan `auth.uid()` diambil dari JWT
-- user yang login. Client `service_role` TIDAK membawa JWT user mana pun —
-- `auth.uid()` -nya null — jadi `is_guru()` false dan RPC ini MELEMPAR
-- ERROR kalau dipanggil dari helper fan-out lintas jenjang
-- (src/lib/supabase/admin-multi.ts).
--
-- Itu bukan bug di 0008; itu memang perilaku yang benar untuk jalur guru.
-- Yang dibutuhkan cuma pintu kedua khusus server.
--
-- =============================================================================
-- KENAPA FUNGSI BARU, BUKAN MELONGGARKAN YANG LAMA?
-- =============================================================================
-- Cara "gampang"-nya adalah mengubah penjaga di 0008 jadi mis.
-- `if auth.uid() is not null and not is_guru()`. JANGAN — itu justru
-- membuka RPC-nya untuk role `anon` (yang `auth.uid()`-nya juga null),
-- artinya siapa pun yang punya anon key — yang memang tertanam di bundle
-- browser dan tidak rahasia — bisa menarik seluruh statistik sekolah tanpa
-- login sama sekali.
--
-- Jadi dibuat fungsi kembar tanpa penjaga, lalu hak EXECUTE-nya DICABUT
-- dari `anon` dan `authenticated`. PostgREST menghormati hak EXECUTE, jadi
-- satu-satunya yang bisa memanggilnya adalah `service_role` — yang kuncinya
-- hanya ada di server (`SUPABASE_SERVICE_ROLE_KEY_*`, tanpa prefix
-- NEXT_PUBLIC, jadi tidak pernah ikut ke browser).
--
-- Isi query-nya TIDAK disalin dua kali: fungsi lama sekarang memanggil
-- fungsi baru sesudah penjaganya lolos. Kalau suatu saat rumus
-- statistiknya diubah, cukup satu tempat — tidak ada risiko versi guru dan
-- versi admin diam-diam berbeda hasil.

-- =============================================================================
-- 1. Versi service_role: statistik per mapel
-- =============================================================================
create or replace function get_statistik_mapel_admin()
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
language sql
security definer
set search_path = public
stable
as $$
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
$$;

revoke all on function get_statistik_mapel_admin() from public;
revoke all on function get_statistik_mapel_admin() from anon, authenticated;
-- `revoke ... from public` di atas mencabut hak bawaan SEMUA role,
-- termasuk service_role — jadi haknya harus dikembalikan secara eksplisit
-- di sini, kalau tidak fan-out-nya justru error "permission denied".
grant execute on function get_statistik_mapel_admin() to service_role;

comment on function get_statistik_mapel_admin is
  'Sama persis dengan get_statistik_mapel(), TANPA penjaga is_guru(). '
  'Sengaja dicabut hak EXECUTE-nya dari anon & authenticated: hanya '
  'service_role (server) yang boleh memanggil, untuk dashboard admin '
  'gabungan 3 jenjang. Guru tetap lewat get_statistik_mapel().';

-- =============================================================================
-- 2. Fungsi lama sekarang jadi pembungkus berpenjaga
-- =============================================================================
-- Perilaku untuk guru TIDAK BERUBAH: penjaga is_guru() tetap yang pertama
-- dieksekusi, pesan error-nya pun sama. Yang berubah cuma dari mana
-- barisnya datang.
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

  -- Boleh memanggil fungsi yang EXECUTE-nya dicabut dari `authenticated`
  -- karena fungsi INI security definer: di dalamnya, hak yang berlaku
  -- adalah hak pemilik fungsi (postgres), bukan hak si pemanggil.
  return query select * from get_statistik_mapel_admin();
end;
$$;

-- =============================================================================
-- 3. Hal yang sama untuk distribusi nilai
-- =============================================================================
-- Isi query di bawah disalin PERSIS dari get_distribusi_nilai() di 0008
-- (termasuk label bucket '0-19%' dst — label itu ditampilkan apa adanya di
-- UI, jadi jangan diubah di salah satu fungsi saja), cuma tanpa penjaga
-- is_guru(). Sesudah ini fungsi lamanya jadi pembungkus, sama seperti
-- get_statistik_mapel() di atas.
create or replace function get_distribusi_nilai_admin(p_mapel_id uuid)
returns table (rentang text, jumlah bigint)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_maks numeric;
begin
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

revoke all on function get_distribusi_nilai_admin(uuid) from public;
revoke all on function get_distribusi_nilai_admin(uuid) from anon, authenticated;
grant execute on function get_distribusi_nilai_admin(uuid) to service_role;

comment on function get_distribusi_nilai_admin is
  'Versi service_role dari get_distribusi_nilai(p_mapel_id), tanpa penjaga '
  'is_guru(), EXECUTE dicabut dari anon & authenticated. Dipakai Server '
  'Action muatDistribusiNilai() saat admin membuka distribusi mapel dari '
  'jenjang selain jenjang sesinya.';

create or replace function get_distribusi_nilai(p_mapel_id uuid)
returns table (rentang text, jumlah bigint)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not is_guru() then
    raise exception 'Hanya guru yang boleh mengakses statistik.';
  end if;

  return query select * from get_distribusi_nilai_admin(p_mapel_id);
end;
$$;
