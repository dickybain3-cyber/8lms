# Tahap 4 — Tugas (`event.jenis = 'assignment'`)

Isi paket ini melengkapi Tahap 3. Di Tahap 3 kamu sudah bisa memilih **jenis**
sebuah kegiatan; yang bisa diisi baru dua jenis yang memakai mesin ujian
(`asesmen_akhir`, `kuis_harian`). Tahap 4 membuat `assignment` benar-benar
bisa dipakai: guru membuat tugas dengan tenggat, siswa mengumpulkan tulisan
dan/atau berkas, guru menilai satu per satu.

`forum` masih menunggu Tahap 5 dan sekarang ditandai jelas sebagai "menyusul"
di UI, bukan sekadar tidak berfungsi.

---

## 1. Daftar berkas

### BARU — belum ada di repo, cukup disalin masuk

| Berkas | Isi |
|---|---|
| `supabase/migrations-baru/0019_tugas.sql` | Tabel `tugas`, `tugas_kelas`, `pengumpulan_tugas`, dua trigger, RLS, bucket storage `tugas` |
| `src/lib/tugas.ts` | Helper murni: fase tugas, pintu pengumpulan, ringkasan status, papan statistik, validasi nilai, format waktu/ukuran |
| `src/lib/tugas-berkas.ts` | Aturan berkas: batas ukuran, daftar MIME, pembersih nama, path storage |
| `src/app/admin/event/[eventId]/tugas/actions.ts` | Server Action guru: buat/ubah/hapus tugas, simpan penilaian, URL unduh |
| `src/app/admin/event/[eventId]/tugas/TugasForm.tsx` | Satu form dipakai mode "baru" dan "edit" |
| `src/app/admin/event/[eventId]/tugas/baru/page.tsx` | Halaman buat tugas |
| `src/app/admin/event/[eventId]/tugas/[tugasId]/page.tsx` | Halaman detail + daftar siswa |
| `src/app/admin/event/[eventId]/tugas/[tugasId]/edit/page.tsx` | Halaman ubah tugas |
| `src/app/admin/event/[eventId]/tugas/[tugasId]/PanelPenilaian.tsx` | Daftar siswa + saringan + form nilai per siswa |
| `src/app/admin/event/[eventId]/tugas/[tugasId]/TombolHapusTugas.tsx` | Modal hapus (wajib mengetik `HAPUS`) |
| `src/app/siswa/tugas/actions.ts` | Server Action siswa: simpan draf, kumpulkan, tarik kembali, hapus berkas |
| `src/app/siswa/tugas/[tugasId]/page.tsx` | Halaman tugas untuk siswa |
| `src/app/siswa/tugas/[tugasId]/FormPengumpulan.tsx` | Form pengumpulan + hitung mundur |
| `src/lib/__tests__/tugas.test.ts` | Uji helper Tahap 4 |

### PENGGANTI — menimpa berkas yang sudah ada

| Berkas | Yang berubah |
|---|---|
| `src/types/index.ts` | + tipe `Tugas`, `TugasKelas`, `PengumpulanTugas` (sisanya sama) |
| `src/lib/jenis-event.ts` | + `mesin`, `siap`, `tahapRencana`; + `pakaiMesinTugas()`, `jenisEventSiap()`, `istilahIsiKegiatan()` |
| `src/lib/supabase/admin-multi-event.ts` | `ambilDaftarEventMentah` jadi tiga tahap select; + `jumlah_tugas`, `ambilRingkasTugas()`, `daftarTugasAdmin()` |
| `src/app/admin/event/[eventId]/page.tsx` | Memuat mapel ATAU tugas sesuai `def.mesin` |
| `src/components/admin/DaftarEventKelompok.tsx` | Lencana isi: "n mapel" / "n tugas" / "menyusul Tahap 5" |
| `src/app/siswa/(dashboard)/page.tsx` | + memuat tugas & pengumpulan |
| `src/app/siswa/(dashboard)/DashboardSiswaClient.tsx` | + seksi Tugas, riwayat & jadwal gabungan |
| `src/lib/__tests__/event-jenis.test.ts` | Menguji tiga tahap select dan helper jenis yang baru |

