# Login siswa: username + password

Login siswa tidak lagi "pilih kelas → pilih nama → ketik tanggal". Sekarang:

| | Contoh | Aturan |
|---|---|---|
| Username | `rizki`, `rizkip`, `rizki2` | Dari nama, maks. 8 huruf + inisial/angka bila kembar. Kata depan "Muhammad/Moh./M./Siti" dilompati. |
| Password | `kmr482` | Acak 3 huruf kecil + 3 angka (tanpa huruf i, l, o). |

Aturannya ada di `src/lib/akun.ts` dan disalin persis di SQL 0023.

## Cara pasang (lakukan sekaligus, di LUAR jam ujian)

1. Deploy aplikasi versi ini.
2. Di SQL Editor **ketiga** project (kelas 7, 8, 9), jalankan
   `supabase/migrations-baru/0023_login_siswa_username.sql`.
   Baris terakhir (CEK AKHIR) harus **0 baris**.
3. Masih di SQL Editor tiap project, buat akun semua siswa:

   ```sql
   select * from siapkan_akun_siswa();
   ```

   Hasilnya: `kelas | nama | username | password`. Klik **Export → CSV** dan
   simpan. Password hanya tampil sekali ini (setelahnya cuma tersimpan
   sebagai hash). Sesi login lama siswa ikut diputus.

4. Bagikan username + password ke siswa (kartu/WhatsApp per kelas).

Langkah 2 langsung menutup daftar nama di halaman login lama, jadi langkah
1-3 jangan dipisah jauh.

## Perintah lain

```sql
-- satu kelas saja
select * from siapkan_akun_siswa(p_kelas => '7.1');

-- password satu kelas hilang: buat ulang, username tetap
select * from siapkan_akun_siswa(p_kelas => '7.1', p_ulang => true, p_pertahankan_username => true);

-- tambah siswa baru lewat SQL (username terisi otomatis), lalu buatkan akunnya
insert into siswa (nama, kelas_id) select 'Ahmad Fauzi', id from kelas where nama = '7.1';
select * from siapkan_akun_siswa();
```

Menjalankan `siapkan_akun_siswa()` berulang tanpa `p_ulang` aman: akun yang
sudah dibuat tidak disentuh.

## Panel admin (/admin/siswa)

- **Tambah Siswa Manual**: cukup nama + kelas; username boleh dikosongkan.
- **Import Excel**: kolom Nama, Kelas, Username (opsional). Unduh CSV hasil
  untuk password-nya.
- **Reset password**: menghasilkan password baru berpola sama.

Kalau di Supabase **Authentication → Providers → Email** syarat password
dinaikkan (lebih dari 6 karakter, wajib huruf besar/simbol), panel admin
akan gagal membuat akun. Jalur SQL tidak terpengaruh.

## Pembatalan

`0023_login_siswa_username_BATAL.sql` menghapus fungsi/trigger dan membuka
lagi daftar nama. Username/password yang sudah dibuat tetap berlaku.
