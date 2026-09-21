# Tahap 5 — Forum Diskusi (`event.jenis = 'forum'`)

Melengkapi Tahap 4. Forum sekarang benar-benar bisa dipakai: guru membuat
satu jadwal buka/tutup yang menaungi beberapa kelas, tiap kelas punya
ruang obrolannya sendiri, siswa mengirim pesan (1 poin per chat teks),
guru bisa memberi bonus +5 poin dengan mengklik bubble pesan, dan ada
papan poin keaktifan per kelas.

Dengan ini **kelima jenis event dari roadmap Tahap 3 sudah semuanya
siap** — tidak ada lagi jenis kegiatan yang menampilkan "menyusul".

---

## 1. Daftar berkas

### BARU

| Berkas | Isi |
|---|---|
| `supabase/migrations-baru/0020_forum.sql` | Tabel `forum_topik`, `forum_kelas`, `forum_pesan`, `forum_poin`; trigger jaring pengaman jenis event; trigger sinkron poin (pesan + toggle bonus); RLS lengkap; bucket storage TIDAK dibuat (forum tidak punya lampiran berkas) |
| `src/lib/forum.ts` | Helper murni: `faseForum`, `bolehMengirimPesan`, `alasanTidakBolehMengirim`, `apakahPesanDihitungPoin`, `hitungPoinTotal`, `POIN_BONUS_PER_KLIK` (=5) |
| `src/app/admin/event/[eventId]/forum/actions.ts` | Server Action guru: `createForumTopik`, `updateForumTopik`, `hitungDampakHapusForum`, `deleteForumTopik`, `kirimPesanGuru`, `toggleBonusPesan` |
| `src/app/admin/event/[eventId]/forum/ForumTopikForm.tsx` | Satu form dipakai mode "baru" dan "edit" (jadwal + kelas target) |
| `src/app/admin/event/[eventId]/forum/baru/page.tsx` | Halaman buat forum |
| `src/app/admin/event/[eventId]/forum/edit/page.tsx` | Halaman Pengaturan Forum (jadwal, kelas target, hapus) |
| `src/app/admin/event/[eventId]/forum/TombolHapusForum.tsx` | Modal hapus (wajib mengetik `HAPUS`) |
| `src/app/admin/event/[eventId]/forum/[kelasId]/page.tsx` | Ruang obrolan satu kelas: memuat pesan + poin |
| `src/app/admin/event/[eventId]/forum/[kelasId]/PanelForumKelas.tsx` | Bubble chat + klik-untuk-bonus + tabel poin kolom kanan |
| `src/app/siswa/forum/actions.ts` | Server Action siswa: `kirimPesanSiswa` |
| `src/app/siswa/forum/[forumTopikId]/page.tsx` | Halaman forum untuk siswa |
| `src/app/siswa/forum/[forumTopikId]/FormChatForum.tsx` | Riwayat obrolan (baca) + kirim teks/sticker/emoticon |
| `src/lib/__tests__/forum.test.ts` | Uji helper forum |

### PENGGANTI

| Berkas | Yang berubah |
|---|---|
| `src/types/index.ts` | + tipe `ForumTopik`, `ForumKelas`, `ForumPesan`, `ForumPoin`, `JenisIsiForumPesan` |
| `src/lib/jenis-event.ts` | `forum`: `siap: false → true`, `tahapRencana: 5 → null`; + `pakaiMesinForum()` |
| `src/lib/supabase/admin-multi-event.ts` | `ambilDaftarEventMentah` jadi EMPAT tahap select (+ `forum_topik(count)`); + `jumlah_forum_topik` di `EventAdmin`; + `ambilRingkasForum()`/`daftarForumAdmin()` |
| `src/app/admin/event/[eventId]/page.tsx` | + cabang `def.mesin === "forum"` (`BagianForum`/`KartuKelasForum`), tombol Buat Forum/Pengaturan Forum |
| `src/components/admin/DaftarEventKelompok.tsx` | Lencana forum: "Forum dibuat" / "Belum ada forum" (bukan hitungan, beda dari mapel/tugas) |
| `src/app/siswa/(dashboard)/page.tsx` | + memuat `forum_topik` milik siswa |
| `src/app/siswa/(dashboard)/DashboardSiswaClient.tsx` | + seksi Forum Diskusi, forum masuk ke Jadwal Mendatang & Riwayat |
| `src/lib/__tests__/event-jenis.test.ts` | Uji empat tahap select + `pakaiMesinForum` + "tepat satu mesin aktif" |
| `src/lib/__tests__/tugas.test.ts` | 2 baris yang dulu menegaskan forum `siap: false` diperbarui (forum sudah selesai) |

