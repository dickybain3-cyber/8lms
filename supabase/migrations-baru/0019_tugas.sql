-- 0019_tugas.sql
-- Jalankan di KETIGA project (kelas 7, 8, dan 9). Isinya identik.
-- Prasyarat: 0018_event_jenis.sql sudah jalan di project ini.
--
-- =============================================================================
-- APA YANG DIBANGUN TAHAP 4
-- =============================================================================
-- 0018 memperkenalkan `event.jenis`. Dua di antaranya (asesmen_akhir,
-- kuis_harian) memakai mesin mapel/soal yang sudah ada. Dua sisanya belum
-- punya isi sama sekali. Migrasi ini mengisi yang pertama:
--
--   assignment -> tugas -> tugas_kelas + pengumpulan_tugas   (INI)
--   forum      -> forum_topik                                (Tahap 5)
--
-- Bentuknya sengaja MENIRU mesin ujian supaya guru tidak perlu belajar
-- konsep baru, dan supaya kode UI-nya bisa memakai pola yang sama:
--
--   event  -> mapel         -> mapel_kelas -> jawaban_siswa + nilai
--   event  -> tugas         -> tugas_kelas -> pengumpulan_tugas
--
-- Bedanya satu dan penting: `pengumpulan_tugas` menggabungkan "jawaban"
-- dan "nilai" dalam SATU baris, tidak dipisah seperti jawaban_siswa/nilai.
-- Alasannya, nilai tugas TIDAK dihitung mesin — tidak ada kunci jawaban
-- yang bisa dicocokkan otomatis. Nilai selalu datang dari guru yang
-- membaca satu per satu. Memisahkannya ke tabel kedua cuma menambah satu
-- join untuk data yang selalu ditulis bersamaan (guru membuka pengumpulan
-- -> membaca -> memberi angka + catatan, satu aksi).
--
-- =============================================================================
-- KENAPA TIDAK MENUMPANG DI TABEL `nilai` YANG SUDAH ADA
-- =============================================================================
-- `nilai` berkunci (siswa_id, mapel_id) dan diisi oleh mesin koreksi
-- otomatis (0007_scoring.sql). Menumpangkan tugas di sana berarti membuat
-- baris `mapel` palsu untuk tiap tugas — yang langsung ditolak trigger
-- 0018, dan yang akan mengotori halaman statistik, monitoring, dan export
-- dengan "mapel" yang tidak punya soal satu pun. Rekap gabungan
-- nilai-ujian + nilai-tugas memang akan dibutuhkan suatu saat, tapi itu
-- urusan lapisan tampilan (satu view/RPC yang menyatukan keduanya), bukan
-- alasan untuk memaksa dua hal berbeda masuk satu tabel.
--
-- =============================================================================
-- KENAPA `terlambat` TIDAK DISIMPAN SEBAGAI KOLOM
-- =============================================================================
-- Terlambat atau tidak dihitung di lapisan tampilan dari
-- `submitted_at > tugas.tenggat` — BUKAN disimpan sebagai snapshot boolean
-- saat submit. Ini keputusan sadar, dan arahnya sengaja dipilih yang
-- "memaafkan":
--
--   Kalau disimpan sebagai snapshot, guru yang memperpanjang tenggat
--   (listrik mati, server sekolah down, separuh kelas tidak masuk) tetap
--   melihat 30 anak bertanda MERAH TERLAMBAT padahal dia baru saja
--   memutuskan keterlambatan itu tidak berlaku. Dia harus membersihkan
--   tanda itu satu per satu, atau menjelaskannya berulang kali.
--
--   Dengan dihitung, memperpanjang tenggat OTOMATIS memaafkan semua yang
--   terlanjur lewat — dan itu memang persis maksud guru saat menekan
--   tombol perpanjang.
--
-- Efek sampingnya: memperPENDEK tenggat membuat pengumpulan yang tadinya
-- tepat waktu jadi terlambat. Itu memang konsekuensi logis dari
-- tindakannya sendiri, dan `submitted_at` yang asli tetap ditampilkan di
-- sebelah tandanya, jadi guru selalu bisa melihat fakta mentahnya.
--
-- =============================================================================
-- BERKAS: DI STORAGE, PATH-NYA DI TABEL
-- =============================================================================
-- Yang disimpan di `pengumpulan_tugas.berkas_path` adalah PATH objek di
-- bucket `tugas`, bukan URL publik. Buckernya private; URL untuk mengunduh
-- dibuat on-demand sebagai signed URL berumur pendek dari server. Kalau
-- yang disimpan URL publik, siapa pun yang pernah melihat satu URL bisa
-- terus mengaksesnya selamanya dan membagikannya — untuk berkas yang bisa
-- berisi foto wajah anak, itu tidak bisa diterima.
--
-- Konvensi path (dikunci oleh policy storage di bawah, bukan cuma oleh
-- kesepakatan di kode):
--
--   <tugas_id>/<siswa_id>/<nama-berkas-yang-sudah-dibersihkan>
--
-- Segmen kedua HARUS siswa_id pemilik sesi. Itulah yang membuat siswa
-- tidak bisa menulis ke folder temannya walaupun dia menebak tugas_id.

