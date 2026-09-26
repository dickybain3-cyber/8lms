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
import { BATAS_UKURAN_GAMBAR_BYTE } from "@/lib/forum";

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

/**
 * ── KOMPRESI KHUSUS FOTO FORUM CHAT ──
 *
 * Beda dari `kecilkanGambar` (dipakai guru untuk gambar soal) dalam tiga
 * hal, semuanya karena target ukurannya jauh lebih ketat
 * (`BATAS_UKURAN_GAMBAR_BYTE` = 200 KB, lihat forum.ts):
 *
 *   1. Tidak ada jalur "lewati kompresi" untuk berkas kecil — berkas
 *      300 KB tetap harus dicek, karena 300 KB > 200 KB.
 *   2. Kualitas JPEG diturunkan bertahap, dan kalau kualitas terendah
 *      masih di atas batas, RESOLUSI ikut diturunkan lalu kualitas
 *      dicoba ulang dari atas. `kecilkanGambar` cuma encode sekali.
 *   3. Selalu keluar JPEG — termasuk PNG dan gambar dengan transparansi
 *      (transparansi diganti latar putih). Forum chat tidak butuh
 *      transparansi, dan mempertahankan PNG (seperti `kecilkanGambar`)
 *      justru yang bikin tangkapan layar sering di atas 200 KB.
 *
 * GIF TIDAK didukung di sini (lihat `JENIS_DIDUKUNG_CHAT`) — alasan sama
 * dengan `kecilkanGambar`: canvas cuma menyalin bingkai pertama, dan chat
 * foto lebih sering dari kamera/galeri daripada GIF animasi.
 *
 * Melempar `Error` berbahasa manusia kalau target tidak tercapai bahkan
 * setelah diperkecil sampai `SISI_MIN` — SENGAJA tidak diam-diam
 * mengembalikan berkas yang masih di atas batas seperti `kecilkanGambar`
 * lama, karena bubble chat yang kelewat berat justru masalah yang mau
 * dihindari fitur ini.
 */

/** Di bawah sisi ini, gambar sudah terlalu kecil untuk berguna di bubble
 *  chat — lebih baik gagal dengan pesan jelas daripada terus mengecilkan
 *  sampai jadi kotak buram beberapa piksel. */
const SISI_MIN_CHAT = 320;

/** Kualitas JPEG dicoba dari yang terbaik dulu; begitu satu langkah
 *  muat di bawah batas, berhenti — supaya tidak mengecilkan lebih dari
 *  perlu. */
const KUALITAS_LANGKAH_CHAT = [0.85, 0.7, 0.55, 0.4] as const;

/** Tiap kali satu putaran kualitas gagal semua, sisi terpanjang
 *  diperkecil ke 80% sebelum putaran kualitas diulang dari awal. */
const FAKTOR_PENGECILAN_CHAT = 0.8;

export const JENIS_DIDUKUNG_CHAT = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/bmp",
];

export const ACCEPT_GAMBAR_CHAT = JENIS_DIDUKUNG_CHAT.join(",");

export interface HasilKompresiChat {
  berkas: Blob;
  ukuranAsli: number;
  ukuranAkhir: number;
  lebar: number;
  tinggi: number;
}

export async function kecilkanGambarChat(
  file: File
): Promise<HasilKompresiChat> {
  const ukuranAsli = file.size;

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) {
    throw new Error(
      "Berkas gambar tidak bisa dibaca. Coba format lain (JPG, PNG, atau WebP)."
    );
  }

  let sisiTerpanjang = Math.min(SISI_MAKS, Math.max(bitmap.width, bitmap.height));
  let hasil: { blob: Blob; lebar: number; tinggi: number } | null = null;

  while (sisiTerpanjang >= SISI_MIN_CHAT && !hasil) {
    const rasio = sisiTerpanjang / Math.max(bitmap.width, bitmap.height);
    const lebar = Math.max(1, Math.round(bitmap.width * rasio));
    const tinggi = Math.max(1, Math.round(bitmap.height * rasio));

    const canvas = document.createElement("canvas");
    canvas.width = lebar;
    canvas.height = tinggi;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      throw new Error("Kanvas gambar tidak didukung di peramban ini.");
    }

    // Latar putih dulu — hasil akhir selalu JPEG (tanpa alpha), jadi PNG
    // bertransparansi yang langsung digambar di atas kanvas kosong akan
    // menghitam tanpa baris ini.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, lebar, tinggi);
    ctx.drawImage(bitmap, 0, 0, lebar, tinggi);

    for (const kualitas of KUALITAS_LANGKAH_CHAT) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", kualitas)
      );
      if (blob && blob.size <= BATAS_UKURAN_GAMBAR_BYTE) {
        hasil = { blob, lebar, tinggi };
        break;
      }
    }

    if (!hasil) {
      sisiTerpanjang = Math.round(sisiTerpanjang * FAKTOR_PENGECILAN_CHAT);
    }
  }

  bitmap.close?.();

  if (!hasil) {
    throw new Error(
      `Foto masih di atas ${formatUkuran(BATAS_UKURAN_GAMBAR_BYTE)} meski sudah dikecilkan sampai sisi terpanjang ${SISI_MIN_CHAT}px. Coba foto lain yang lebih sederhana (bukan tangkapan layar penuh teks/grafik), atau potong bagian yang tidak perlu.`
    );
  }

  return {
    berkas: hasil.blob,
    ukuranAsli,
    ukuranAkhir: hasil.blob.size,
    lebar: hasil.lebar,
    tinggi: hasil.tinggi,
  };
}

/**
 * Validasi → kecilkan (agresif, target ≤200 KB) → unggah, jadi satu
 * panggilan — versi chat forum dari `prosesDanUnggah`. Dipakai
 * `FormChatForum.tsx` (Part 3), belum dipasang di sana.
 */
export async function prosesDanUnggahGambarChat(file: File): Promise<{
  url: string;
  info: string;
}> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Berkas yang dipilih bukan gambar.");
  }
  if (!JENIS_DIDUKUNG_CHAT.includes(file.type)) {
    const jenis = file.type.replace("image/", "").toUpperCase();
    const pesanGif =
      file.type === "image/gif"
        ? " GIF tidak didukung di chat karena animasinya akan hilang."
        : "";
    throw new Error(
      `Format ${jenis} belum didukung.${pesanGif} Pakai JPG, PNG, atau WebP.`
    );
  }

  const hasil = await kecilkanGambarChat(file);

  const namaDasar = (file.name || "foto-chat").replace(/\.[^.]+$/, "");
  const namaBerkas = `${namaDasar}.jpg`;

  const url = await uploadKeCloudinary(hasil.berkas, namaBerkas);

  return {
    url,
    info: `${hasil.lebar}×${hasil.tinggi} px · ${formatUkuran(hasil.ukuranAsli)} → ${formatUkuran(hasil.ukuranAkhir)}`,
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
