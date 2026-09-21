-- 0020_forum.sql
-- Jalankan di KETIGA project (kelas 7, 8, dan 9). Isinya identik.
-- Prasyarat: 0018_event_jenis.sql DAN 0019_tugas.sql sudah jalan di project
-- ini (yang kedua tidak dipakai langsung oleh forum, tapi migrasi ini
-- ditulis dengan asumsi urutan tahap tidak dilompati).
--
-- =============================================================================
-- APA YANG DIBANGUN TAHAP 5
-- =============================================================================
-- Mengisi mesin ketiga dan terakhir dari `event.jenis` (0018):
--
--   assignment -> tugas -> tugas_kelas + pengumpulan_tugas   (Tahap 4)
--   forum      -> forum_topik -> forum_kelas + forum_pesan
--                             -> forum_poin                   (INI)
--
-- Bentuknya MENIRU pola tugas, tapi satu sumbu berubah bentuk: tugas punya
-- BANYAK tugas per event (tiap tugas independen, kelas targetnya sendiri).
-- Forum di sini dimodelkan SATU forum_topik yang menaungi BANYAK ruang
-- kelas (`forum_kelas`) — jadwal buka/tutupnya satu untuk semua kelas yang
-- ikut, tapi isi obrolannya (`forum_pesan`) terpisah total per kelas.
-- Itu sebabnya halaman admin di Tahap 5 langsung
-- `/admin/event/[eventId]/forum/[kelasId]` (bukan .../forum/[topikId]/...)
-- — dalam satu event forum hanya ada satu topik yang relevan, jadi yang
-- perlu dipilih guru cuma ruang kelasnya. Skema TIDAK memaksa hal ini
-- lewat constraint unik pada `forum_topik.event_id` (dibiarkan sama
-- longgarnya dengan `tugas.event_id`, untuk konsistensi), tapi Server
-- Action Tahap 5 bagian 2 akan menolak membuat forum_topik kedua kalau
-- event itu sudah punya satu.
--
-- =============================================================================
-- KENAPA CHAT PER KELAS TERPISAH MESKI SATU forum_topik
-- =============================================================================
-- `forum_pesan.kelas_id` BUKAN sekadar turunan dari kelas siswa pengirim —
-- ia kolom sendiri, diisi eksplisit saat insert. Alasannya: forum_topik
-- boleh menaungi kelas 7.1 DAN 7.2 sekaligus (satu wali kelas mengajar
-- keduanya, ingin diskusi yang sama untuk dua kelas), tapi siswa 7.1 dan
-- 7.2 TIDAK saling melihat obrolan satu sama lain. Kalau `kelas_id` hanya
-- disimpulkan lewat join ke `siswa`, tidak ada cara memfilter pesan GURU
-- (yang tidak berada di kelas mana pun) ke ruang kelas yang benar — guru
-- membalas di ruang 7.1 harus muncul di 7.1 saja, bukan tersebar ke semua
-- kelas yang ditautkan ke forum_topik yang sama.
--
-- =============================================================================
-- KENAPA `forum_poin` TABEL TERPISAH, BUKAN DIHITUNG SAAT QUERY
-- =============================================================================
-- Beda dengan `terlambat` di Tahap 4 (dihitung saat tampil, karena
-- bergantung pada SATU baris `pengumpulan_tugas` dan gampang dibandingkan
-- ulang tiap kali), poin forum adalah AGREGAT dari bisa ratusan baris
-- `forum_pesan` per siswa per kelas, dan salah satu komponennya
-- (`poin_bonus`) berasal dari aksi terpisah (guru mengklik bubble) yang
-- tidak punya jejak "jumlah total" di tempat lain kalau tidak disimpan.
-- Menghitung ulang dari nol setiap kali tabel poin ditampilkan berarti
-- men-scan seluruh `forum_pesan` ruang itu tiap refresh — murah di awal,
-- tapi ruang forum yang aktif berbulan-bulan bisa berisi ribuan pesan.
-- Trigger yang menjaga `forum_poin` tetap sinkron (bagian 3 di bawah)
-- membayar biaya itu SEKALI per pesan/klik, bukan berulang setiap kali
-- tabelnya dibuka.
--
-- `total` sendiri TETAP dihitung, bukan disimpan manual — lewat
-- `generated always as (poin_pesan + poin_bonus) stored`. Ini beda dari
-- `poin_pesan`/`poin_bonus` itu sendiri (yang memang harus disimpan,
-- karena masing-masing adalah akumulasi dari kejadian terpisah), tapi
-- sejalan dengan filosofi Tahap 4: jangan simpan angka yang bisa
-- dijamin PostgreSQL sendiri tidak akan pernah salah jumlah.
--
-- =============================================================================
-- KENAPA BONUS DISIMPAN DI `forum_pesan.bonus_diberikan`, BUKAN LANGSUNG
-- MENAMBAH `forum_poin.poin_bonus`
-- =============================================================================
-- Guru mengklik BUBBLE PESAN TERTENTU untuk memberi/membatalkan bonus, dan
-- klik ulang pada bubble yang sama harus MEMBATALKAN, bukan menambah lagi
-- (toggle, bukan akumulasi — lihat catatan panjang di `forum.ts`). Untuk
-- tahu "apakah bubble INI sudah dapat bonus" sebelum menggambar
-- indikatornya, harus ada penanda PER PESAN. Kalau bonus langsung
-- ditambahkan ke `forum_poin.poin_bonus` tanpa jejak per pesan, tidak ada
-- cara membedakan "pesan ini sudah dapat bonus" dari "pesan ini belum",
-- dan guru yang me-refresh halaman akan kehilangan semua indikator
-- "menyala"-nya — bisa mengklik ulang pesan yang sama dan tanpa sadar
-- membatalkan bonus yang justru ingin dipertahankan.
--
-- Trigger di bagian 3 menjaga `forum_poin.poin_bonus` tetap sinkron dengan
-- SUM(bonus_diberikan) * 5 tanpa UI perlu menghitungnya sendiri.

