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

1. **Petunjuk**: topik (boleh banyak), jumlah per bentuk soal (6 baris), skor
   otomatis (total pas 100 atau angka lain), jumlah soal bergambar
   (kosong = otomatis maks. 20%), tingkat kesulitan, 4/5 opsi, catatan.
2. **Proses**: pesanan dipecah per bentuk soal (maks 5–15 butir per
   panggilan). Prompt dirakit di kode, jadi tidak ada panggilan AI tambahan.
   40 soal ≈ 5 panggilan.
3. **Tinjau**: setiap draf bisa diedit (teks, opsi, kunci, skor), dicoret,
   atau diganti ("Ganti"). Soal bergambar memilih sumber gambar:
   - **Diagram (AI teks)**: Gemini menulis SVG (angka/label akurat), dirender jadi PNG di browser.
   - **Ilustrasi (gratis)**: Pollinations (open source).
   - **Unggah sendiri** / tempel Ctrl+V.
   - **Tanpa gambar**.
4. **Simpan**: lewat `createSoal`/`createSoalAdmin` yang sama dengan form
   manual (validasi server, Bank Soal, log aktivitas ikut jalan).

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

1. Jalankan 0022 + isi minimal 1 kunci di Supabase kelas 7, login guru kelas 7.
2. Buka mapel → **Generate AI** → topik "Pecahan", PG 5, B/S 3, bergambar 2 → Generate.
3. Cek: skor per soal tampil, total 100. Di tinjauan, ubah satu kunci, coret satu soal.
4. Soal bergambar: klik **Diagram**, lalu pada soal lain **Ilustrasi**. Gambar harus muncul.
5. **Simpan** → daftar soal bertambah, total skor sesuai, Bank Soal ikut terisi.
6. **Pratinjau Ujian** → gambar tampil, kunci tidak terlihat.
7. Tugas → Buat Tugas → **Buat Lembar Kerja dengan AI** → judul & instruksi terisi.
8. Admin: buka mapel kelas 8 dengan `?jenjang=8` → generate memakai kunci kelas 8.

## Berkas

- `src/lib/ai/rencana-soal.ts`: skor, alokasi gambar, batch, prompt, normalisasi (murni, teruji)
- `src/lib/ai/gemini.ts`: klien Gemini + giliran kunci (server-only)
- `src/lib/ai/akses.ts`: penjaga sesi guru/jenjang + batas laju 80 permintaan/10 menit/guru
- `src/lib/ai/svg.ts`, `lembar-kerja.ts`, `gambar-klien.ts`
- `src/app/api/ai/{soal,diagram,gambar,lembar-kerja}/route.ts`
- `src/components/admin/AiSoal/{GeneratorSoalAi,KartuDraf,LembarKerjaAi}.tsx`
- Uji: `npx tsx src/lib/__tests__/ai-soal.test.ts`, `npx tsx src/lib/__tests__/ai-gemini.test.ts`
