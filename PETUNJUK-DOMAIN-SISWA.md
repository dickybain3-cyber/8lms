# Domain Khusus Guru (siswa wajib lewat ExamSafer)

`8lms.vercel.app` tetap bisa dipakai guru/admin. Siswa ditolak di sana dan
hanya bisa masuk lewat domain baru yang tertanam di ExamSafer.

## Langkah (urut)

1. Vercel → Project → Settings → Domains → Add: domain baru acak, mis.
   `smpn8-ujian-x7k2.vercel.app`. Jangan dibagikan ke siapa pun.
2. Supabase (ketiga project 7, 8, 9) → Authentication → URL Configuration:
   tambahkan domain baru di Redirect URLs (bila daftar itu dipakai).
3. Ganti URL ExamSafer ke domain baru. Uji login siswa lewat ExamSafer.
4. Vercel → Settings → Environment Variables (Production):
   `NEXT_PUBLIC_HOST_KHUSUS_GURU` = `8lms.vercel.app`
   (boleh beberapa, pisah koma).
5. Redeploy (env NEXT_PUBLIC ditanam saat build; tanpa redeploy tidak aktif).

Urutan penting: langkah 4–5 SETELAH ExamSafer pindah ke domain baru, kalau
tidak siswa di ExamSafer lama ikut tertolak.

## Perilaku

- Di domain khusus guru, tab Siswa menolak login dengan pesan
  "Siswa tidak bisa masuk lewat alamat ini. Buka LMS lewat aplikasi ExamSafer."
- Akun siswa yang diketik di tab Guru juga ditolak (sesi langsung ditutup).
- Siswa yang SUDAH login di domain lama dikeluarkan pada perpindahan halaman
  berikutnya dan diarahkan ke halaman login dengan pesan yang sama.
- Guru/admin tidak terpengaruh di domain mana pun.
- Tryout kelas 9 (`/tryout`) TIDAK diblokir: memang publik untuk dikerjakan
  dari rumah, tanpa login.
- Env kosong = fitur mati, perilaku sama seperti sebelumnya.

## Bila domain siswa bocor

Tambah domain acak baru di Vercel, ganti URL ExamSafer, lalu tambahkan
domain bocor ke `NEXT_PUBLIC_HOST_KHUSUS_GURU` (pisah koma) dan redeploy.

## Uji manual

1. Di `8lms.vercel.app/kelas8`: login siswa → ditolak dengan pesan di atas.
2. Di `8lms.vercel.app/kelas8`: login guru → masuk /admin normal.
3. Di domain baru (ExamSafer): login siswa → masuk /siswa, ujian normal.
4. Siswa yang login di domain lama sebelum env aktif: setelah redeploy,
   buka halaman apa pun → keluar ke login dengan pesan.