-- ---------------------------------------------------------------------------
-- 1. TABEL
-- ---------------------------------------------------------------------------

create table if not exists forum_topik (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references event(id) on delete cascade,
  dibuka_at timestamptz not null default now(),
  ditutup_at timestamptz not null,
  created_at timestamptz not null default now(),
  created_by uuid references guru(id) on delete set null,

  constraint forum_topik_ditutup_setelah_dibuka check (ditutup_at > dibuka_at)
);

create index if not exists forum_topik_event_id_idx on forum_topik (event_id);

comment on table forum_topik is
  'Satu topik diskusi di dalam event berjenis forum (0018). Jadwal '
  'buka/tutupnya berlaku untuk SEMUA kelas yang ditautkan lewat '
  'forum_kelas — kalau butuh jadwal berbeda per kelas, buat forum_topik '
  'terpisah (satu event forum secara teknis boleh punya lebih dari satu, '
  'walau alur UI Tahap 5 mengarahkan ke satu per event).';

-- Many-to-many kelas target, pola persis `tugas_kelas` (Tahap 4). Satu
-- forum_topik boleh menaungi beberapa kelas; tiap kelas punya "ruangnya"
-- sendiri (lihat forum_pesan.kelas_id di bawah).
create table if not exists forum_kelas (
  forum_topik_id uuid not null references forum_topik(id) on delete cascade,
  kelas_id uuid not null references kelas(id) on delete cascade,
  primary key (forum_topik_id, kelas_id)
);

create index if not exists forum_kelas_kelas_id_idx on forum_kelas (kelas_id);

