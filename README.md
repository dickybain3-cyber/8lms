# LMS + CBT Sekolah

Sistem LMS untuk mengelola ujian CBT online. Next.js (App Router) +
Supabase (Postgres + Auth) + Cloudinary + Tailwind. Detail lengkap fitur
ada di spec asli (`README-1.md` kalau kamu masih menyimpannya) — file ini
fokus ke **cara menjalankan project** dan **status progres per sesi**.

---

## Status

### Sesi 1 selesai ✅

Yang sudah jadi di sesi ini:

- Setup project Next.js + TypeScript + Tailwind (dengan token warna &
  font custom, bukan default generik — lihat `tailwind.config.ts`)
- Migrasi Supabase lengkap: `kelas`, `guru`, `siswa`, `event`, `mapel`,
  `mapel_kelas`, `soal`, `jawaban_siswa`, `nilai`
- RLS aktif di semua tabel, termasuk RPC khusus `get_soal_untuk_siswa`
  supaya kunci jawaban tidak pernah terkirim ke browser siswa (lihat
  penjelasan di `docs/skema-database.md`)
- Login (tab Admin/Guru vs Siswa — siswa pakai username, bukan email)
- Middleware proteksi route + auto-redirect berdasarkan role
- Dashboard admin & siswa versi skeleton (cuma untuk verifikasi alur
  login end-to-end — isi sebenarnya nyusul Sesi 2 & 5)

### Sesi 2 selesai ✅

Yang sudah jadi di sesi ini:

- Shell admin penuh: header + hamburger menu (Event, Statistik,
  Pengolahan Nilai), menggantikan skeleton `src/app/admin/layout.tsx`
- `/admin/event` — daftar semua event sebagai card (nama, rentang
  tanggal, jenjang kelas_utama, jumlah mapel)
- `/admin/event/baru` — form buat event (Server Action `createEvent`)
- `/admin/event/[eventId]` — detail event: card tiap mapel di
  dalamnya + kelas target + tombol "Tambah Mapel"
- `/admin/event/[eventId]/mapel/baru` — form tambah mapel dengan
  checkbox kelas target (per-jenjang, + "pilih semua"), Server Action
  `createMapel` yang insert ke `mapel` lalu `mapel_kelas` (many-to-many)
- Validasi form di layer aplikasi (tanggal/waktu selesai >= mulai,
  minimal satu kelas dipilih) di atas CHECK constraint DB, supaya
  pesan error enak dibaca
- Placeholder `/admin/statistik` dan `/admin/nilai` (isi sebenarnya
  nyusul sesi berikutnya, supaya link menu tidak 404)

**Belum dikerjakan** (nyusul sesi berikutnya): form soal 6 tipe +
upload gambar Cloudinary, alur ujian siswa, autosave, scoring,
statistik, dan pengolahan nilai. Lihat `PROMPT-SESI-3.md` untuk
lanjutannya.

### Sesi 3 selesai ✅

Yang sudah jadi di sesi ini:

- `/admin/event/[eventId]/mapel/[mapelId]` — detail mapel: daftar soal
  urut berdasarkan `urutan`, badge tipe + skor tiap soal, total skor,
  tombol "Tambah Soal". Card mapel di halaman detail event sekarang
  jadi link ke halaman ini.
- `/admin/event/[eventId]/mapel/[mapelId]/soal/baru` — form tambah
  soal: tab pilih salah satu dari 6 `TipeSoal`, lalu render sub-form
  berbeda per tipe (`src/components/admin/SoalForm/`) — tiap tipe
  komponen sendiri, bukan satu form raksasa dengan banyak `if/else`.
- Bentuk `konten_jsonb` yang dihasilkan tiap sub-form mengikuti persis
  yang didokumentasikan di `docs/skema-database.md` /
  `supabase/migrations/0003_soal.sql`.
- Upload gambar ke Cloudinary lewat unsigned upload preset, langsung
  dari client (`src/components/admin/SoalForm/ImageUpload.tsx`) — bisa
  paste dari clipboard atau pilih file. Dipakai untuk gambar
  pertanyaan/pernyataan, gambar per-opsi (pilgan), gambar per-item
  (menjodohkan), dan gambar umum soal (`soal.gambar_url`).
- Server Action `createSoal`
  (`src/app/admin/event/[eventId]/mapel/[mapelId]/soal/actions.ts`)
  memvalidasi bentuk konten per tipe sebelum insert (jumlah opsi
  benar, minimal opsi/pernyataan/pasangan, dst) dengan pesan error
  yang jelas, dan menghitung `urutan` otomatis dari jumlah soal yang
  sudah ada di mapel tsb.

**Belum dikerjakan** (nyusul sesi berikutnya): alur ujian sisi siswa
(ambil soal lewat RPC `get_soal_untuk_siswa`, tampilkan per tipe,
autosave ke `jawaban_siswa`), scoring otomatis, statistik, dan
pengolahan nilai. Lihat `PROMPT-SESI-4.md` untuk lanjutannya.

---

### Sesi 4 selesai ✅

Yang sudah jadi di sesi ini:

- `/siswa` dipecah jadi route group `(dashboard)` supaya punya header +
  chrome sendiri, terpisah dari halaman ujian yang butuh tampilan fokus
  (lihat poin di bawah) — `src/app/siswa/layout.tsx` sekarang jadi
  passthrough transparan, `src/app/siswa/(dashboard)/layout.tsx` yang
  pegang header.
- Dashboard siswa (`src/app/siswa/(dashboard)/page.tsx`) sekarang berisi
  daftar mapel (lewat RLS `mapel_select_siswa`, otomatis terfilter ke
  kelas siswa yang login) dikelompokkan 3 bagian: **Sedang berlangsung**
  (tombol "Kerjakan" aktif, atau badge "Sudah dikumpulkan" kalau baris
  `jawaban_siswa` sudah punya `submitted_at`), **Akan datang** (jadwal
  ditampilkan, tombol nonaktif), **Sudah selesai** (badge "Sudah
  dikerjakan" / "Tidak dikerjakan" tergantung ada tidaknya
  `submitted_at`).
- `/siswa/ujian/[mapelId]` — halaman pengerjaan ujian
  (`src/app/siswa/ujian/[mapelId]/page.tsx`, server component yang
  manggil `supabase.rpc("get_soal_untuk_siswa", ...)` + load jawaban
  tersimpan, lalu render client component
  `src/components/siswa/ujian/ExamClient.tsx`):
  - Render tiap soal sesuai `tipe` lewat komponen viewer baru di
    `src/components/siswa/SoalViewer/` — **terpisah total** dari
    `src/components/admin/SoalForm/`, tipe-nya sendiri
    (`SoalViewer/types.ts`) sengaja tidak punya slot untuk field kunci
    jawaban sama sekali (bukan cuma "kebetulan kosong").
  - Bentuk jawaban per tipe: `pilgan_biasa` (string id opsi),
    `pilgan_kompleks` (array id opsi), `uraian_singkat` (string),
    `benar_salah` (boolean), `multi_benar_salah` (object
    `{pernyataan_id: boolean}`), `menjodohkan` (object
    `{soal_id: jawaban_id}`, UI dropdown per baris, bukan drag-drop).
  - Semua jawaban satu mapel disimpan dalam satu baris
    `jawaban_siswa.jawaban_jsonb` berbentuk `{soal_id: jawaban}`.
  - **Autosave**: upsert per perubahan jawaban dengan debounce 1.5
    detik, indikator "Tersimpan" / "Menyimpan…" / "Gagal tersimpan" di
    header halaman ujian. Error RLS (waktu habis / sudah submit)
    ditangani dengan pesan manusiawi, bukan raw error.
  - Saat halaman dibuka, jawaban lama (kalau ada, mis. refresh
    di tengah ujian) dimuat balik dari `jawaban_jsonb`.
  - Tombol "Selesai & Kumpulkan" — modal konfirmasi dulu, baru set
    `submitted_at`. Setelah itu halaman jadi read-only di UI (bukan
    cuma mengandalkan RLS).
  - Countdown timer (berubah warna kalau sisa < 5 menit) + auto-submit
    kalau `now() >= waktu_selesai` sementara siswa masih di halaman,
    lalu redirect ke dashboard dengan pesan lewat query param `?pesan=`
    (dibaca & ditampilkan di `(dashboard)/page.tsx`).
  - Halaman ujian sengaja tidak pakai header/nav dashboard — cuma bar
    fokus (nama mapel, progress, timer, status simpan).
- Perbaikan kecil peninggalan Sesi 3 yang ketahuan lewat `tsc --noEmit`
  (tidak sempat dicek waktu itu): cast tipe di
  `admin/event/[eventId]/page.tsx` &
  `admin/event/[eventId]/mapel/[mapelId]/page.tsx` (join `kelas`/`event`
  dari Supabase butuh `as unknown as` dulu), dan tipe `onContentChange`
  di `SoalForm.tsx` yang tidak cocok dengan tipe konten spesifik tiap
  sub-form.

**Belum dikerjakan** (nyusul sesi berikutnya): scoring otomatis (isi
tabel `nilai`), halaman statistik & pengolahan nilai admin (saat ini
masih placeholder), dan kemungkinan penghalusan dashboard/shell siswa
lebih lanjut. Lihat `PROMPT-SESI-5.md` untuk lanjutannya.

---

### Sesi 5 selesai ✅

Yang sudah jadi di sesi ini:

- **Scoring otomatis** — migrasi `0007_scoring.sql`:
  - Function `hitung_nilai(p_siswa_id, p_mapel_id)`, `security definer`,
    membaca `soal.konten_jsonb` (kunci jawaban asli) +
    `jawaban_siswa.jawaban_jsonb`, mencocokkan per tipe, lalu upsert ke
    `nilai` (`total_skor` + `detail_jsonb` per soal). Aturan pencocokan
    per tipe (didokumentasikan sebagai komentar di migrasi):
    `pilgan_biasa` (skor penuh/0), `pilgan_kompleks` (himpunan opsi
    harus persis sama, skor penuh/0 — sengaja tanpa partial credit),
    `uraian_singkat` (skor penuh kalau jawaban mengandung salah satu
    kata di `kunci_jawaban`, case-insensitive), `benar_salah` (exact
    boolean), `multi_benar_salah` & `menjodohkan` (partial credit
    proporsional per bagian yang benar).
  - Dipicu **trigger** `trg_jawaban_siswa_scoring` (`AFTER UPDATE ON
    jawaban_siswa WHEN submitted_at` baru terisi) — dipilih alih-alih
    dipanggil manual dari Server Action, supaya kode client Sesi 4
    (submit manual & auto-submit habis waktu) tidak perlu diubah sama
    sekali untuk memicu koreksi, dan supaya satu-satunya jalur koreksi
    cuma trigger DB ini (tidak ada jalur lain yang bisa "lupa"
    memicu).
  - Function `hitung_ulang_semua_nilai(p_mapel_id)` — guru saja, dipicu
    tombol "Hitung Ulang Nilai" di `/admin/nilai`, menghitung ulang
    semua siswa yang sudah submit di satu mapel (berguna kalau guru
    edit soal/kunci setelah ada yang submit — re-scoring otomatis saat
    edit soal belum ada, ini pemicu manualnya).
  - Kolom baru `nilai.is_override` menandai baris yang pernah ditimpa
    manual oleh guru, beda dari hasil koreksi otomatis murni.
- **`/admin/statistik`** — RPC `get_statistik_mapel()` &
  `get_distribusi_nilai()` di `0008_statistik_rpc.sql` (keduanya
  dibatasi guru lewat `is_guru()` di dalam function, karena
  `security definer` melewati RLS tabel yang dibaca). Halaman
  menampilkan mapel dikelompokkan per event: jumlah submit vs target,
  rata-rata/min/maks `total_skor`, skor maksimal mapel, progress bar
  submit, dan distribusi nilai (5 bucket persentase) dimuat lazy per
  mapel lewat komponen client `DistribusiNilai`.
