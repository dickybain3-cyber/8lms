-- 0021_forum_gambar_balas_reaksi.sql
-- Jalankan di KETIGA project (kelas 7, 8, dan 9). Isinya identik.
-- Prasyarat: 0020_forum.sql sudah jalan di project ini.
--
-- =============================================================================
-- APA YANG DITAMBAHKAN
-- =============================================================================
-- Tiga kemampuan baru di forum, semuanya SUSULAN dari 0020 (menambah
-- kolom/tabel, tidak mengubah struktur yang sudah ada):
--
--   1. `jenis_isi = 'gambar'`  — siswa unggah foto (kamera/galeri), sudah
--      dikecilkan di browser sebelum sampai ke server (lihat `forum.ts`,
--      `BATAS_UKURAN_GAMBAR_BYTE`). URL-nya (Cloudinary, pola sama persis
--      dengan gambar soal) disimpan di kolom baru `gambar_url`.
--   2. `balas_ke_id`           — satu pesan boleh menunjuk SATU pesan lain
--      sebagai "yang dibalas" (pola kutipan ala WhatsApp). Dipakai gestur
--      geser-kanan di sisi guru, tapi kolomnya tidak dibatasi hanya guru —
--      lihat catatan RLS di bagian 4.
--   3. `forum_reaksi`          — satu guru boleh menaruh SATU emoji reaksi
--      per pesan (toggle: klik emoji yang sama lagi = batal, klik emoji
--      lain = ganti). Sengaja tabel terpisah, bukan kolom di forum_pesan,
--      karena baris forum_pesan tidak boleh disunting siswa lain (lihat
--      catatan "TIDAK ADA policy update" di 0020) — reaksi guru berubah-
--      ubah sepanjang waktu, riwayat pesan itu sendiri tidak.
--
-- Tidak ada satu pun perubahan di sini yang mengubah PERHITUNGAN POIN:
-- gambar TIDAK dihitung poin keaktifan, persis alasan sticker/emoticon di
-- 0020 (mencegah spam foto demi poin) — lihat `apakahPesanDihitungPoin`
-- di forum.ts, tidak berubah sama sekali oleh migrasi ini karena
-- triggernya sudah dibatasi `when (new.jenis_isi = 'teks' ...)`.

-- ---------------------------------------------------------------------------
-- 1. forum_pesan: kolom baru + constraint jenis_isi diperluas
-- ---------------------------------------------------------------------------

alter table forum_pesan add column if not exists gambar_url text;

alter table forum_pesan
  add column if not exists balas_ke_id uuid references forum_pesan(id) on delete set null;

create index if not exists forum_pesan_balas_ke_id_idx
  on forum_pesan (balas_ke_id);

comment on column forum_pesan.gambar_url is
  'URL Cloudinary hasil unggah siswa (jenis_isi = ''gambar''), sudah '
  'dikecilkan sepenuhnya di browser sebelum diunggah — lihat '
  '`kecilkanGambarChat` di src/lib/unggah-gambar.ts. NULL untuk jenis_isi '
  'lain.';

comment on column forum_pesan.balas_ke_id is
  'Pesan yang dikutip/dibalas (pola kutipan ala WhatsApp), kalau ada. '
  '`on delete set null` supaya balasan tidak ikut hilang kalau pesan '
  'aslinya kebetulan terhapus (tidak ada jalur hapus pesan siswa/guru di '
  'UI sekarang, tapi kolom ini tidak boleh diam-diam menolak dibuat NULL '
  'kalau jalur itu ditambahkan nanti).';

-- Ganti constraint lama supaya 'gambar' menjadi jenis_isi yang sah.
alter table forum_pesan drop constraint if exists forum_pesan_jenis_isi_valid;
alter table forum_pesan add constraint forum_pesan_jenis_isi_valid
  check (jenis_isi in ('teks', 'sticker', 'emoticon', 'gambar'));

-- Pesan bergambar WAJIB punya gambar_url; pesan jenis lain WAJIB kosong.
-- Simetris dengan pola forum_pesan_bonus_hanya_teks_siswa di 0020 — jaring
-- pengaman di database, bukan cuma disiplin Server Action.
alter table forum_pesan drop constraint if exists forum_pesan_gambar_konsisten;
alter table forum_pesan add constraint forum_pesan_gambar_konsisten
  check (
    (jenis_isi = 'gambar' and gambar_url is not null)
    or (jenis_isi <> 'gambar' and gambar_url is null)
  );

-- Pesan bergambar tetap butuh `isi` (constraint `not null` sudah ada sejak
-- 0020) — dipakai sebagai keterangan singkat, mis. "[Foto]" atau caption
-- kalau siswa mengetik sesuatu bersama fotonya. Diisi Server Action, bukan
-- constraint tambahan di sini (tidak ada aturan format yang perlu
-- ditegakkan database, cuma tidak boleh NULL — dan itu sudah dijamin
-- constraint lama).

