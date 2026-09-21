/**
 * Menyiapkan foto profil di browser sebelum diunggah: dipotong PERSEGI dari
 * tengah, dikecilkan, lalu dijadikan JPEG kecil.
 *
 * Kenapa tidak memakai `prosesDanUnggah` dari `unggah-gambar.ts`: yang itu
 * dibuat untuk gambar SOAL — mempertahankan seluruh gambar (tidak dipotong)
 * dan membiarkannya sampai 1600 px. Foto profil butuh kebalikannya: selalu
 * persegi, dan tidak pernah ditampilkan lebih besar dari beberapa ratus
 * piksel. Foto 4 MB dari kamera HP yang diunggah utuh hanya membuang kuota
 * Cloudinary tanpa terlihat bedanya.
 *
 * Yang dipakai ulang dari `unggah-gambar.ts` hanya `uploadKeCloudinary`
 * (memilih cloud sesuai jenjang sesi) dan daftar jenis berkas yang didukung.
 */

import { JENIS_DIDUKUNG, uploadKeCloudinary } from "@/lib/unggah-gambar";

/** Sisi foto profil hasil akhir, dalam piksel. */
export const SISI_FOTO_PROFIL = 320;

/** Batas berkas ASLI yang dipilih guru. Yang diunggah jauh lebih kecil. */
export const BATAS_FOTO_ASLI_BYTE = 15 * 1024 * 1024;

export interface FotoProfilSiap {
  blob: Blob;
  /** URL sementara untuk pratinjau; panggil `URL.revokeObjectURL` setelah dipakai. */
  urlPratinjau: string;
}

export async function siapkanFotoProfil(file: File): Promise<FotoProfilSiap> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Berkas yang dipilih bukan gambar.");
  }
  if (!JENIS_DIDUKUNG.includes(file.type)) {
    throw new Error(
      `Format ${file.type.replace("image/", "").toUpperCase()} belum didukung. Pakai JPG, PNG, atau WebP.`
    );
  }
  if (file.size > BATAS_FOTO_ASLI_BYTE) {
    throw new Error("Foto terlalu besar (maksimal 15 MB). Pilih foto lain.");
  }

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) {
    throw new Error("Foto tidak bisa dibaca. Coba foto lain.");
  }

  const sisi = Math.min(bitmap.width, bitmap.height);
  const sx = Math.round((bitmap.width - sisi) / 2);
  const sy = Math.round((bitmap.height - sisi) / 2);

  const canvas = document.createElement("canvas");
  canvas.width = SISI_FOTO_PROFIL;
  canvas.height = SISI_FOTO_PROFIL;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close?.();
    throw new Error("Browser ini tidak bisa memproses gambar.");
  }

  // Latar putih dulu: PNG transparan yang diubah ke JPEG kalau tidak
  // begitu jadi berlatar hitam.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, SISI_FOTO_PROFIL, SISI_FOTO_PROFIL);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    bitmap,
    sx,
    sy,
    sisi,
    sisi,
    0,
    0,
    SISI_FOTO_PROFIL,
    SISI_FOTO_PROFIL
  );
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.88)
  );
  if (!blob) throw new Error("Gagal memproses foto. Coba foto lain.");

  return { blob, urlPratinjau: URL.createObjectURL(blob) };
}

/** Unggah hasil `siapkanFotoProfil` ke Cloudinary; mengembalikan URL-nya. */
export function unggahFotoProfil(blob: Blob): Promise<string> {
  return uploadKeCloudinary(blob, `foto-profil-${Date.now()}.jpg`);
}