- **`/admin/nilai`** — pilih mapel (dikelompokkan per event, mirip pola
  `/admin/event`) lewat query param `?mapelId=`, lalu tabel siswa x
  nilai: status submit, total skor (bisa expand ke detail skor per
  soal), tombol "Ubah" untuk override manual (Server Action
  `overrideNilai` — validasi siswa sudah submit & skor tidak melebihi
  skor maksimal mapel), tombol "Hitung Ulang Nilai" (Server Action
  `hitungUlangNilaiMapel`), dan "Export CSV" (dibuat manual di client,
  tanpa library tambahan — kolom per soal + total + status override).
- `npx tsc --noEmit` bersih. `npm run build` masih gagal di lingkungan
  pengembangan ini karena tidak bisa akses `fonts.googleapis.com` (sama
  seperti dicatat di Sesi 4, bukan regresi dari sesi ini).

**Belum dikerjakan** (nyusul sesi berikutnya): lihat
`PROMPT-SESI-6.md`.

---

### Sesi 6 selesai ✅

Yang sudah jadi di sesi ini:

- **Import massal akun siswa** — `/admin/siswa` (menu baru di
  `AdminShell.tsx`):
  - `src/lib/supabase/admin.ts` — client Supabase terpisah berbekal
    `service_role` key, HANYA dipakai di Server Action (tidak pernah di
    Client Component/browser). Sengaja dipisah dari `client.ts` dan
    `server.ts` supaya key ini tidak ketuker dipakai di tempat yang salah.
  - `src/lib/csv.ts` — parser CSV minimal (tanpa dependency baru) yang
    mendukung upload file maupun paste teks langsung.
  - `src/app/admin/siswa/actions.ts` — `importSiswaBatch` diproses per
    batch 50 baris dari client (`ImportSiswaForm.tsx`), bukan satu Server
    Action raksasa, supaya 600 baris tidak timeout dan progres per batch
    terlihat. Validasi per baris: data lengkap, `kelas` harus cocok
    `kelas.nama` yang sudah ada (baris tidak cocok dilewati, tidak
    membuat kelas baru diam-diam), `username` unik (dicek ke DB + ke
    baris lain dalam batch yang sama).
  - Password **acak per siswa** (bukan password seragam) — keputusan
    desain supaya satu password bocor tidak membuka akses satu kelas
    penuh. Konsekuensinya: password TIDAK bisa dilihat ulang setelah
    dibuat (Supabase Auth hanya simpan hash), jadi UI mewajibkan guru
    mengunduh hasil (tombol "Download CSV hasil") sebelum meninggalkan
    halaman ringkasan.
  - Rollback otomatis: kalau `auth.admin.createUser` berhasil tapi insert
    baris `siswa` gagal, akun auth langsung dihapus lagi
    (`admin.deleteUser`) supaya tidak ada akun "yatim". Kalau rollback itu
    sendiri gagal, dicatat jelas di ringkasan (dengan id akun) supaya guru
    tahu perlu bersih-bersih manual.
  - Ringkasan akhir: jumlah berhasil, daftar baris dilewati + alasan per
    baris (mis. "Baris 14: kelas 'X.9' tidak ditemukan, dilewati").
- **Edit & hapus Event** (`/admin/event/[eventId]/edit`, tombol di
  halaman detail event):
  - Server Action `updateEvent` (validasi sama seperti create) dan
    `deleteEvent`.
  - `hitungDampakHapusEvent` menghitung jumlah mapel + jawaban_siswa +
    nilai yang akan ikut terhapus (cascade dari migrasi 0002–0004) —
    ditampilkan di modal konfirmasi (`DeleteEventButton.tsx`) SEBELUM
    guru bisa menghapus. Guru wajib mengetik ulang nama event untuk
    mengaktifkan tombol hapus.
- **Edit & hapus Mapel** — pola sama dengan Event:
  - `updateMapel` merekonsiliasi `mapel_kelas` (hapus baris kelas yang
    tidak lagi dicentang, insert yang baru) alih-alih hapus-insert-ulang
    semua baris.
  - `hitungDampakHapusMapel` + `DeleteMapelButton.tsx` menampilkan dampak
    (jumlah soal/jawaban_siswa/nilai) sebelum hapus.
  - **Keputusan desain**: mapel yang sudah punya siswa submit (dicek
    lewat `cekMapelSudahDikerjakan`) TETAP boleh diedit jadwal/kelas
    targetnya — tapi form edit menampilkan peringatan eksplisit soal
    risikonya (mis. mempercepat waktu selesai bisa memutus akses siswa
    yang belum submit). Diizinkan alih-alih diblokir karena guru kadang
    memang perlu membetulkan jadwal salah ketik walau sudah ada yang
    mulai mengerjakan.
- **Edit & hapus Soal** — `/admin/event/[eventId]/mapel/[mapelId]/soal/[soalId]/edit`
  memakai ulang `SoalForm.tsx` yang sekarang punya mode edit (prop
  `soalAwal`): semua sub-komponen `SoalForm/*Form.tsx` menerima prop
  `initial` untuk prefill dari `konten_jsonb` yang tersimpan. Tipe soal
  sengaja TIDAK BISA diganti saat edit (ditampilkan sebagai label statis)
  — mengganti tipe akan membuat seluruh bentuk `konten_jsonb` tidak valid
  lagi, jadi alurnya: hapus lalu buat ulang kalau memang perlu ganti
  tipe. Form edit menampilkan peringatan re-scoring manual (mengarah ke
  tombol "Hitung Ulang Nilai" di `/admin/nilai`, fitur Sesi 5) kalau
  sudah ada siswa submit di mapel tsb — dua fitur ini nyambung dari sisi
  UX, bukan cuma di database. `deleteSoal` dijalankan lewat modal
  konfirmasi ringan per baris soal di halaman detail mapel.
- `npx tsc --noEmit` bersih. `npm run build` masih gagal di lingkungan
  pengembangan ini karena tidak bisa akses `fonts.googleapis.com` (sama
  seperti dicatat di Sesi 4 & 5, bukan regresi dari sesi ini).

**Belum dikerjakan / perlu dicek lagi di sesi berikutnya** (lihat juga
catatan di `PROMPT-SESI-7.md`):
- Belum ada uji manual end-to-end terhadap Supabase project sungguhan
  (mis. konfirmasi `auth.admin.createUser` benar-benar butuh
  `email_confirm: true` supaya siswa langsung bisa login tanpa verifikasi
  email — perlu dicek di project asli, bukan cuma dari dokumentasi
  Supabase).
- Belum ada testing untuk skenario race condition kalau dua guru
  menjalankan import siswa bersamaan dengan username yang sama persis di
  kedua file CSV masing-masing (kemungkinan kecil tapi belum divalidasi).
- Halaman `/admin/siswa` belum menampilkan daftar siswa yang sudah ada
  (cuma total count) — kandidat penghalusan berikutnya kalau guru perlu
  audit/edit data siswa satu-satu.

---

### Sesi 7 sebagian selesai ⏳

Sesi ini SENGAJA dihentikan di tengah (satu dari tiga kandidat topik di
`PROMPT-SESI-7.md` yang dikerjakan tuntas, dua lainnya belum disentuh
sama sekali) — lanjutan lengkapnya ada di `PROMPT-SESI-8.md`.

Yang sudah jadi di sesi ini:

- **Import massal akun guru** — `/admin/guru` (menu baru di
  `AdminShell.tsx`), reuse pola `importSiswaBatch` Sesi 6:
  - `src/lib/csv.ts` — `csvToGuruRows` (kolom `nama,email`, tanpa
    `kelas`).
  - `src/app/admin/guru/actions.ts` — `importGuruBatch`, proses per
    batch 50 baris sama seperti siswa. Beda utama dari import siswa:
    guru pakai **email asli** (bukan email sintetis + username), jadi
    tidak ada kolom `username`/`kelas`; validasi keunikan email
    diserahkan ke `auth.admin.createUser` (gagal dengan pesan jelas
    kalau email sudah terdaftar) alih-alih dicek manual ke tabel `guru`
    dulu.
  - `src/lib/supabase/admin.ts` (service role client Sesi 6) di-reuse
    apa adanya, tidak dibuat helper baru.
  - Password acak per guru + rollback otomatis `admin.deleteUser` kalau
    insert baris `guru` gagal — pola identik dengan import siswa.
  - **Keputusan**: siapa boleh import guru? Diputuskan SAMA seperti
    import siswa ("siapa saja yang sudah jadi guru login" boleh
    menjalankan), BUKAN dibatasi ke guru pertama/owner — alasan
    lengkapnya ada di komentar `importGuruBatch` (`actions.ts`).
    Alasannya singkatnya: skema `guru` saat ini tidak punya
    kolom role/peringkat, jadi "guru pertama" adalah konsep baru yang
    rapuh (bergantung ke `created_at`, bisa berubah kalau baris pertama
    dihapus) dan belum diminta eksplisit oleh spec.
  - `docs/skema-database.md` ditambah penjelasan kenapa guru pakai email
    asli (simetris dengan penjelasan siswa pakai email sintetis yang
    sudah ada dari sesi sebelumnya).
  - Bagian 2c di README ini diperbarui: akun guru sekarang disarankan
    lewat `/admin/guru`, bukan manual SQL Editor lagi (manual masih
    didokumentasikan sebagai alternatif untuk 1-2 akun).
- `npx tsc --noEmit` bersih (dicek ulang setelah perubahan sesi ini).