-- ---------------------------------------------------------------------------
-- 1. TABEL
-- ---------------------------------------------------------------------------

create table if not exists tugas (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references event(id) on delete cascade,
  judul text not null,
  -- Instruksi tugas. Teks biasa (baris baru dipertahankan saat ditampilkan),
  -- bukan HTML — tidak ada editor kaya di sini dan tidak perlu ada; yang
  -- disimpan guru akan dibaca apa adanya, jadi tidak ada jalur XSS.
  deskripsi text not null default '',
  dibuka_at timestamptz not null default now(),
  tenggat timestamptz not null,
  skor_maksimal numeric not null default 100,
  -- true  = siswa masih boleh mengumpulkan setelah tenggat, tapi ditandai
  --         terlambat (default — ini yang hampir selalu diinginkan guru).
  -- false = pintu benar-benar tertutup pada tenggat, ditolak di RLS.
  izinkan_terlambat boolean not null default true,
  -- Apa yang diminta dari siswa. Minimal salah satu harus true.
  minta_teks boolean not null default true,
  minta_berkas boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references guru(id) on delete set null,

  constraint tugas_skor_maksimal_positif check (skor_maksimal > 0),
  constraint tugas_tenggat_setelah_dibuka check (tenggat > dibuka_at),
  constraint tugas_minta_sesuatu check (minta_teks or minta_berkas)
);

create index if not exists tugas_event_id_idx on tugas (event_id);
create index if not exists tugas_tenggat_idx on tugas (tenggat);

comment on table tugas is
  'Satu penugasan di dalam event berjenis assignment (0018). Sejajar dengan '
  '`mapel` di mesin ujian: punya jadwal sendiri dan kelas target sendiri, '
  'tidak mewarisi tanggal event.';

comment on column tugas.dibuka_at is
  'Kapan tugas mulai bisa dikerjakan siswa. Siswa TETAP bisa MELIHAT tugas '
  'yang belum dibuka di dashboardnya (sama seperti mapel terjadwal) supaya '
  'bisa bersiap — yang dikunci adalah pengumpulannya, bukan tampilannya.';

comment on column tugas.izinkan_terlambat is
  'true: pengumpulan setelah tenggat diterima tapi ditandai terlambat di UI. '
  'false: RLS menolak insert/update pengumpulan setelah tenggat. Tanda '
  'terlambat dihitung dari submitted_at > tenggat, tidak disimpan — lihat '
  'penjelasan panjang di kepala migrasi 0019.';

-- Many-to-many kelas target, persis pola `mapel_kelas` (0002). Satu tugas
-- bisa ditujukan ke beberapa kelas sekaligus (mis. guru IPA yang mengajar
-- 7.1 sampai 7.4 memberi tugas yang sama).
create table if not exists tugas_kelas (
  tugas_id uuid not null references tugas(id) on delete cascade,
  kelas_id uuid not null references kelas(id) on delete cascade,
  primary key (tugas_id, kelas_id)
);

create index if not exists tugas_kelas_kelas_id_idx on tugas_kelas (kelas_id);

create table if not exists pengumpulan_tugas (
  tugas_id uuid not null references tugas(id) on delete cascade,
  siswa_id uuid not null references siswa(id) on delete cascade,

  -- Isi pengumpulan.
  teks text not null default '',
  berkas_path text,
  berkas_nama text,
  berkas_ukuran integer,

  -- `submitted_at` null = draf. Siswa bisa mengetik lalu menutup tab, dan
  -- yang diketiknya tidak hilang, tapi guru belum melihatnya sebagai
  -- "sudah mengumpulkan". Sama persis semantiknya dengan
  -- `jawaban_siswa.submitted_at` di mesin ujian, supaya tidak ada dua
  -- arti berbeda untuk nama kolom yang sama di aplikasi ini.
  submitted_at timestamptz,
  updated_at timestamptz not null default now(),

  -- Penilaian. Selalu manual — tidak ada koreksi otomatis untuk tugas.
  nilai numeric,
  catatan_guru text,
  dinilai_at timestamptz,
  dinilai_by uuid references guru(id) on delete set null,

  primary key (tugas_id, siswa_id)
);

create index if not exists pengumpulan_tugas_siswa_idx
  on pengumpulan_tugas (siswa_id);

comment on table pengumpulan_tugas is
  'Gabungan "jawaban" + "nilai" untuk satu siswa di satu tugas. Sengaja '
  'tidak dipecah dua tabel seperti jawaban_siswa/nilai: nilai tugas tidak '
  'pernah dihitung mesin, selalu ditulis guru bersamaan saat dia membaca '
  'pengumpulannya.';

