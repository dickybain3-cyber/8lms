/**
 * Bentuk konten_jsonb per tipe soal. HARUS sinkron dengan komentar SQL di
 * supabase/migrations-kelas{7,8,9}/0003_soal.sql (identik di ketiga
 * folder sejak Sesi 16) dan docs/skema-database.md — jangan ubah bentuk
 * di sini tanpa mengubah semuanya juga.
 *
 * ── TAMBAHAN: field `*_html` ──
 *
 * Sejak kolom pertanyaan & opsi memakai editor kaya (tebal/miring/rata/
 * gambar sebaris), isinya adalah HTML. HTML itu disimpan di field BARU
 * yang berakhiran `_html`, sementara field teks lama (`pertanyaan`,
 * `teks`, `instruksi`) TETAP DIISI dengan teks polos turunannya.
 *
 * Kenapa dua-duanya, bukan mengganti field lama saja:
 *
 *   1. Tidak ada migrasi data. Soal yang sudah ada tidak punya `_html`,
 *      dan field itu opsional — soal lama tetap tampil apa adanya. Ini
 *      bukan kerapian belaka: soal-soal itu sudah dipakai ujian dan
 *      nilainya sudah tercatat.
 *   2. Tidak ada kode lain yang perlu diubah. Validasi server, preview
 *      di daftar soal, ekspor Excel, dan pencocokan kunci jawaban
 *      uraian singkat semuanya membaca field teks lama dan terus
 *      bekerja tanpa tahu-menahu soal HTML.
 *   3. Pencarian & pembacaan manusia. `pertanyaan` yang berisi HTML
 *      mentah tidak terbaca di dashboard Supabase dan tidak bisa
 *      dicari dengan `ilike`.
 *
 * Aturannya satu: `pertanyaan` SELALU merupakan hasil `htmlKeTeks()` dari
 * `pertanyaan_html`. Jangan pernah menulis salah satunya sendirian.
 */

export interface OpsiPilgan {
  id: string;
  teks: string;
  /** HTML opsi (boleh memuat gambar sebaris). Turunan teksnya ada di `teks`. */
  teks_html?: string | null;
  gambar_url?: string | null;
  benar: boolean;
}

export interface KontenPilgan {
  pertanyaan: string;
  pertanyaan_html?: string | null;
  gambar_pertanyaan_url?: string | null;
  opsi: OpsiPilgan[];
}

export interface KontenUraianSingkat {
  pertanyaan: string;
  pertanyaan_html?: string | null;
  gambar_pertanyaan_url?: string | null;
  /** Kunci jawaban SENGAJA tetap teks polos — ini dicocokkan string,
   *  bukan ditampilkan. Memberinya format hanya akan membuat pencocokan
   *  gagal karena tag ikut terbawa. */
  kunci_jawaban: string[];
}

export interface KontenBenarSalah {
  pertanyaan: string;
  pertanyaan_html?: string | null;
  gambar_pertanyaan_url?: string | null;
  jawaban_benar: boolean;
}

export interface PernyataanMultiBS {
  id: string;
  teks: string;
  teks_html?: string | null;
  jawaban_benar: boolean;
}

export interface KontenMultiBenarSalah {
  instruksi: string;
  instruksi_html?: string | null;
  gambar_pertanyaan_url?: string | null;
  pernyataan: PernyataanMultiBS[];
}

export interface ItemMenjodohkan {
  id: string;
  teks: string;
  teks_html?: string | null;
  gambar_url?: string | null;
}

export interface JawabanMenjodohkan {
  id: string;
  teks: string;
  teks_html?: string | null;
}

export interface KontenMenjodohkan {
  instruksi: string;
  instruksi_html?: string | null;
  gambar_pertanyaan_url?: string | null;
  soal: ItemMenjodohkan[];
  jawaban: JawabanMenjodohkan[];
  pasangan_benar: Record<string, string>;
}

export function buatId(prefix: string): string {
  return `${prefix}${Math.random().toString(36).slice(2, 8)}`;
}