Tidak ada berkas Tahap 1–4 yang dihapus.

---

## 2. Urutan pasang

1. Salin berkas BARU.
2. Jalankan `0020_forum.sql` di **ketiga** project Supabase (kelas 7, 8,
   9), lewat SQL Editor, satu per satu. Sama seperti `0019_tugas.sql`:
   aman dijalankan ulang (`create ... if not exists`, `drop policy if
   exists` sebelum `create policy`).
3. Salin berkas PENGGANTI.
4. `npm run build` lalu deploy.

`TZ=Asia/Jakarta` yang sudah wajib sejak Tahap 4 **tetap wajib** — forum
memakai `untukInputDatetime()`/`formatTenggat()` yang sama persis dari
`src/lib/tugas.ts` (dipakai bersama, tidak diduplikasi).

### Kalau migrasi 0020 belum jalan di semua project

Pola fallback yang sama seperti Tahap 4: daftar kegiatan guru (`ambilDaftarEventMentah`)
sekarang mencoba EMPAT bentuk select berurutan — badge forum jatuh ke
"Belum ada forum" tanpa error di project yang 0020-nya belum jalan.
Dashboard siswa mengabaikan kegagalan query `forum_topik` (daftar forum
kosong, sisanya jalan seperti biasa). Halaman forum itu sendiri
(`/admin/.../forum/...`, `/siswa/forum/...`) akan error di project yang
belum dimigrasi — disengaja, sama alasannya dengan halaman tugas di
Tahap 4.

---

## 3. Menguji

```bash
TZ=Asia/Jakarta npx tsx --tsconfig tsconfig.test.json src/lib/__tests__/tugas.test.ts
TZ=Asia/Jakarta npx tsx --tsconfig tsconfig.test.json src/lib/__tests__/event-jenis.test.ts
TZ=Asia/Jakarta npx tsx --tsconfig tsconfig.test.json src/lib/__tests__/forum.test.ts
```

Ketiganya sudah dijalankan dan **LULUS**. Yang dijaga `event-jenis.test.ts`
untuk empat tahap select: project yang migrasi 0019-nya sudah jalan tapi
0020-nya belum (kasus paling mungkin persis setelah Tahap 5 dipasang,
karena 0020 pasti menyusul belakangan di tiap project) tetap jatuh ke
tahap yang masih membaca `tugas(count)` dengan benar, bukan langsung
melompat ke tahap paling minim.

### Uji trigger secara manual

**Jaring pengaman jenis event** (harus GAGAL — ganti `<id-event-tugas>`
dengan id event ber-jenis `assignment`):

```sql
insert into forum_topik (event_id, dibuka_at, ditutup_at)
values ('<id-event-tugas>', now(), now() + interval '1 day');
```

**Trigger poin pesan** (ganti id sesuai data uji):

```sql
-- 1. Kirim pesan teks dari siswa
insert into forum_pesan (forum_topik_id, kelas_id, siswa_id, isi, jenis_isi)
values ('<id-forum-topik>', '<id-kelas>', '<id-siswa>', 'halo', 'teks');

-- 2. forum_poin.poin_pesan harus naik 1
select poin_pesan, poin_bonus, total from forum_poin
where forum_topik_id = '<id-forum-topik>' and siswa_id = '<id-siswa>';

-- 3. Kirim sticker — poin_pesan TIDAK boleh naik
insert into forum_pesan (forum_topik_id, kelas_id, siswa_id, isi, jenis_isi)
values ('<id-forum-topik>', '<id-kelas>', '<id-siswa>', '🎉', 'sticker');
```

**Toggle bonus** (klik dua kali berturut-turut lewat UI, atau manual):

```sql
update forum_pesan set bonus_diberikan = true where id = '<id-pesan>';
-- forum_poin.poin_bonus harus naik 5, total ikut naik (generated column)
update forum_pesan set bonus_diberikan = false where id = '<id-pesan>';
-- forum_poin.poin_bonus harus KEMBALI ke angka semula, bukan berkurang lagi jadi minus
```

### Uji jalur lengkap (sekali saja, di project kelas 7)

