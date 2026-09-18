-- 0006_soal_siswa_rpc.sql
-- Siswa mengambil soal lewat RPC ini, BUKAN lewat SELECT langsung ke
-- tabel `soal` (yang memang sengaja tidak diberi policy SELECT untuk
-- siswa di 0005). Fungsi ini men-strip field kunci jawaban dari
-- konten_jsonb sebelum mengembalikan data, per tipe soal.

create or replace function get_soal_untuk_siswa(p_mapel_id uuid)
returns table (
  id uuid,
  tipe tipe_soal,
  urutan integer,
  skor numeric,
  konten_jsonb jsonb,
  gambar_url text
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  -- Validasi: mapel harus ditarget ke kelas siswa yang memanggil, dan
  -- jadwal ujian sudah berlangsung.
  if not exists (
    select 1
    from mapel m
    join mapel_kelas mk on mk.mapel_id = m.id
    where m.id = p_mapel_id
      and mk.kelas_id = current_siswa_kelas_id()
      and now() between m.waktu_mulai and m.waktu_selesai
  ) then
    raise exception 'Ujian tidak tersedia untuk diakses saat ini.';
  end if;

  return query
  select
    s.id,
    s.tipe,
    s.urutan,
    s.skor,
    case s.tipe
      when 'pilgan_biasa' then
        jsonb_set(
          s.konten_jsonb, '{opsi}',
          (select jsonb_agg(opt - 'benar') from jsonb_array_elements(s.konten_jsonb->'opsi') opt)
        )
      when 'pilgan_kompleks' then
        jsonb_set(
          s.konten_jsonb, '{opsi}',
          (select jsonb_agg(opt - 'benar') from jsonb_array_elements(s.konten_jsonb->'opsi') opt)
        )
      when 'uraian_singkat' then
        s.konten_jsonb - 'kunci_jawaban'
      when 'benar_salah' then
        s.konten_jsonb - 'jawaban_benar'
      when 'multi_benar_salah' then
        jsonb_set(
          s.konten_jsonb, '{pernyataan}',
          (select jsonb_agg(p - 'jawaban_benar') from jsonb_array_elements(s.konten_jsonb->'pernyataan') p)
        )
      when 'menjodohkan' then
        s.konten_jsonb - 'pasangan_benar'
      else
        s.konten_jsonb
    end as konten_jsonb,
    s.gambar_url
  from soal s
  where s.mapel_id = p_mapel_id
  order by s.urutan;
end;
$$;

comment on function get_soal_untuk_siswa is
  'Dipanggil siswa lewat supabase.rpc("get_soal_untuk_siswa", { p_mapel_id }). '
  'Mengembalikan soal tanpa kunci jawaban. Jangan pernah expose SELECT '
  'langsung ke tabel soal untuk role siswa.';
