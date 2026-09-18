# Petunjuk Penerapan Revisi — LMS CBT

Semua file di folder `src/` dan `supabase/` menimpa file dengan nama & lokasi
yang sama di project-mu. File `data-master/` bukan bagian aplikasi — itu
contoh data yang dipakai lewat browser.

---

## ⚠️ LANGKAH WAJIB SEBELUM APA PUN: jalankan migrasi database

Tanpa ini, halaman guru akan error karena kolomnya belum ada.

Buka **SQL Editor** di dashboard Supabase, lalu jalankan isi file
`supabase/migrations-baru/0015_guru_nip_username.sql` **di ketiga project**
(kelas 7, kelas 8, kelas 9). Isinya identik untuk ketiganya.

Migrasi ini menambahkan:

| Tabel | Kolom baru | Kegunaan |
|---|---|---|
| `guru` | `nip`, `username` | Identitas login guru (menggantikan email) |
| `siswa` | `tanggal_lahir` | Password login siswa |

**Temuan yang perlu kamu tahu:** kolom `siswa.tanggal_lahir` selama ini sudah
**dibaca** oleh `src/app/login/Action.ts`, tapi tidak pernah dibuat oleh
migrasi 0001–0014 mana pun. Bug ini belum ketahuan karena fungsi yang
membacanya (`siapkanLoginSiswa`) belum pernah dipanggil `LoginForm`. Migrasi
0015 menutup lubang itu.

Guru yang sudah ada **tidak rusak** dan tetap bisa login pakai email. Kalau
mau mereka ikut bisa login pakai NIP, jalankan perintah opsional di bagian
bawah file migrasi (ada penjelasan lengkapnya di sana).

---

## Yang berubah — sisi siswa

### 1. Pindah soal langsung ke atas ✅
`src/components/siswa/ujian/ExamClient.tsx`

Begitu siswa menekan Sebelumnya/Berikutnya atau memilih nomor di panel
navigasi, halaman otomatis menggulir ke kartu soal — dengan tinggi header
sticky sudah diperhitungkan, jadi baris pertama soal tidak ketutupan.

Gulir halus dipakai untuk jarak dekat, tapi **lompat langsung** untuk jarak
jauh (mis. dari soal 40 ke soal 1). Di HP kelas bawah, animasi gulir sejauh
itu memakan lebih dari sedetik dan terasa seperti aplikasi macet. Setelan
"kurangi animasi" di perangkat juga dihormati.

### 2. Dashboard hidup tanpa refresh ✅
`src/app/siswa/(dashboard)/page.tsx` + `DashboardSiswaClient.tsx` (baru)

Dulu pengelompokan ujian (berlangsung / mendatang / riwayat) dihitung di
server dan **beku** sejak halaman dirender. Sekarang server hanya mengambil
data; yang memutuskan status adalah client dengan jam yang berdetak tiap
detik. Kartu ujian berpindah ke "Ujian Hari Ini" dan tombolnya bisa diklik
tepat pada detiknya.

Jam yang dipakai adalah **jam server**, dikirim sebagai prop lalu dihitung
selisihnya dengan jam HP. Jadi HP yang jamnya meleset 10 menit tetap melihat
ujian terbuka di waktu yang benar — konsisten dengan cara timer ujian bekerja.

Ada juga hitung mundur "Terbuka dalam 42 menit" di jadwal mendatang.

### 3. Sapaan login yang kepotong ✅
`src/components/ui/SwalPanel.tsx`

**Ini bug CSS sungguhan, bukan sekadar soal ukuran.** Kartu login memakai
`backdrop-blur`. Di CSS, elemen dengan `backdrop-filter` menjadi *containing
block* baru untuk anak yang `position: fixed` — jadi `inset-0` pada overlay
sapaan berarti "penuhi kartu login yang blur itu", bukan "penuhi layar".
Itulah kenapa sapaannya terlihat terjepit di dalam kotak kecil.

Diperbaiki dengan me-render lewat **React Portal** ke `document.body`, keluar
dari pohon DOM yang blur. Sekalian kartunya dipercantik (lingkaran dekoratif
CSS murni, tanpa gambar tambahan yang perlu diunduh).

### 4. Unduh semua soal saat klik "Mulai Kerjakan" ✅
`src/lib/paket-soal-lokal.ts` (baru) + `ExamClient.tsx`

Saat siswa menekan "Mulai Ujian":
1. Seluruh naskah soal disalin ke `localStorage`
2. Seluruh gambar dipaksa masuk cache browser (4 unduhan serentak)
3. **Baru setelah itu** timer dijalankan

Urutannya penting: waktu unduh ditanggung di luar jam ujian. Ada bilah
progres "Gambar 7 dari 23" — angkanya ditulis apa adanya, karena layar yang
tampak diam sepuluh detik adalah layar yang tombolnya ditekan berulang kali.

Gambar dikumpulkan dari **dua** sumber: kolom `gambar_url` *dan* tag `<img>`
yang ditempel guru di dalam `konten_jsonb`. Menangkap yang pertama saja akan
membuat soal matematika — justru yang paling sering pakai gambar sisipan —
tetap kosong saat sinyal hilang.

Kalau halaman dimuat ulang saat koneksi putus, ujian lanjut dari salinan
lokal dengan banner pemberitahuan. Paket dihapus setelah ujian dikumpulkan,
supaya naskah soal tidak tertinggal di HP siswa.

---

## Yang berubah — sisi guru/admin

### 1. Animasi loading tiap pindah halaman ✅
`src/components/admin/NavigasiProgress.tsx` (baru) — sudah terpasang di
`AdminShell.tsx`, tidak perlu dipanggil manual.

