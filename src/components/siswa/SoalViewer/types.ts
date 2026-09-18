/**
 * Bentuk konten_jsonb versi SISWA (setelah di-strip field kunci jawaban
 * oleh RPC `get_soal_untuk_siswa`) + bentuk jawaban yang siswa susun.
 *
 * SENGAJA didefinisikan ulang di sini (bukan reuse tipe
 * `src/components/admin/SoalForm/types.ts`) — tipe admin punya field kunci
 * (`benar`, `jawaban_benar`, `kunci_jawaban`, `pasangan_benar`). Kalau
 * komponen siswa dibuat generic memakai tipe admin, sangat gampang suatu
 * saat "kebetulan" ada kode yang mencoba baca field kunci itu (walau di
 * data nyata sudah kosong dari RPC) — lebih aman kalau tipenya sendiri
 * memang tidak punya slot untuk field itu sama sekali.
 *
 * ── TAMBAHAN: field `*_html` ──
 *
 * Isi soal yang ditulis lewat editor kaya disimpan sebagai HTML di field
 * berakhiran `_html`, dengan teks polos turunannya tetap ada di field
 * lama. Semua field `_html` OPSIONAL: soal yang dibuat sebelum editor
 * kaya ada tidak punya field itu, dan `KontenKaya` otomatis jatuh ke
 * teks polos. Tidak ada migrasi data, dan tidak ada soal lama yang
 * berubah tampilannya.
 *
 * `_html` TIDAK perlu di-strip RPC: isinya persis isi yang memang
 * ditujukan untuk dibaca siswa — tidak ada kunci jawaban di dalamnya.
 */

export interface OpsiPilganSiswa {
  id: string;
  teks: string;
  teks_html?: string | null;
  gambar_url?: string | null;
}

export interface KontenPilganSiswa {
  pertanyaan: string;
  pertanyaan_html?: string | null;
  gambar_pertanyaan_url?: string | null;
  opsi: OpsiPilganSiswa[];
}

export interface KontenUraianSingkatSiswa {
  pertanyaan: string;
  pertanyaan_html?: string | null;
  gambar_pertanyaan_url?: string | null;
}

export interface KontenBenarSalahSiswa {
  pertanyaan: string;
  pertanyaan_html?: string | null;
  gambar_pertanyaan_url?: string | null;
}

export interface PernyataanMultiBSSiswa {
  id: string;
  teks: string;
  teks_html?: string | null;
  gambar_url?: string | null;
}

export interface KontenMultiBenarSalahSiswa {
  instruksi: string;
  instruksi_html?: string | null;
  gambar_pertanyaan_url?: string | null;
  pernyataan: PernyataanMultiBSSiswa[];
}

export interface ItemMenjodohkanSiswa {
  id: string;
  teks: string;
  teks_html?: string | null;
  gambar_url?: string | null;
}

export interface JawabanItemMenjodohkanSiswa {
  id: string;
  teks: string;
}

export interface KontenMenjodohkanSiswa {
  instruksi: string;
  instruksi_html?: string | null;
  gambar_pertanyaan_url?: string | null;
  soal: ItemMenjodohkanSiswa[];
  jawaban: JawabanItemMenjodohkanSiswa[];
}

// Bentuk jawaban yang disimpan per tipe, simetris dengan konten di atas —
// ini yang masuk ke `jawaban_siswa.jawaban_jsonb[soal_id]`.
export type JawabanPilganBiasa = string; // id opsi
export type JawabanPilganKompleks = string[]; // array id opsi
export type JawabanUraianSingkat = string;
export type JawabanBenarSalah = boolean;
export type JawabanMultiBenarSalah = Record<string, boolean>; // pernyataan_id -> benar/salah
export type JawabanMenjodohkan = Record<string, string>; // soal_id -> jawaban_id
