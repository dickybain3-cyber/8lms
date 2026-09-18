/**
 * Pengecilan + unggah gambar, dipisahkan dari komponen supaya bisa
 * dipakai dua pemanggil yang sekarang ada:
 *
 *   1. `ImageUpload` — kotak unggah terpisah yang lama (masih dipakai
 *      untuk "Gambar soal umum").
 *   2. `EditorKaya` — gambar yang ditempel/disisipkan LANGSUNG di tengah
 *      teks pertanyaan atau opsi jawaban.
 *
 * Isi fungsinya sama persis dengan yang dulu ada di dalam
 * `ImageUpload.tsx` — dipindah, bukan ditulis ulang, supaya perilaku
 * pengecilan yang sudah terbukti di lapangan tidak berubah diam-diam.
 * Yang ditambahkan cuma satu: `JENIS_DIDUKUNG` kini memuat `image/bmp`,
 * karena sebagian Snipping Tool / "Paint lalu salin" di Windows menaruh
 * BMP di clipboard, dan versi lama menolaknya dengan pesan "Format BMP
 * belum didukung" tepat pada alur yang paling sering dipakai guru.
 *
 * Catatan konsistensi yang sebelumnya salah: daftar `JENIS_DIDUKUNG`
 * memuat `image/gif`, tapi atribut `accept` pada input berkas tidak.
 * Akibatnya GIF bisa lolos lewat tempel/seret tapi tidak lewat tombol
 * pilih berkas. Sekarang keduanya memakai konstanta yang sama di bawah.
 */

import { getCloudinaryConfig } from "@/lib/supabase/config";
import { getJenjangFromDocumentCookie } from "@/lib/jenjang";

/** Sisi terpanjang maksimal setelah dikecilkan. Sama dengan lebar mode
 *  perbesar di layar siswa (LEBAR_ZOOM di src/lib/gambar.ts) — lebih dari
 *  ini tidak pernah terlihat. */
export const SISI_MAKS = 1600;

/** Di bawah ini, berkas dianggap sudah cukup kecil dan dilewatkan apa
 *  adanya (300 KB). */
const AMBANG_LEWATI_BYTE = 300 * 1024;

/** Batas keras setelah kompresi. */
export const BATAS_UNGGAH_BYTE = 5 * 1024 * 1024;

export const JENIS_DIDUKUNG = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",
];

/** Dipakai di atribut `accept` supaya sama persis dengan validasi di atas. */
export const ACCEPT_GAMBAR = JENIS_DIDUKUNG.join(",");

export function formatUkuran(byte: number): string {
  if (byte < 1024) return `${byte} B`;
  if (byte < 1024 * 1024) return `${Math.round(byte / 1024)} KB`;
  return `${(byte / (1024 * 1024)).toFixed(1)} MB`;
}

export interface HasilKompresi {
  berkas: File | Blob;
  ukuranAsli: number;
  ukuranAkhir: number;
  lebar: number;
  tinggi: number;
  dikompres: boolean;
}

/**
 * Kecilkan gambar lewat <canvas>. Dikerjakan sepenuhnya di browser guru —
 * tidak ada berkas besar yang pernah menyentuh jaringan.
 *
 * GIF sengaja TIDAK dikompres: canvas hanya menyalin bingkai pertama,
 * jadi GIF beranimasi akan kehilangan animasinya tanpa peringatan.
 */
export async function kecilkanGambar(file: File): Promise<HasilKompresi> {
  const ukuranAsli = file.size;

  const lewati =
    file.type === "image/gif" ||
    (ukuranAsli <= AMBANG_LEWATI_BYTE && file.type !== "image/png");

  const bitmap = await createImageBitmap(file).catch(() => null);

  if (!bitmap) {
    return {
      berkas: file,
      ukuranAsli,
      ukuranAkhir: ukuranAsli,
      lebar: 0,
      tinggi: 0,
      dikompres: false,
    };
  }

  const sisiTerpanjang = Math.max(bitmap.width, bitmap.height);

  if (lewati && sisiTerpanjang <= SISI_MAKS) {
    bitmap.close?.();
    return {
      berkas: file,
      ukuranAsli,
      ukuranAkhir: ukuranAsli,
      lebar: bitmap.width,
      tinggi: bitmap.height,
      dikompres: false,
    };
  }

  const rasio = Math.min(1, SISI_MAKS / sisiTerpanjang);
  const lebar = Math.round(bitmap.width * rasio);
  const tinggi = Math.round(bitmap.height * rasio);

  const canvas = document.createElement("canvas");
  canvas.width = lebar;
  canvas.height = tinggi;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close?.();
    return {
      berkas: file,
      ukuranAsli,
      ukuranAkhir: ukuranAsli,
      lebar,
      tinggi,
      dikompres: false,
    };
  }

  // PNG dengan transparansi: latar dibiarkan transparan dan hasilnya tetap
  // PNG. Selain itu, latar putih dulu supaya JPEG tidak menghitam.
  //
  // Tangkapan layar Snipping Tool hampir selalu PNG, dan justru PNG-lah
  // yang paling boros untuk tangkapan layar berisi grafik/foto. Cabang
  // ini tetap mempertahankan PNG demi transparansi — kalau suatu saat
  // ukuran jadi masalah, ubahnya di sini, satu tempat.
  const jagaTransparan = file.type === "image/png";
  if (!jagaTransparan) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, lebar, tinggi);
  }
  ctx.drawImage(bitmap, 0, 0, lebar, tinggi);
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(
      resolve,
      jagaTransparan ? "image/png" : "image/jpeg",
      jagaTransparan ? undefined : 0.85
    )
  );

  if (!blob || blob.size >= ukuranAsli) {
    return {
      berkas: file,
      ukuranAsli,
      ukuranAkhir: ukuranAsli,
      lebar,
      tinggi,
      dikompres: false,
    };
  }

  return {
    berkas: blob,
    ukuranAsli,
    ukuranAkhir: blob.size,
    lebar,
    tinggi,
    dikompres: true,
  };
}

