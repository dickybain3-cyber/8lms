# Fitur Generate Soal & Lembar Kerja dengan AI

## Ringkas

| Tempat | Tombol | Hasil |
|---|---|---|
| Detail mapel (Asesmen Akhir / Kuis Harian) | **Generate AI** (di samping "Tambah Soal") | Draf soal 6 bentuk → ditinjau → disimpan |
| Halaman Tambah Soal | Kartu **Generate soal dengan AI** | sama |
| Form Tugas (baru & edit) | **Buat Lembar Kerja dengan AI** | Mengisi judul + instruksi (LKPD/praktikum/proyek/latihan/literasi) |
| Forum | — | Tidak ada: form forum tidak punya kolom teks untuk diisi |

Hasil AI **tidak pernah tersimpan otomatis**. Guru selalu meninjau dulu.

## Alur soal (asesmen/kuis)

Dua pintu, satu komponen (`GeneratorSoalAi`):
- **Mapel kegiatan** → Tambah soal → "Generate dengan AI" (jendela).
- **Sidebar → Kegiatan → Buat Soal AI** (`/admin/soal-ai`): tidak terikat
  mapel; guru mengetik nama mapel, hasil ke Bank Soal dan/atau diunduh.

1. **Petunjuk**: topik; **jumlah soal** lalu sebaran ke 6 bentuk (− / +
   memindahkan soal antar bentuk, total tetap); **pertanyaan pemandu**
   (tujuan pembelajaran, untuk asesmen apa, level kognitif C1–C6, pakai
   stimulus AKM); **contoh soal** (unggah .docx/.pdf/.xlsx/.txt/foto →
   `/api/ai/ekstrak` mengubahnya jadi teks, bisa dirapikan); detail
   tambahan (gambar, kesulitan, 4/5 opsi, total skor, detail lain).
2. **Proses**: memakai **1 kuota harian** → tiket → pesanan dipecah per
   bentuk soal (maks 5–15 butir per panggilan).
3. **Hasil**: **Preview soal** (kuis, `SoalViewer` siswa + tombol Periksa)
   atau **Lihat draf soal** (naskah dokumen + lembar kunci). → Next.
4. **Edit soal** (form yang sama dengan buat soal manual, per soal; siapkan
   gambar dulu: Diagram AI / Ilustrasi gratis / Unggah / Tanpa gambar) atau
   **Lanjutkan**.
5. **Simpan**: **Simpan ke Bank Soal** (beri nama paket → `bank_soal.paket_nama`)
   dan/atau **Unduh** (.doc naskah + kunci, .doc naskah siswa, Cetak/PDF).
6. (Mapel kegiatan saja) **Masukkan ke ujian** atau **Tutup**. Masukkan =
   `createSoal` yang sama dengan form manual. Kalau paket sudah disimpan ke
   bank di langkah 5, salinan otomatis ke bank dilewati (`lewati_bank=1`).

### Pustaka konversi dokumen

- **mammoth** (npm) untuk .docx → teks; **exceljs** (sudah ada) untuk .xlsx.
- PDF dan foto dikirim ke **Gemini** sebagai berkas (multimodal) — ikut
  menangani PDF hasil pindai yang tidak punya lapisan teks.
- Dipertimbangkan tapi tidak dipakai: microsoft/markitdown (Python, butuh
  runtime terpisah di server), pdf-parse/unpdf (tidak bisa membaca PDF pindai).
- Teks contoh dibatasi 6.000 karakter karena ikut ke setiap prompt batch.

### Kuota harian (migrasi 0025)

- Guru biasa: **1 kali generate per hari** (tanggal WIB). Admin tidak dibatasi.
- Kuota habis → guru menekan "Minta ke admin" (boleh dengan alasan).
- Admin melihat notifikasi di **Dashboard** (ketiga jenjang): Setujui = +1
  kali untuk hari itu, Tolak = tetap habis.
- Satu kuota = satu tiket (`ai_sesi_generate`): berlaku 3 jam, jumlah
  panggilan = jumlah batch + 15 (untuk tombol "Ganti"). Route
  `/api/ai/soal` menolak panggilan tanpa tiket yang sah.
- Tabel kuota RLS tanpa policy (service_role saja). Migrasi belum jalan →
  guru biasa ditolak dengan pesan yang menyebut 0025; admin tetap bisa.

Semua gambar berakhir di **Cloudinary jenjang** (jalur `prosesDanUnggah`),
sama seperti gambar tempelan. Ujian tidak bergantung ke layanan AI.

Draf disimpan sementara di `localStorage` per mapel; menutup jendela tidak
membuang hasil generate.

"Pembahasan" dari AI hanya tampil ke guru dan **tidak disimpan**: RPC
`get_soal_untuk_siswa` hanya membuang field kunci yang dikenalnya, jadi
field tambahan di `konten_jsonb` akan terkirim ke HP siswa.

## Memasang kunci API (di Supabase, per kelas)

1. Di project Supabase **kelas 7**, buka SQL Editor, jalankan
   `supabase/migrations-baru/0022_ai_kunci.sql`. Hasil "CEK AKHIR" harus 0 baris.
