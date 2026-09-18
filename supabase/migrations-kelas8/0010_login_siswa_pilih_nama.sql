-- 0010_login_siswa_pilih_nama.sql
-- Login siswa SEMENTARA (uji coba Sabtu) diganti dari ketik
-- username+password manual, menjadi: pilih kelas -> pilih nama dari
-- daftar (modal "Pilih Nama" di LoginForm.tsx) -> masukkan tanggal
-- lahir sebagai pengganti password. Rencananya dikembalikan lagi ke
-- username+password manual sesudah uji coba selesai — lihat README.md
-- bagian Status untuk catatan itu, JANGAN hapus alur username+password
-- yang lama, RPC ini cuma tambahan berdampingan.
--
-- Supaya siswa bisa PILIH NAMA sebelum login (anon, belum ada
-- auth.uid()), butuh RPC baca-saja yang sengaja dibuka untuk role anon
-- — BUKAN akses langsung ke tabel `siswa` (RLS-nya mensyaratkan
-- auth.uid() sudah ada, lihat 0005_rls_policies.sql).
--
-- Yang dikembalikan CUMA nama + username (dipakai membentuk email
-- sintetis di client, sama seperti alur lama) — TIDAK ADA kolom
-- sensitif yang diekspos. Tanggal lahir TIDAK disimpan di kolom
-- manapun di database ini — dipakai LANGSUNG sebagai password akun
-- Supabase Auth siswa, dengan format digit "DDMMYYYY" (mis. lahir 14
-- Mei 2012 -> password "14052012"), diset MANUAL oleh admin lewat
-- Dashboard Supabase Auth saat bikin akun. Kalau login gagal, itu
-- berarti password akun ybs belum/tidak diset sesuai format ini.
--
-- Username memang sejak desain awal sudah dianggap "tidak rahasia"
-- (dulu dicetak di kertas dibagi ke siswa) — expose lewat RPC anon ini
-- sengaja diterima sebagai trade-off sementara, BUKAN kebocoran baru
-- yang setara dengan expose password/tanggal lahir.
--
-- p_kelas_nama:
--   - diisi (mis. '7.1') -> filter ke kelas itu saja. Dipakai untuk
--     jenjang 7 di form login, karena satu jenjang 7 = 6 kelas dengan
--     total siswa banyak, dipecah dulu per kelas supaya daftar nama
--     tidak kepanjangan buat di-scroll.
--   - NULL -> semua siswa di project ini digabung jadi satu daftar.
--     Dipakai untuk jenjang 8/9 di form login (cuma satu pilihan
--     "Kelas 8"/"Kelas 9" tanpa dipecah per sub-kelas 8.1-8.6/9.1-9.6).

create or replace function get_siswa_untuk_pilih_nama(p_kelas_nama text default null)
returns table (
  id       uuid,
  nama     text,
  username text
)
language sql
security definer
set search_path = public
stable
as $$
  select s.id, s.nama, s.username
  from siswa s
  join kelas k on k.id = s.kelas_id
  where p_kelas_nama is null or k.nama = p_kelas_nama
  order by s.nama;
$$;

comment on function get_siswa_untuk_pilih_nama is
  'Dipanggil ANON dari halaman login (LoginForm.tsx) untuk mengisi modal '
  '"Pilih Nama" siswa — sengaja bisa diakses sebelum auth.uid() ada. '
  'Cuma expose nama+username, TIDAK PERNAH kolom sensitif. Bagian dari '
  'alur login sementara (tanggal lahir sebagai password) untuk uji coba '
  'Sabtu — lihat README.md bagian Status.';