create table if not exists forum_pesan (
  id uuid primary key default gen_random_uuid(),
  forum_topik_id uuid not null references forum_topik(id) on delete cascade,
  -- Kolom sendiri, bukan turunan dari siswa_id -> lihat penjelasan panjang
  -- di kepala migrasi ini ("KENAPA CHAT PER KELAS TERPISAH").
  kelas_id uuid not null references kelas(id) on delete cascade,
  siswa_id uuid references siswa(id) on delete set null,
  guru_id uuid references guru(id) on delete set null,
  isi text not null,
  jenis_isi text not null default 'teks',
  bonus_diberikan boolean not null default false,
  created_at timestamptz not null default now(),

  constraint forum_pesan_jenis_isi_valid
    check (jenis_isi in ('teks', 'sticker', 'emoticon')),
  -- Pesan harus datang dari SATU sisi: siswa ATAU guru, tidak boleh
  -- keduanya kosong (pesan anonim tidak masuk akal di ruang kelas) dan
  -- tidak boleh keduanya terisi (siapa "pengirim sebenarnya" jadi ambigu
  -- di UI, yang membedakan gaya bubble persis dari kolom mana yang
  -- terisi).
  constraint forum_pesan_satu_pengirim check (
    (siswa_id is not null and guru_id is null)
    or (siswa_id is null and guru_id is not null)
  ),
  -- Bonus hanya masuk akal untuk pesan siswa bertipe teks (lihat UI Tahap
  -- 5 bagian admin: bubble guru dan bubble sticker/emoticon tidak punya
  -- tombol bonus sama sekali). Constraint ini jaring pengaman kedua kalau
  -- suatu saat ada jalur tulis baru yang lupa menyaring itu di UI.
  constraint forum_pesan_bonus_hanya_teks_siswa check (
    not bonus_diberikan or (siswa_id is not null and jenis_isi = 'teks')
  )
);

create index if not exists forum_pesan_ruang_idx
  on forum_pesan (forum_topik_id, kelas_id, created_at);
create index if not exists forum_pesan_siswa_idx on forum_pesan (siswa_id);

comment on table forum_pesan is
  'Satu bubble chat. `kelas_id` dipilih eksplisit saat insert (RLS bagian '
  '4 memaksa siswa hanya bisa mengisi kelasnya sendiri), bukan disimpulkan '
  'dari siswa_id, supaya pesan guru — yang tidak berada di kelas mana pun '
  '— tetap bisa ditempatkan di ruang yang benar.';

comment on column forum_pesan.jenis_isi is
  '''teks'' dihitung 1 poin keaktifan otomatis (lihat trigger bagian 3). '
  '''sticker''/''emoticon'' sengaja TIDAK dihitung — keduanya cara siswa '
  'menunjukkan hadir tanpa menulis apa-apa, dan tidak boleh dipakai untuk '
  'mengerek poin dengan spam emoji.';

comment on column forum_pesan.bonus_diberikan is
  'Toggle, BUKAN akumulasi. true = guru pernah mengklik bubble ini dan '
  'belum membatalkannya; +5 poin (POIN_BONUS_PER_KLIK di forum.ts) hidup '
  'di forum_poin.poin_bonus, dijaga trigger, BUKAN dihitung dari kolom '
  'ini saat tampil — kolom ini cuma penanda "sudah/belum", bukan sumber '
  'angka. Lihat penjelasan panjang di kepala migrasi ini.';

create table if not exists forum_poin (
  forum_topik_id uuid not null references forum_topik(id) on delete cascade,
  kelas_id uuid not null references kelas(id) on delete cascade,
  siswa_id uuid not null references siswa(id) on delete cascade,
  poin_pesan integer not null default 0,
  poin_bonus integer not null default 0,
  -- Dihitung PostgreSQL, tidak pernah ditulis manual. Lihat "KENAPA
  -- forum_poin TABEL TERPISAH" di kepala migrasi ini.
  total integer generated always as (poin_pesan + poin_bonus) stored,

  primary key (forum_topik_id, kelas_id, siswa_id),
  constraint forum_poin_tidak_negatif check (poin_pesan >= 0 and poin_bonus >= 0)
);

comment on table forum_poin is
  'Agregat poin keaktifan per siswa per ruang kelas, dijaga sinkron oleh '
  'trigger di forum_pesan (bagian 3) — TIDAK PERNAH ditulis langsung oleh '
  'Server Action. Baris di sini dibuat otomatis (upsert dari trigger) '
  'begitu pesan bertipe teks pertama siswa itu masuk; siswa yang belum '
  'pernah mengirim pesan teks tidak punya baris sama sekali (bukan baris '
  'dengan angka 0 — bedanya penting untuk PanelForumKelas Tahap 5 bagian '
  '2, yang harus menampilkan SEMUA siswa kelas itu, bukan cuma yang ada '
  'di forum_poin).';

-- ---------------------------------------------------------------------------
-- 2. JARING PENGAMAN: `forum_topik` hanya untuk event berjenis forum
-- ---------------------------------------------------------------------------
-- Cermin persis `cegah_tugas_di_event_bukan_assignment` (0019), yang juga
-- cermin `cegah_mapel_di_event_bukan_ujian` (0018). Server Action Tahap 5
-- bagian 2 akan menolak lebih dulu dengan pesan ramah; trigger ini jaring
-- pengaman kedua untuk jalur service_role (admin-multi-event.ts) yang
-- melewati Server Action sama sekali.