comment on column pengumpulan_tugas.berkas_path is
  'Path objek di bucket private `tugas`, BUKAN URL. Bentuknya '
  '<tugas_id>/<siswa_id>/<nama>. URL unduh dibuat sebagai signed URL '
  'berumur pendek dari server saat dibutuhkan.';

comment on column pengumpulan_tugas.nilai is
  'null = belum dinilai (beda dari 0 = dinilai nol). UI wajib membedakan '
  'keduanya; "belum dinilai" dan "dapat nol" adalah dua kabar yang sangat '
  'berbeda untuk siswa.';

-- ---------------------------------------------------------------------------
-- 2. updated_at OTOMATIS
-- ---------------------------------------------------------------------------
-- Nama fungsinya diawali `pengumpulan_` supaya tidak bentrok/menimpa
-- fungsi `set_updated_at` generik yang mungkin sudah dipakai tabel lain di
-- project ini. Migrasi ini tidak boleh mengubah perilaku tabel manapun di
-- luar yang dia buat sendiri.

create or replace function pengumpulan_tugas_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_pengumpulan_tugas_updated_at on pengumpulan_tugas;

create trigger trg_pengumpulan_tugas_updated_at
  before update on pengumpulan_tugas
  for each row
  execute function pengumpulan_tugas_set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. JARING PENGAMAN: `tugas` hanya untuk event berjenis assignment
-- ---------------------------------------------------------------------------
-- Cermin dari `cegah_mapel_di_event_bukan_ujian` (0018), alasannya sama
-- persis: Server Action sudah menolak, tapi Server Action bisa dilewati
-- (service_role di admin-multi*.ts). Triggernya satu SELECT by primary key
-- per insert tugas — dan tugas dibuat beberapa kali sehari, bukan ribuan
-- kali per menit.

create or replace function cegah_tugas_di_event_bukan_assignment()
returns trigger
language plpgsql
as $$
declare
  v_jenis text;
begin
  select jenis into v_jenis from event where id = new.event_id;

  if v_jenis is distinct from 'assignment' then
    raise exception
      'Tugas hanya boleh dibuat di event berjenis assignment (event ini: %). Event ujian memakai mapel/soal.',
      coalesce(v_jenis, 'tidak ditemukan');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_cegah_tugas_di_event_bukan_assignment on tugas;

create trigger trg_cegah_tugas_di_event_bukan_assignment
  before insert on tugas
  for each row
  execute function cegah_tugas_di_event_bukan_assignment();

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------
-- Catatan tentang cara menemukan "siswa yang sedang login": dipakai
-- subquery `(select id from siswa where auth_id = auth.uid())`, bukan
-- fungsi helper, supaya migrasi ini tidak bergantung pada helper yang
-- namanya bisa berbeda antar project. `is_guru()` sendiri sudah pasti ada
-- sejak 0005 dan dipakai apa adanya.

alter table tugas enable row level security;
alter table tugas_kelas enable row level security;
alter table pengumpulan_tugas enable row level security;

-- --- tugas ---

drop policy if exists tugas_guru_all on tugas;
create policy tugas_guru_all on tugas
  for all
  using (is_guru())
  with check (is_guru());

-- Siswa melihat tugas yang ditujukan ke kelasnya, TERMASUK yang belum
-- dibuka dan yang tenggatnya sudah lewat. Dashboard butuh keduanya:
-- yang belum dibuka untuk "Jadwal Mendatang", yang lewat untuk riwayat.
drop policy if exists tugas_select_siswa on tugas;
create policy tugas_select_siswa on tugas
  for select
  using (
    exists (
      select 1
      from tugas_kelas tk
      join siswa s on s.kelas_id = tk.kelas_id
      where tk.tugas_id = tugas.id
        and s.auth_id = auth.uid()
    )
  );

-- --- tugas_kelas ---

drop policy if exists tugas_kelas_guru_all on tugas_kelas;
create policy tugas_kelas_guru_all on tugas_kelas
  for all
  using (is_guru())
  with check (is_guru());

drop policy if exists tugas_kelas_select_siswa on tugas_kelas;
create policy tugas_kelas_select_siswa on tugas_kelas
  for select
  using (
    kelas_id in (select kelas_id from siswa where auth_id = auth.uid())
  );

-- --- pengumpulan_tugas ---

drop policy if exists pengumpulan_guru_all on pengumpulan_tugas;
create policy pengumpulan_guru_all on pengumpulan_tugas
  for all
  using (is_guru())
  with check (is_guru());

drop policy if exists pengumpulan_select_own on pengumpulan_tugas;
create policy pengumpulan_select_own on pengumpulan_tugas
  for select
  using (
    siswa_id in (select id from siswa where auth_id = auth.uid())
  );

