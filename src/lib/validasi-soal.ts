import type { TipeSoal } from "@/types";
import { htmlAdaIsinya } from "@/lib/html-soal";

/**
 * Validasi bentuk konten_jsonb per tipe sebelum insert, supaya pesan error
 * jelas (bukan raw error Postgres) dan supaya data yang masuk ke DB selalu
 * sesuai bentuk yang didokumentasikan di docs/skema-database.md /
 * 0003_soal.sql. Dijalankan di server — jangan percaya validasi client saja.
 */
/**
 * Apakah salah satu field teks ini benar-benar terisi?
 *
 * Kenapa tidak cukup `String(konten.pertanyaan).trim()` seperti dulu:
 * sejak kolom pertanyaan & opsi memakai editor kaya, soal yang isinya
 * HANYA GAMBAR TEMPELAN adalah bentuk yang sah dan justru sering dipakai
 * — guru memotret satu soal utuh dari buku, menempelkannya, selesai.
 * Soal seperti itu punya `pertanyaan` kosong tapi `pertanyaan_html`
 * berisi <img>. Validasi versi lama menolaknya dengan "Pertanyaan wajib
 * diisi" padahal gambarnya jelas terlihat di layar guru — kegagalan yang
 * mustahil dipahami dari pesannya.
 *
 * Tetap dijalankan di SERVER, dan `htmlAdaIsinya` memakai penyaring yang
 * sama dengan yang dipakai saat merender ke siswa. Validasi di client
 * bukan pengganti ini.
 */
function adaIsi(obj: Record<string, unknown>, ...fieldTeks: string[]): boolean {
  for (const f of fieldTeks) {
    if (String(obj[f] ?? "").trim()) return true;
    if (htmlAdaIsinya(obj[`${f}_html`] as string | undefined)) return true;
  }
  return false;
}

export function validasiKonten(
  tipe: TipeSoal,
  konten: Record<string, unknown>
): string | null {
  if (!adaIsi(konten, "pertanyaan", "instruksi")) {
    return "Pertanyaan/instruksi wajib diisi.";
  }

  switch (tipe) {
    case "pilgan_biasa":
    case "pilgan_kompleks": {
      const opsi = konten.opsi;
      if (!Array.isArray(opsi) || opsi.length < 2) {
        return "Pilihan ganda minimal harus punya 2 opsi.";
      }
      for (const o of opsi) {
        if (typeof o !== "object" || o === null) {
          return "Semua opsi wajib punya teks atau gambar.";
        }
        // Opsi yang isinya gambar saja (mis. empat bangun datar yang
        // ditempel guru) tidak punya teks — dan itu sah. Gambarnya boleh
        // datang dari mana saja: ditempel di dalam `teks_html`, atau
        // diunggah lewat kotak `gambar_url` yang lama.
        const punyaGambarTerpisah = !!String(
          (o as { gambar_url?: unknown }).gambar_url ?? ""
        ).trim();
        if (
          !adaIsi(o as Record<string, unknown>, "teks") &&
          !punyaGambarTerpisah
        ) {
          return "Semua opsi wajib punya teks atau gambar.";
        }
      }
      const jumlahBenar = opsi.filter(
        (o) => (o as { benar?: unknown }).benar === true
      ).length;
      if (tipe === "pilgan_biasa" && jumlahBenar !== 1) {
        return "Pilihan ganda biasa harus punya tepat satu opsi benar.";
      }
      if (tipe === "pilgan_kompleks" && jumlahBenar < 1) {
        return "Pilihan ganda kompleks minimal harus punya satu opsi benar.";
      }
      return null;
    }

    case "uraian_singkat": {
      const kunci = konten.kunci_jawaban;
      if (
        !Array.isArray(kunci) ||
        kunci.length < 1 ||
        kunci.some((k) => !String(k ?? "").trim())
      ) {
        return "Minimal satu kata kunci jawaban wajib diisi.";
      }
      return null;
    }

    case "benar_salah": {
      if (typeof konten.jawaban_benar !== "boolean") {
        return "Pilih kunci jawaban Benar atau Salah.";
      }
      return null;
    }

    case "multi_benar_salah": {
      const pernyataan = konten.pernyataan;
      if (!Array.isArray(pernyataan) || pernyataan.length < 2) {
        return "Minimal harus ada 2 pernyataan.";
      }
      for (const p of pernyataan) {
        if (
          typeof p !== "object" ||
          p === null ||
          !adaIsi(p as Record<string, unknown>, "teks") ||
          typeof (p as { jawaban_benar?: unknown }).jawaban_benar !==
            "boolean"
        ) {
          return "Semua pernyataan wajib punya teks dan kunci Benar/Salah.";
        }
      }
      return null;
    }

    case "menjodohkan": {
      const soal = konten.soal;
      const jawaban = konten.jawaban;
      const pasangan = konten.pasangan_benar;
      if (!Array.isArray(soal) || soal.length < 2) {
        return "Menjodohkan minimal harus punya 2 pasangan (kolom kiri).";
      }
      if (!Array.isArray(jawaban) || jawaban.length < 2) {
        return "Menjodohkan minimal harus punya 2 item di kolom kanan.";
      }
      if (
        soal.some(
          (s) =>
            !adaIsi(s as Record<string, unknown>, "teks") &&
            !String((s as { gambar_url?: unknown }).gambar_url ?? "").trim()
        )
      ) {
        return "Semua item kolom kiri wajib punya teks atau gambar.";
      }
      if (
        jawaban.some((j) => !String((j as { teks?: unknown }).teks ?? "").trim())
      ) {
        return "Semua item kolom kanan wajib punya teks.";
      }
      if (typeof pasangan !== "object" || pasangan === null) {
        return "Pasangan jawaban belum ditautkan.";
      }
      const pasanganMap = pasangan as Record<string, string>;
      const soalIds = soal.map((s) => (s as { id: string }).id);
      const belumDipasangkan = soalIds.filter((id) => !pasanganMap[id]);
      if (belumDipasangkan.length > 0) {
        return "Semua item kolom kiri wajib dipasangkan dengan salah satu item kolom kanan.";
      }
      return null;
    }

    default:
      return "Tipe soal tidak dikenal.";
  }
}

