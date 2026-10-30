-- 0024_checkout_ujian.sql
-- Jalankan di KETIGA project (kelas 7, 8, dan 9). Isinya identik.
-- Prasyarat: 0011_ujian_pro.sql (kolom jawaban_siswa.mulai_at).
-- Aman dijalankan berulang (idempoten). Pembatalan: 0024_checkout_ujian_BATAL.sql
--
-- =============================================================================
-- APA INI
-- =============================================================================
-- Bukti siswa masih di aplikasi ujian sampai akhir jadwal. 5 menit sebelum
-- `mapel.waktu_selesai`, siswa yang sudah menekan Mulai Ujian wajib menjawab
-- satu pertanyaan ya/tidak lalu menekan Checkout. Contoh: IPA tutup 08.30,
-- jendela checkout 08.25 - 08.30.
--
-- Checkout TIDAK menyentuh jawaban maupun nilai. Siswa yang tidak checkout
-- tetap dapat nilai, hanya diberi catatan di Pantau Ujian dan Rekap Nilai.
--
-- =============================================================================
-- KEPUTUSAN DESAIN
-- =============================================================================
-- 1. Tabel sendiri, BUKAN kolom di jawaban_siswa. Policy `jawaban_update_own`
--    mengizinkan siswa meng-update barisnya sendiri lewat anon key; kolom di
--    sana bisa diisi sendiri dari DevTools. Tabel ini hanya bisa ditulis
--    lewat RPC yang memeriksa jadwal di jam server.
-- 2. FK ke jawaban_siswa ON DELETE CASCADE. Semua jalur reset (RPC 0011,
--    Rekap Nilai, Bersih-bersih Data) menghapus baris jawaban_siswa, jadi
--    checkout ikut hilang tanpa mengubah satu pun jalur itu.
-- 3. `mapel.checkout_wajib`: mapel yang sudah lewat saat migrasi ini jalan
--    diberi false, supaya ujian lama tidak mendadak penuh catatan "belum
--    checkout". Mapel baru dan mapel yang belum selesai otomatis true.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'mapel'
       and column_name = 'checkout_wajib'
  ) then
    alter table mapel add column checkout_wajib boolean not null default true;
    -- trg_mapel_log (0009) menolak penulisan tanpa sesi guru, termasuk dari
    -- SQL Editor. Ini pengisian kolom baru, bukan aksi guru yang perlu dicatat.
    alter table mapel disable trigger trg_mapel_log;
    update mapel set checkout_wajib = false where waktu_selesai <= now();
    alter table mapel enable trigger trg_mapel_log;
  end if;
end;
$$;

comment on column mapel.checkout_wajib is
  'true = siswa wajib checkout 5 menit sebelum waktu_selesai. false hanya '
  'untuk mapel yang sudah selesai saat migrasi 0024 dijalankan.';

create table if not exists checkout_ujian (
  siswa_id uuid not null,
  mapel_id uuid not null,
  masih_di_ruang boolean not null,
  checkout_at timestamptz not null default now(),
  primary key (siswa_id, mapel_id),
  constraint checkout_ujian_jawaban_fk
    foreign key (siswa_id, mapel_id)
    references jawaban_siswa (siswa_id, mapel_id)
    on delete cascade
);

create index if not exists idx_checkout_ujian_mapel_id
  on checkout_ujian (mapel_id);

comment on table checkout_ujian is
  'Satu baris per siswa per mapel yang sudah checkout. Ditulis hanya lewat '
  'RPC checkout_ujian_siswa. Reset ujian menghapusnya lewat FK cascade.';

-- Baca saja: guru semua baris, siswa baris sendiri. Tulis hanya lewat RPC.
alter table checkout_ujian enable row level security;
revoke all on table checkout_ujian from anon, authenticated;
grant select on table checkout_ujian to authenticated;

drop policy if exists checkout_select_guru on checkout_ujian;
create policy checkout_select_guru on checkout_ujian
  for select using (is_guru());

drop policy if exists checkout_select_own on checkout_ujian;
create policy checkout_select_own on checkout_ujian
  for select using (siswa_id = current_siswa_id());