Tidak ada berkas Tahap 3 yang dihapus.

---

## 2. Urutan pasang

1. **Salin berkas BARU** dulu. Aman: belum ada yang mengimpornya.
2. **Jalankan `0019_tugas.sql` di KETIGA project Supabase** (kelas 7, 8, 9),
   lewat SQL Editor, satu per satu. Skripnya `create ... if not exists` dan
   `drop policy if exists` sebelum `create policy`, jadi aman dijalankan
   ulang kalau kamu ragu sudah pernah menjalankannya.
3. **Salin berkas PENGGANTI.**
4. `npm run build` lalu deploy.

Kalau langkah 2 tertunda di salah satu project, aplikasinya tetap jalan —
lihat bagian 4.

### Yang perlu dicek setelah migrasi jalan

Di dashboard Supabase → **Storage**, harus muncul bucket bernama `tugas`
dengan status **private** (bukan public). Kalau bucket-nya tidak muncul,
biasanya karena `insert into storage.buckets` ditolak oleh project yang
belum pernah memakai Storage sama sekali; buka menu Storage sekali (supaya
skemanya diinisialisasi), lalu jalankan ulang bagian akhir `0019_tugas.sql`.

---

## 3. Syarat deploy: `TZ=Asia/Jakarta`

**Ini wajib, dan bukan formalitas.**

`<input type="datetime-local">` mengirim string polos tanpa zona waktu
(`"2026-09-30T23:59"`). Server Action menafsirkannya dengan `new Date(...)`,
yang memakai **zona waktu proses server**. Vercel dan kebanyakan host
menjalankan proses dalam UTC. Artinya, tanpa `TZ=Asia/Jakarta`, tenggat yang
diketik guru sebagai jam 23:59 akan tersimpan sebagai 06:59 WIB keesokan
harinya — tugas ditutup 7 jam lebih lambat dari yang dimaksud, tiap kali.

Karena itu `untukInputDatetime()` di `src/lib/tugas.ts` sengaja **tidak**
memaksa `timeZone: "Asia/Jakarta"`: yang dipakai untuk menampilkan harus zona
yang sama dengan yang dipakai untuk membaca. Memaksa zona di satu sisi saja
justru membuat angka yang ditampilkan berbeda dari angka yang tersimpan.

Pasang di environment variable project (Vercel → Settings → Environment
Variables, semua environment):

```
TZ=Asia/Jakarta
```

Lalu **redeploy** — variabel `TZ` dibaca saat proses mulai, bukan saat
request.

Cara cepat memastikan: buat tugas dengan tenggat 23:59, simpan, buka lagi
halaman editnya. Kalau yang tampil tetap 23:59, zona sudah benar.

> Catatan: `formatTenggat()` dan semua tampilan *baca* lainnya memang memakai
> `timeZone: "Asia/Jakarta"` eksplisit, jadi tampilannya benar bahkan di
> server UTC. Yang rusak tanpa `TZ` hanya jalur *tulis* dari form.

---

## 4. Kalau migrasi belum jalan di semua project

Tiga project dimigrasi manual satu per satu, jadi selalu ada jendela waktu
di mana skemanya berbeda. Yang sudah disiapkan untuk jendela itu:

- **Daftar kegiatan guru** (`ambilDaftarEventMentah`) mencoba tiga bentuk
  select berurutan: `jenis + mapel + tugas` → `jenis + mapel` → `mapel` saja.
  Di project yang 0019-nya belum jalan, lencana jumlah tugas tampil `0`,
  tetapi daftarnya tetap muncul lengkap. Kegagalan yang **bukan** soal skema
  (koneksi putus, kredensial salah) tetap dilempar — supaya masalah nyata
  tidak menyamar jadi "belum ada kegiatan".
