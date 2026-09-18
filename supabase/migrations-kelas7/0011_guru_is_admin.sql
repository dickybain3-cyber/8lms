-- 0011_guru_is_admin.sql
-- Membedakan "guru biasa" dari "admin" di dalam tabel `guru`.
--
-- =============================================================================
-- KENAPA KOLOM BARU, BUKAN TABEL/ROLE BARU?
-- =============================================================================
-- Sampai migrasi ini, di database TIDAK ADA konsep "admin" sama sekali —
-- yang ada cuma tabel `guru`. Yang selama ini disebut "admin" di UI
-- (middleware.ts: role = 'admin' kalau ada baris di tabel `guru`) sebenarnya
-- BERARTI "punya baris di tabel guru", titik. Jadi tiap guru otomatis
-- adalah admin, dan sebaliknya.
--
-- Itu tidak masalah selama semua halaman /admin dibatasi RLS per project
-- (satu jenjang saja). Tapi begitu ada dashboard yang MENGGABUNG data dari
-- ketiga project lewat `service_role` (yang melewati RLS sepenuhnya),
-- "semua guru = admin" berarti guru kelas 7 ikut melihat seluruh data kelas
-- 8 dan 9 — padahal keputusan desainnya jelas: guru tetap per-jenjang.
--
-- Karena itu dibutuhkan penanda eksplisit. Kolom boolean di `guru` dipilih
-- daripada tabel `admin` terpisah karena: (a) seorang admin di sekolah ini
-- tetap seorang guru yang juga mengelola soal/nilai jenjangnya sendiri,
-- jadi dia butuh baris `guru` itu juga — tabel terpisah berarti satu orang
-- punya dua baris identitas yang harus dijaga sinkron; (b) semua RLS yang
-- sudah ada bertumpu pada `is_guru()`, yang tidak perlu berubah sama sekali
-- dengan pendekatan kolom ini.
--
-- =============================================================================
-- PENTING: DEFAULT-NYA `false`
-- =============================================================================
-- Sesudah migrasi ini jalan, BELUM ADA seorang pun yang jadi admin — semua
-- baris `guru` yang sudah ada dapat `is_admin = false`. Itu disengaja
-- (aman secara default: tidak ada yang tiba-tiba dapat akses lintas
-- jenjang tanpa diputuskan manusia).
--
-- Kamu HARUS menaikkan akunmu sendiri jadi admin secara manual, lihat
-- contoh perintahnya di bagian paling bawah file ini.
--
-- Halaman yang terpengaruh TIDAK akan error kalau kamu lupa: /admin/
-- statistik cuma akan menampilkan data satu jenjang saja (persis seperti
-- sebelum migrasi ini) sampai flag-nya dinyalakan. Jadi tidak ada risiko
-- terkunci di luar panel sendiri.
--
-- Flag ini WAJIB diset di KETIGA project dengan nilai yang sama untuk orang
-- yang sama. Kalau cuma diset di project kelas 7, dashboard gabungan hanya
-- jalan saat dia login lewat jenjang 7.

alter table guru
  add column if not exists is_admin boolean not null default false;

comment on column guru.is_admin is
  'true = boleh membuka dashboard gabungan lintas 3 project (kelas 7/8/9) '
  'dan menjalankan aksi terarah ke jenjang lain lewat service_role. '
  'false (default) = guru biasa, tetap terbatas pada project/jenjang tempat '
  'dia login, persis seperti sebelum migrasi 0011. Pengecekannya ada di '
  'src/lib/admin-guard.ts (sisi aplikasi) — SENGAJA tidak dipakai di RLS '
  'mana pun, karena akses lintas jenjang memang tidak mungkin lewat RLS '
  '(tiap project punya auth.users sendiri, auth.uid() admin tidak dikenal '
  'di project tetangga).';

-- =============================================================================
-- LANGKAH MANUAL — jalankan SEKALI per project, ganti dulu emailnya
-- =============================================================================
-- Ganti 'ganti@dengan-email-adminmu.sch.id' dengan email akun yang mau
-- dijadikan admin, lalu jalankan di KETIGA project (kelas 7, 8, dan 9).
--
--   update guru
--      set is_admin = true
--    where auth_id = (
--      select id from auth.users
--       where email = 'ganti@dengan-email-adminmu.sch.id'
--    );
--
-- Cek hasilnya:
--
--   select g.nama, u.email, g.is_admin
--     from guru g join auth.users u on u.id = g.auth_id
--    order by g.is_admin desc, g.nama;
