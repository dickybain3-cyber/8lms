-- ===========================================================================
-- 0014_bank_soal.sql — Bank Soal lintas event
--
-- File ini IDENTIK di migrations-kelas7 / -kelas8 / -kelas9, mengikuti pola
-- yang sudah dipakai sejak Sesi 16 (tiga project Supabase terpisah, satu per
-- jenjang, skema sama persis). Jalankan di KETIGA project.
--
-- ── MASALAH YANG DIPECAHKAN ──
--
-- Sampai sekarang soal hanya hidup di dalam satu `mapel`, dan `mapel` hanya
-- hidup di dalam satu `event`. Begitu event-nya lewat, soalnya ikut terkubur:
-- guru yang ingin memakai ulang soal PTS tahun lalu untuk PAS tahun ini harus
-- mengetik ulang dari nol. Untuk 50 butir per mapel per event, itu pekerjaan
-- yang tidak masuk akal — dan alasan paling umum kenapa guru akhirnya
-- menempelkan foto satu halaman buku sebagai satu soal utuh.
--
-- Tabel ini adalah arsip permanen: setiap soal yang disimpan guru otomatis
-- ikut tersalin ke sini, dan bisa dipanggil lagi ke event mana pun kapan pun.
--
-- ── KENAPA SALINAN, BUKAN REFERENSI ──
--
-- `soal` TIDAK diubah jadi menunjuk ke `bank_soal`. Bank menyimpan SALINAN
-- isi soal pada saat disimpan, dan "gunakan" membuat salinan baru ke `soal`.
-- Alasannya: kalau `soal` cuma menunjuk ke bank, maka guru yang memperbaiki
-- typo di bank akan diam-diam mengubah soal pada ujian yang SUDAH BERLANGSUNG
-- dan sudah dinilai — nilai siswa jadi merujuk pertanyaan yang sudah tidak ada
-- lagi. Duplikasi data di sini adalah harga yang murah untuk menjaga ujian
-- yang sudah lewat tetap utuh apa adanya.
-- ===========================================================================