export async function uploadKeCloudinary(
  berkas: File | Blob,
  namaBerkas: string
): Promise<string> {
  const jenjang = getJenjangFromDocumentCookie();
  if (!jenjang) {
    throw new Error(
      "Jenjang tidak diketahui (cookie lms_jenjang tidak ada) — coba login ulang."
    );
  }

  const { cloudName, uploadPreset } = getCloudinaryConfig(jenjang);

  const formData = new FormData();
  formData.append("file", berkas, namaBerkas);
  formData.append("upload_preset", uploadPreset);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    { method: "POST", body: formData }
  );

  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      detail = body.error?.message ? ` (${body.error.message})` : "";
    } catch {
      // respons bukan JSON — biarkan detail kosong
    }
    throw new Error(
      `Upload gambar gagal${detail}. Cek koneksi, lalu pastikan upload preset Cloudinary kelas ${jenjang} sudah bermode "unsigned".`
    );
  }

  const data = (await res.json()) as { secure_url?: string };
  if (!data.secure_url) {
    throw new Error("Upload gambar gagal (respons Cloudinary tidak lengkap).");
  }
  return data.secure_url;
}

/**
 * Validasi → kecilkan → unggah, jadi satu panggilan.
 *
 * Melempar `Error` dengan pesan berbahasa manusia untuk SEMUA kegagalan,
 * termasuk berkas yang bukan gambar dan berkas yang masih terlalu besar
 * setelah dikecilkan. Pemanggil cukup menangkapnya dan menampilkan
 * `err.message` apa adanya — tidak perlu tahu tahapannya.
 */
export async function prosesDanUnggah(file: File): Promise<{
  url: string;
  info: string;
}> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Berkas yang dipilih bukan gambar.");
  }
  if (!JENIS_DIDUKUNG.includes(file.type)) {
    throw new Error(
      `Format ${file.type.replace("image/", "").toUpperCase()} belum didukung. Pakai JPG, PNG, atau WebP.`
    );
  }

  const hasil = await kecilkanGambar(file);

  if (hasil.ukuranAkhir > BATAS_UNGGAH_BYTE) {
    throw new Error(
      `Gambar masih ${formatUkuran(hasil.ukuranAkhir)} setelah dikecilkan — terlalu berat untuk dibuka 600 siswa bersamaan. Potong bagian yang tidak perlu lalu coba lagi.`
    );
  }

  // Gambar dari clipboard tidak punya nama berkas (`file.name` kosong).
  // Cloudinary menolak unggahan tanpa nama, jadi nama dibuatkan di sini —
  // ini jalur yang paling sering dipakai guru (Snipping Tool → Ctrl+V),
  // dan tanpa baris ini seluruh fitur tempel gagal dengan pesan dari
  // Cloudinary yang tidak ada hubungannya dengan sebabnya.
  const namaDasar = (file.name || "tempelan").replace(/\.[^.]+$/, "");
  const namaBerkas = hasil.dikompres
    ? `${namaDasar}${file.type === "image/png" ? ".png" : ".jpg"}`
    : file.name || `tempelan-${Date.now()}.png`;

  const url = await uploadKeCloudinary(hasil.berkas, namaBerkas);

  return {
    url,
    info: hasil.dikompres
      ? `Dikecilkan ke ${hasil.lebar}×${hasil.tinggi} px · ${formatUkuran(hasil.ukuranAsli)} → ${formatUkuran(hasil.ukuranAkhir)}`
      : `Ukuran asli dipakai · ${formatUkuran(hasil.ukuranAkhir)}`,
  };
}

/** Ambil berkas gambar pertama dari event tempel/seret, kalau ada. */
export function gambarDariClipboard(
  data: DataTransfer | null
): File | null {
  if (!data) return null;

  // `files` lebih dulu: di Windows, menempel berkas gambar dari File
  // Explorer mengisi `files` tapi tidak selalu `items` dengan kind file.
  for (const f of Array.from(data.files ?? [])) {
    if (f.type.startsWith("image/")) return f;
  }
  for (const it of Array.from(data.items ?? [])) {
    if (it.kind === "file" && it.type.startsWith("image/")) {
      const f = it.getAsFile();
      if (f) return f;
    }
  }
  return null;
}
