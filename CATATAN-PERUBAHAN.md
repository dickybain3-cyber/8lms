# Catatan perubahan — login siswa bertingkat, perbaikan login admin, desain baru

Salin isi folder ini menimpa isi project `lms-cbt` (struktur foldernya
sudah sama persis, jadi bisa langsung di-copy). Tidak ada file yang
dihapus dan tidak ada dependensi npm baru.

Sesudah disalin:

```bash
npm run dev     # cek tampilan
npm run build   # memastikan tidak ada yang rusak
```

---

## 1. Login siswa: Kelas Utama -> Kelas -> Nama -> Tanggal lahir

**File:** `src/app/login/LoginForm.tsx`

Sekarang ada **dua dropdown bertingkat**:

1. **Kelas Utama** (7 / 8 / 9) — ini yang menentukan project Supabase mana
   yang dihubungi, jadi wajib dipilih paling awal. Sebelum ini dipilih,
   aplikasi bahkan tidak tahu harus menanyakan daftar nama ke server yang
   mana.
2. **Kelas** (7.1–7.6 / 8.1–8.6 / 9.1–9.6) — terkunci sampai kelas utama
   dipilih, isinya otomatis menyesuaikan jenjang.
3. **Pilih Nama** — modal berisi daftar nama sekelas + kolom pencarian.
4. **Tanggal lahir** — baru muncul setelah nama dipilih.

Beda dari versi sebelumnya: dulu jenjang 8 dan 9 tidak dipecah per
sub-kelas (satu pilihan "Kelas 8" saja, daftar namanya digabung satu
jenjang, ±200 nama). Sekarang ketiganya diperlakukan sama, jadi daftar
yang di-scroll siswa selalu sepanjang satu kelas saja.

Setiap kali pilihan di atasnya diganti, pilihan di bawahnya direset —
supaya tidak pernah terkirim kombinasi kelas-dan-nama yang tidak cocok.

**Tidak ada perubahan database untuk ini.** RPC
`get_siswa_untuk_pilih_nama(p_kelas_nama)` yang sudah ada memang sudah
menerima nama kelas spesifik; yang berubah cuma sekarang parameternya
selalu diisi (dulu untuk jenjang 8/9 dikirim `null`). Migrasi
`0010_login_siswa_pilih_nama.sql` **tidak perlu dijalankan ulang**.

## 2. Perbaikan "login admin/guru sudah benar tapi dilempar balik"

Ada dua penyebab terpisah, dua-duanya diperbaiki.

**a. Cookie sesi hilang saat redirect** — `middleware.ts`

`@supabase/ssr` menulis ulang cookie sesi setiap kali access token perlu
di-refresh, dan tulisan itu masuk ke objek `response` dari
`createMiddlewareClient`. Kode lama membuat redirect lewat
`NextResponse.redirect(url)` yang baru dan polos, jadi cookie hasil
refresh tadi ikut terbuang. Browser tetap memegang token lama yang sudah
tidak berlaku → request berikutnya `getUser()`-nya null → dilempar ke
`/login`, padahal barusan login dengan benar.

Sekarang semua redirect lewat helper `redirectKe()` yang menyalin dulu
cookie dari `response`.

**b. Akun tidak punya baris di tabel `guru`** — `LoginForm.tsx`

Kalau akun berhasil login tapi `auth_id`-nya tidak ada di tabel `guru`
maupun `siswa` di project jenjang itu, middleware tidak bisa menentukan
role, halaman `/` meneruskan ke `/login`, dan yang kelihatan cuma form
login lagi tanpa pesan apa pun.

Sekarang role diperiksa di `LoginForm` tepat setelah sign-in berhasil,
lalu langsung diarahkan ke `/admin` atau `/siswa` (tidak lewat `/` lagi).
Kalau tidak ketemu di dua tabel itu, sesinya dibatalkan dan penyebabnya
ditulis jelas di layar, termasuk kemungkinan "akunmu ada di jenjang
lain".

> Kalau sesudah update masih muncul pesan itu, berarti memang barisnya
> belum ada. Akun admin yang dibuat manual lewat Authentication > Users
> tetap perlu satu baris di tabel `guru` — panel admin mengenali
> admin/guru dari tabel itu, bukan dari email atau role bawaan Supabase.

## 3. Desain