**BELUM dikerjakan sama sekali di sesi ini** (dua dari tiga kandidat
`PROMPT-SESI-7.md`, plus item verifikasi manual — semua jadi prioritas
utama `PROMPT-SESI-8.md`):
- **Riwayat/log aktivitas admin** (kandidat #2) — belum ada tabel
  `log_aktivitas`, belum ada trigger/pencatatan manual, belum ada
  halaman `/admin/log`. Trade-off trigger-DB vs catat-manual-di-Server-
  Action (dibahas di `PROMPT-SESI-7.md`) belum dianalisis sama sekali,
  apalagi diputuskan.
- **Pemolesan UX ujian siswa** (kandidat #3) — `ExamClient.tsx` belum
  disentuh: belum ada sidebar navigasi nomor soal, belum ada indikator
  status terjawab/belum, belum ada tombol lompat ke nomor tertentu.
  Definisi "sudah dijawab" untuk tipe `menjodohkan` (jawaban partial per
  baris) juga belum diputuskan.
- Verifikasi manual terhadap project Supabase sungguhan untuk fitur
  Sesi 6 (`auth.admin.createUser` + rollback) — catatan dari
  `PROMPT-SESI-6.md`/`PROMPT-SESI-7.md` ini masih belum dikerjakan,
  jadi juga masih berlaku untuk fitur import guru yang baru (pola
  create/rollback-nya sama, jadi risiko yang sama juga belum
  diverifikasi ke project asli).
- `npm run build` belum dicoba di sesi ini (lingkungan tetap tidak bisa
  akses Google Fonts, sama seperti sesi-sesi sebelumnya — bukan hal baru
  yang perlu dikhawatirkan, cuma belum dicoba ulang).

---

### Sesi 8 selesai ✅

Fokus tunggal sesi ini: pemolesan UX ujian siswa (`ExamClient.tsx`).
Riwayat/log aktivitas admin (kandidat lain dari `PROMPT-SESI-7.md`)
SENGAJA tidak disentuh sama sekali, sesuai arahan `PROMPT-SESI-8.md`,
supaya tidak berhenti-di-tengah lagi seperti Sesi 7.

Yang sudah jadi di sesi ini:

- **Navigasi antar-soal** — `ExamClient.tsx` sekarang menampilkan satu
  soal per layar (bukan scroll panjang satu halaman berisi semua soal),
  dengan panel nomor soal terpisah dari body soal:
  - Layar lg+ (desktop): sidebar tetap (sticky) di kiri, grid nomor soal.
  - Layar sempit (target utama produk ini — ujian dikerjakan lewat HP
    browser): panel nomor soal jadi collapsible (tombol toggle di atas
    body soal) supaya tidak mendorong soal terlalu jauh ke bawah di
    layar kecil. Kedua tampilan pakai komponen `SoalNavPanel` yang sama
    (cuma beda className grid/wrap), jadi logika status & pemilihan
    soal tidak pernah berbeda antara mobile dan desktop.
  - Tombol "← Sebelumnya" / "Berikutnya →" di bawah tiap soal, plus
    lompat langsung ke nomor tertentu dari panel nomor soal (sidebar
    atau panel collapsible).
- **Indikator status per nomor soal** (3 warna, badge/dot legend di
  bawah panel nomor soal):
  - **Sudah dijawab** (hijau) — dihitung dari `soalSudahTerjawab`
    (`src/lib/ujian.ts`), fungsi yang SUDAH ADA dari Sesi 4, dipakai
    ulang apa adanya (bukan bikin logika status baru) supaya cuma ada
    satu definisi "terjawab" di seluruh alur siswa (progress bar header
    & panel nomor soal sekarang bersumber dari fungsi yang sama).
  - **Sudah dilihat** (emas/`gold`, token warna brand yang sudah ada di
    `tailwind.config.ts`) — soal yang pernah jadi soal aktif tapi belum
    terjawab. Ditrack di state React lokal (`Set<string>` soal id),
    **sengaja tidak disimpan ke DB/localStorage** — murni bantuan visual
    dalam satu sesi pengerjaan, bukan data yang perlu selamat dari
    refresh. Alasan lengkap & konsekuensinya (refresh mereset status
    "dilihat", status "terjawab" tetap akurat karena sumbernya beda)
    didokumentasikan sebagai komentar di atas tipe `StatusNavSoal` dalam
    `ExamClient.tsx`.
  - **Belum dilihat** (abu-abu) — default.
  - **Definisi "sudah dijawab" untuk `menjodohkan`** (jawaban partial per
    baris) — dipakai definisi yang SUDAH DIPUTUSKAN sejak Sesi 4:
    **semua baris harus terisi**, bukan minimal satu baris (lihat
    komentar `soalSudahTerjawab` di `src/lib/ujian.ts`, sudah ada
    sebelum sesi ini, sekarang diperjelas lagi bahwa Sesi 8 mengikuti
    definisi yang sama, bukan bikin definisi baru yang berbeda).
  - Perbaikan kecil: komentar di `src/lib/ujian.ts` yang menyebut
    scoring "itu Sesi 7" diperbaiki jadi "Sesi 5" (sesuai riwayat Status
    di README ini) — salah ketik peninggalan sesi lama, bukan perubahan
    fungsional.
- **Autosave debounce TIDAK diubah sama sekali** — `simpanSekarang`,
  `jadwalkanSimpan`, `jawabanRef`, dan `debounceRef` dipindah apa adanya
  dari kode Sesi 4, tidak ada satu baris pun logika debounce/upsert yang
  disentuh. Perubahan sesi ini murni di layer render (soal mana yang
  ditampilkan `soalAktif` vs `soalList[activeIndex]`), bukan di jalur
  penyimpanan jawaban.
  - **PERLU DIVERIFIKASI MANUAL** oleh guru di lingkungan yang punya
    akses project Supabase sungguhan (lingkungan pengembangan sesi ini
    tidak punya akses jaringan sama sekali — lihat catatan verifikasi di
    bawah): isi jawaban di satu soal, pindah ke soal lain lewat panel
    nomor soal, tunggu indikator "Tersimpan", refresh halaman, pastikan
    jawaban soal pertama tadi tetap termuat balik lewat `jawabanAwal`.
    Belum dicoba langsung karena lingkungan sesi ini tidak bisa
    menjalankan aplikasi (lihat catatan verifikasi di bawah) — jangan
    dianggap terverifikasi hanya dari membaca kode.
- **Bagian 0 `PROMPT-SESI-8.md` (verifikasi `auth.admin.createUser` +
  rollback, nunggak sejak Sesi 6) — DILEWATI LAGI**, sama seperti
  disebutkan boleh dilewati di prompt: lingkungan sesi ini tidak punya
  akses project Supabase sungguhan sama sekali. Masih nunggak, dicatat
  lagi di `PROMPT-SESI-9.md`.
- **Verifikasi otomatis (`npx tsc --noEmit` / `npm run build`) TIDAK
  BISA dijalankan sama sekali di sesi ini** — beda dari catatan
  sesi-sesi sebelumnya ("build gagal karena tidak ada akses
  `fonts.googleapis.com`, tapi `tsc` bersih"): di lingkungan sesi ini
  bahkan `npm install` gagal total (tidak ada akses registry npm sama
  sekali, error `403`/`ENOTCACHED`, bukan cuma domain fonts Google), jadi
  `node_modules` tidak pernah terbentuk dan `tsc`/`build` tidak bisa
  dicoba sama sekali — bukan cuma "belum dicoba" seperti Sesi 7, tapi
  benar-benar tidak bisa di lingkungan ini. Perubahan sudah ditinjau
  manual baris-per-baris terhadap tipe (`SoalSiswa`, props `SoalViewer`,
  `Record<StatusNavSoal, string>`, dst) sebagai gantinya, tapi ini BUKAN
  pengganti `tsc --noEmit` sungguhan — **wajib dijalankan di lingkungan
  yang punya akses npm sebelum dianggap final**, apalagi sebelum
  deploy.

**Belum dikerjakan** (nyusul sesi berikutnya, lihat `PROMPT-SESI-9.md`):
- Riwayat/log aktivitas admin (kandidat #2 dari `PROMPT-SESI-7.md`) —
  belum disentuh sama sekali, sesuai rencana.
- Verifikasi manual autosave setelah perubahan navigasi (lihat poin di
  atas) — belum dicoba di aplikasi yang benar-benar berjalan.
- Verifikasi `auth.admin.createUser` + rollback (nunggak sejak Sesi 6).
- `npx tsc --noEmit` dan `npm run build` — belum bisa dicoba sama sekali
  di lingkungan pengembangan sesi ini (lihat catatan di atas).
- Race condition dua guru import bersamaan dengan username/email sama
  persis — masih belum divalidasi (nunggak dari Sesi 6–7).
- `/admin/siswa` dan `/admin/guru` masih belum menampilkan daftar akun
  yang sudah ada (cuma total count) — nunggak dari Sesi 6–7.

---

### Sesi 9 selesai ✅

Fokus tunggal sesi ini (sesuai `PROMPT-SESI-9.md`): **Riwayat/log
aktivitas admin**, kandidat #2 dari `PROMPT-SESI-7.md` yang digeser dua
kali (Sesi 7 → 8, Sesi 8 → 9) sebelum akhirnya dikerjakan tuntas di sini.

**Perbedaan penting dari lingkungan Sesi 8**: lingkungan pengembangan
sesi ini PUNYA akses `registry.npmjs.org` — `npm install` berhasil dan
`npx tsc --noEmit` benar-benar bisa dijalankan (bersih, tanpa error),
bukan cuma ditinjau manual baris-per-baris seperti Sesi 8. Ini juga
berarti item wajib "0" di `PROMPT-SESI-9.md" (jalankan `tsc` sebelum
kode baru) sungguh-sungguh terverifikasi kali ini, termasuk untuk kode
peninggalan Sesi 8 yang sebelumnya cuma ditinjau manual. `npm run build`
tetap gagal — tapi karena sebab yang SAMA seperti Sesi 4–7 (tidak ada
akses `fonts.googleapis.com` untuk `next/font/google`, dikonfirmasi
ulang di sesi ini, BUKAN regresi baru).

Yang sudah jadi di sesi ini:

- **Tabel `log_aktivitas`** (migrasi `0009_log_aktivitas.sql`) — lihat
  penjelasan lengkap & alasan desain di `docs/skema-database.md` bagian
  "`log_aktivitas` — riwayat aktivitas admin". Ringkasnya:
  - **Trigger DB generik** di `event`, `mapel`, `soal` (insert/update/
    delete) — konsisten dengan pola `hitung_nilai` Sesi 5, karena tabel
    ini cuma pernah ditulis guru.
  - **Trigger DB bersyarat** di `nilai` — HANYA menyala kalau
    `is_override = true` (override manual guru lewat `overrideNilai`,
    fitur Sesi 5), supaya koreksi otomatis dari submit siswa/tombol
    "Hitung Ulang Nilai" tidak ikut tercatat sebagai aktivitas guru.
  - **Dicatat manual** (panggil RPC `catat_log_aktivitas` langsung dari
    Server Action, BUKAN trigger) untuk tiga aksi massal yang menyentuh
    banyak baris sekaligus dalam satu keputusan guru: `hitungUlangNilaiMapel`
    (`/admin/nilai/actions.ts`), `importSiswaBatch`
    (`/admin/siswa/actions.ts`), `importGuruBatch`
    (`/admin/guru/actions.ts`) — masing-masing dapat SATU baris log per
    panggilan (per batch untuk import, per klik tombol untuk hitung
    ulang), bukan satu baris per siswa/baris CSV, supaya `/admin/log`
    tidak penuh noise.
  - Fungsi `catat_log_aktivitas()` adalah **satu-satunya jalur INSERT**
    ke tabel ini (tidak ada policy RLS INSERT langsung untuk guru sama
    sekali) — memvalidasi `is_guru()` dan menyimpan snapshot nama guru
    (`detail_jsonb.oleh_nama`) supaya tetap terbaca kalau baris `guru`
    yang bersangkutan suatu saat dihapus (`guru_id` sendiri
    `on delete set null`, riwayatnya tidak ikut hilang).
  - `detail_jsonb` tiap baris menyimpan snapshot data (nama event/mapel,
    tipe+cuplikan soal, siswa+skor nilai, dst), bukan cuma `entitas_id`
    mentah — supaya tetap terbaca lengkap walau baris sumbernya sendiri
    sudah terhapus.
  - **Verifikasi `auth.uid()` di dalam trigger `security definer`**
    (item yang diminta dicek di `PROMPT-SESI-9.md` poin 1) — TIDAK bisa
    diverifikasi langsung ke project Supabase sungguhan di sesi ini
    (lingkungan tidak punya akses project Supabase, cuma npm registry).
    Pendekatan yang dipilih justru dirancang supaya perilaku ini sudah
    terbukti benar dari Sesi 5 (`hitung_nilai`/`current_siswa_id` sudah
    memakai pola `auth.uid()` di dalam fungsi `security definer` yang
    sama, dan itu sudah jadi fondasi fitur inti sejak Sesi 5) — bukan
    pola baru yang belum teruji sama sekali, tapi tetap PERLU diverifikasi
    langsung ke project sungguhan sebelum dianggap final, terutama untuk
    baris log yang dihasilkan trigger (bukan RPC manual).
- **Halaman `/admin/log`** (`src/app/admin/log/page.tsx`, menu baru
  "Log Aktivitas" di `AdminShell.tsx`):
  - Tabel riwayat: waktu, nama guru (fallback ke snapshot `oleh_nama`
    kalau baris guru sudah terhapus), badge entitas, badge aksi, dan
    kalimat ringkasan manusiawi per baris (bukan JSON mentah) — mis.
    "Mengubah soal (pilgan_biasa): ... — isi/kunci jawaban berubah",
    "Import massal akun siswa: 48 berhasil, 2 dilewati (dari 50 baris)".
  - Filter lewat query param biasa (`?entitas=&guruId=&dari=&sampai=`),
    form `method="get"` tanpa JS — pola yang sama dengan `MapelPicker`
    di `/admin/nilai`.
  - Dibatasi 100 baris terbaru per query — **belum ada pagination**,
    dicatat sebagai kandidat penghalusan berikutnya kalau volume log
    sudah jauh lebih besar dari itu (nunggak ke Sesi 10 kalau relevan).
- `npx tsc --noEmit` bersih (dijalankan sungguhan, bukan tinjauan manual
  — lihat catatan perbedaan lingkungan di atas). `npm run build` gagal
  karena `fonts.googleapis.com` tidak bisa diakses (sama seperti Sesi
  4–7, dikonfirmasi ulang, bukan regresi baru).

**Belum dikerjakan** (nyusul sesi berikutnya, lihat `PROMPT-SESI-10.md`):
- Verifikasi manual `auth.uid()` di dalam trigger `log_aktivitas` +
  `auth.admin.createUser`/rollback (nunggak sejak Sesi 6) ke project
  Supabase sungguhan — lingkungan sesi ini tetap tidak punya akses ke
  situ (cuma npm registry yang baru tersedia sesi ini).
- Verifikasi manual autosave ujian siswa setelah perubahan navigasi
  Sesi 8 — masih belum dicoba di aplikasi yang benar-benar berjalan
  (nunggak dari Sesi 8, tidak disentuh sesi ini karena fokus tunggal ke
  log aktivitas).
- Pagination `/admin/log` kalau volume baris sudah besar.
- Race condition dua guru import bersamaan dengan username/email sama
  persis — masih belum divalidasi (nunggak dari Sesi 6–7).
- `/admin/siswa` dan `/admin/guru` masih belum menampilkan daftar akun
  yang sudah ada (cuma total count) — nunggak dari Sesi 6–7.

### Sesi 10 selesai ✅

Tidak ada topik "wajib tunggal" di sesi ini (lihat `PROMPT-SESI-10.md`) —
tiga kandidat yang berulang kali digeser sejak Sesi 6-9 semua dikerjakan
tuntas: pagination `/admin/log`, daftar akun di `/admin/siswa` &
`/admin/guru`, dan analisis race condition import bersamaan.

**Lingkungan pengembangan sesi ini PUNYA akses `registry.npmjs.org`**
(`npm install` berhasil, `npx tsc --noEmit` dijalankan sungguhan, bersih,
baik sebelum maupun setelah perubahan sesi ini). **TETAP TIDAK ADA akses**
`fonts.googleapis.com` — `npm run build` dicoba ulang (sesuai instruksi
poin 0 `PROMPT-SESI-10.md`, bukan diasumsikan gagal) dan gagal dengan
error yang SAMA seperti Sesi 4-9 (`next/font/google` tidak bisa fetch
`IBM Plex Sans` / `Source Serif 4`). Tidak ada akses ke project Supabase
sungguhan sama sekali sesi ini — semua item verifikasi manual di poin 0
`PROMPT-SESI-10.md` (auth.admin.createUser/rollback, auth.uid() di trigger
log_aktivitas, autosave ujian pasca Sesi 8) masih nunggak murni karena
sebab itu, dicatat lagi di bawah dan di `PROMPT-SESI-11.md`.

Yang sudah jadi di sesi ini:

- **Pagination `/admin/log`** (kandidat #1) — keyset pagination
  (`created_at < cursor`), BUKAN offset (`page * 100`). Alasannya
  didokumentasikan sebagai komentar di `src/app/admin/log/page.tsx`:
  tabel ini append-only dan terus bertambah, jadi offset pagination
  rawan menggeser/menduplikasi baris kalau ada log baru masuk di antara
  dua klik "halaman berikutnya" — keyset tidak punya masalah itu. Tombol
  "Muat riwayat lebih lama →" membawa semua filter aktif
  (`entitas`/`guruId`/`dari`/`sampai`) plus `cursor` baru (created_at
  baris terakhir yang sedang ditampilkan). **Trade-off yang diterima**:
  cuma bisa maju (lihat yang lebih lama), tidak ada tombol "kembali ke
  lebih baru" langsung — guru yang perlu itu klik ulang salah satu link
  filter atau hapus parameter `cursor` dari URL untuk mulai dari awal.
- **Daftar akun di `/admin/siswa`** (kandidat #2, bagian siswa) — tabel
  baru di bawah form import, menampilkan nama/username/kelas/tanggal
  daftar, dengan filter pencarian nama-atau-username (`?cari=`) dan
  filter kelas (`?kelasId=`), form `method="get"` tanpa JS (pola sama
  dengan `/admin/log` & `/admin/nilai`). Dibatasi 200 baris pertama
  (urut nama) per kombinasi filter — sama seperti pola batas di
  `/admin/log`, belum pagination penuh di daftar ini (kandidat
  penghalusan lagi kalau jumlah siswa sudah jauh melebihi itu).
- **Daftar akun di `/admin/guru`** (kandidat #2, bagian guru) — pola
  sama, tapi dengan tantangan tambahan: email guru disimpan di
  `auth.users` (Supabase Auth), BUKAN di tabel `guru` (beda dari siswa
  yang punya kolom `username` sendiri) — lihat penjelasan "guru pakai
  email asli" di `docs/skema-database.md`. Diselesaikan dengan
  `admin.auth.admin.listUsers()` dipaginasi (bukan `getUserById`
  satu-satu per guru) untuk membangun map `auth_id -> email` sekali di
  awal render halaman, lalu di-join ke daftar guru dari tabel biasa.
  **Gagal-lunak**: kalau `SUPABASE_SERVICE_ROLE_KEY` tidak diset di
  environment (mis. preview/build tanpa akses Supabase), daftar tetap
  tampil (nama + tanggal) tanpa kolom email, bukan error total —
  konsisten dengan pola "jangan diblokir kalau environment tidak punya
  akses" di `PROMPT-SESI-*.md` sebelumnya.
- **Analisis race condition import bersamaan** (kandidat #3) —
  DIANALISIS TUNTAS, hasilnya: **sudah aman dari sisi konsistensi data,
  tidak perlu kode tambahan**. `siswa.username` (dan email guru di
  `auth.users`) sudah punya `unique` constraint di level DB sejak
  Sesi 1/awal — pre-check di `importSiswaBatch`/`importGuruBatch` cuma
  optimisasi (hindari panggilan `createUser` sia-sia), bukan satu-satunya
  lapisan pertahanan. Kalau dua request benar-benar bersamaan lolos
  pre-check masing-masing lalu sama-sama coba INSERT baris dengan
  username sama, DB akan menolak INSERT kedua — dan jalur `insertError`
  yang SUDAH ADA sejak Sesi 6 (rollback `admin.deleteUser` otomatis)
  menangani itu dengan benar tanpa akun "yatim". Didokumentasikan sebagai
  komentar panjang di `src/app/admin/siswa/actions.ts` tepat di atas
  pre-check tersebut, supaya sesi berikutnya tidak perlu menganalisis
  ulang dari nol. **Catatan tetap**: ini analisis logika/kode, BELUM ada
  uji manual dua request sungguhan bersamaan ke project Supabase asli
  (masih butuh akses Supabase sungguhan yang belum ada sejak beberapa
  sesi) — dicatat lagi di bawah, bukan dianggap tuntas 100%.
- `src/types/index.ts` — `Siswa` & `Guru` ditambah field `created_at`
  (sudah ada di kolom DB sejak Sesi 1, belum pernah dipetakan ke tipe
  karena belum ada UI yang menampilkannya sampai sesi ini).
- `npx tsc --noEmit` bersih (dijalankan sungguhan sebelum DAN sesudah
  semua perubahan sesi ini, sesuai poin 0 `PROMPT-SESI-10.md`). `npm run
  build` gagal karena `fonts.googleapis.com` tidak bisa diakses — dicoba
  ulang sungguhan sesi ini (bukan diasumsikan), errornya identik dengan
  Sesi 4-9, bukan regresi baru.

**Belum dikerjakan / masih nunggak** (lihat `PROMPT-SESI-11.md`):
- Verifikasi manual ke project Supabase sungguhan — SEMUA item ini masih
  nunggak karena lingkungan sesi ini (sama seperti Sesi 6-9) tidak punya
  akses ke situ, cuma npm registry:
  - `auth.admin.createUser` + rollback `admin.deleteUser` (nunggak sejak
    Sesi 6).
  - `auth.uid()` di dalam trigger `security definer` untuk
    `log_aktivitas` (nunggak sejak Sesi 9).
  - Autosave ujian siswa pasca perubahan navigasi Sesi 8 (nunggak sejak
    Sesi 8).
  - Race condition import bersamaan — analisis kode sudah tuntas (lihat
    di atas), tapi uji dua request sungguhan bersamaan ke Supabase asli
    belum pernah dilakukan.
- Pagination daftar akun `/admin/siswa`/`/admin/guru` kalau jumlah akun
  sudah jauh melebihi batas 200 baris (analog dengan keyset pagination
  `/admin/log` yang baru — belum diterapkan ke dua halaman ini karena
  belum ada kebutuhan konkret sejumlah itu, bukan karena lebih sulit).
- Tidak ada topik wajib baru yang digeser dari sesi ini — semua kandidat
  `PROMPT-SESI-10.md` sudah disentuh. `PROMPT-SESI-11.md` isinya
  kandidat baru + daftar verifikasi manual yang masih nunggak di atas.

### Sesi 11 selesai ✅ (sebagian — lihat catatan lingkungan)

Tidak ada topik "wajib tunggal" di sesi ini (lihat `PROMPT-SESI-11.md`).
Dari 3 kandidat baru yang ditawarkan, **kandidat #2 (reset password
individual siswa/guru) dikerjakan tuntas**; kandidat #1 (pagination
daftar akun) dan #3 (hapus akun) **belum disentuh sama sekali** — bukan
dicoba-dan-gagal, murni belum dipilih di sesi ini, digeser ke
`PROMPT-SESI-12.md`.

**Lingkungan pengembangan sesi ini TIDAK PUNYA akses `registry.npmjs.org`**
(`npm install` gagal dengan `403 Forbidden`, berbeda dari Sesi 10 yang
sempat punya akses) — jadi `npx tsc --noEmit` SUNGGUHAN tidak bisa
dijalankan sama sekali di sini (tidak ada `node_modules`, termasuk
`typescript` milik project). Sebagai gantinya, tiap file baru/berubah
dicek dengan `tsc` global (versi lain, tanpa resolusi modul project —
cuma menyaring error sintaks kelas TS1xxx, BUKAN type-check penuh
terhadap tipe Supabase/Next.js) dan ditinjau manual baris-per-baris
terhadap pola yang sudah ada (`importSiswaBatch`/`importGuruBatch`).
**Ini BUKAN pengganti `tsc --noEmit` sungguhan** — sesi berikutnya yang
environment-nya punya akses npm registry WAJIB menjalankan `npx tsc
--noEmit` sungguhan atas perubahan sesi ini sebagai prioritas pertama,
sama seperti poin 0 di tiap `PROMPT-SESI-*.md`. Tidak ada akses
`fonts.googleapis.com` maupun project Supabase sungguhan juga di sesi
ini — semua item verifikasi manual di bawah masih nunggak murni karena
sebab yang sama seperti Sesi 6-10.

Yang sudah jadi di sesi ini:

- **Reset password individual siswa** — tombol "Reset password" baru
  di tiap baris tabel `/admin/siswa` (`resetPasswordSiswa` di
  `src/app/admin/siswa/actions.ts`). Setelah konfirmasi (`window.confirm`,
  peringatan bahwa password lama langsung tidak berlaku), memanggil
  `admin.auth.admin.updateUserById(auth_id, { password })` dengan
  password acak 12 karakter baru (generator sama persis dengan
  `importSiswaBatch`) — TIDAK ada create/rollback seperti import, karena
  akun auth-nya sudah ada, cuma satu operasi update. Password baru
  ditampilkan sekali di UI (komponen client `ResetPasswordButton`, tombol
  salin ke clipboard), tidak disimpan plaintext di mana pun setelahnya.
  Dicatat ke `log_aktivitas` dengan aksi baru `reset_password_siswa`.
- **Reset password individual guru** — pasangan persis di `/admin/guru`
  (`resetPasswordGuru` di `src/app/admin/guru/actions.ts`, aksi log
  `reset_password_guru`). Satu-satunya beda dari versi siswa: tabel
  `guru` tidak punya kolom `username`, jadi detail log & label tombol
  pakai email hasil `admin.auth.admin.getUserById()` (gagal-lunak — kalau
  lookup email gagal, log tetap tercatat tanpa email, reset password itu
  sendiri tetap dianggap berhasil).
- `src/components/admin/ResetPasswordButton.tsx` — SATU komponen client
  generik dipakai di kedua halaman (siswa & guru), menerima Server Action
  yang mana yang dipanggil lewat prop `action`. Beda dari keputusan di
  layer Server Action (`resetPasswordSiswa`/`resetPasswordGuru` SENGAJA
  tidak disatukan, lihat komentar di `actions.ts` masing-masing) — di
  sisi client tidak ada alasan bisnis yang mungkin membuat perilaku
  keduanya berbeda nanti, jadi duplikasi di sini murni boilerplate tanpa
  nilai tambah.
- `src/app/admin/log/page.tsx` — fungsi `ringkasanBaris` disesuaikan
  supaya baris log dengan `entitas: "siswa"` / `entitas: "guru"` yang
  BUKAN import (cek `log.aksi`) ditampilkan sebagai kalimat "Reset
  password …" yang benar, bukan ikut ditampilkan sebagai "Import massal
  akun …" yang salah.
- Kolom baru "Aksi" ditambah di tabel daftar akun `/admin/siswa` dan
  `/admin/guru` untuk menampung tombol reset password ini.

**Belum dikerjakan / masih nunggak** (lihat `PROMPT-SESI-12.md`):
- **`npx tsc --noEmit` sungguhan belum pernah dijalankan atas perubahan
  sesi ini** — prioritas tertinggi begitu environment sesi berikutnya
  punya akses npm registry (lihat catatan lingkungan di atas, ini beda
  dari nunggak-nunggak lain yang murni soal akses Supabase).
- Verifikasi manual ke project Supabase sungguhan — SEMUA masih nunggak,
  termasuk item lama (createUser/rollback sejak Sesi 6, auth.uid() di
  trigger log_aktivitas sejak Sesi 9, autosave ujian sejak Sesi 8, race
  condition import sejak Sesi 10) **plus dua item baru dari fitur sesi
  ini**: reset password siswa DAN guru belum pernah dicoba sungguhan ke
  project Supabase asli (mis. apakah `updateUserById` benar-benar
  membuat login lama gagal & login baru berhasil).
- Kandidat #1 (pagination daftar akun `/admin/siswa`/`/admin/guru`) —
  belum disentuh sama sekali, masih dibatasi 200 baris pertama seperti
  Sesi 10. Ingat catatan di `PROMPT-SESI-11.md`: kunci urut untuk keyset
  di sini beda dari `/admin/log` (perlu composite `(nama, id)`, bukan
  cuma `nama`, karena nama BISA duplikat antar siswa).
- Kandidat #3 (hapus akun siswa/guru individual) — belum disentuh sama
  sekali. Perlu keputusan desain dulu soal dampak ke data terkait
  (nilai/jawaban_siswa) sebelum implementasi, mirip pola
  `hitungDampakHapusEvent`/`hitungDampakHapusMapel` Sesi 6.

### Sesi 12 selesai ✅ (sebagian — lihat catatan lingkungan)

Dari kandidat `PROMPT-SESI-12.md`, **kandidat #1 (pagination keyset
composite `/admin/siswa` & `/admin/guru`) dikerjakan tuntas**; kandidat
#2 (hapus akun) dan #3 (modal konfirmasi custom pengganti
`window.confirm`) **belum disentuh sama sekali** — digeser ke
`PROMPT-SESI-13.md`.

**Lingkungan pengembangan sesi ini TIDAK PUNYA akses
`registry.npmjs.org`** — dicoba ulang secara eksplisit sesuai poin 0
`PROMPT-SESI-12.md` (bukan diasumsikan sama dengan Sesi 11 tanpa
dicoba), hasilnya sama: `npm install` gagal `403 Forbidden`, tidak ada
`node_modules`. Jadi `npx tsc --noEmit` SUNGGUHAN **masih belum pernah
dijalankan sama sekali** atas kode Sesi 11 maupun perubahan baru sesi
ini — ini poin terpisah dari nunggak-nunggak akses Supabase di bawah,
sesuai permintaan eksplisit di `PROMPT-SESI-12.md` untuk tidak
menggabungkannya jadi satu poin generik. Sebagai jaring pengaman
minimal (BUKAN pengganti type-check sungguhan), file baru/berubah sesi
ini (`src/app/admin/siswa/page.tsx`, `src/app/admin/guru/page.tsx`,
`src/lib/postgrest-filter.ts`) dicek dengan `tsc` global versi lain
(6.0.3, di luar project) tanpa resolusi modul — disaring khusus error
sintaks kelas TS1xxx, hasilnya nihil. Tidak ada akses
`fonts.googleapis.com` maupun project Supabase sungguhan juga di sesi
ini.

Yang sudah jadi di sesi ini:

- **Pagination keyset composite `(nama, id)` di `/admin/siswa` dan
  `/admin/guru`** — sebelumnya dibatasi 200 baris pertama tanpa cara
  melihat baris berikutnya. Beda dari `/admin/log` (cursor tunggal
  `created_at`, praktis selalu unik): `nama` siswa/guru BISA duplikat,
  jadi cursor-nya composite — baris berikutnya adalah `nama > cursor`
  ATAU (`nama = cursor` DAN `id > cursorId`). Query diurut
  `.order("nama").order("id")` (dua-duanya ascending) supaya urutan
  deterministik dan konsisten dengan cursor.
- `src/lib/postgrest-filter.ts` (baru) — helper `escapePostgrestValue`
  (bungkus nilai dengan tanda kutip ganda + escape backslash/kutip,
  ikut sintaks filter PostgREST supaya nama yang mengandung koma/kurung
  tidak merusak ekspresi filter) dan `cursorKeysetOr` (bangun ekspresi
  `kolom.gt.V,and(kolom.eq.V,id.gt.ID)` untuk keyset composite generik,
  tidak spesifik ke tabel `siswa`/`guru` kalau nanti dibutuhkan tabel
  lain).
- Di `/admin/siswa`, filter pencarian (`nama` ATAU `username`) itu
  sendiri sudah butuh `.or()`. Supaya tidak bergantung pada perilaku
  yang tidak jelas terdokumentasi saat DUA `.or()` terpisah dipanggil
  berurutan (lihat komentar panjang di `postgrest-filter.ts`), kondisi
  cursor dan kondisi pencarian digabung jadi SATU ekspresi
  `and(or(...),or(...))` lewat SATU pemanggilan `.or()` saat keduanya
  aktif bersamaan. Di `/admin/guru`, pencarian cuma satu kolom (`nama`,
  `.ilike()` biasa yang AND-composable), jadi tidak perlu penggabungan
  serupa — cursor tetap SATU `.or()` terpisah yang aman di-AND-kan
  dengan filter lain.
- Tombol "Muat lebih banyak" (gaya sama seperti "Muat riwayat lebih
  lama" di `/admin/log`) muncul kalau jumlah baris di halaman tepat
  mencapai batas 200 — bawa filter aktif (`cari`/`kelasId`) plus
  `cursorNama`/`cursorId` dari baris terakhir yang ditampilkan.
  Mengubah/reset filter otomatis mereset pagination (form GET tidak
  membawa field cursor tersembunyi), konsisten dengan pola
  `/admin/log`.

**CATATAN JUJUR soal verifikasi** (belum diuji ke PostgREST/Supabase
sungguhan, murni belum ada akses sepanjang sesi ini):
- Ekspresi nested `and(or(...),or(...))` di `/admin/siswa` — sintaksnya
  mengikuti dokumentasi PostgREST, tapi belum pernah dicoba beneran.
  Prioritas tinggi untuk diuji dulu (dengan kombinasi pencarian +
  "Muat lebih banyak" sekaligus) sebelum terlalu percaya diri.
- `escapePostgrestValue` — belum diuji dengan nama yang benar-benar
  mengandung koma, kurung, atau tanda kutip ganda. Kalau ada siswa/guru
  dengan nama seperti itu di data sungguhan, uji jalur itu secara
  spesifik.
- Asumsi "kalau baris di halaman == 200, mungkin masih ada lagi" bisa
  meleset kalau jumlah baris yang cocok filter PERSIS 200 (klik "Muat
  lebih banyak" akan menampilkan 0 baris, bukan error — cuma sedikit
  membingungkan UX-nya, bukan bug fatal). Sama seperti trade-off yang
  sudah diterima di `/admin/log` sejak Sesi 10.

**Belum dikerjakan / masih nunggak** (lihat `PROMPT-SESI-13.md`):
- **`npx tsc --noEmit` sungguhan masih belum pernah dijalankan sama
  sekali** atas kode Sesi 11 maupun Sesi 12 — ini SUDAH 2 sesi berturut
  tanpa akses npm registry, prioritas tertinggi begitu environment
  sesi berikutnya punya akses.
- Verifikasi manual ke project Supabase sungguhan — SEMUA item lama
  masih nunggak tanpa perubahan (createUser/rollback sejak Sesi 6,
  auth.uid() di trigger log_aktivitas sejak Sesi 9, autosave ujian
  sejak Sesi 8 — sudah 4 sesi, reset password siswa/guru sejak Sesi
  11), **plus** dua item baru dari catatan jujur di atas (ekspresi
  nested or/and, escaping nama dengan karakter spesial).
- Kandidat #2 (hapus akun siswa/guru individual) — belum disentuh sama
  sekali, masih perlu keputusan cascade vs soft-delete dulu.
- Kandidat #3 (modal konfirmasi custom pengganti `window.confirm` untuk
  reset password) — belum disentuh, murni penghalusan UX kalau ada
  waktu.

---

### Sesi 13 selesai ✅ (sebagian — lihat catatan lingkungan)

Kedua kandidat dari `PROMPT-SESI-13.md` (hapus akun individual +
konfirmasi custom pengganti `window.confirm`) DIKERJAKAN BERSAMAAN,
sesuai saran di prompt yang sama, jadi satu keputusan desain: satu
mekanisme modal konsisten untuk dua aksi berbahaya sekaligus, bukan dua
mekanisme terpisah.

Yang sudah jadi di sesi ini:

- **Hapus akun siswa/guru individual** — `/admin/siswa` dan
  `/admin/guru`:
  - **Keputusan cascade vs soft-delete**: CASCADE (bukan soft-delete),
    dan ternyata TIDAK butuh implementasi manual sama sekali — skema
    yang sudah ada sejak Sesi 1/4 sudah menjamin ini lewat FK: `siswa.
    auth_id` / `guru.auth_id` punya `references auth.users (id) on
    delete cascade`, jadi cukup SATU panggilan
    `admin.auth.admin.deleteUser(authId)` dan baris `siswa`/`guru`
    ikut terhapus otomatis oleh Postgres. `jawaban_siswa` dan `nilai`
    juga punya FK cascade ke `siswa` (0004), jadi ikut terhapus
    transitif. Soft-delete (mis. kolom `deleted_at`) dipertimbangkan
    tapi TIDAK dipilih — akan butuh mengubah semua query/RLS yang
    sudah ada di seluruh aplikasi untuk mengecualikan baris
    ter-soft-delete (event, mapel, statistik, dst), scope yang jauh
    lebih besar daripada yang diminta, dan tidak ada requirement
    eksplisit untuk "akun yang bisa dipulihkan" di spec manapun.
  - `hitungDampakHapusSiswa`/`hitungDampakHapusGuru`
    (`src/app/admin/siswa/actions.ts`,
    `src/app/admin/guru/actions.ts`) — pola sama dengan
    `hitungDampakHapusEvent`/`hitungDampakHapusMapel` Sesi 6, TAPI
    dipanggil per-klik dari client (bukan pra-dihitung untuk semua
    baris tabel saat render halaman) — `/admin/siswa`/`/admin/guru`
    bisa menampilkan sampai 200 baris sekaligus, pra-hitung dampak
    semua baris akan jadi ratusan query sia-sia.
  - **Dampak siswa vs guru beda level bahaya, ditampilkan beda pula**:
    siswa (kotak MERAH — jawaban_siswa & nilai ikut terhapus permanen,
    termasuk draf yang belum dikumpulkan) vs guru (kotak NETRAL — event
    yang pernah dibuat guru itu TIDAK ikut terhapus, `event.created_by`
    cuma `on delete set null`, bukan cascade).
  - `deleteSiswa`/`deleteGuru` — dicatat MANUAL ke `log_aktivitas`
    (bukan trigger, konsisten dengan seluruh aksi lain di entitas
    'siswa'/'guru': import & reset password juga manual, lihat
    komentar di `0009_log_aktivitas.sql` kenapa tabel `siswa`/`guru`
    memang tidak punya trigger generik). Snapshot nama/username/email
    diambil SEBELUM delete (baris sudah hilang setelahnya).
  - **`deleteGuru` menolak guru menghapus akunnya sendiri** yang
    sedang dipakai login saat itu — mencegah situasi mengunci diri
    sendiri dari sistem di tengah aksi. Tidak ada jalur "paksa", guru
    lain yang harus menjalankan.
- **Modal konfirmasi custom untuk KEDUA aksi** (`AkunAksiButtons.tsx`,
  menggantikan `ResetPasswordButton.tsx` Sesi 11 sepenuhnya — file lama
  dihapus):
  - Reset password: modal Ya/Batal custom (bukan `window.confirm()`
    lagi).
  - Hapus akun: modal dengan kotak dampak + **ketik ulang identitas
    unik untuk konfirmasi** (username untuk siswa, email untuk guru —
    fallback ke nama kalau email tidak termuat), pola yang sama dengan
    `DeleteEventButton.tsx`/`DeleteMapelButton.tsx` Sesi 6.
  - **Pemisahan visual**: DUA TOMBOL bersebelahan (bukan dropdown) —
    "Reset password" netral vs "Hapus" merah. Dropdown dipertimbangkan
    tapi dihindari karena container tabel pakai `overflow-hidden`
    (untuk sudut membulat) yang berisiko memotong dropdown
    `position: absolute` untuk baris-baris dekat bagian bawah tabel;
    modal (`position: fixed`) tidak punya masalah ini.
  - Setelah hapus berhasil, `router.refresh()` dipanggil di client
    supaya baris hilang dari tabel seketika (`revalidatePath` di server
    action saja tidak cukup untuk memicu re-render di sisi client).

**CATATAN JUJUR soal verifikasi lingkungan (WAJIB dibaca sebelum lanjut
sesi berikutnya)**:

- **`npx tsc --noEmit` SUNGGUHAN BELUM PERNAH JALAN — 3 SESI
  BERTURUT-TURUT SEKARANG** (Sesi 11, 12, 13). `npm install` dicoba
  ulang secara eksplisit di sesi ini (bukan diasumsikan gagal seperti
  sesi sebelumnya) dan TETAP gagal `403 Forbidden` ke
  `registry.npmjs.org`. Seluruh kode Sesi 13 (`AkunAksiButtons.tsx`,
  penambahan di `admin/siswa/actions.ts` & `admin/guru/actions.ts`)
  sudah ditinjau manual baris-per-baris untuk tipe (union
  discriminated `Props` di `AkunAksiButtons.tsx`, return type Server
  Action, dst) tapi ini BUKAN pengganti compiler sungguhan — sudah 3
  sesi tanpa verifikasi nyata, risiko ada typo tipe yang lolos makin
  perlu dianggap serius, BUKAN sekadar "kemungkinan kecil".
- Item lama yang MASIH NUNGKAK (tidak ada perubahan dari Sesi 12):
  `auth.admin.createUser`/rollback (sejak Sesi 6), `auth.uid()` di
  trigger `log_aktivitas` (sejak Sesi 9), autosave ujian siswa (sejak
  Sesi 8), reset password siswa/guru (sejak Sesi 11), pagination
  keyset composite (sejak Sesi 12).
- **BARU sejak Sesi 13** — belum diuji ke project Supabase sungguhan:
  hapus akun siswa DAN guru (termasuk memastikan cascade
  jawaban_siswa/nilai benar-benar berjalan, bukan cuma diasumsikan dari
  membaca definisi FK), dan penolakan hapus-akun-sendiri untuk guru.

**Belum dikerjakan** (nyusul sesi berikutnya, lihat
`PROMPT-SESI-14.md`):
- Semua item verifikasi manual di atas.
- Kemungkinan penghalusan lanjutan kalau ada waktu: kolom "Aksi" di
  tabel siswa/guru sekarang berisi dua tombol berdampingan — belum
  diuji di layar sangat sempit (mis. tablet kecil), container tabel
  belum punya `overflow-x-auto` untuk kasus itu.

### Sesi 14 selesai ✅ (sebagian — lihat catatan lingkungan)

**Prioritas tertinggi sesi ini** (poin 0 `PROMPT-SESI-14.md`, sudah 3
sesi berturut-turut gagal 403): **`npm install` BERHASIL** di lingkungan
sesi ini — akses `registry.npmjs.org` akhirnya ada lagi (beda dari Sesi
11-13). `npx tsc --noEmit` SUNGGUHAN dijalankan untuk PERTAMA KALI atas
seluruh kode sejak Sesi 10, termasuk kode Sesi 11 (reset password),
Sesi 12 (pagination keyset composite + `postgrest-filter.ts`), dan
Sesi 13 (`AkunAksiButtons.tsx` — discriminated union yang paling
dikhawatirkan di `PROMPT-SESI-14.md`). **Hasilnya: BERSIH, tanpa satu
error pun** — tiga sesi tinjauan manual baris-per-baris ternyata tidak
meninggalkan typo tipe yang lolos. Ini tidak berarti tinjauan manual
terbukti "cukup" secara umum (kebetulan baik di sini, bukan jaminan),
tapi utang verifikasi compiler untuk kode Sesi 11-13 sekarang LUNAS.

`npm run build` dicoba ulang juga (sesuai instruksi, bukan diasumsikan
gagal) — TETAP gagal dengan error yang SAMA seperti Sesi 4-10
(`next/font/google` tidak bisa fetch `IBM Plex Sans` / `Source Serif 4`
dari `fonts.googleapis.com`). Tidak ada akses ke project Supabase
sungguhan di sesi ini (beda dari akses npm registry yang baru pulih) —
semua item verifikasi manual yang butuh itu (lihat daftar di bawah)
masih nunggak murni karena sebab yang sama seperti sesi-sesi sebelumnya.

Yang sudah jadi di sesi ini:

- **Verifikasi `npx tsc --noEmit` sungguhan** (topik utama, prioritas 1
  di `PROMPT-SESI-14.md`) — bersih, dijalankan sebelum DAN sesudah
  perubahan kecil di bawah.
- **Penghalusan kecil kolom "Aksi"** (kandidat #2, dicatat sejak Sesi
  13): `src/app/admin/siswa/page.tsx` & `src/app/admin/guru/page.tsx`
  sekarang membungkus `<table>` dalam `<div className="overflow-x-auto">`
  terpisah dari `<div className="overflow-hidden rounded-lg ...">` di
  luarnya — dipisah jadi dua layer supaya sudut membulat (`rounded-lg` +
  `overflow-hidden` di div luar) tidak hilang saat konten discroll
  horizontal (div dalam yang baru menangani `overflow-x-auto`-nya
  sendiri). Alasan lengkap ada sebagai komentar di kedua file. Perubahan
  murni CSS/struktur div, tidak mengubah `AkunAksiButtons.tsx` atau
  logika Server Action sama sekali.

**Item verifikasi manual yang MASIH NUNGKAK** (butuh akses project
Supabase sungguhan, bukan cuma npm registry — TIDAK ADA PERUBAHAN dari
Sesi 13, akses itu masih belum ada di sesi ini):
- `auth.admin.createUser` + rollback `admin.deleteUser` — nunggak sejak
  Sesi 6, 9 sesi berturut-turut.
- `auth.uid()` di trigger `security definer` untuk `log_aktivitas` —
  nunggak sejak Sesi 9.
- Autosave ujian siswa pasca navigasi Sesi 8 — nunggak sejak Sesi 8, 7
  sesi belum sempat dicoba. Tetap regresi paling fatal kalau gagal.
- Reset password siswa & guru (Sesi 11) — belum pernah dicoba ke project
  sungguhan.
- Pagination keyset composite `/admin/siswa`/`/admin/guru` (Sesi 12) —
  nested or/and & escaping nama spesial belum diuji ke PostgREST asli.
- Hapus akun siswa/guru + cascade jawaban_siswa/nilai, dan penolakan
  hapus-akun-sendiri untuk guru (Sesi 13) — belum diuji.
- Race condition dua guru import bersamaan (dianalisis kode Sesi 10) —
  belum ada uji sungguhan dua request bersamaan.

**Belum dikerjakan** (nyusul sesi berikutnya, lihat
`PROMPT-SESI-15.md`):
- Semua item verifikasi manual Supabase di atas — daftar sama sekali
  tidak berkurang sesi ini (murni soal akses environment, bukan
  diabaikan).
- Tidak ada kandidat fitur baru lain yang disentuh — sesi ini sengaja
  fokus ke verifikasi compiler + satu penghalusan kecil, sesuai arahan
  eksplisit "jangan ditambah fitur baru dulu sebelum sebagian nunggak
  di atas tercoret" di `PROMPT-SESI-14.md`.

### Sesi 15 selesai ✅ (sebagian — lihat catatan lingkungan)

Tidak ada kandidat fitur eksplisit dari `PROMPT-SESI-15.md` (isinya
murni daftar verifikasi manual) — akses project Supabase sungguhan
TETAP TIDAK ADA di sesi ini juga (sama seperti Sesi 6-14), jadi seluruh
poin 0 & 1 `PROMPT-SESI-15.md` (autosave ujian, createUser/rollback,
auth.uid() trigger, reset password, pagination keyset, hapus akun, race
condition import) TIDAK BISA diverifikasi lagi sesi ini — bukan
diabaikan, murni tidak ada jalan. Sesuai izin eksplisit di
`PROMPT-SESI-15.md` ("boleh usulkan kandidat fitur baru sendiri kalau
ada ide yang belum tercakup di README manapun"), satu fitur kecil baru
diusulkan & dikerjakan sendiri: **export CSV untuk daftar akun**.

**Status akses lingkungan sesi ini** (dicoba ulang eksplisit, bukan
diasumsikan dari Sesi 14): `npm install` BERHASIL lagi (akses
`registry.npmjs.org` masih ada, konsisten dengan Sesi 14) — `npx tsc
--noEmit` sungguhan dijalankan sebelum DAN sesudah perubahan sesi ini,
bersih keduanya. `npm run build` dicoba ulang, TETAP gagal karena
`fonts.googleapis.com` tidak terjangkau (sama seperti Sesi 4-14). Tidak
ada akses project Supabase sungguhan sama sekali.

Yang sudah jadi di sesi ini:

- **Export CSV daftar akun** — tombol baru di header "Daftar akun
  terdaftar" pada `/admin/siswa` dan `/admin/guru`, di sebelah judul.
  Komponen client baru `src/components/admin/ExportAkunCsvButton.tsx`
  (generik: terima `headers`/`rows`/`filename`, generate Blob CSV +
  trigger download, pola escape & BOM SAMA seperti `unduhCsv` di
  `NilaiTable.tsx` Sesi 5).
  - **Sengaja TIDAK menarik ulang (refactor) `unduhCsv` dari
    `NilaiTable.tsx`** jadi satu helper bersama — walau tergoda karena
    logikanya identik, `NilaiTable.tsx` sudah berjalan dan sesi ini
    tidak punya cara menjalankan aplikasi untuk uji regresi sungguhan
    (lihat catatan akses Supabase di atas). Duplikasi kecil diterima
    sebagai trade-off, didokumentasikan sebagai komentar di file baru,
    bukan dianggap utang mendesak.
  - **Cakupan export dibatasi ke baris yang SEDANG TAMPIL di halaman**
    (setelah filter cari/kelas & batas 200 baris keyset pagination),
    BUKAN seluruh tabel `siswa`/`guru` — konsisten dengan cara halaman
    itu sendiri menampilkan data. Tombol otomatis hilang kalau daftar
    kosong (`rows.length === 0`).
- `npx tsc --noEmit` bersih (dijalankan sungguhan, sebelum & sesudah
  perubahan). `npm run build` gagal karena Google Fonts, dikonfirmasi
  ulang bukan regresi baru.

**Belum dikerjakan / masih nunggak** (lihat `PROMPT-SESI-16.md`,
daftar SAMA seperti Sesi 14 — tidak berkurang karena akses Supabase
sungguhan tetap tidak ada):
- `auth.admin.createUser` + rollback `admin.deleteUser` — nunggak sejak
  Sesi 6, 10 sesi berturut-turut.
- `auth.uid()` di trigger `security definer` untuk `log_aktivitas` —
  nunggak sejak Sesi 9.
- Autosave ujian siswa pasca navigasi Sesi 8 — nunggak sejak Sesi 8, 8
  sesi belum sempat dicoba. Tetap regresi paling fatal kalau gagal —
  disarankan jadi prioritas #1 begitu ada akses Supabase sungguhan.
- Reset password siswa/guru (Sesi 11), pagination keyset composite
  (Sesi 12), hapus akun + cascade (Sesi 13) — belum diuji sungguhan.
- Race condition import bersamaan (dianalisis kode Sesi 10) — belum
  diuji sungguhan.
- Export CSV daftar akun (fitur baru sesi ini) — belum dicoba di
  browser sungguhan sama sekali (mis. apakah nama dengan koma/kutip
  ganda benar-benar terbuka rapi di Excel), sama seperti pola "belum
  diuji ke lingkungan sungguhan" di fitur-fitur sesi lain.

### Sesi 16 selesai ✅ — perubahan arsitektur terbesar sejak Sesi 1

**Beda dari sesi-sesi sebelumnya**: ini bukan dari daftar kandidat
`PROMPT-SESI-16.md` (yang lama), tapi permintaan langsung dari hasil
diskusi soal kekhawatiran skalabilitas 600 siswa ujian bersamaan di
Supabase free tier. Ringkasan keputusannya (detail lengkap ada di
riwayat obrolan): daripada 1 project Supabase menanggung 600 siswa
sekaligus, **dipecah jadi 3 project Supabase terpisah, satu per jenjang**
(±200 siswa per project), DITAMBAH autosave ujian diubah total supaya
tidak lagi membombardir server tiap ada perubahan jawaban.

**Dua perubahan besar, saling melengkapi:**

**1. Arsitektur 3 project Supabase per jenjang**
- `src/lib/jenjang.ts` (baru) — tipe `Jenjang` (7/8/9), cookie
  `lms_jenjang` sebagai penanda project mana yang aktif, dibaca dari
  Client Component lewat `document.cookie`. SENGAJA bukan `httpOnly`
  (nilainya cuma angka, bukan rahasia) dan SENGAJA jadi session cookie
  tanpa `max-age` (hilang saat browser ditutup — supaya komputer lab
  sekolah tidak "mewarisi" pilihan jenjang siswa sebelumnya).
- `src/lib/jenjang-server.ts` (baru) — versi server (`next/headers`),
  dipisah file dari `jenjang.ts` supaya `next/headers` tidak ikut
  ter-bundle ke kode browser (akan bikin build gagal kalau digabung).
- `src/lib/supabase/config.ts` (baru) — satu-satunya tempat yang tahu
  pola penamaan env var per jenjang (`_7`/`_8`/`_9`). Ditulis pakai
  `switch` dengan akses `process.env.NEXT_PUBLIC_...` LITERAL per
  cabang, BUKAN akses dinamis `process.env[nama]` — ini bug yang
  ketahuan & diperbaiki sebelum sempat jadi masalah produksi: Next.js
  cuma meng-inline `NEXT_PUBLIC_*` ke bundle browser kalau aksesnya
  literal, akses dinamis diam-diam jadi `undefined` di browser tanpa
  error apa pun saat build/`tsc`.
- `client.ts`/`server.ts`/`admin.ts`/`middleware.ts` (lib) — SEMUA
  ditulis ulang untuk resolve project dari jenjang di cookie SECARA
  OTOMATIS di dalam fungsi `createClient()`/`createAdminClient()`
  sendiri. Keputusan desain paling penting sesi ini: dengan pendekatan
  ini, **~30 file lain** (semua `actions.ts` dan `page.tsx` di
  `admin/`, `siswa/`) **tidak perlu diubah SAMA SEKALI** — mereka semua
  sudah manggil `createClient()`/`createAdminClient()` tanpa argumen
  sejak sesi-sesi sebelumnya, dan itu otomatis tetap benar. Alternatif
  yang tidak dipilih: thread parameter `jenjang` eksplisit lewat setiap
  pemanggilan fungsi di seluruh codebase — jauh lebih invasif untuk
  manfaat yang sama.
- `LoginForm.tsx` — tambah dropdown "Pilih jenjang…" (wajib, tanpa
  default) sebelum field email/username+password. Set cookie SEBELUM
  `signInWithPassword` (sinkron, tidak ada delay).
- `LogoutButton.tsx` (baru) — **belum pernah ada tombol logout sama
  sekali sejak Sesi 1**, ketahuan pas nulis fitur pindah-jenjang (ganti
  jenjang tanpa logout dulu berisiko rancu sesi). Dipasang di
  `AdminShell.tsx` dan layout dashboard siswa — SENGAJA TIDAK dipasang
  di halaman ujian (`siswa/ujian/`, di luar route group `(dashboard)`)
  supaya siswa tidak gampang "kabur" di tengah ujian.
- `ImageUpload.tsx` — upload Cloudinary sekarang baca cloud
  name/upload preset per jenjang dari cookie yang sama, karena diminta
  eksplisit: tiap jenjang pakai akun Cloudinary sendiri juga (bukan
  cuma Supabase).
- `.env.local.example` — 3 set kredensial Supabase + 3 set Cloudinary,
  akhiran `_7`/`_8`/`_9`.
- `supabase/migrations-kelas{7,8,9}/` — folder migrasi terpisah per
  jenjang, ISINYA IDENTIK (9 file yang sama persis) karena skema/RLS
  memang harus sama di ketiga project — dipisah foldernya murni supaya
  jelas mana yang harus disalin ke project Supabase mana. Yang BEDA:
  `seed-kelas{7,8,9}.sql`, masing-masing cuma insert baris `kelas`
  jenjangnya sendiri (kelas 7 cuma dapat 7.1-7.6, dst) — project kelas 7
  memang tidak akan pernah punya siswa kelas 8/9.
- `supabase/README.md` (baru) — penjelasan lengkap struktur ini.

**2. Autosave ujian: dari debounce 1.5 detik jadi local-first + jeda acak**
- `src/lib/autosave-lokal.ts` (baru) — baca/tulis jawaban ke
  `localStorage` (bukan IndexedDB — datanya kecil, localStorage cukup
  dan jauh lebih sedikit kode untuk kasus ini), plus dua fungsi jeda
  acak: `jedaSinkronAcakMs()` (70-180 detik, untuk autosave berkala) dan
  `jitterSubmitMs()` (0-15 detik, khusus auto-submit saat waktu habis).
- `ExamClient.tsx` — perubahan paling substansial di sesi ini:
  - Tiap perubahan jawaban: tulis ke `localStorage` INSTAN (tidak
    nunggu network), tandai `dirtyRef.current = true`. TIDAK LAGI
    langsung menjadwalkan upsert ke Supabase seperti debounce 1.5 detik
    sebelumnya.
  - Sinkron ke server lewat `setInterval` dengan jeda ACAK per siswa
    (di-random SEKALI per mount lewat `useRef`, bukan di-random ulang
    tiap tick) — cuma benar-benar kirim kalau `dirtyRef.current` true.
  - Flush tambahan saat `visibilitychange` ke `"hidden"` (siswa pindah
    tab/kunci HP) — SENGAJA bukan `beforeunload`/`unload`, karena
    browser modern sering memotong request async yang belum selesai
    saat event unload; `visibilitychange` terjadi selagi halaman masih
    hidup, jadi fetch punya waktu wajar untuk selesai. Tetap bukan
    jaminan 100% (HP mati paksa/baterai habis tidak sempat ke-flush) —
    `localStorage` tetap jaring pengaman utama, bukan flush ini.
  - Retry pendek (2x, jeda 3 & 9 detik) untuk error yang kemungkinan
    transient (bukan error RLS/keamanan) — di luar itu, `dirtyRef`
    sengaja TIDAK direset supaya tick interval berikutnya otomatis
    coba lagi (jaring pengaman utama, retry cepat di atas cuma
    percepatan untuk kasus umum: blip jaringan singkat).
  - **Auto-submit saat waktu habis**: input dikunci INSTAN
    (`setWaktuHabis(true)`) tepat saat timer mencapai nol, SEBELUM
    network call apa pun — soal keadilan, semua siswa terkunci di detik
    yang sama persis. Baru SETELAH terkunci, pengiriman ke server
    ditunda jitter 0-15 detik (`jitterSubmitMs()`) — ini yang menyebar
    beban submit massal, tapi TIDAK memberi siswa mana pun waktu ekstra
    untuk menjawab (dikunci dulu, baru ditunda kirimnya). Submit manual
    (klik "Ya, kumpulkan") TIDAK diberi jitter — itu satu aksi sukarela
    yang sudah natural tersebar sendiri, beda dari 600 auto-submit yang
    numpuk di detik yang sama.
  - Banner "sudah dikumpulkan" (`StatusSubmittedBanner`) dipisah dari
    kondisi terkunci — ada banner transisi baru "sedang dikumpulkan
    otomatis, mohon tunggu" untuk rentang waktu terkunci-tapi-belum-
    selesai-submit (dulu ini digabung jadi satu kondisi `readOnly`,
    yang salah menampilkan "sudah dikumpulkan" padahal masih di tengah
    jitter+network).
  - Kalau ada snapshot di `localStorage` (dari sesi sebelumnya yang
    sempat menulis lokal tapi belum sempat sinkron), itu dipakai
    sebagai state jawaban AWAL saat halaman ujian dibuka — bukan
    `jawabanAwal` dari server — karena localStorage cuma pernah terisi
    dari perubahan siswa sendiri di perangkat itu, jadi tidak pernah
    lebih usang dari yang di server.

**Dampak ke beban server** (dari sesi diskusi sebelumnya): dari
"debounce 1.5 detik × 600 siswa yang lagi ngetik" jadi "1 request per
70-180 detik per siswa" — turun kira-kira 40-100x. Ditambah 3-way split
per jenjang, tiap project cuma nanggung request dari ±200 siswa, bukan
600.

**Belum dikerjakan / masih nunggak** (lihat `PROMPT-SESI-17.md`):
- **SEMUA hal ini masih di atas kertas, sama sekali belum diuji beban
  sungguhan** — baik arsitektur 3-project-nya, maupun autosave
  local-first + jitter-nya. `tsc --noEmit` bersih (0 error) dan alur
  logikanya benar di atas kertas, tapi belum ada satu pun request
  sungguhan yang pernah dikirim ke project Supabase manapun sejak
  Sesi 11 (lingkungan berturut-turut tidak punya akses `registry.npmjs.
  org`/Supabase, kecuali Sesi 13). Load test (k6/Artillery, simulasi
  ratusan login+autosave bersamaan) TETAP wajib sebelum dipakai ujian
  sungguhan — assessment "kemungkinan besar aman" di obrolan
  sebelumnya masih dugaan berdasar prinsip umum.
- Guru yang perlu akses lintas jenjang (mis. kepala sekolah) harus
  login ulang 3x (satu per jenjang) dan lihat 3 dashboard terpisah —
  belum ada halaman gabungan yang query 3 project sekaligus. Kandidat
  kerjaan mendatang kalau dirasa perlu.
- Skenario pindah jenjang TANPA logout eksplisit (mis. buka tab baru,
  ganti pilihan di dropdown login sambil sesi lama masih aktif di tab
  lain) — belum diuji, secara teori aman karena `@supabase/ssr`
  menamai cookie sesi berdasar project-ref (otomatis beda nama per
  project), tapi "secara teori" ini juga belum pernah dicoba sungguhan.
- Optimasi gambar Cloudinary (resize otomatis lewat parameter URL,
  lazy-load per soal aktif) — dibahas di obrolan soal hemat kuota HP
  siswa, belum diimplementasikan sama sekali di sesi ini, fokus sesi
  ini habis untuk 2 perubahan besar di atas.
- Semua item nunggak dari Sesi 6-15 (createUser/rollback, autosave —
  sudah ditulis ulang sesi ini tapi belum sekalipun diuji nyata,
  reset password, pagination keyset, hapus akun+cascade, race condition
  import, export CSV) — TETAP nunggak, ditambah kompleksitas baru
  (semua itu sekarang perlu diuji di 3 project terpisah, bukan 1).

### Login siswa sementara (uji coba Sabtu) — permintaan ad-hoc di luar Sesi 17

Login siswa DIUBAH SEMENTARA (tab "Admin/Guru" **tidak berubah** — tetap
jenjang + email + password manual) supaya tidak perlu cetak
username+password per siswa untuk uji coba CBT hari Sabtu:

1. Siswa pilih **kelas** dari dropdown (7.1-7.6, 8, 9 — kelas 8/9
   SENGAJA tidak dipecah sub-kelas di dropdown ini, murni penyederhanaan
   tampilan, skema `kelas` di database tidak diubah).
2. Klik **"Pilih Nama"** — muncul modal (window) berisi daftar nama
   siswa di kelas itu, bisa di-scroll/cari, klik satu untuk pilih.
3. Masukkan **tanggal lahir** sebagai pengganti password, lalu "Masuk".

**Cara kerja teknis** (`src/app/login/LoginForm.tsx`):
- Modal "Pilih Nama" diisi lewat RPC baru `get_siswa_untuk_pilih_nama`
  (`supabase/migrations-kelas{7,8,9}/0010_login_siswa_pilih_nama.sql`,
  `security definer`, sengaja bisa diakses ANON — cuma expose
  nama+username, TIDAK ADA data sensitif).
- Tanggal lahir **TIDAK disimpan** di kolom database mana pun — dipakai
  LANGSUNG sebagai password akun Supabase Auth siswa, format digit
  `DDMMYYYY` (mis. lahir 14 Mei 2012 → password `14052012`).
  **INI YANG PERLU DISET MANUAL OLEH ADMIN** saat bikin akun siswa lewat
  Dashboard Supabase Auth (Authentication → Users → Add user) — kalau
  password akun tidak diset sesuai format ini, siswa itu tidak akan
  bisa masuk lewat alur baru ini walau nama & kelasnya benar.
- Email login tetap email sintetis yang sama seperti sebelumnya
  (`{username}{NEXT_PUBLIC_SISWA_EMAIL_SUFFIX}`) — cuma sumber
  password-nya yang beda (tanggal lahir, bukan password bebas).

**BELUM diuji sungguhan** (sama seperti semua item Sesi 16 lainnya —
belum ada akses Supabase sungguhan sepanjang sesi ini juga): jalankan
`0010_login_siswa_pilih_nama.sql` di ketiga project (SQL Editor,
byte-for-byte sama seperti 9 file migrasi sebelumnya — lihat
`supabase/README.md`), lalu coba alur login siswa end-to-end sebelum
hari-H, termasuk kasus tanggal lahir salah (harus dapat pesan error
yang jelas, bukan crash).

**Rencana ke depan**: ini SEMENTARA, dimaksudkan dikembalikan lagi ke
alur username+password manual untuk siswa sesudah uji coba Sabtu
selesai — lihat komentar di awal `LoginForm.tsx` untuk cara baliknya
(RPC baru boleh dibiarkan menganggur di database, tidak perlu dihapus).

---

## 1. Yang perlu diinstal (sekali saja)

| Tool | Versi | Cek dengan |
|---|---|---|
| [Node.js](https://nodejs.org) | 18.18 atau lebih baru (20 LTS disarankan) | `node -v` |
| npm | ikut Node.js | `npm -v` |
| [Supabase CLI](https://supabase.com/docs/guides/cli) | terbaru | `supabase --version` |
| Akun [Supabase](https://supabase.com) | gratis | — |
| Akun [Cloudinary](https://cloudinary.com) | gratis, **baru dipakai mulai Sesi 3** | — |

Kalau belum ada Supabase CLI, install salah satu:

```bash
# via npm (paling gampang, tidak perlu global install)
npx supabase --version

# atau via Homebrew (Mac)
brew install supabase/tap/supabase

# atau via scoop (Windows)
scoop install supabase
```

### Ekstensi VSCode yang disarankan (opsional tapi membantu)

- **Tailwind CSS IntelliSense** (`bradlc.vscode-tailwindcss`)
- **ESLint** (`dbaeumer.vscode-eslint`)
- **Prettier** (`esbenp.prettier-vscode`)

---

## 2. Setup pertama kali setelah extract zip

```bash
cd lms-cbt
npm install
cp .env.local.example .env.local
```

### 2a. Buat 3 project Supabase (Sesi 16 — bukan 1 lagi)

Ulangi langkah ini **3 kali**, satu project per jenjang. Kasih nama yang
jelas biar tidak ketuker (mis. `lms-cbt-kelas7`, `lms-cbt-kelas8`,
`lms-cbt-kelas9`).

1. Buka [supabase.com/dashboard](https://supabase.com/dashboard) → **New
   project**.
2. Setelah project jadi, buka **Project Settings → API**. Salin ke
   `.env.local` dengan akhiran sesuai jenjang project itu (`_7`/`_8`/`_9`):
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL_{N}`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY_{N}`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY_{N}` (rahasia,
     jangan disebar / jangan di-commit)

### 2b. Jalankan migrasi — di ketiga project

Struktur foldernya sudah dipisah jelas per jenjang, lihat
`supabase/README.md` untuk penjelasan lengkap. Ringkas:

**Cara termudah (tanpa install CLI, cukup dashboard):**

Untuk MASING-MASING dari 3 project: buka **SQL Editor**, jalankan isi
tiap file di `supabase/migrations-kelas{N}/` **sesuai urutan angkanya**
(`0001_...` sampai `0009_...`), lalu `supabase/seed-kelas{N}.sql` di
akhir — `N` sesuai jenjang project yang lagi dibuka (jangan sampai
migrasi kelas 7 dijalankan ke project kelas 8, isinya sih identik tapi
seed-nya beda, lihat `supabase/README.md`).

**Cara dengan Supabase CLI (kalau mau migrasi otomatis & repeatable):**

```bash
# Ulangi 3x, ganti --project-ref dan path migrations-kelas{N} sesuai jenjang
supabase login
supabase link --project-ref <project-ref-kelas-7>
supabase db push --db-url "<connection-string-project-kelas-7>" \
  --include-all supabase/migrations-kelas7
```
(Supabase CLI didesain untuk satu folder `supabase/migrations/` per
project yang di-link — untuk setup 3 project sekaligus, cara paling
gampang sebenarnya tetap manual lewat SQL Editor seperti di atas,
kecuali kamu mau bikin 3 folder project Supabase CLI terpisah di
komputer lokal, satu per jenjang.)

### 2c. Buat akun login untuk testing

Supabase Auth (tabel `auth.users`) tidak bisa diisi lewat migrasi biasa.
**Lakukan ini di project Supabase yang BENAR** — akun guru/siswa yang
dibuat di project kelas 7 TIDAK otomatis ada di project kelas 8/9 (lihat
catatan "data admin dan guru sama persis di tiap jenjang" — itu artinya
kamu input manual/CSV yang sama 3 kali, bukan otomatis nyebar sendiri).

**Akun siswa** — cara yang disarankan adalah lewat `/admin/siswa` di
aplikasi (login sebagai guru dulu dengan jenjang yang benar dipilih di
halaman login, lalu upload/paste CSV kolom `nama,username,kelas`). Ini
otomatis membuat akun `auth.users` + baris `siswa` yang menaut di
project jenjang yang sedang aktif.

**Akun guru** — sama, lewat `/admin/guru`, atau manual:

1. Dashboard Supabase (project jenjang yang dituju) → **Authentication →
   Users → Add user**.
   - **Guru**: email bebas (mis. `guru1@sekolah.sch.id`), set password.
   - **Siswa** (kalau manual, bukan lewat `/admin/siswa`): email HARUS
     pakai suffix di `NEXT_PUBLIC_SISWA_EMAIL_SUFFIX` (default
     `@siswa.lms-cbt.local`).
2. Salin `UID` user yang baru dibuat, lalu di **SQL Editor** project itu:

   ```sql
   insert into guru (auth_id, nama)
     values ('<UID-tadi>', 'Bu Sari');
   ```

### 2d. Setup Cloudinary — 3 akun terpisah

Form tambah soal upload gambar langsung dari browser ke Cloudinary
pakai **unsigned upload preset**. Sesi 16: masing-masing jenjang pakai
akun Cloudinary sendiri (bukan 1 akun dipakai 3x) — supaya jatah
gratisannya juga ikut kepecah, bukan cuma Supabase-nya.

Ulangi 3 kali (satu akun Cloudinary per jenjang):

1. Buka [cloudinary.com](https://cloudinary.com) → buat akun gratis.
2. Salin **Cloud name** → tempel ke
   `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME_{N}` di `.env.local`.
3. **Settings (ikon gerigi) → Upload → Upload presets → Add upload
   preset** → **Signing Mode: Unsigned** → simpan → salin nama preset
   ke `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET_{N}`.
4. Tidak perlu API Key/Secret Cloudinary — upload preset unsigned sudah
   cukup, secret tidak pernah terkirim ke browser.

### 2e. Jalankan

```bash
npm run dev
```

Buka `http://localhost:3000` → otomatis ke `/login`. **Pilih jenjang
dulu** di dropdown atas form login, baru isi email/username + password
akun yang dibuat di langkah 2c untuk jenjang itu — admin akan diarahkan
ke `/admin`, siswa ke `/siswa`, keduanya scoped ke project jenjang yang
dipilih saja.

---

## 3. Struktur project (ringkas)

```
src/app/                halaman (App Router) — login, admin/*, siswa/*
src/lib/supabase/        client browser, client server, admin, helper middleware
src/lib/jenjang.ts        cookie jenjang (7/8/9) — shared, aman di client & server
src/lib/jenjang-server.ts baca cookie jenjang lewat next/headers — SERVER ONLY
src/lib/supabase/config.ts resolusi jenjang -> kredensial Supabase/Cloudinary
src/lib/autosave-lokal.ts  local-first autosave (localStorage) + jitter
src/types/               TypeScript types
middleware.ts            proteksi route + redirect berdasarkan role
supabase/migrations-kelas7/  migrasi SQL untuk project Supabase kelas 7
supabase/migrations-kelas8/  migrasi SQL untuk project Supabase kelas 8
supabase/migrations-kelas9/  migrasi SQL untuk project Supabase kelas 9
supabase/seed-kelas{7,8,9}.sql  data kelas awal, masing-masing cuma jenjangnya sendiri
supabase/README.md       penjelasan struktur 3-project ini
docs/skema-database.md   penjelasan lengkap skema + alasan desain
```

---

## 4. Alur kerja sesi-demi-sesi

Project ini dikerjakan bertahap. Tiap sesi baru:

1. Upload ulang zip hasil sesi sebelumnya (yang ini) sebagai lampiran.
2. Tempel isi `PROMPT-SESI-N.md` yang relevan sebagai pesan pertama.
3. Setelah selesai, kamu akan dapat zip baru + `PROMPT-SESI-(N+1).md`
   baru untuk lanjut ke sesi berikutnya.

Progres kumulatif dicatat di bagian **Status** paling atas file ini —
tiap sesi akan menambah baris baru di situ, bukan menimpa yang lama.
