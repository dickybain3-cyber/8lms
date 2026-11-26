-- 0029_tryout_BATAL.sql
-- Membatalkan 0029_tryout.sql. Jalankan HANYA di project KELAS 9.
-- Aman dijalankan berulang.
--
-- YANG HILANG: SEMUA kegiatan berjenis tryout beserta paket, subtes, soal,
-- jawaban, nilai, dan log masuk tryout. Asesmen, kuis, tugas, forum tidak
-- tersentuh. Unduh rekap nilai tryout dulu bila masih dibutuhkan.

-- 1. Hapus data tryout (cascade: tryout_paket -> mapel -> soal/jawaban/nilai).
--    Trigger log (0009/0028) melewati penulisan tanpa sesi guru.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'event'
                and column_name = 'jenis') then
    delete from event where jenis = 'tryout';
  end if;
end;
$$;

-- 2. Policy, trigger, fungsi
drop policy if exists jawaban_tolak_tryout_insert on jawaban_siswa;
drop policy if exists jawaban_tolak_tryout_update on jawaban_siswa;

drop trigger if exists trg_atur_mapel_tryout on mapel;
drop trigger if exists trg_cegah_mapel_kelas_tryout on mapel_kelas;

drop function if exists public.tryout_nilai_saya();
drop function if exists public.tryout_rekap_nilai(uuid);
drop function if exists public.tryout_kumpulkan(uuid, uuid, uuid, jsonb);
drop function if exists public.tryout_simpan_jawaban(uuid, uuid, uuid, jsonb, smallint, integer);
drop function if exists public.tryout_soal(uuid, uuid, uuid);
drop function if exists public.tryout_mulai_subtes(uuid, uuid, uuid);
drop function if exists public.tryout_status_paket(uuid, uuid);
drop function if exists public.tryout_masuk_paket(uuid, uuid, text);
drop function if exists public.tryout_daftar_siswa(text);
drop function if exists public.tryout_cek_token(uuid, text, text);
drop function if exists public.tryout_tutup_kedaluwarsa(uuid, uuid);
drop function if exists public.tryout_validasi(uuid, uuid, uuid);
drop function if exists public.soal_tanpa_kunci(tipe_soal, jsonb);
drop function if exists public.atur_mapel_tryout();
drop function if exists public.cegah_mapel_kelas_tryout();
drop function if exists public.mapel_adalah_tryout(uuid);

-- 3. Tabel & kolom
drop table if exists public.tryout_gagal_token;
drop table if exists public.tryout_masuk;

drop index if exists public.uq_mapel_tryout_paket_subtes;
drop index if exists public.idx_mapel_tryout_paket_id;
alter table mapel drop constraint if exists mapel_tryout_subtes_format;
alter table mapel drop column if exists tryout_subtes;
alter table mapel drop column if exists tryout_paket_id;

drop table if exists public.tryout_paket;
drop function if exists public.sinkron_waktu_paket_ke_mapel();
drop function if exists public.cegah_paket_di_event_bukan_tryout();

-- 4. Kembalikan constraint & trigger 0018 seperti semula
alter table event drop constraint if exists event_tryout_kelas9;
alter table event drop constraint if exists event_jenis_check;
alter table event
  add constraint event_jenis_check
  check (jenis in ('asesmen_akhir', 'kuis_harian', 'assignment', 'forum'));

create or replace function cegah_mapel_di_event_bukan_ujian()
returns trigger
language plpgsql
as $$
declare
  v_jenis text;
begin
  select jenis into v_jenis from event where id = new.event_id;

  if v_jenis not in ('asesmen_akhir', 'kuis_harian') then
    raise exception
      'Event berjenis % tidak memakai mapel/soal — assignment memakai tabel tugas, forum memakai tabel forum_topik.',
      v_jenis;
  end if;

  return new;
end;
$$;

-- CEK AKHIR — harus menghasilkan 0 baris
select masalah from (
  select 'fungsi ' || p.proname || ' masih ada' as masalah
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and (p.proname like 'tryout\_%' escape '\'
          or p.proname in ('soal_tanpa_kunci', 'atur_mapel_tryout', 'cegah_mapel_kelas_tryout',
                           'mapel_adalah_tryout', 'sinkron_waktu_paket_ke_mapel',
                           'cegah_paket_di_event_bukan_tryout'))
  union all
  select 'tabel ' || t || ' masih ada'
    from unnest(array['tryout_paket', 'tryout_masuk', 'tryout_gagal_token']) t
   where to_regclass('public.' || t) is not null
  union all
  select 'kolom mapel.' || column_name || ' masih ada'
    from information_schema.columns
   where table_schema = 'public' and table_name = 'mapel'
     and column_name in ('tryout_paket_id', 'tryout_subtes')
  union all
  select 'policy ' || polname || ' masih ada'
    from pg_policy
   where polname in ('jawaban_tolak_tryout_insert', 'jawaban_tolak_tryout_update')
  union all
  select 'masih ada event berjenis tryout'
   where exists (select 1 from event where jenis = 'tryout')
  union all
  select 'event_jenis_check masih memuat tryout'
   where exists (select 1 from pg_constraint
                  where conname = 'event_jenis_check'
                    and pg_get_constraintdef(oid) like '%tryout%')
  union all
  select 'trigger 0018 masih mengizinkan tryout'
   where exists (select 1 from pg_proc
                  where proname = 'cegah_mapel_di_event_bukan_ujian' and prosrc like '%tryout%')
) cek;