- **Dashboard siswa** mengabaikan kegagalan query tugas dan menganggap
  daftarnya kosong. Dashboard ujian tidak ikut jatuh hanya karena tabel
  `tugas` belum ada.
- **Halaman tugas** (guru maupun siswa) akan error di project yang belum
  dimigrasi — dan itu memang disengaja: tidak ada gunanya menampilkan
  halaman tugas yang kosong padahal penyebabnya migrasi tertinggal.

---

## 5. Perubahan perilaku yang perlu kamu tahu

**`formatSisaSingkat` pindah rumah.** Dulu fungsi lokal di dalam
`DashboardSiswaClient.tsx`, sekarang diekspor dari `src/lib/tugas.ts` supaya
kartu ujian dan kartu tugas memakai satuan yang sama persis.

Satu perilakunya berubah: sisa waktu lebih dari sehari kini ditulis dalam
hari (`"2 hari 1 jam"`), bukan puluhan jam (`"49 jam"`). Ini terasa juga di
kartu ujian, bukan hanya di kartu tugas. Kalau kamu lebih suka versi lama
untuk ujian, pisahkan jadi dua fungsi — tapi pertimbangkan dulu: tenggat
tugas berjarak berhari-hari, dan "49 jam" menuntut pembacanya membagi dengan
24 di kepala.

Yang **tidak** berubah: `ms <= 0` tetap menghasilkan `"sebentar lagi"`, dan
sisa detik tetap dibulatkan ke atas ke menit terdekat.

**`pakaiMesinUjian()` sengaja tidak berubah artinya.** Ia masih menjawab
"apakah kegiatan ini punya mapel & sesi ujian", karena itulah yang dipakai
penjaga `createMapel()` dan trigger dari migrasi 0018. Pertanyaan baru
dijawab fungsi baru: `pakaiMesinTugas()`.

---

## 6. Keputusan desain yang sebaiknya dibaca sebelum mengubah

**Keterlambatan tidak disimpan.** Tidak ada kolom `terlambat`. Status itu
dihitung dari `submitted_at > tugas.tenggat` setiap kali ditampilkan. Efeknya
disengaja: kalau guru memperpanjang tenggat, siswa yang terlanjur lewat
otomatis dimaafkan — tanpa perlu ada tombol "maafkan" atau skrip perbaikan
data.

**Jawaban dan nilai satu baris.** `pengumpulan_tugas` memuat isi jawaban
sekaligus nilainya, tidak menumpang tabel `nilai`. Nilai tugas selalu manual;
tidak ada mesin koreksi yang perlu dipisahkan seperti pada ujian.

**Draf tidak ditampilkan ke guru.** Selama `submitted_at` masih kosong,
guru hanya melihat status "belum mengumpulkan" — isinya tidak ditampilkan.
Siswa perlu tempat menulis setengah jadi tanpa merasa diintip.

**Menarik kembali = mengosongkan `submitted_at`, bukan menghapus baris.**
Isi jawaban tidak hilang. Penarikan ditolak kalau pintu pengumpulan sudah
tertutup.

**Mengosongkan nilai = membatalkan penilaian.** Itu juga yang membuka kunci
baris untuk siswa lagi (policy `pengumpulan_update_own` mengunci baris yang
`nilai`-nya sudah terisi). Perlu kalau guru salah menilai siswa yang keliru.

**Berkas diunggah lewat Server Action, bukan langsung dari browser.**
Lebih lambat satu hop, tapi artinya aturan ukuran & tipe berkas ditegakkan di
tempat yang tidak bisa dilewati lewat DevTools. Batas: 5 MB per berkas.

**Menghapus tugas: objek storage dulu, baru barisnya.** Urutan ini disengaja.
Kalau barisnya dihapus dulu lalu penghapusan storage gagal, berkasnya jadi
yatim — tidak terhubung ke apa pun dan tidak akan pernah ditemukan lagi.