comment on column forum_pesan.jenis_isi is
  '''teks'' dihitung 1 poin keaktifan otomatis (lihat trigger di 0020). '
  '''sticker''/''emoticon''/''gambar'' sengaja TIDAK dihitung — cara '
  'siswa menunjukkan hadir atau berbagi foto tanpa mengerek poin lewat '
  'spam.';

-- ---------------------------------------------------------------------------
-- 2. forum_reaksi
-- ---------------------------------------------------------------------------
-- Satu guru, satu pesan, SATU emoji aktif pada satu waktu — primary key
-- (pesan_id, guru_id) sekaligus menegakkan itu di level database, bukan
-- cuma disiplin "upsert" di Server Action. Ganti emoji = update baris yang
-- sama, bukan baris kedua; batal = delete baris.
create table if not exists forum_reaksi (
  pesan_id uuid not null references forum_pesan(id) on delete cascade,
  guru_id uuid not null references guru(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),

  primary key (pesan_id, guru_id)
);

create index if not exists forum_reaksi_pesan_id_idx on forum_reaksi (pesan_id);

comment on table forum_reaksi is
  'Reaksi emoji GURU atas satu bubble pesan (pola ala WhatsApp/Slack). '
  'Sengaja tabel terpisah dari forum_pesan — lihat kepala migrasi ini. '
  'Siswa tidak punya jalur memberi reaksi sama sekali di produk ini '
  '(bukan cuma disembunyikan di UI — tidak ada policy insert untuk '
  'siswa di bagian 4).';

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------

alter table forum_reaksi enable row level security;

drop policy if exists forum_reaksi_guru_all on forum_reaksi;
create policy forum_reaksi_guru_all on forum_reaksi
  for all
  using (is_guru())
  with check (is_guru());

-- Siswa hanya BACA reaksi pada pesan yang memang berhak ia baca — dicermin
-- persis dari policy forum_pesan_select_siswa di 0020 (forum sudah
-- dibuka, kelasnya sendiri, tertaut lewat forum_kelas). Tidak ada policy
-- insert/update/delete untuk siswa: siswa tidak pernah menulis ke tabel
-- ini.
drop policy if exists forum_reaksi_select_siswa on forum_reaksi;
create policy forum_reaksi_select_siswa on forum_reaksi
  for select
  using (
    exists (
      select 1
      from forum_pesan fp
      join forum_topik ft on ft.id = fp.forum_topik_id
      join forum_kelas fk
        on fk.forum_topik_id = ft.id and fk.kelas_id = fp.kelas_id
      join siswa s on s.kelas_id = fk.kelas_id
      where fp.id = forum_reaksi.pesan_id
        and s.auth_id = auth.uid()
        and ft.dibuka_at <= now()
    )
  );

-- `balas_ke_id` di forum_pesan TIDAK butuh policy baru: kolom ini dibaca
-- lewat policy select forum_pesan yang sudah ada (0020), dan ditulis lewat
-- policy insert yang sudah ada juga (siswa hanya boleh mengisinya untuk
-- pesan MILIKNYA sendiri).
--
-- CATATAN PENTING — yang TIDAK dijamin database: foreign key hanya
-- memastikan id yang ditunjuk ADA di forum_pesan. Ia tidak memastikan
-- pesan itu berada di forum_topik + kelas yang sama dengan pesan yang
-- membalas, dan policy insert juga tidak memeriksanya. Kecocokan ruang itu
-- ditegakkan di Server Action (`kirimPesanSiswa` dan `kirimPesanGuru`,
-- lewat query dengan filter forum_topik_id + kelas_id sebelum insert).
-- Kalau nanti ada jalur tulis baru selain dua Server Action itu, jalur itu
-- WAJIB mengulang pengecekan yang sama.

-- ---------------------------------------------------------------------------
-- Cek hasil:
--   select column_name from information_schema.columns
--     where table_name = 'forum_pesan' and column_name in ('gambar_url','balas_ke_id');
--   select tablename, policyname from pg_policies where tablename = 'forum_reaksi';
--
-- Uji constraint gambar (harus GAGAL):
--   insert into forum_pesan (forum_topik_id, kelas_id, siswa_id, isi, jenis_isi)
--   values ('<id>', '<id>', '<id>', '[Foto]', 'gambar'); -- gambar_url kosong
--
-- Uji toggle reaksi (jalankan berurutan):
--   insert into forum_reaksi (pesan_id, guru_id, emoji) values ('<id>', '<id>', '👍')
--     on conflict (pesan_id, guru_id) do update set emoji = excluded.emoji;
--   -- klik emoji sama lagi di UI -> DELETE baris ini, bukan insert baris kedua.
-- ---------------------------------------------------------------------------