create table if not exists bank_soal (
  id uuid primary key default gen_random_uuid(),

  -- Nama mapel disimpan sebagai TEKS, bukan foreign key ke `mapel`.
  -- Ini disengaja: `mapel` adalah baris milik satu event, dan event boleh
  -- dihapus. Kalau bank menunjuk ke sana, menghapus event tahun lalu akan
  -- ikut memusnahkan arsip soalnya — persis kebalikan dari gunanya tabel ini.
  mapel_nama text not null,

  -- ── Kenapa ada kolom ternormalisasi ──
  -- Guru A mengetik "MATEMATIKA", guru B mengetik "Matematika", guru C
  -- "matematika ". Tanpa kolom ini ketiganya jadi tiga mapel berbeda di
  -- daftar bank soal, dan tidak ada satu pun guru yang menemukan soal
  -- rekannya. Dinormalisasi di DATABASE (bukan di aplikasi) supaya aturannya
  -- berlaku untuk semua jalur tulis — termasuk impor manual lewat dashboard
  -- Supabase — dan tidak bisa ketinggalan kalau nanti ada kode baru yang
  -- menulis ke tabel ini.
  --
  -- `regexp_replace(..., '\s+', ' ', 'g')` merapikan spasi ganda di tengah
  -- ("Bahasa  Indonesia"), `btrim` membuang spasi di ujung, `lower` menyamakan
  -- besar-kecil huruf.
  mapel_nama_norm text generated always as (
    lower(btrim(regexp_replace(mapel_nama, '\s+', ' ', 'g')))
  ) stored,

  tipe text not null check (tipe in (
    'pilgan_biasa', 'pilgan_kompleks', 'uraian_singkat',
    'benar_salah', 'multi_benar_salah', 'menjodohkan'
  )),
  skor numeric(6,2) not null default 1 check (skor > 0),
  konten_jsonb jsonb not null,
  gambar_url text,

  -- Jejak asal, murni informatif (ditampilkan sebagai "dari: PAS Ganjil
  -- 2025"). Sengaja teks & uuid lepas tanpa foreign key, dengan alasan yang
  -- sama seperti `mapel_nama` di atas: arsip harus selamat dari penghapusan
  -- event/mapel asalnya.
  asal_soal_id uuid,
  asal_event_nama text,

  dibuat_oleh uuid references guru(id) on delete set null,
  -- Snapshot nama, mengikuti pola `log_aktivitas.detail_jsonb.oleh_nama`
  -- (0009): baris guru bisa dihapus, tapi arsipnya harus tetap bisa
  -- menyebutkan siapa yang membuat.
  dibuat_oleh_nama text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Kenapa UNIQUE pada asal_soal_id ──
-- Guru menyimpan soal, sadar ada typo, membuka lagi, memperbaiki, menyimpan
-- lagi. Tanpa batasan ini bank berisi dua salinan soal yang sama — satu
-- dengan typo — dan guru berikutnya yang mencari di bank tidak punya cara
-- tahu mana yang benar. Dengan ini, simpan-ulang MEMPERBARUI entri bank yang
-- sama (lihat `on conflict` di src/lib/bank-soal.ts).
--
-- Partial index (`where asal_soal_id is not null`) supaya entri bank yang
-- dibuat tanpa asal (mis. hasil impor) tidak saling bentrok di NULL.
create unique index if not exists bank_soal_asal_soal_id_key
  on bank_soal (asal_soal_id)
  where asal_soal_id is not null;

create index if not exists bank_soal_mapel_norm_idx
  on bank_soal (mapel_nama_norm);

create index if not exists bank_soal_created_at_idx
  on bank_soal (created_at desc);

-- pg_trgm HARUS dibuat SEBELUM index di bawah yang memakai
-- `gin_trgm_ops` — kalau dibalik, Postgres menolak dengan
-- "operator class gin_trgm_ops does not exist for access method gin"
-- karena operator class itu memang baru terdaftar setelah ekstensinya ada.
-- `if not exists` supaya migrasi ini aman dijalankan di project yang
-- sudah punya ekstensinya.
create extension if not exists pg_trgm;

-- Pencarian teks isi soal. `konten_jsonb::text` dipakai apa adanya (bukan
-- kolom teks terpisah) karena bentuk konten berbeda per tipe — pertanyaan
-- bisa ada di `pertanyaan` atau `instruksi`, dan opsi jawabannya di dalam
-- array. Mencari di seluruh JSON-nya sekaligus justru yang diinginkan guru:
-- "cari soal yang menyebut fotosintesis" harus menemukannya walau kata itu
-- ada di opsi jawaban, bukan di pertanyaannya.
create index if not exists bank_soal_konten_trgm_idx
  on bank_soal using gin ((konten_jsonb::text) gin_trgm_ops);

create or replace function set_bank_soal_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_bank_soal_updated_at on bank_soal;
create trigger trg_bank_soal_updated_at
  before update on bank_soal
  for each row execute function set_bank_soal_updated_at();

-- ===========================================================================
-- RLS
--
-- Bank soal adalah milik BERSAMA para guru satu jenjang — itu inti fiturnya.
-- Guru matematika harus bisa memakai soal yang dibuat rekannya. Jadi SELECT
-- dibuka untuk semua guru, bukan cuma pembuatnya.
--
-- Siswa TIDAK punya policy apa pun di sini, artinya tidak bisa membaca
-- sebaris pun. Ini penting: `konten_jsonb` di bank menyimpan soal LENGKAP
-- DENGAN KUNCI JAWABAN (berbeda dari yang dikirim RPC `get_soal_untuk_siswa`
-- yang sudah di-strip). Satu policy yang kelewat longgar di sini sama dengan
-- membocorkan seluruh kunci jawaban sekolah.
-- ===========================================================================

alter table bank_soal enable row level security;

drop policy if exists bank_soal_select_guru on bank_soal;
create policy bank_soal_select_guru on bank_soal
  for select
  using (exists (select 1 from guru g where g.auth_id = auth.uid()));

drop policy if exists bank_soal_insert_guru on bank_soal;
create policy bank_soal_insert_guru on bank_soal
  for insert
  with check (exists (select 1 from guru g where g.auth_id = auth.uid()));

drop policy if exists bank_soal_update_guru on bank_soal;
create policy bank_soal_update_guru on bank_soal
  for update
  using (exists (select 1 from guru g where g.auth_id = auth.uid()));

-- Hapus dibatasi ke pembuatnya sendiri atau akun admin (`guru.is_admin`,
-- migrasi 0011). Arsip bersama yang bisa dikosongkan siapa saja bukan arsip.
drop policy if exists bank_soal_delete_pemilik on bank_soal;
create policy bank_soal_delete_pemilik on bank_soal
  for delete
  using (
    exists (
      select 1 from guru g
      where g.auth_id = auth.uid()
        and (g.id = bank_soal.dibuat_oleh or g.is_admin = true)
    )
  );

-- ===========================================================================
-- RPC: daftar mapel yang ada di bank, sudah digabung per nama ternormalisasi.
--
-- Dikerjakan di database, bukan di aplikasi, karena pengelompokannya harus
-- memakai `mapel_nama_norm` yang sama dengan yang dipakai pencarian — kalau
-- aplikasi mengelompokkan sendiri dengan `toLowerCase()` JavaScript, dua
-- aturan normalisasi itu bisa menyimpang tanpa ada yang menyadarinya
-- (JavaScript dan Postgres berbeda soal huruf non-ASCII, mis. 'İ').
--
-- `nama_tampil` memakai nama yang PALING SERING dipakai untuk mapel itu,
-- bukan yang pertama masuk: kalau 30 soal ditulis "Matematika" dan 1 soal
-- "MATEMATIKA", yang ditampilkan "Matematika".
-- ===========================================================================

create or replace function get_bank_soal_mapel()
returns table (
  mapel_nama_norm text,
  nama_tampil text,
  jumlah bigint
)
language sql
stable
security invoker
as $$
  with per_ejaan as (
    select
      b.mapel_nama_norm,
      b.mapel_nama,
      count(*) as n
    from bank_soal b
    group by b.mapel_nama_norm, b.mapel_nama
  ),
  terpopuler as (
    select distinct on (p.mapel_nama_norm)
      p.mapel_nama_norm,
      p.mapel_nama as nama_tampil
    from per_ejaan p
    order by p.mapel_nama_norm, p.n desc, p.mapel_nama asc
  )
  select
    t.mapel_nama_norm,
    t.nama_tampil,
    sum(p.n) as jumlah
  from terpopuler t
  join per_ejaan p on p.mapel_nama_norm = t.mapel_nama_norm
  group by t.mapel_nama_norm, t.nama_tampil
  order by t.nama_tampil;
$$;

grant execute on function get_bank_soal_mapel() to authenticated;
