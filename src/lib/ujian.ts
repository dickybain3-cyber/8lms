import type { SoalSiswa } from "@/types";

/**
 * Anggap soal "terjawab" untuk keperluan progress bar — bukan untuk
 * scoring (itu Sesi 5, lihat `hitung_nilai` di 0007_scoring.sql). Untuk
 * tipe majemuk (multi_benar_salah, menjodohkan) sengaja mensyaratkan
 * SEMUA baris terisi supaya progress tidak menyesatkan siswa (mis. baru
 * isi 1 dari 5 pernyataan tapi dihitung "selesai") — definisi ini juga
 * dipakai Sesi 8 untuk status "sudah dijawab" di sidebar navigasi ujian
 * (`ExamClient.tsx`), supaya cuma ada satu definisi "terjawab" di seluruh
 * alur siswa, bukan dua yang bisa berbeda.
 */
export function soalSudahTerjawab(soal: SoalSiswa, jawaban: unknown): boolean {
  if (jawaban === undefined || jawaban === null) return false;

  switch (soal.tipe) {
    case "pilgan_biasa":
      return typeof jawaban === "string" && jawaban.length > 0;
    case "pilgan_kompleks":
      return Array.isArray(jawaban) && jawaban.length > 0;
    case "uraian_singkat":
      return typeof jawaban === "string" && jawaban.trim().length > 0;
    case "benar_salah":
      return typeof jawaban === "boolean";
    case "multi_benar_salah": {
      const pernyataan = (soal.konten_jsonb.pernyataan as unknown[]) ?? [];
      if (typeof jawaban !== "object" || jawaban === null) return false;
      return (
        Object.keys(jawaban as Record<string, unknown>).length ===
        pernyataan.length
      );
    }
    case "menjodohkan": {
      const daftarSoal = (soal.konten_jsonb.soal as unknown[]) ?? [];
      if (typeof jawaban !== "object" || jawaban === null) return false;
      return (
        Object.keys(jawaban as Record<string, unknown>).length ===
        daftarSoal.length
      );
    }
    default:
      return false;
  }
}

/** Format ms sisa waktu jadi "HH:MM:SS" (atau "MM:SS" kalau < 1 jam). */
export function formatSisaWaktu(ms: number): string {
  const totalDetik = Math.max(0, Math.floor(ms / 1000));
  const jam = Math.floor(totalDetik / 3600);
  const menit = Math.floor((totalDetik % 3600) / 60);
  const detik = totalDetik % 60;

  const mm = String(menit).padStart(2, "0");
  const ss = String(detik).padStart(2, "0");

  return jam > 0 ? `${jam}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatWaktu(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
