import type { TipeSoal } from "@/types";

/**
 * Label & urutan tampilan tipe soal — dipakai di tab pemilihan tipe (form
 * tambah soal) dan di badge ringkasan (halaman detail mapel).
 */
export const TIPE_SOAL_LIST: TipeSoal[] = [
  "pilgan_biasa",
  "pilgan_kompleks",
  "uraian_singkat",
  "benar_salah",
  "multi_benar_salah",
  "menjodohkan",
];

export const TIPE_LABEL: Record<TipeSoal, string> = {
  pilgan_biasa: "Pilihan Ganda",
  pilgan_kompleks: "Pilihan Ganda Kompleks",
  uraian_singkat: "Uraian Singkat",
  benar_salah: "Benar / Salah",
  multi_benar_salah: "Benar / Salah Bertingkat",
  menjodohkan: "Menjodohkan",
};

export const TIPE_DESKRIPSI: Record<TipeSoal, string> = {
  pilgan_biasa: "Beberapa opsi, tepat satu jawaban benar",
  pilgan_kompleks: "Beberapa opsi, bisa lebih dari satu jawaban benar",
  uraian_singkat: "Siswa mengetik jawaban singkat, dicocokkan kata kunci",
  benar_salah: "Satu pernyataan, jawaban Benar atau Salah",
  multi_benar_salah: "Beberapa pernyataan, tiap baris Benar/Salah sendiri",
  menjodohkan: "Menautkan pasangan antara dua kolom",
};

/**
 * Ambil ringkasan teks pertanyaan/instruksi dari konten_jsonb, dipakai untuk
 * preview di daftar soal (halaman detail mapel). Bentuk konten beda per
 * tipe (lihat docs/skema-database.md) — field teksnya bisa "pertanyaan"
 * atau "instruksi" tergantung tipe.
 *
 * Field teks polos (`pertanyaan`/`instruksi`) selalu diisi form, bahkan
 * untuk soal yang ditulis di editor kaya — jadi fungsi ini tidak perlu
 * menyentuh HTML sama sekali. Yang ditambahkan cuma satu hal: soal yang
 * isinya HANYA gambar tempelan punya teks kosong, dan barisnya akan
 * tampil sebagai "(belum ada teks pertanyaan)" di daftar soal seolah
 * soalnya belum digarap. Untuk kasus itu dikembalikan penanda bergambar
 * supaya guru bisa membedakan "soal gambar" dari "soal kosong".
 */
export function ringkasanKonten(konten: Record<string, unknown>): string {
  const teks = (
    (konten.pertanyaan as string | undefined) ??
    (konten.instruksi as string | undefined) ??
    ""
  ).trim();

  if (teks) return teks;

  const html =
    (konten.pertanyaan_html as string | undefined) ??
    (konten.instruksi_html as string | undefined) ??
    "";

  return /<img\b/i.test(html) ? "🖼 (soal berupa gambar)" : "";
}