1. Buat kegiatan baru berjenis **Forum Diskusi**.
2. Klik **Buat Forum**, isi jadwal (dibuka sekarang, ditutup beberapa
   menit lagi untuk keperluan uji), centang satu kelas.
3. Dari kartu event, klik kartu kelas itu → masuk ke ruang obrolan.
4. Kirim satu pesan sebagai guru.
5. Masuk sebagai siswa di kelas itu → forum muncul di dashboard (seksi
   Forum Diskusi) → buka → balas pesan guru dengan teks.
6. Kembali ke akun guru, refresh (atau tunggu polling 5 detik) → pesan
   siswa muncul, tabel poin kanan menunjukkan 1 chat untuk siswa itu.
7. Klik bubble pesan siswa → badge "+5" muncul, tabel poin ikut naik.
   Klik lagi → badge hilang, poin kembali turun.
8. Kirim sticker/emoticon dari sisi siswa → muncul di chat, TIDAK
   menambah angka "chat" di tabel poin.
9. Lewati waktu tutup (atau ubah `ditutup_at` manual ke masa lalu) →
   kotak kirim pesan siswa terkunci; guru tetap bisa membaca & memberi
   bonus.

---

## 4. Keputusan desain

**Satu `forum_topik` per event, walau skema tidak memaksanya lewat
constraint unik.** Beda dari tugas (banyak `tugas` independen per
event), forum dimodelkan sebagai SATU jadwal buka/tutup yang menaungi
BANYAK kelas lewat `forum_kelas` — makanya rute adminnya langsung
`/admin/event/[eventId]/forum/[kelasId]`, tanpa `[topikId]` di antaranya.
Batasan "cuma satu forum per event" ditegakkan di `createForumTopik`
(Server Action), dicek juga di halaman `/forum/baru` supaya URL yang
dibuka langsung tidak menampilkan form yang pasti ditolak saat disimpan.

**Bonus disimpan per-pesan (`forum_pesan.bonus_diberikan`), bukan
langsung menambah `forum_poin.poin_bonus`.** Guru mengklik BUBBLE
TERTENTU; klik ulang pada bubble yang sama membatalkan (toggle), bukan
menambah lagi. Tanpa penanda per pesan, tidak ada cara tahu "apakah
bubble ini sudah menyala" setelah halaman di-refresh — dan tanpa itu,
guru yang iseng mengeklik sepuluh kali bisa membuat poin meledak. Nilai
baru SELALU kebalikan dari yang tersimpan di database saat itu (dibaca
dulu, baru ditulis) — bukan nilai yang "diasumsikan" client, supaya dua
tab guru yang terbuka bersamaan tidak saling menimpa dengan cara yang
aneh. Trigger `trg_forum_pesan_toggle_bonus` (0020) yang menjaga
`forum_poin.poin_bonus` tetap sinkron; `toggleBonusPesan()` di
`forum/actions.ts` cuma menulis penandanya.

**`forum_poin.total` adalah *generated column*, bukan dihitung di
JavaScript.** Beda dari `pengumpulan_tugas.terlambat` (Tahap 4, sengaja
TIDAK disimpan karena bergantung pada baris lain), `total` di sini cuma
`poin_pesan + poin_bonus` — dua kolom di baris yang sama, jadi Postgres
bisa menjaminnya tidak pernah salah jumlah tanpa trigger tambahan.

**Siswa yang belum pernah mengirim pesan bertipe teks TIDAK punya baris
`forum_poin`.** Sama polanya dengan tugas (siswa yang belum menyentuh
tugas tidak punya baris `pengumpulan_tugas`). `page.tsx` ruang forum
guru WAJIB memakai daftar siswa kelas sebagai sumber baris tabel poin,
lalu menempeli angka dari `forum_poin` kalau ada — bukan langsung
menampilkan hasil `SELECT * FROM forum_poin` apa adanya, karena itu
menyembunyikan siswa yang paling diam dari papan poin, padahal
merekalah yang paling perlu terlihat guru.

**Sticker dan emoticon dua kategori terpisah, keduanya tidak dihitung
poin.** `jenis_isi` punya tiga nilai (`teks`/`sticker`/`emoticon`) —
trigger poin cuma menyala untuk `jenis_isi = 'teks'`. Di UI siswa,
emoticon adalah satu simbol cepat (👍😂❤️ dst.), sticker adalah frasa
pendek siap pakai ("🙋 Ada pertanyaan"); bedanya cuma kosmetik, aturan
poinnya sama-sama nol. Ini yang memenuhi permintaan "kalo hanya kirim
sticker atau emoticon ga kehitung".