**Palet & font — `tailwind.config.ts`, `src/app/globals.css`, `src/app/layout.tsx`**

Nama token warna **sengaja tidak diganti** (`ink`, `paper`, `gold`,
`teal`, `ok`, `danger`). Nama-nama itu sudah dipakai di ±30 file halaman
admin dan siswa; dengan hanya mengganti nilai hex-nya, seluruh halaman
ikut berganti warna sekaligus tanpa menyentuh file-file itu satu per
satu — jauh lebih kecil risikonya daripada find-and-replace nama kelas di
puluhan file. Konsekuensinya: kalau di kode terbaca `text-ink`, sekarang
artinya slate gelap, bukan lagi navy.

| Token | Sekarang | Peran di desain |
|---|---|---|
| `ink` | `#1e293b` | teks utama & sidebar |
| `paper` | `#f8fafc` | latar halaman |
| `gold` | `#3b82f6` | aksen |
| `teal` | `#2563eb` | tombol/tautan utama |
| `ok` | `#10b981` | sukses |
| `danger` | `#ef4444` | bahaya |

Font: Poppins (judul) + Inter (teks), lewat `next/font`. Variabel CSS-nya
tetap `--font-serif` / `--font-sans` supaya kelas `font-serif` yang sudah
tersebar tidak perlu diubah — sekarang kelas itu menghasilkan Poppins.
Font Awesome dimuat lewat CDN di `layout.tsx`.

Di `globals.css` ada kelas siap pakai: `.card-mewah`, `.btn-primary`,
`.btn-ghost`, `.btn-logout`, `.field`, `.label-field`, `.badge-ok`,
`.badge-danger`, `.badge-netral`.

**Halaman login — `src/app/login/page.tsx`**

Foto gedung sekolah sebagai latar satu layar penuh, kartu putih
semi-transparan + blur di tengah, logo sekolah, judul kapital tiga baris,
tombol `#004e92`, footer hak cipta + kredit. Ditambah lapisan gelap tipis
di atas foto: tanpa itu teks di dalam kartu ikut silau karena fotonya
terang. URL logo & latar dikumpulkan di `src/lib/branding.ts`.

**Halaman siswa** — header putih sticky (logo + nama sekolah, pil
identitas siswa, tombol keluar), isi dua kolom (Ujian Hari Ini + riwayat
di kiri; Jadwal Mendatang + Tips di kanan), footer menempel di bawah.

**Halaman admin/guru** — sidebar gelap 260px dengan menu berkelompok
(Data Master, Kegiatan) yang otomatis terbuka di grup halaman aktif; di
HP jadi laci geser dengan tombol hamburger dan lapisan gelap. Dashboard
admin diisi kartu pintasan, plus pengingat bahwa data yang tampil hanya
milik jenjang yang dipilih saat login.

**Statistik** — kartu per mapel dengan empat kotak angka (Submit,
Rata-rata, Terendah, Tertinggi) dan bar progres pengumpulan. Komponen
`DistribusiNilai` tidak diubah, tampilannya ikut berganti sendiri lewat
palet.

## 4. Yang sengaja TIDAK saya sentuh

**`src/components/siswa/ujian/ExamClient.tsx`** (halaman mengerjakan
soal, 634 baris) tidak saya rombak. Warnanya sudah ikut berganti sendiri
karena memakai token yang sama, dan file itu memegang logika autosave +
timer + submit — menata ulang layoutnya beberapa hari sebelum uji coba
Sabtu risikonya tidak sebanding. Kalau kamu mau layout ujian persis
seperti desain acuan (kotak soal + panel navigasi nomor di kanan), itu
dikerjakan terpisah sesudah uji coba.

Halaman admin lain (event, soal, siswa, guru, nilai, log) juga tidak
disentuh strukturnya — semuanya ikut berganti warna & font lewat palet.

## 5. Sudah diuji

- `npx tsc --noEmit` → bersih.
- `npx next build` → sukses, 14 halaman ter-generate, tidak ada error
  atau warning baru.
- CSS hasil build dicek manual: kelas `.card-mewah`, `.btn-primary`, dan
  `.field` benar-benar menghasilkan `var(--primary)` dll.

Yang belum bisa diuji dari sini: alur login sungguhan ke Supabase
(butuh kredensial asli) dan tampilan di browser. Untuk itu jalankan
`npm run dev` lalu coba login siswa dan admin bergantian.