create or replace function cegah_forum_di_event_bukan_forum()
returns trigger
language plpgsql
as $$
declare
  v_jenis text;
begin
  select jenis into v_jenis from event where id = new.event_id;

  if v_jenis is distinct from 'forum' then
    raise exception
      'Forum hanya boleh dibuat di event berjenis forum (event ini: %). Event tugas memakai mesin tugas, event ujian memakai mapel/soal.',
      coalesce(v_jenis, 'tidak ditemukan');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_cegah_forum_di_event_bukan_forum on forum_topik;

create trigger trg_cegah_forum_di_event_bukan_forum
  before insert on forum_topik
  for each row
  execute function cegah_forum_di_event_bukan_forum();

-- ---------------------------------------------------------------------------
-- 3. TRIGGER: forum_poin dijaga sinkron oleh forum_pesan
-- ---------------------------------------------------------------------------
-- Tiga kejadian yang bisa mengubah poin, tiga trigger terpisah — sengaja
-- tidak digabung jadi satu fungsi besar dengan banyak `if TG_OP = ...`,
-- supaya tiap trigger bisa dibatasi `when` pada level SQL (Postgres tidak
-- akan memanggil fungsinya sama sekali kalau kondisinya tidak terpenuhi,
-- bukan cuma "dipanggil lalu langsung return new" di baris pertama).

-- 3a. Pesan teks BARU dari siswa -> +1 poin_pesan. Upsert karena ini bisa
--     jadi pesan teks PERTAMA siswa itu di ruang ini (belum ada baris
--     forum_poin sama sekali).
create or replace function forum_pesan_tambah_poin()
returns trigger
language plpgsql
as $$
begin
  insert into forum_poin (forum_topik_id, kelas_id, siswa_id, poin_pesan, poin_bonus)
  values (new.forum_topik_id, new.kelas_id, new.siswa_id, 1, 0)
  on conflict (forum_topik_id, kelas_id, siswa_id)
  do update set poin_pesan = forum_poin.poin_pesan + 1;

  return new;
end;
$$;

drop trigger if exists trg_forum_pesan_tambah_poin on forum_pesan;

create trigger trg_forum_pesan_tambah_poin
  after insert on forum_pesan
  for each row
  when (new.jenis_isi = 'teks' and new.siswa_id is not null)
  execute function forum_pesan_tambah_poin();

-- 3b. Pesan teks DIHAPUS -> -1 poin_pesan, dan kalau pesan itu sedang
--     dapat bonus, -5 poin_bonus sekalian (pesannya sudah tidak ada,
--     bonus untuk pesan yang tidak ada tidak masuk akal untuk
--     dipertahankan). `greatest(0, ...)` murni jaring pengaman terhadap
--     urutan kejadian yang seharusnya tidak mungkin (mis. baris forum_poin
--     sempat dihapus manual); constraint `forum_poin_tidak_negatif` di
--     atas tetap yang mengikat.
create or replace function forum_pesan_kurangi_poin()
returns trigger
language plpgsql
as $$
begin
  update forum_poin
  set poin_pesan = greatest(0, poin_pesan - 1),
      poin_bonus = greatest(0, poin_bonus - (case when old.bonus_diberikan then 5 else 0 end))
  where forum_topik_id = old.forum_topik_id
    and kelas_id = old.kelas_id
    and siswa_id = old.siswa_id;

  return old;
end;
$$;

drop trigger if exists trg_forum_pesan_kurangi_poin on forum_pesan;

create trigger trg_forum_pesan_kurangi_poin
  after delete on forum_pesan
  for each row
  when (old.jenis_isi = 'teks' and old.siswa_id is not null)
  execute function forum_pesan_kurangi_poin();