-- Daftar checkout yang masih harus dilakukan siswa yang login. Dipanggil
-- PenjagaCheckout tiap beberapa menit, jadi harus ringan: berangkat dari
-- primary key jawaban_siswa (baris siswa ini saja). `server_now` ikut dikirim
-- karena jam HP siswa tidak bisa dipercaya.
create or replace function get_checkout_siswa()
returns table (
  mapel_id     uuid,
  mapel_nama   text,
  buka_at      timestamptz,
  tutup_at     timestamptz,
  sudah_kumpul boolean,
  server_now   timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    m.id,
    m.nama,
    m.waktu_selesai - interval '5 minutes',
    m.waktu_selesai,
    js.submitted_at is not null,
    now()
  from jawaban_siswa js
  join mapel m on m.id = js.mapel_id
  where js.siswa_id = current_siswa_id()
    and js.mulai_at is not null
    and m.checkout_wajib
    and now() < m.waktu_selesai
    and not exists (
      select 1 from checkout_ujian c
       where c.siswa_id = js.siswa_id and c.mapel_id = js.mapel_id
    )
  order by m.waktu_selesai;
$$;

comment on function get_checkout_siswa is
  'Checkout yang belum dilakukan siswa login, termasuk yang jendelanya belum '
  'buka, supaya layar siswa bisa membuka jendela tepat waktu tanpa polling rapat.';

-- GRACE 1 menit setelah tutup hanya untuk permintaan yang sudah terkirim saat
-- sinyal lambat; jendela di layar siswa tetap tertutup tepat waktu_selesai.
create or replace function checkout_ujian_siswa(
  p_mapel_id uuid,
  p_masih_di_ruang boolean
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_siswa_id uuid;
  v_selesai  timestamptz;
  v_wajib    boolean;
  v_at       timestamptz;
begin
  v_siswa_id := current_siswa_id();
  if v_siswa_id is null then
    raise exception 'Hanya siswa yang bisa checkout.';
  end if;
  if p_masih_di_ruang is null then
    raise exception 'Jawab pertanyaannya dulu.';
  end if;

  select m.waktu_selesai, m.checkout_wajib into v_selesai, v_wajib
  from jawaban_siswa js
  join mapel m on m.id = js.mapel_id
  where js.siswa_id = v_siswa_id
    and js.mapel_id = p_mapel_id
    and js.mulai_at is not null;

  if not found then
    raise exception 'Kamu belum memulai ujian ini.';
  end if;
  if not v_wajib then
    raise exception 'Ujian ini tidak memakai checkout.';
  end if;
  if now() < v_selesai - interval '5 minutes' then
    raise exception 'Checkout belum dibuka.';
  end if;
  if now() > v_selesai + interval '1 minute' then
    raise exception 'Waktu checkout sudah habis.';
  end if;

  -- Checkout pertama yang berlaku: pengiriman ulang tidak mengubah jam/jawaban.
  insert into checkout_ujian (siswa_id, mapel_id, masih_di_ruang)
  values (v_siswa_id, p_mapel_id, p_masih_di_ruang)
  on conflict (siswa_id, mapel_id) do nothing;

  select c.checkout_at into v_at
  from checkout_ujian c
  where c.siswa_id = v_siswa_id and c.mapel_id = p_mapel_id;

  return v_at;
end;
$$;

comment on function checkout_ujian_siswa is
  'Mencatat checkout siswa login. Jadwal diperiksa di sini dengan jam server, '
  'jadi jam HP yang diubah tidak bisa membuka jendela lebih awal.';

revoke all on function get_checkout_siswa() from public, anon;
revoke all on function checkout_ujian_siswa(uuid, boolean) from public, anon;
grant execute on function get_checkout_siswa() to authenticated;
grant execute on function checkout_ujian_siswa(uuid, boolean) to authenticated;

-- CEK AKHIR — harus menghasilkan 0 baris
select masalah from (
  select 'kolom mapel.checkout_wajib belum ada' as masalah
   where not exists (
     select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'mapel'
        and column_name = 'checkout_wajib')
  union all
  select 'RLS checkout_ujian belum aktif'
   where not exists (
     select 1 from pg_class
      where oid = 'public.checkout_ujian'::regclass and relrowsecurity)
  union all
  select 'FK cascade ke jawaban_siswa belum ada'
   where not exists (
     select 1 from pg_constraint
      where conname = 'checkout_ujian_jawaban_fk' and confdeltype = 'c')
  union all
  select 'siswa/guru masih bisa menulis langsung ke checkout_ujian'
   where has_table_privilege('authenticated', 'public.checkout_ujian', 'INSERT')
      or has_table_privilege('authenticated', 'public.checkout_ujian', 'UPDATE')
      or has_table_privilege('authenticated', 'public.checkout_ujian', 'DELETE')
  union all
  select 'anon masih bisa memanggil RPC checkout'
   where has_function_privilege('anon', 'public.checkout_ujian_siswa(uuid, boolean)', 'EXECUTE')
      or has_function_privilege('anon', 'public.get_checkout_siswa()', 'EXECUTE')
) cek;
