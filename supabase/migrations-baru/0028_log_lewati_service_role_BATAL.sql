-- 0028_log_lewati_service_role_BATAL.sql
-- Mengembalikan catat_log_aktivitas ke versi 0009 (menolak tanpa user login).
-- PERHATIAN: setelah ini, Bersih-bersih Data & aksi admin lintas jenjang
-- akan gagal lagi dengan "Hanya guru yang boleh mencatat aktivitas."

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
select 'catat_log_aktivitas masih versi 0028' as masalah
where exists (
  select 1 from pg_proc
  where proname = 'catat_log_aktivitas'
    and prosrc like '%auth.uid() is null%'
);