**Tidak ada jalur "terlambat" untuk forum.** Tugas punya jalur "boleh
telat, ditandai terlambat" karena hasil kerja tidak berkurang nilainya
cuma karena telat dikirim. Forum itu obrolan; pesan yang "telat" ke
ruang yang sudah ditutup tidak pernah masuk akal untuk diterima —
`faseForum` cuma tiga keadaan tegas (belum_buka/berlangsung/ditutup),
tanpa status perantara.

**Guru boleh mengirim pesan kapan pun**, termasuk sebelum forum dibuka
(menyiapkan pertanyaan pembuka) atau setelah ditutup (mengumumkan
rekap). Yang dibatasi jendela waktu cuma SISWA — dicerminkan policy
`forum_pesan_insert_siswa` di database, dicek ulang di
`kirimPesanSiswa()` supaya pesan errornya berupa kalimat manusiawi,
bukan pesan mentah Postgres soal row-level security.

**Tidak ada UPDATE/DELETE pesan untuk siswa.** Ini chat, bukan draf.
Kalau nanti ada permintaan fitur "edit pesan" atau "hapus pesan",
itu perubahan skema (butuh kolom `edited_at`, kebijakan RLS baru),
bukan sekadar halaman baru.

**Polling 5 detik, bukan Supabase Realtime.** Realtime butuh langganan
channel per ruang, penanganan reconnect, dan pembersihan langganan saat
guru berpindah kelas — kerumitan yang belum sepadan untuk pola pakai
sebenarnya (guru membuka satu ruang, membaca, membalas — bukan
memantau dua puluh ruang sekaligus). Aksi guru sendiri (kirim pesan,
toggle bonus) memicu `router.refresh()` segera, jadi guru tidak pernah
menunggu 5 detik untuk melihat efek tindakannya sendiri; yang menunggu
polling cuma pesan BARU dari siswa. Migrasi ke realtime, kalau pola
pakainya berubah nanti, adalah pekerjaan terpisah.

**Tidak ada bucket storage untuk forum.** Forum tidak punya lampiran
berkas — beda dari tugas (`BUCKET_TUGAS`, Tahap 4) — jadi `0020_forum.sql`
tidak membuat bucket sama sekali, dan `deleteForumTopik` tidak perlu
langkah pembersihan storage seperti `deleteTugas`.

---

## 5. Asumsi terhadap kode yang sudah ada

Sama seperti Tahap 4 — kalau salah satu nama berikut berbeda di repo
kamu, penyesuaiannya cuma di baris impor:

- Fungsi SQL `is_guru()` (migrasi 0005).
- `@/components/ui/Panel`: `KepalaHalaman`, `Remah`, `Info`, `Kosong`,
  `BarisStatistik`, `Statistik`, `TOMBOL_UTAMA`, `TOMBOL_BIASA`.
- `@/lib/admin-guard` (`getSesiGuru`, `JENJANG_LABEL`), `@/lib/jenjang`
  (`parseJenjang`), `@/lib/event-status` (`statusEvent`,
  `kelompokkanEvent`, `URUTAN_STATUS`).
- `@/lib/tugas` (`untukInputDatetime`, `formatTenggat`,
  `formatSisaSingkat`) — dipakai ULANG oleh forum, bukan diduplikasi.
  Kalau nama-nama ini berubah di Tahap 4, forum ikut terdampak.
- `@/app/admin/event/[eventId]/DeleteEventButton.tsx`,
  `@/app/admin/event/actions.ts` (`hitungDampakHapusEvent`).

---

## 6. Status roadmap

Dengan Tahap 5 selesai, **kelima jenis kegiatan dari migrasi 0018 sudah
semuanya siap dipakai**: `asesmen_akhir`, `kuis_harian` (mesin ujian),
`assignment` (mesin tugas, Tahap 4), `forum` (mesin forum, Tahap 5).
Tidak ada lagi kartu "menyusul" di halaman daftar kegiatan untuk jenis
kegiatan manapun — cabang `!def.siap` di `page.tsx` dan
`DaftarEventKelompok.tsx` dipertahankan sebagai jaring pengaman untuk
jenis kegiatan yang mungkin ditambahkan di masa depan, bukan dihapus.