-- Pintu pengumpulan, di database. Server Action juga mengeceknya supaya
-- pesan errornya ramah, tapi INI yang mengikat: kalau suatu saat ada
-- jalur tulis baru yang lupa mengecek, jalur itu tetap ditolak di sini.
--
-- Tiga syarat, dan ketiganya harus terpenuhi:
--   a. barisnya milik siswa yang login;
--   b. tugasnya memang ditujukan ke kelasnya;
--   c. sekarang >= dibuka_at DAN (sekarang <= tenggat ATAU tugas
--      mengizinkan terlambat).
drop policy if exists pengumpulan_insert_own on pengumpulan_tugas;
create policy pengumpulan_insert_own on pengumpulan_tugas
  for insert
  with check (
    siswa_id in (select id from siswa where auth_id = auth.uid())
    and exists (
      select 1
      from tugas t
      join tugas_kelas tk on tk.tugas_id = t.id
      join siswa s on s.kelas_id = tk.kelas_id
      where t.id = pengumpulan_tugas.tugas_id
        and s.auth_id = auth.uid()
        and now() >= t.dibuka_at
        and (now() <= t.tenggat or t.izinkan_terlambat)
    )
  );

-- Update dengan syarat yang sama, PLUS: baris yang sudah dinilai guru
-- tidak bisa diubah lagi oleh siswa. Kalau boleh, siswa bisa mengosongkan
-- jawabannya setelah dapat nilai dan catatan guru jadi menggantung pada
-- isi yang sudah tidak ada. Guru yang ingin memberi kesempatan perbaikan
-- tinggal mengosongkan nilainya lagi lewat panel penilaian — itu tindakan
-- sadar, dan tercatat di dinilai_at.
drop policy if exists pengumpulan_update_own on pengumpulan_tugas;
create policy pengumpulan_update_own on pengumpulan_tugas
  for update
  using (
    siswa_id in (select id from siswa where auth_id = auth.uid())
    and nilai is null
  )
  with check (
    siswa_id in (select id from siswa where auth_id = auth.uid())
    and exists (
      select 1
      from tugas t
      join tugas_kelas tk on tk.tugas_id = t.id
      join siswa s on s.kelas_id = tk.kelas_id
      where t.id = pengumpulan_tugas.tugas_id
        and s.auth_id = auth.uid()
        and now() >= t.dibuka_at
        and (now() <= t.tenggat or t.izinkan_terlambat)
    )
  );

-- Siswa TIDAK diberi policy delete sama sekali: menarik kembali
-- pengumpulan dilakukan dengan mengosongkan `submitted_at` lewat update
-- (jadi drafnya tetap ada), bukan dengan menghapus barisnya. Menghapus
-- baris akan menghilangkan jejak bahwa dia pernah mengumpulkan.

-- ---------------------------------------------------------------------------
-- 5. STORAGE: bucket `tugas`
-- ---------------------------------------------------------------------------
-- Private. 5 MB per berkas — cukup untuk foto tulisan tangan dari HP
-- (biasanya 1-3 MB) dan PDF beberapa halaman, tapi tidak cukup untuk
-- video, yang memang tidak ingin kita tampung di sini.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tugas',
  'tugas',
  false,
  5242880,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists tugas_berkas_guru_all on storage.objects;
create policy tugas_berkas_guru_all on storage.objects
  for all
  using (bucket_id = 'tugas' and is_guru())
  with check (bucket_id = 'tugas' and is_guru());

-- Siswa hanya boleh menyentuh objek di folder <tugas_id>/<siswa_id>/
-- miliknya sendiri. `storage.foldername(name)` memecah path jadi array;
-- elemen ke-2 adalah siswa_id. Inilah yang mengubah konvensi penamaan
-- dari "kesepakatan di kode" jadi aturan yang benar-benar ditegakkan.
drop policy if exists tugas_berkas_siswa_own on storage.objects;
create policy tugas_berkas_siswa_own on storage.objects
  for all
  using (
    bucket_id = 'tugas'
    and (storage.foldername(name))[2] in (
      select id::text from siswa where auth_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'tugas'
    and (storage.foldername(name))[2] in (
      select id::text from siswa where auth_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Cek hasil:
--   select count(*) from tugas;
--   select id, public, file_size_limit from storage.buckets where id = 'tugas';
--   select tablename, policyname from pg_policies
--     where tablename in ('tugas','tugas_kelas','pengumpulan_tugas')
--     order by tablename, policyname;
--
-- Uji trigger (harus GAGAL, ini yang diharapkan):
--   insert into tugas (event_id, judul, tenggat)
--   select id, 'salah kamar', now() + interval '1 day'
--   from event where jenis = 'asesmen_akhir' limit 1;
-- ---------------------------------------------------------------------------
