-- 0028_log_lewati_service_role.sql
-- Memperbaiki: "Gagal menghapus event: Hanya guru yang boleh mencatat aktivitas."
--
-- SEBAB: aksi admin (Bersih-bersih Data, hapus/ubah soal lintas jenjang,
-- hapus seluruh siswa) menulis lewat service_role. Trigger log di
-- event/mapel/soal memanggil catat_log_aktivitas(), yang menolak karena
-- auth.uid() kosong (service_role bukan "guru") -> SELURUH penghapusan
-- dibatalkan. Aksi admin itu sudah mencatat log-nya sendiri dari server.
--
-- PERBAIKAN: bila tidak ada user login (auth.uid() null = service_role /
-- SQL Editor), pencatatan DILEWATI, bukan error. Siswa tetap ditolak
-- (auth.uid() ada tapi bukan guru). Isi fungsi selain itu identik 0009.
--
-- Jalankan di KETIGA project (kelas 7, 8, 9). Idempoten.
-- Pembatalan: 0028_log_lewati_service_role_BATAL.sql

create or replace function catat_log_aktivitas(
  p_aksi text,
  p_entitas text,
  p_entitas_id uuid,
  p_detail jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guru_id   uuid;
  v_guru_nama text;
  v_id        uuid;
begin
  -- Tanpa user login (service_role dari server / SQL Editor): lewati.
  -- Server Action admin mencatat log-nya sendiri secara manual.
  if auth.uid() is null then
    return null;
  end if;

  -- Hanya guru yang boleh mencatat aktivitas (mencegah siswa mengotori log).
  if not is_guru() then
    raise exception 'Hanya guru yang boleh mencatat aktivitas.';
  end if;

  select id, nama into v_guru_id, v_guru_nama
  from guru where auth_id = auth.uid();

  insert into log_aktivitas (guru_id, aksi, entitas, entitas_id, detail_jsonb)
  values (
    v_guru_id,
    p_aksi,
    p_entitas,
    p_entitas_id,
    coalesce(p_detail, '{}'::jsonb) || jsonb_build_object('oleh_nama', v_guru_nama)
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- CEK AKHIR — harus menghasilkan 0 baris
select 'catat_log_aktivitas belum memakai versi 0028' as masalah
where not exists (
  select 1 from pg_proc
  where proname = 'catat_log_aktivitas'
    and prosrc like '%auth.uid() is null%'
);