**Halaman penilaian merender daftar SISWA, bukan daftar pengumpulan.** Yang
belum mengumpulkan justru yang paling perlu terlihat guru.

---

## 7. Menguji

Uji helper (tidak butuh database):

```bash
TZ=Asia/Jakarta npx tsx --tsconfig tsconfig.test.json src/lib/__tests__/tugas.test.ts
TZ=Asia/Jakarta npx tsx --tsconfig tsconfig.test.json src/lib/__tests__/event-jenis.test.ts
```

Keduanya sudah dijalankan dan lulus. Yang dijaga `tugas.test.ts`: batas
pintu pengumpulan bersifat inklusif, nilai `0` dihitung sebagai "sudah
dinilai" (bukan "belum"), koma Indonesia diterima saat mengetik nilai, dan
nama berkas tidak bisa dipakai untuk keluar dari foldernya.

### Menguji trigger secara manual

Trigger `trg_cegah_tugas_di_event_bukan_assignment` adalah jaring pengaman
yang mencerminkan validasi di `createTugas()`. Untuk memastikan ia benar-benar
aktif, jalankan di SQL Editor (ganti `<id-event-ujian>` dengan id event
ber-jenis `asesmen_akhir`):

```sql
insert into tugas (event_id, judul, dibuka_at, tenggat, created_by)
values ('<id-event-ujian>', 'uji trigger', now(), now() + interval '1 day', null);
```

Harus ditolak dengan pesan yang menyebut `assignment`. Kalau baris itu justru
masuk, trigger-nya belum terpasang — jalankan ulang bagian trigger di
`0019_tugas.sql`.

### Uji jalur lengkap (sekali saja, di project kelas 7)

1. Buat kegiatan baru berjenis **Tugas**.
2. Tambah satu tugas, pilih satu kelas target, tenggat beberapa menit dari
   sekarang, centang "minta teks" dan "minta berkas".
3. Masuk sebagai siswa di kelas itu → tugasnya muncul di dashboard.
4. Simpan draf → keluar → masuk lagi → isinya masih ada.
5. Kumpulkan → status berubah jadi "terkumpul".
6. Lewati tenggat → coba tarik kembali → harus ditolak.
7. Sebagai guru, beri nilai → siswa melihat nilainya dan formnya terkunci.
8. Kosongkan nilainya → siswa bisa menyunting lagi.

---

## 8. Asumsi terhadap kode yang sudah ada

Paket ini menganggap hal-hal berikut sudah ada dari tahap sebelumnya. Kalau
salah satu namanya berbeda di repo kamu, penyesuaiannya hanya di baris impor:

- Fungsi SQL `is_guru()` (dari migrasi 0005) — dipakai seluruh policy guru
  di `0019_tugas.sql`.
- `@/components/ui/Panel`: `KepalaHalaman`, `Remah`, `Info`, `Kosong`,
  `BarisStatistik`, `Statistik`, `TOMBOL_UTAMA`, `TOMBOL_BIASA`.
- `@/lib/admin-guard` (`getSesiGuru`), `@/lib/jenjang`, `@/lib/event-status`,
  `@/lib/ujian`, `@/lib/supabase/admin`, `@/lib/supabase/admin-multi`.
- `@/components/TombolKerjakanUjian` (masih dipakai kartu ujian; kartu tugas
  sengaja memakai `<Link>` biasa karena membuka tugas tidak menulis apa pun).

---

## 9. Setelah ini

Tahap 5 mengisi `forum` (tabel `forum_topik`). Sampai itu dikerjakan,
`jenisEventSiap('forum')` bernilai `false` dan UI menampilkannya sebagai
"menyusul Tahap 5" — jadi guru yang terlanjur membuat kegiatan berjenis forum
tahu bahwa itu memang belum bisa diisi, bukan rusak.
