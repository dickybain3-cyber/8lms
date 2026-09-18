-- 0007_scoring.sql
-- Koreksi otomatis (Sesi 5). Pendekatan: trigger Postgres, bukan Server
-- Action Next.js yang query soal.konten_jsonb lalu hitung di app server.
-- Alasan: (1) source of truth koreksi ada satu tempat (DB), tidak ada jalur
-- lain yang bisa "lupa" memicu koreksi; (2) kunci jawaban tidak pernah
-- perlu melewati proses Next.js sama sekali untuk kasus submit biasa —
-- konsisten dengan alasan RPC get_soal_untuk_siswa di 0006 (kunci jawaban
-- hanya boleh disentuh oleh fungsi security definer di DB); (3) submit
-- terjadi lewat UPDATE jawaban_siswa langsung dari client (Sesi 4), jadi
-- trigger AFTER UPDATE otomatis kepanggil tanpa perlu ubah kode client.

-- =============================================================================
-- hitung_nilai: koreksi satu (siswa, mapel), dipanggil trigger maupun manual.
-- =============================================================================
create or replace function hitung_nilai(p_siswa_id uuid, p_mapel_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jawaban_semua  jsonb;
  v_soal           record;
  v_jawaban_soal   jsonb;
  v_skor_soal      numeric;
  v_total          numeric := 0;
  v_detail         jsonb := '{}'::jsonb;
  v_correct_ids    text[];
  v_selected_ids   text[];
  v_total_bagian   integer;
  v_benar_bagian   integer;
  v_pernyataan     record;
  v_pasangan       jsonb;
  v_key            text;
begin
  -- Siswa cuma boleh memicu koreksi untuk dirinya sendiri (lewat trigger
  -- submit, di bawah); guru boleh memicu untuk siapa saja (dipakai tombol
  -- "Hitung Ulang Nilai" di /admin/nilai). Ini BUKAN untuk membatasi baca
  -- kunci jawaban (function ini tidak pernah mengembalikan kunci jawaban ke
  -- pemanggil), tapi supaya siswa tidak bisa memicu penghitungan ulang
  -- nilai siswa lain lewat RPC ini.
  if not is_guru() and p_siswa_id <> current_siswa_id() then
    raise exception 'Tidak berwenang menghitung nilai siswa lain.';
  end if;

  select jawaban_jsonb into v_jawaban_semua
  from jawaban_siswa
  where siswa_id = p_siswa_id and mapel_id = p_mapel_id;

  v_jawaban_semua := coalesce(v_jawaban_semua, '{}'::jsonb);

  for v_soal in
    select id, tipe, skor, konten_jsonb
    from soal
    where mapel_id = p_mapel_id
  loop
    v_jawaban_soal := v_jawaban_semua -> v_soal.id::text;
    v_skor_soal := 0;

    if v_jawaban_soal is not null and v_jawaban_soal <> 'null'::jsonb then
      case v_soal.tipe

        -- Tepat satu opsi benar. Skor penuh kalau opsi yang dipilih siswa
        -- ada di opsi yang bertanda benar, 0 kalau tidak.
        when 'pilgan_biasa' then
          if exists (
            select 1
            from jsonb_array_elements(v_soal.konten_jsonb -> 'opsi') opt
            where opt ->> 'id' = v_jawaban_soal #>> '{}'
              and (opt ->> 'benar')::boolean is true
          ) then
            v_skor_soal := v_soal.skor;
          end if;

        -- Semua-atau-tidak-sama-sekali: opsi yang dipilih siswa harus PERSIS
        -- sama dengan himpunan opsi benar (tidak kurang, tidak lebih).
        -- Keputusan desain: tidak ada partial credit di sini, supaya siswa
        -- tidak diuntungkan mencentang semua opsi untuk menjamin sebagian
        -- skor — soal kompleks memang menguji ketepatan himpunan jawaban.
        when 'pilgan_kompleks' then
          select array_agg(opt ->> 'id' order by opt ->> 'id')
            into v_correct_ids
            from jsonb_array_elements(v_soal.konten_jsonb -> 'opsi') opt
            where (opt ->> 'benar')::boolean is true;

          select array_agg(val order by val)
            into v_selected_ids
            from jsonb_array_elements_text(v_jawaban_soal) val;

          if v_correct_ids is not null
             and v_selected_ids is not null
             and v_correct_ids = v_selected_ids then
            v_skor_soal := v_soal.skor;
          end if;

        -- Cocok kalau jawaban siswa MENGANDUNG salah satu kata kunci,
        -- case-insensitive. Keputusan desain: "mengandung salah satu kata
        -- kunci" (bukan harus mengandung semua) supaya kunci_jawaban bisa
        -- diisi guru sebagai daftar sinonim/variasi jawaban yang diterima
        -- (mis. ["fotosintesis", "photosynthesis"]), bukan daftar kata
        -- wajib yang semuanya harus muncul.
        when 'uraian_singkat' then
          if exists (
            select 1
            from jsonb_array_elements_text(v_soal.konten_jsonb -> 'kunci_jawaban') kw
            where kw <> ''
              and lower(coalesce(v_jawaban_soal #>> '{}', '')) like '%' || lower(kw) || '%'
          ) then
            v_skor_soal := v_soal.skor;
          end if;

        -- Cocok exact boolean.
        when 'benar_salah' then
          if (v_jawaban_soal #>> '{}')::boolean = (v_soal.konten_jsonb ->> 'jawaban_benar')::boolean then
            v_skor_soal := v_soal.skor;
          end if;

        -- Skor proporsional: skor soal dibagi rata per pernyataan, siswa
        -- dapat bagian untuk tiap pernyataan yang jawaban Benar/Salah-nya
        -- cocok (partial credit, beda dengan pilgan_kompleks di atas —
        -- keputusan desain: di sini tiap pernyataan independen, jadi wajar
        -- dinilai independen juga).
        when 'multi_benar_salah' then
          v_total_bagian := 0;
          v_benar_bagian := 0;

          for v_pernyataan in
            select
              p ->> 'id' as pid,
              (p ->> 'jawaban_benar')::boolean as benar
            from jsonb_array_elements(v_soal.konten_jsonb -> 'pernyataan') p
          loop
            v_total_bagian := v_total_bagian + 1;
            if (v_jawaban_soal ? v_pernyataan.pid)
               and (v_jawaban_soal ->> v_pernyataan.pid)::boolean = v_pernyataan.benar then
              v_benar_bagian := v_benar_bagian + 1;
            end if;
          end loop;

          if v_total_bagian > 0 then
            v_skor_soal := v_soal.skor * v_benar_bagian::numeric / v_total_bagian;
          end if;

        -- Skor proporsional per pasangan yang benar, dari total pasangan
        -- yang didefinisikan guru di pasangan_benar (bukan dari jumlah
        -- "soal"/"jawaban" yang mungkin lebih banyak dari pasangan valid).
        when 'menjodohkan' then
          v_pasangan := v_soal.konten_jsonb -> 'pasangan_benar';
          v_total_bagian := 0;
          v_benar_bagian := 0;

          for v_key in select jsonb_object_keys(coalesce(v_pasangan, '{}'::jsonb))
          loop
            v_total_bagian := v_total_bagian + 1;
            if (v_jawaban_soal ? v_key)
               and (v_jawaban_soal ->> v_key) = (v_pasangan ->> v_key) then
              v_benar_bagian := v_benar_bagian + 1;
            end if;
          end loop;

          if v_total_bagian > 0 then
            v_skor_soal := v_soal.skor * v_benar_bagian::numeric / v_total_bagian;
          end if;

        else
          v_skor_soal := 0;
      end case;
    end if;

    v_total := v_total + v_skor_soal;
    v_detail := v_detail || jsonb_build_object(v_soal.id::text, round(v_skor_soal, 2));
  end loop;

  insert into nilai (siswa_id, mapel_id, total_skor, detail_jsonb, is_override, dihitung_at)
  values (p_siswa_id, p_mapel_id, round(v_total, 2), v_detail, false, now())
  on conflict (siswa_id, mapel_id) do update
    set total_skor = excluded.total_skor,
        detail_jsonb = excluded.detail_jsonb,
        is_override = false,
        dihitung_at = now();
end;
$$;

comment on function hitung_nilai is
  'Koreksi otomatis satu (siswa, mapel): baca soal.konten_jsonb (kunci '
  'jawaban asli) + jawaban_siswa.jawaban_jsonb, cocokkan per tipe, upsert '
  'ke nilai. security definer supaya siswa (pemilik trigger submit) tetap '
  'bisa memicu ini walau tidak punya akses SELECT ke soal.konten_jsonb.';

-- =============================================================================
-- Kolom tambahan `nilai.is_override` — menandai baris yang skornya sudah
-- ditimpa manual oleh guru (lihat /admin/nilai), supaya UI bisa membedakan
-- "hasil koreksi otomatis" vs "sudah ditinjau & diubah guru".
-- =============================================================================
alter table nilai add column if not exists is_override boolean not null default false;

-- =============================================================================
-- Trigger: begitu jawaban_siswa.submitted_at diisi (submit manual maupun
-- auto-submit waktu habis, dua-duanya dari Sesi 4 lewat UPDATE biasa dari
-- client), langsung panggil hitung_nilai. Sisi client tidak perlu tahu
-- trigger ini ada sama sekali.
-- =============================================================================
create or replace function trg_hitung_nilai_on_submit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.submitted_at is not null and old.submitted_at is null then
    perform hitung_nilai(new.siswa_id, new.mapel_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_jawaban_siswa_scoring on jawaban_siswa;
create trigger trg_jawaban_siswa_scoring
  after update on jawaban_siswa
  for each row
  execute function trg_hitung_nilai_on_submit();

-- =============================================================================
-- hitung_ulang_semua_nilai: dipanggil tombol "Hitung Ulang Nilai" di
-- /admin/nilai — guru saja. Berguna kalau guru mengedit soal/kunci jawaban
-- SETELAH ada siswa yang submit (nilai lama tidak otomatis ter-update,
-- sesuai catatan di PROMPT-SESI-5.md). Hanya menghitung ulang siswa yang
-- SUDAH submit; belum ada mekanisme re-scoring otomatis saat guru mengedit
-- soal — ini tombol manual, bukan trigger di tabel `soal`.
-- =============================================================================
create or replace function hitung_ulang_semua_nilai(p_mapel_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row   record;
  v_count integer := 0;
begin
  if not is_guru() then
    raise exception 'Hanya guru yang boleh menghitung ulang nilai secara massal.';
  end if;

  for v_row in
    select siswa_id
    from jawaban_siswa
    where mapel_id = p_mapel_id and submitted_at is not null
  loop
    perform hitung_nilai(v_row.siswa_id, p_mapel_id);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function hitung_ulang_semua_nilai is
  'Hitung ulang nilai semua siswa yang sudah submit di satu mapel. '
  'Menimpa is_override manual yang ada (guru memanggil ini secara sadar).';
