/**
 * Lembar Kerja (untuk kegiatan Tugas) — bagian murni, dipakai route
 * `/api/ai/lembar-kerja` dan diuji tanpa jaringan.
 *
 * Kolom "Instruksi untuk siswa" di form Tugas adalah TEKS POLOS yang
 * baris barunya dipertahankan, jadi hasil AI disusun jadi teks berpoin
 * biasa — bukan HTML/Markdown yang akan tampil sebagai simbol mentah.
 */

import { rapikanTeks } from "@/lib/ai/rencana-soal";

export const JENIS_LK = {
  lkpd: {
    label: "LKPD (Lembar Kerja Peserta Didik)",
    arahan: "Bentuk LKPD: tujuan, langkah kegiatan bertahap, lalu pertanyaan analisis.",
  },
  praktikum: {
    label: "Lembar Kerja Praktikum",
    arahan: "Bentuk praktikum sederhana: alat & bahan aman, langkah percobaan, tabel pengamatan (dijelaskan dalam teks), pertanyaan kesimpulan.",
  },
  proyek: {
    label: "Tugas Proyek",
    arahan: "Bentuk proyek kecil 1-2 minggu: tujuan, tahapan kerja, produk yang dihasilkan, pertanyaan refleksi.",
  },
  latihan: {
    label: "Lembar Latihan Soal",
    arahan: "Bentuk latihan: petunjuk singkat lalu daftar soal uraian bertingkat dari mudah ke sulit.",
  },
  literasi: {
    label: "Lembar Kerja Literasi",
    arahan: "Bentuk literasi: siswa membaca/mencari sumber tentang topik, merangkum, lalu menjawab pertanyaan pemahaman dan opini.",
  },
} as const;

export type JenisLembarKerja = keyof typeof JENIS_LK;

/** Batas panjang judul di form Tugas (`maxLength={200}`). */
const MAKS_JUDUL = 200;

function daftar(x: unknown, maks = 15): string[] {
  return Array.isArray(x)
    ? x.map((s) => rapikanTeks(s, 500).replace(/^\s*(?:\d+[.)]|[-•*])\s*/, "")).filter(Boolean).slice(0, maks)
    : [];
}

export function susunLembarKerja(
  raw: Record<string, unknown> | null | undefined
): { judul: string; deskripsi: string } | null {
  if (!raw) return null;
  const judul = rapikanTeks(raw.judul, MAKS_JUDUL);
  const tujuan = daftar(raw.tujuan, 6);
  const alat = daftar(raw.alat_bahan, 12);
  const langkah = daftar(raw.langkah, 15);
  const pertanyaan = daftar(raw.pertanyaan, 15);
  const kriteria = daftar(raw.kriteria, 8);
  const pengumpulan = rapikanTeks(raw.pengumpulan, 600);

  if (!judul || (langkah.length === 0 && pertanyaan.length === 0)) return null;

  const bagian: string[] = [];
  if (tujuan.length) bagian.push(`TUJUAN\n${tujuan.map((t) => `- ${t}`).join("\n")}`);
  if (alat.length) bagian.push(`ALAT DAN BAHAN\n${alat.map((t) => `- ${t}`).join("\n")}`);
  if (langkah.length)
    bagian.push(`LANGKAH KERJA\n${langkah.map((t, i) => `${i + 1}. ${t}`).join("\n")}`);
  if (pertanyaan.length)
    bagian.push(`PERTANYAAN\n${pertanyaan.map((t, i) => `${i + 1}. ${t}`).join("\n")}`);
  if (pengumpulan) bagian.push(`PENGUMPULAN\n${pengumpulan}`);
  if (kriteria.length)
    bagian.push(`KRITERIA PENILAIAN\n${kriteria.map((t) => `- ${t}`).join("\n")}`);

  return { judul, deskripsi: bagian.join("\n\n") };
}