Bilah gradasi tipis di paling atas layar yang bergerak begitu menu diklik dan
berhenti saat halaman tujuan siap. Bergerak maju sambil melambat mendekati
90% (pola YouTube/GitHub) — yang penting terlihat **bergerak**, karena itulah
bukti aplikasi tidak macet.

Murni CSS + beberapa baris JS, **tanpa library tambahan**.

Ditambah `loading.tsx` + `SkeletonTabelAdmin.tsx` untuk halaman bertabel
besar (siswa & guru), dengan animasi kilau menyapu kiri-ke-kanan.

### 2. Tambah manual + login username + import Excel ✅

**Akun guru** sekarang: `No, Nama, NIP` — username = NIP, password =
`guru123456`, persis permintaanmu. Email sintetis dirakit otomatis di
belakang layar (`{nip}@guru.lms-cbt.local`); guru tidak pernah melihatnya.

| File | Isi |
|---|---|
| `admin/guru/TambahGuruManualForm.tsx` | Form satu guru (baru) |
| `admin/guru/ImportGuruForm.tsx` | Import **Excel**, bukan CSV lagi |
| `admin/guru/actions.ts` | Ditulis ulang untuk NIP |
| `admin/guru/page.tsx` | Kolom NIP & Username |
| `admin/siswa/TambahSiswaManualForm.tsx` | Form satu siswa (baru) |
| `admin/siswa/ImportSiswaForm.tsx` | Import **Excel** + tanggal lahir |
| `lib/excel-import.ts` | Pembaca `.xlsx` di browser (baru) |
| `lib/akun.ts` | Satu sumber aturan username/password (baru) |

Login guru sekarang lewat kolom **"Username / NIP"**. Akun lama yang belum
punya NIP tetap bisa mengetik email di kolom yang sama — dibedakan dari
ada-tidaknya tanda `@`.

Halaman `/admin/guru` jadi **lebih cepat**: dulu harus memanggil
`listUsers` halaman demi halaman ke Supabase Auth hanya untuk menampilkan
kolom email. Sekarang cukup satu query biasa.

**Bug yang ikut ketemu dan diperbaiki:** `Action.ts` membentuk password siswa
`Lms#DDMMYYYY` sementara `LoginForm.tsx` mengirim `DDMMYYYY` polos. Dua rumus
berbeda untuk hal yang sama. Gejalanya kalau sampai terpakai adalah yang
paling sulit ditelusuri: *akun ada, tanggal lahir benar, tapi ditolak.*
Sekarang keduanya memanggil rumus yang sama dari `lib/akun.ts`.

### 3. UI dipercantik, tetap ringan ✅
`src/app/globals.css`

Tambahan murni CSS — tanpa gambar, font, atau JS baru, jadi **nol permintaan
jaringan tambahan**: baris tabel yang menyala saat disorot, kepala tabel
lengket, animasi kilau skeleton, dan penghormatan pada setelan "kurangi
animasi" perangkat.

---

## Data master contoh

Folder `data-master/` berisi dua file siap pakai:

- `data-master-guru.xlsx` — 8 guru contoh (No, Nama, NIP)
- `data-master-siswa.xlsx` — 10 siswa contoh (No, Nama, Username, Kelas, Tanggal Lahir)

Formatnya persis yang dicari pembaca Excel, jadi bisa **langsung diunggah**
ke form import untuk uji coba. Di aplikasi juga ada tombol "Unduh template"
yang menghasilkan file kosong berformat sama.

> **Catatan teknis penting:** kolom NIP disimpan sebagai **teks**, bukan
> angka. NIP 18 digit melebihi presisi Excel (15 digit signifikan), jadi NIP
> yang tersimpan sebagai angka berubah diam-diam jadi `196504121990030000` —
> tiga digit terakhir hilang. Tidak ada error, cuma guru yang tidak bisa
> login. Kalau TU menyiapkan file sendiri, pastikan kolom NIP diformat
> sebagai Teks dulu.

---

## Sesudah menyalin file

```bash
npm install          # exceljs sudah ada di project; ini untuk memastikan
npm run build        # pastikan lolos
```

Yang perlu diuji manual (belum bisa saya uji karena tidak punya akses ke
Supabase-mu):

1. Jalankan migrasi 0015 di ketiga project
2. Tambah satu guru manual → coba login pakai NIP + `guru123456`
3. Unggah `data-master-guru.xlsx` lewat import
4. Tambah satu siswa manual → coba login pakai nama + tanggal lahir
5. Buka ujian, klik "Mulai Ujian", pastikan progres unduhan muncul
6. Pindah-pindah soal, pastikan gulir otomatis ke atas
7. Klik-klik menu admin, pastikan bilah loading muncul

---

## Satu hal yang perlu keputusanmu

Password guru seragam `guru123456` berarti **siapa pun yang tahu NIP seorang
guru bisa masuk sebagai guru itu**. NIP bukan rahasia — tercetak di banyak
dokumen sekolah dan sering ditempel di papan pengumuman.

Untuk guru biasa, risikonya masih sepadan dengan kemudahannya. Tapi untuk
akun dengan `is_admin = true` (bisa melihat dan mengubah data **ketiga**
jenjang), saya sarankan jangan memakai password seragam ini — buat akunnya
lewat dashboard Supabase dengan password sendiri.

Tombol "Reset Password" di `/admin/guru` sengaja tetap menghasilkan password
**acak**, bukan `guru123456`, supaya selalu ada jalan mengeraskan satu akun
tertentu kapan pun dibutuhkan.

Kalau kamu mau, saya bisa membuat form tambah guru **menolak** pembuatan akun
admin dengan password seragam — tinggal bilang.
