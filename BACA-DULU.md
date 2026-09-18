# Revisi Besar — Cara Memasang

Ekstrak zip ini, lalu salin folder `src/` dan `supabase/` ke root proyek,
timpa file yang namanya sama. Semua path sudah mengikuti struktur asli
proyek, jadi tinggal drag-and-drop.

## ⚠️ LANGKAH WAJIB: jalankan SQL dulu

Menu Bank Soal **tidak akan berfungsi** sebelum ini dijalankan:

```
supabase/migrations-kelas7/0014_bank_soal.sql   → project Supabase kelas 7
supabase/migrations-kelas8/0014_bank_soal.sql   → project Supabase kelas 8
supabase/migrations-kelas9/0014_bank_soal.sql   → project Supabase kelas 9
```

Isi ketiganya identik (mengikuti pola sejak Sesi 16). Jalankan lewat SQL
Editor di dashboard masing-masing project, atau `supabase db push`.

Kalau migrasi ini belum dijalankan, sisa aplikasi TETAP JALAN NORMAL —
soal tetap tersimpan seperti biasa, hanya salinan ke banknya yang gagal
diam-diam (disengaja; lihat catatan di `src/lib/bank-soal.ts`). Halaman
Bank Soal akan tampil kosong dengan keterangan penyebabnya.

Setelah itu: `npm run build` (atau restart `npm run dev`).

---

## Yang berubah, per poin revisi

### 1. Loading + sapaan saat login
- BARU `src/components/ui/SwalPanel.tsx`
- UBAH `src/app/login/LoginForm.tsx`

Layar antrian bertahap selama proses masuk, lalu kartu sapaan berisi
nama + peran + kelas. Admin hanya menampilkan peran (akun admin tidak
terikat satu kelas).

**Tidak memakai SweetAlert2** — tampilannya meniru, tapi ditulis sendiri.
Alasan: `Swal.fire()` sering tidak sinkron dengan transisi rute App
Router, paketnya ±45 KB di halaman yang dibuka 600 siswa serentak, dan
cara ini tidak butuh `npm install`.

### 2. Perbaikan UI
- BARU `src/components/ui/Panel.tsx` — satu sumber bentuk untuk judul,
  tombol, kartu, statistik, dan keadaan kosong.
- UBAH `src/app/admin/event/page.tsx`
- UBAH `src/app/admin/event/[eventId]/page.tsx`
- UBAH `src/app/admin/event/[eventId]/mapel/[mapelId]/page.tsx`
- UBAH `src/app/admin/event/[eventId]/mapel/[mapelId]/soal/baru/page.tsx`
- UBAH `src/components/admin/SoalForm/SoalForm.tsx` (dibagi 3 langkah
  bernomor: bentuk soal → isi → bobot)

Angka penting dinaikkan jadi kartu. Total skor kini menandai sendiri
"sudah pas 100" atau "kurang 13 dari 100".

### 3. Unggah gambar terpisah dihapus
- UBAH kelima sub-form + `SoalForm.tsx`

Sekarang satu jalur saja: tempel/sisipkan gambar di dalam kolomnya.

**Data lama aman.** Field `gambar_pertanyaan_url` dan `gambar_url` tetap
dibaca dan dikirim ulang lewat hidden input. Kalau nilainya dibuang,
gambar di ratusan soal lama akan lenyap diam-diam begitu gurunya membuka
lalu menyimpan ulang soal itu.

`ImageUpload.tsx` sekarang tidak dipakai siapa pun. Dibiarkan ada (tidak
mengganggu build); boleh dihapus kalau mau bersih-bersih.

### 4. Input berantai — tidak keluar setelah simpan
- UBAH `.../soal/actions.ts` (`createSoal` & `createSoalAdmin` tidak lagi
  `redirect`, sekarang mengembalikan `sukses` + `nonce`)
- UBAH `SoalForm.tsx`

Form mengosongkan diri, naik ke pemilih bentuk soal, menampilkan "Soal
ke-13" dan "N soal tersimpan sesi ini". Bobot skor sengaja TIDAK
dikosongkan (bobot antar butir hampir selalu sama).

`updateSoal` (mode edit) tetap `redirect` ke daftar — mengedit satu soal
memang selesai setelah disimpan.

### 5. Edit skor langsung dari daftar
- BARU `.../mapel/[mapelId]/SkorInline.tsx`
- UBAH `.../soal/actions.ts` (`updateSkorSoal`, `updateSkorSoalAdmin`)

Simpan saat kolom kehilangan fokus atau Enter — bukan per ketikan.
Escape membatalkan. Total skor mapel tampil di kartu statistik.

### 6. Tombol Pratinjau Ujian
- BARU `.../mapel/[mapelId]/preview/page.tsx` + `PreviewClient.tsx`

Abu-abu dan tidak bisa diklik selama belum ada soal (bukan
disembunyikan). Memakai `SoalViewer` yang sama persis dengan halaman
ujian, dan membuang kunci jawaban di server meniru RPC
`get_soal_untuk_siswa` — supaya soal yang diam-diam bergantung pada field
kunci untuk bisa dirender gagal DI SINI, bukan saat ujian berlangsung.