-- 3c. `bonus_diberikan` di-toggle guru -> +5/-5 poin_bonus. `when`
--     membandingkan old vs new supaya trigger TIDAK jalan setiap kali
--     baris pesan diupdate untuk alasan lain — hanya saat kolom ini
--     benar-benar berubah nilainya.
create or replace function forum_pesan_toggle_bonus()
returns trigger
language plpgsql
as $$
begin
  insert into forum_poin (forum_topik_id, kelas_id, siswa_id, poin_pesan, poin_bonus)
  values (
    new.forum_topik_id,
    new.kelas_id,
    new.siswa_id,
    0,
    case when new.bonus_diberikan then 5 else 0 end
  )
  on conflict (forum_topik_id, kelas_id, siswa_id)
  do update set poin_bonus = greatest(
    0,
    forum_poin.poin_bonus + (case when new.bonus_diberikan then 5 else -5 end)
  );

  return new;
end;
$$;

drop trigger if exists trg_forum_pesan_toggle_bonus on forum_pesan;

create trigger trg_forum_pesan_toggle_bonus
  after update on forum_pesan
  for each row
  when (old.bonus_diberikan is distinct from new.bonus_diberikan)
  execute function forum_pesan_toggle_bonus();

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------
-- Pola dan alasannya sama dengan 0019: subquery langsung ke `siswa` lewat
-- `auth.uid()`, bukan fungsi helper baru, supaya migrasi ini tidak
-- bergantung pada sesuatu yang belum tentu ada di semua project. `is_guru()`
-- sendiri sudah ada sejak 0005.

alter table forum_topik enable row level security;
alter table forum_kelas enable row level security;
alter table forum_pesan enable row level security;
alter table forum_poin enable row level security;

-- --- forum_topik ---

drop policy if exists forum_topik_guru_all on forum_topik;
create policy forum_topik_guru_all on forum_topik
  for all
  using (is_guru())
  with check (is_guru());

drop policy if exists forum_topik_select_siswa on forum_topik;
create policy forum_topik_select_siswa on forum_topik
  for select
  using (
    exists (
      select 1
      from forum_kelas fk
      join siswa s on s.kelas_id = fk.kelas_id
      where fk.forum_topik_id = forum_topik.id
        and s.auth_id = auth.uid()
    )
  );

-- --- forum_kelas ---

drop policy if exists forum_kelas_guru_all on forum_kelas;
create policy forum_kelas_guru_all on forum_kelas
  for all
  using (is_guru())
  with check (is_guru());

drop policy if exists forum_kelas_select_siswa on forum_kelas;
create policy forum_kelas_select_siswa on forum_kelas
  for select
  using (
    kelas_id in (select kelas_id from siswa where auth_id = auth.uid())
  );

-- --- forum_pesan ---

drop policy if exists forum_pesan_guru_all on forum_pesan;
create policy forum_pesan_guru_all on forum_pesan
  for all
  using (is_guru())
  with check (is_guru());

-- Siswa membaca pesan DI KELASNYA SENDIRI, dan hanya kalau forumnya sudah
-- dibuka (dibuka_at <= now()). Sengaja TIDAK disyaratkan "belum ditutup"
-- di SELECT — chat yang forumnya sudah tutup tetap boleh dibaca ulang
-- sebagai riwayat/rekap; yang ditutup cuma pintu KIRIM (lihat policy
-- insert di bawah). Ini beda arah dari tugas.ts (tugas TETAP tampil
-- sebelum dibuka), karena chat yang belum dibuka memang belum ada isinya
-- untuk dibaca.
-- Catatan penting: keempat baris `join`/`where` di bawah SENGAJA memeriksa
-- forum_kelas juga (bukan cuma "kelas_id ini kelasku sendiri"). Tanpa itu,
-- siswa kelas 7.5 yang kelas_id-nya kebetulan sama dengan salah satu baris
-- forum_pesan (mis. hasil percobaan manual, atau forum_topik yang cuma
-- ditautkan ke 7.1-7.4) tetap bisa lolos hanya karena kelas_id di baris
-- itu = kelas_id-nya sendiri. Yang seharusnya mengikat adalah: forum_topik
-- INI memang menautkan kelasnya lewat forum_kelas.
drop policy if exists forum_pesan_select_siswa on forum_pesan;
create policy forum_pesan_select_siswa on forum_pesan
  for select
  using (
    exists (
      select 1
      from forum_topik ft
      join forum_kelas fk
        on fk.forum_topik_id = ft.id and fk.kelas_id = forum_pesan.kelas_id
      join siswa s on s.kelas_id = fk.kelas_id
      where ft.id = forum_pesan.forum_topik_id
        and s.auth_id = auth.uid()
        and ft.dibuka_at <= now()
    )
  );

