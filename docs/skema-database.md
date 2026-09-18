# Skema Database

Lihat file migrasi di `supabase/migrations-kelas{7,8,9}/` sebagai sumber
kebenaran (ini ringkasannya).

> **Sesi 16 — arsitektur 3 project terpisah.** Skema di bawah ini
> berlaku SAMA PERSIS di ketiga project Supabase (kelas 7/8/9) — tidak
> ada perbedaan tabel/kolom/RLS antar jenjang, cuma datanya yang
> terpisah karena tinggal di project yang berbeda. Lihat
> `supabase/README.md` untuk penjelasan struktur folder migrasi, dan
> bagian "Status Sesi 16" di `README.md` utama untuk alasan lengkap
> kenapa dipecah 3.

## Tabel

| Tabel | Ringkasan |
|---|---|
| `kelas` | Referensi kelas: `tingkat` (7/8/9) + `nama` ("7.1", dst) — di tiap project cuma diisi kelas jenjangnya sendiri lewat `seed-kelas{N}.sql` |
| `guru` | 1 baris per akun guru/admin, `auth_id` → `auth.users.id` |
| `siswa` | 1 baris per siswa, `auth_id` → `auth.users.id`, `username` unik untuk login |
| `event` | Periode ujian (mis. "PTS Ganjil"), ditarget ke satu jenjang (`kelas_utama`) |
| `mapel` | Satu sesi ujian/mapel di dalam event, punya jendela waktu `waktu_mulai`–`waktu_selesai` |
| `mapel_kelas` | Many-to-many: kelas mana saja yang ditarget satu mapel |
| `soal` | Semua tipe soal, dibedakan kolom `tipe` (enum), isi soal di `konten_jsonb` |
| `jawaban_siswa` | 1 baris per (siswa, mapel) — target upsert autosave |
| `nilai` | Hasil koreksi otomatis per (siswa, mapel) |
| `log_aktivitas` | Riwayat aktivitas guru/admin (Sesi 9) — lihat bagian tersendiri di bawah |

## Kenapa login siswa pakai email sintetis?

Supabase Auth berbasis email+password. Spec minta siswa login pakai
**username**, bukan email (siswa SMP/SMA biasanya tidak punya email
sekolah). Solusinya: saat provisioning akun siswa, buat user Supabase Auth
dengan email `{username}{NEXT_PUBLIC_SISWA_EMAIL_SUFFIX}` (default
`@siswa.lms-cbt.local` — domain palsu, tidak pernah dipakai kirim email
sungguhan). Form login menerjemahkan `username` yang diketik siswa jadi
email itu sebelum memanggil `signInWithPassword`. Ini **asumsi desain**
dari saya — kalau nanti ternyata sekolah sudah punya sistem SSO/NISN
sendiri, bagian ini yang perlu diganti duluan.

**Guru login pakai email asli**, bukan email sintetis seperti siswa —
asumsinya guru (berbeda dari siswa SMP/SMA) sudah punya email sekolah
atau email pribadi yang dipakai sehari-hari, jadi tidak perlu lapisan
username terpisah. Konsekuensinya di skema: tabel `guru` (lihat
`0001_init.sql`) tidak punya kolom `username` sama sekali, dan
`LoginForm.tsx` tab "Admin/Guru" memakai input yang diketik langsung
sebagai email tanpa suffix apa pun (beda dengan tab "Siswa"). Import
massal guru (`/admin/guru`, Sesi 7) mengikuti asumsi ini — CSV-nya
berkolom `nama,email`, bukan `nama,username,kelas` seperti siswa.

## Kenapa ada RPC `get_soal_untuk_siswa` alih-alih siswa SELECT langsung ke tabel `soal`?

`soal.konten_jsonb` menyimpan kunci jawaban di dalamnya (field `benar`,
`jawaban_benar`, `kunci_jawaban`, `pasangan_benar` — lihat komentar di
`0003_soal.sql`). RLS itu **row-level**, bukan column-level — kalau siswa
diberi izin SELECT ke tabel `soal`, mereka akan menerima seluruh
`konten_jsonb` termasuk kunci jawabannya lewat DevTools/network tab,
walau UI tidak menampilkannya. Untuk sistem CBT, ini fatal (integritas
ujian bocor).

Solusinya: siswa **tidak** diberi policy SELECT ke tabel `soal` sama
sekali (lihat `0005_rls_policies.sql`). Mereka mengambil soal lewat
fungsi `get_soal_untuk_siswa(mapel_id)` (`security definer`, jadi jalan
dengan hak akses superuser fungsi, bukan hak akses pemanggil) yang:

1. Validasi ulang: mapel ditarget ke kelas siswa itu + jadwal sudah
   berlangsung (redundant dengan RLS `mapel`, sengaja double-check).
2. Strip field kunci jawaban dari `konten_jsonb` sebelum dikembalikan,
   per tipe soal.

Dipanggil dari client seperti:

```ts
const { data, error } = await supabase.rpc("get_soal_untuk_siswa", {
  p_mapel_id: mapelId,
});
```

## `log_aktivitas` — riwayat aktivitas admin (Sesi 9)

Requirement asli ada di poin 2 `PROMPT-SESI-7.md`: minimal harus bisa
menjawab "siapa menghapus event X jam berapa" dan "siapa mengubah kunci
jawaban soal Y". Penjelasan lengkap keputusan desain (kenapa CAMPURAN
trigger DB + pemanggilan manual, bukan salah satu penuh) ada sebagai
komentar panjang di awal `0009_log_aktivitas.sql` — jangan diulang di
sini secara lengkap, cuma ringkasannya:

| Sumber perubahan | Cara dicatat |
|---|---|
| `event`, `mapel`, `soal` (insert/update/delete) | Trigger DB generik — tabel ini cuma pernah ditulis guru |
| `nilai` — override manual guru (`is_override = true`) | Trigger DB, tapi BERSYARAT — supaya koreksi otomatis (dipicu submit siswa) tidak ikut tercatat sebagai "aktivitas guru" |
| `nilai` — hitung ulang massal, import siswa/guru | Dicatat MANUAL (satu panggilan `catat_log_aktivitas` per aksi/batch) — satu aksi guru yang menyentuh banyak baris sekaligus, supaya log tidak berisi ratusan baris untuk satu keputusan |

Satu-satunya jalur INSERT ke `log_aktivitas` adalah fungsi
`catat_log_aktivitas()` (`security definer`) — tabel ini sengaja TIDAK
punya policy RLS INSERT untuk siapa pun (termasuk guru), supaya baris log
selalu lewat validasi `is_guru()` + snapshot nama guru di fungsi itu,
bukan bisa ditulis bebas dari client. RLS SELECT dibuka untuk guru saja
(`log_aktivitas_select_guru`, pola sama seperti tabel lain yang guru-only,
mis. `soal`).

`detail_jsonb` menyimpan snapshot data yang relevan di titik waktu itu
(nama event/mapel, tipe+cuplikan pertanyaan soal, siswa_id+total_skor
nilai, dst) — BUKAN cuma `entitas_id` mentah — supaya kalau baris
sumbernya sendiri sudah terhapus (mis. event yang dihapus), riwayatnya
tetap terbaca lengkap di `/admin/log` tanpa perlu join ke tabel yang
sudah tidak ada barisnya lagi. Pola yang sama dipakai untuk nama guru
(`detail_jsonb.oleh_nama`) supaya tetap terbaca walau baris `guru`-nya
suatu saat dihapus (kolom `guru_id` sendiri `on delete set null`, bukan
cascade — riwayat historisnya tidak boleh ikut hilang).

Halaman `/admin/log` (`src/app/admin/log/page.tsx`) difilter lewat query
param biasa (`?entitas=&guruId=&dari=&sampai=`, form `method="get"` tanpa
JS — pola yang sama dengan `MapelPicker` di `/admin/nilai`), dibatasi 100
baris terbaru per query (belum ada pagination — kandidat penghalusan
kalau volume log sudah jauh lebih besar dari itu).

## RLS — ringkasan kebijakan akses

| Tabel | Guru/Admin | Siswa |
|---|---|---|
| `kelas` | full | read semua |
| `guru` | read semua guru | tidak ada akses |
| `siswa` | read semua siswa | read baris sendiri |
| `event` | full | read event yang `kelas_utama`-nya sama dengan tingkat kelasnya |
| `mapel` | full | read mapel yang ditarget ke kelasnya (metadata saja, kapan pun) |
| `mapel_kelas` | full | read baris kelasnya sendiri |
| `soal` | full | **tidak ada** — lewat RPC `get_soal_untuk_siswa` |
| `jawaban_siswa` | read semua (read-only) | read/insert/update baris sendiri, hanya selama mapel berlangsung & belum `submitted_at` |
| `nilai` | full | read baris sendiri |
| `log_aktivitas` | read semua (insert HANYA lewat fungsi `catat_log_aktivitas`, tidak ada policy INSERT langsung) | tidak ada akses |

## Tipe soal & bentuk `konten_jsonb`

Didokumentasikan lengkap sebagai komentar SQL di `0003_soal.sql`. Ringkas:

- **pilgan_biasa** / **pilgan_kompleks** — `opsi[]`, tiap opsi punya
  `benar: boolean`. Bedanya cuma di validasi jumlah opsi benar (1 vs banyak),
  ditegakkan di layer aplikasi.
- **uraian_singkat** — `kunci_jawaban: string[]`, dicocokkan per kata,
  case-insensitive.
- **benar_salah** — satu `jawaban_benar: boolean`.
- **multi_benar_salah** — `pernyataan[]`, tiap pernyataan punya
  `jawaban_benar: boolean` sendiri.
- **menjodohkan** — `soal[]` + `jawaban[]` (boleh beda jumlah) +
  `pasangan_benar: { [soal_id]: jawaban_id }`.