### 7. Bank Soal
- BARU `supabase/migrations-kelas{7,8,9}/0014_bank_soal.sql`
- BARU `src/lib/bank-soal.ts`
- BARU `src/app/admin/bank-soal/{page.tsx, BankSoalClient.tsx, actions.ts}`
- UBAH `src/app/admin/AdminShell.tsx` (menu, di bawah Kelola Kegiatan)

Setiap soal yang disimpan otomatis diarsipkan — tidak ada tombol yang
perlu ditekan. Ada pencarian isi soal, penyaring mapel & bentuk soal,
tombol Lihat (pratinjau) dan Gunakan (pilih mapel tujuan, bisa banyak
soal sekaligus).

Penyamaan "MATEMATIKA" / "Matematika" / "matematika " dikerjakan di
DATABASE lewat generated column `mapel_nama_norm`, bukan `toLowerCase()`
JavaScript — supaya aturannya juga berlaku untuk impor manual lewat
dashboard Supabase, dan tidak bisa menyimpang antara dua tempat.

---

## Tiga keputusan desain yang perlu diketahui

**Bank menyimpan SALINAN, bukan referensi.** Kalau `soal` cuma menunjuk
ke bank, guru yang memperbaiki typo di bank akan ikut mengubah soal pada
ujian yang SUDAH DINILAI — nilai siswa jadi merujuk pertanyaan yang tidak
ada lagi. Duplikasi data adalah harga murah untuk itu.

**Gagal menyalin ke bank TIDAK menggagalkan simpan soal.** Kalau migrasi
0014 belum jalan, guru tidak boleh melihat "gagal menyimpan soal" padahal
soalnya sudah masuk — dia akan mengetik ulang dan menghasilkan duplikat.

**RLS `bank_soal` tidak punya policy siswa sama sekali.** `konten_jsonb`
di bank menyimpan soal LENGKAP DENGAN KUNCI JAWABAN, berbeda dari yang
dikirim RPC ke siswa. Satu policy longgar di sini sama dengan membocorkan
seluruh kunci jawaban sekolah.

---

### 8. Rekap Nilai — unduh Excel rapi + filter kelas
- BARU `src/lib/tahun-ajaran.ts`
- UBAH `src/lib/excel.ts` (tambah `unduhExcelRekapNilai()` — fungsi lama
  `unduhExcel()` tidak disentuh, masih dipakai export akun siswa/guru)
- UBAH `src/components/admin/Nilai/NilaiTable.tsx`
- UBAH `src/app/admin/nilai/page.tsx`
- UBAH `src/lib/supabase/admin-multi.ts` (`detailNilaiMapelAdmin()`
  sekarang ikut mengembalikan `eventTglMulai`)

Tombol **"Unduh Rekap Nilai (Excel)"** menghasilkan file dengan kop:
```
Nilai (Mata Pelajaran)
Kegiatan (Nama Event) (Kelas)
SMP Negeri 8 Probolinggo
Tahun Ajaran 2026/2027
```
lalu tabel No / Nama Siswa / Nilai / Jumlah Benar / Jumlah Salah.

**Selalu satu sheet per kelas** — baik saat filter "Semua Kelas" (satu
sheet untuk tiap kelas yang ditarget mapel itu) maupun saat satu kelas
dipilih (hanya sheet itu yang dibuat). Ini meniru pola yang sudah ada di
export akun siswa (`ExportExcel.tsx`), dan cocok dengan cara rekap
biasanya dicetak: satu lembar per kelas untuk wali kelasnya.

Dropdown filter kelas hanya muncul kalau mapelnya memang ditarget ke
lebih dari satu kelas — untuk mapel satu-kelas dropdownnya disembunyikan
karena tidak ada gunanya.

"Jumlah Benar" dihitung dari skor PENUH per soal (bukan skor sebagian);
siswa yang benar separuh opsi pada soal pilihan ganda kompleks dihitung
"salah" untuk soal itu. Siswa yang belum submit tetap tercantum dengan
kolom Nilai/Benar/Salah dikosongkan (bukan diisi 0) — supaya rekap juga
berfungsi sebagai daftar siapa yang belum mengerjakan.

Export CSV detail per-soal yang lama TIDAK dihapus, cuma diberi label
"Export CSV Detail" di sebelah tombol baru — masih berguna untuk audit
skor tiap butir soal, yang tidak muat di rekap ringkas ini.

Tahun ajaran dihitung otomatis dari tanggal mulai kegiatan (sekolah
Indonesia mulai tahun ajaran bulan Juli), bukan field baru yang harus
diisi manual — lihat `src/lib/tahun-ajaran.ts`.

---

## Belum diverifikasi

Arsip yang dikirim hanya berisi `src/`, tanpa `package.json` /
`node_modules`, jadi `next build` dan `tsc` belum bisa dijalankan.

Sudah disapu manual: import tak terpakai, hook tanpa import, penyempitan
tipe `Jenjang | null` pada `createAdminClient()`, kelas Tailwind tidak
valid, dan `startTransition(async …)` yang tidak dijamin di React 18
(diganti state biasa).

Kalau muncul error kompilasi, kirim pesannya.