-- Siswa mengirim pesan MILIKNYA SENDIRI (siswa_id wajib = dirinya, guru_id
-- wajib kosong), ke kelasnya sendiri, selama forum BELUM ditutup. Ini
-- cermin database dari `bolehMengirimPesan()` di forum.ts — kalau suatu
-- saat keduanya lupa disamakan, policy inilah yang tetap mengikat.
drop policy if exists forum_pesan_insert_siswa on forum_pesan;
create policy forum_pesan_insert_siswa on forum_pesan
  for insert
  with check (
    guru_id is null
    and siswa_id in (select id from siswa where auth_id = auth.uid())
    and bonus_diberikan = false
    and exists (
      select 1
      from forum_topik ft
      join forum_kelas fk
        on fk.forum_topik_id = ft.id and fk.kelas_id = forum_pesan.kelas_id
      join siswa s on s.kelas_id = fk.kelas_id
      where ft.id = forum_pesan.forum_topik_id
        and s.auth_id = auth.uid()
        and now() >= ft.dibuka_at
        and now() <= ft.ditutup_at
    )
  );

-- TIDAK ADA policy update/delete untuk siswa. Ini chat, bukan draf yang
-- bisa disunting seperti pengumpulan_tugas — pesan yang sudah terkirim
-- dibaca semua orang di ruang itu secara real-time (atau mendekati), dan
-- mengizinkan sunting/hapus sepihak membuka pintu untuk "gaslighting"
-- percakapan yang sudah dibalas orang lain.

-- --- forum_poin ---

drop policy if exists forum_poin_guru_all on forum_poin;
create policy forum_poin_guru_all on forum_poin
  for all
  using (is_guru())
  with check (is_guru());

-- Siswa hanya boleh melihat poinnya SENDIRI, bukan papan poin satu kelas
-- penuh lewat query langsung ke tabel ini — papan poin kelas (yang
-- memang perlu menampilkan semua siswa) adalah tampilan GURU
-- (PanelForumKelas, Tahap 5 bagian 2), bukan siswa. Kalau nanti siswa
-- perlu melihat papan poin kelasnya sendiri, itu keputusan produk baru
-- yang sengaja tidak diam-diam dimasukkan lewat RLS yang longgar di sini.
drop policy if exists forum_poin_select_own on forum_poin;
create policy forum_poin_select_own on forum_poin
  for select
  using (
    siswa_id in (select id from siswa where auth_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Cek hasil:
--   select count(*) from forum_topik;
--   select tablename, policyname from pg_policies
--     where tablename in ('forum_topik','forum_kelas','forum_pesan','forum_poin')
--     order by tablename, policyname;
--
-- Uji trigger jaring pengaman jenis event (harus GAGAL, ini yang
-- diharapkan):
--   insert into forum_topik (event_id, ditutup_at)
--   select id, now() + interval '1 day'
--   from event where jenis = 'assignment' limit 1;
--
-- Uji trigger poin pesan (jalankan berurutan, ganti id sesuai data uji):
--   insert into forum_pesan (forum_topik_id, kelas_id, siswa_id, isi, jenis_isi)
--   values ('<forum_topik_id>', '<kelas_id>', '<siswa_id>', 'halo', 'teks');
--   select * from forum_poin
--     where forum_topik_id = '<forum_topik_id>' and siswa_id = '<siswa_id>';
--   -- poin_pesan harus 1, poin_bonus 0, total 1.
--
-- Uji trigger toggle bonus:
--   update forum_pesan set bonus_diberikan = true where id = '<forum_pesan_id>';
--   -- poin_bonus harus jadi 5, total 6.
--   update forum_pesan set bonus_diberikan = false where id = '<forum_pesan_id>';
--   -- poin_bonus harus kembali 0, total 1. Klik ulang TIDAK BOLEH
--   -- membuatnya 10 — itulah yang dijaga `when (old.bonus_diberikan is
--   -- distinct from new.bonus_diberikan)` di trigger 3c, bukan cuma
--   -- disiplin UI semata.
-- ---------------------------------------------------------------------------
