-- 0023_login_siswa_username_BATAL.sql
-- Membatalkan OBJEK dari 0023_login_siswa_username.sql. Jalankan di project
-- yang ingin dibatalkan. Aman dijalankan berulang.
--
-- YANG TIDAK DIKEMBALIKAN:
--   - Username dan password yang sudah dibuat siapkan_akun_siswa() tetap
--     berlaku (password lama tidak tersimpan di mana pun, jadi tidak bisa
--     dipulihkan). Login tanggal lahir lama butuh password akun diset ulang.
--   - siswa.auth_id tetap boleh kosong: mengembalikan NOT NULL akan gagal
--     selama masih ada baris siswa yang belum punya akun auth. Kalau memang
--     perlu: hapus/isi dulu baris itu, lalu
--       alter table siswa alter column auth_id set not null;

drop trigger if exists trg_siswa_isi_username on siswa;
drop function if exists public.lms_isi_username_siswa();
drop function if exists public.siapkan_akun_siswa(text, boolean, boolean, text);
drop function if exists public.lms_username_siswa(text, uuid, uuid, text);
drop function if exists public.lms_username_bebas(text, uuid, uuid, text);
drop function if exists public.lms_suffix_email_siswa();
drop function if exists public.lms_password_siswa();
drop function if exists public.lms_username_dasar(text);

-- Buka lagi daftar nama untuk halaman login lama (pilih nama).
do $$
begin
  if to_regprocedure('public.get_siswa_untuk_pilih_nama(text)') is not null then
    grant execute on function public.get_siswa_untuk_pilih_nama(text) to anon, authenticated;
  end if;
end;
$$;

-- CEK AKHIR — harus menghasilkan 0 baris
select masalah from (
  select 'fungsi ' || p.proname || ' masih ada' as masalah
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('siapkan_akun_siswa', 'lms_username_siswa', 'lms_username_bebas',
                       'lms_suffix_email_siswa', 'lms_password_siswa', 'lms_username_dasar',
                       'lms_isi_username_siswa')
  union all
  select 'trigger trg_siswa_isi_username masih ada'
   where exists (select 1 from pg_trigger
                  where tgname = 'trg_siswa_isi_username'
                    and tgrelid = 'public.siswa'::regclass)
) cek;