2. Masih di SQL Editor, isi kuncinya (ganti teks KUNCI_... dengan kunci asli dari
   aistudio.google.com → Get API key):

   ```sql
   insert into ai_kunci (penyedia, kunci, label) values
     ('gemini', 'KUNCI_1', 'akun 1'),
     ('gemini', 'KUNCI_2', 'akun 2')
     -- ... sampai 10
   on conflict (penyedia, kunci) do nothing;
   ```
3. Ulangi langkah 1-2 di project **kelas 8** dan **kelas 9** dengan kunci masing-masing.
4. Tidak perlu deploy ulang. Kunci baru terbaca paling lambat 5 menit.

Tabel ini RLS aktif **tanpa policy**: guru/siswa tidak bisa membacanya, hanya
server (service_role). Nonaktifkan kunci: `update ai_kunci set aktif = false where label = 'akun 2';`
Batalkan seluruhnya: `0022_ai_kunci_BATAL.sql`.

Kunci dipakai bergiliran. Kunci yang kena batas (429) diistirahatkan 65 detik,
kunci salah 30 menit, lalu langsung pindah ke kunci berikutnya.

### Alternatif lewat environment server (opsional)

`GEMINI_API_KEYS_7`, `_8`, `_9` (dipisah koma), `GEMINI_MODEL` (default
`gemini-flash-latest`, selalu model Flash terbaru), `GEMINI_MODEL_CADANGAN`,
`POLLINATIONS_TOKEN`. Kunci dari env dan dari tabel digabung.

## Batas generator ilustrasi gratis (dicek 21 Okt 2026)

- `image.pollinations.ai` tanpa kunci: **1 gambar / 45 detik / IP**.
  Tanpa token, browser guru mengambil gambarnya langsung (IP sekolah/HP),
  bukan server hosting yang IP-nya dipakai bersama. Tombol "Buat N gambar"
  otomatis memberi jeda 46 detik di antara ilustrasi.
- Dengan `POLLINATIONS_TOKEN`, server memakai `gen.pollinations.ai` dan
  jedanya 3 detik. Cek sendiri biaya/kuota "pollen" di enter.pollinations.ai.
- Diagram (grafik, bangun, tabel) memakai Gemini, bukan Pollinations, jadi
  tidak kena batas itu.

## Uji manual untuk pemilik

1. Jalankan 0022 (+ isi kunci) dan **0025_ai_kuota.sql** di ketiga project (CEK AKHIR 0 baris).
2. Login guru biasa kelas 7 → mapel → Tambah soal → **Generate dengan AI**.
3. Isi topik "Pecahan", jumlah soal 10, pindahkan 3 ke Benar/Salah pakai − / +.
   Isi tujuan pembelajaran, pilih C3, unggah contoh soal .docx → teks muncul.
4. Generate → di Hasil coba **Preview soal** (jawab, Periksa) dan **Lihat draf soal**.
5. Next → **Edit soal** → Edit satu soal (tebalkan teks, ubah kunci) → Selesai edit → Lanjutkan.
6. **Simpan ke Bank Soal** dengan nama paket → cek Bank Soal: tampil "paket …".
   **Unduh** .doc → buka di Word.
7. Next → **Masukkan ke ujian** → daftar soal bertambah; Bank Soal TIDAK dobel.
8. Buka generator lagi → kuota habis → **Minta ke admin**.
9. Login admin → Dashboard → notifikasi → **Setujui** → guru bisa generate sekali lagi.
10. Sidebar → **Buat Soal AI** → isi nama mapel → alur sama, berhenti di Simpan/Unduh.
11. Tugas → Buat Tugas → **Buat Lembar Kerja dengan AI** → judul & instruksi terisi.

## Berkas

- `src/lib/ai/rencana-soal.ts`: skor, alokasi gambar, batch, prompt, normalisasi (murni, teruji)
- `src/lib/ai/gemini.ts`: klien Gemini + giliran kunci (server-only)
- `src/lib/ai/akses.ts`: penjaga sesi guru/jenjang + batas laju 80 permintaan/10 menit/guru
- `src/lib/ai/svg.ts`, `lembar-kerja.ts`, `gambar-klien.ts`
- `src/lib/ai/kuota.ts`: kuota harian, tiket, permintaan (server-only); aksi di `src/app/admin/soal-ai/actions.ts`
- `src/lib/ai/draf.ts`: konten final, periksa jawaban kuis, naskah dokumen (murni, teruji)
- `src/lib/validasi-soal.ts`: validasi `konten_jsonb` bersama (form manual + simpan paket ke bank)
- `src/app/api/ai/{soal,ekstrak,diagram,gambar,lembar-kerja}/route.ts`
- `src/components/admin/AiSoal/{GeneratorSoalAi,KartuDraf,PreviewKuis,DokumenDraf,LembarKerjaAi}.tsx`
- `src/components/admin/PermintaanKuotaAi.tsx` (dashboard admin), `src/app/admin/soal-ai/page.tsx` (sidebar)
- Migrasi: `supabase/migrations-baru/0025_ai_kuota.sql` (+ `_BATAL`)
- Uji: `npx tsx src/lib/__tests__/ai-soal.test.ts`, `ai-draf.test.ts`, `ai-gemini.test.ts`
