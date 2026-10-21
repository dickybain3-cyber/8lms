/**
 * Gambar untuk soal hasil AI — BROWSER-ONLY.
 *
 * Tiga sumber gambar, semuanya berakhir di jalur unggah yang SAMA dengan
 * gambar tempelan guru (`prosesDanUnggah` → kompres di browser →
 * Cloudinary jenjang). Jadi soal hasil AI tidak punya cara penyimpanan
 * gambar yang berbeda: URL-nya sama-sama `res.cloudinary.com`, ikut
 * transformasi `f_auto,q_auto` di `gambar.ts`, dan tetap tampil walau
 * layanan AI-nya suatu hari mati.
 *
 *   1. Diagram  — SVG dari Gemini (teks, akurat untuk angka/label),
 *                 dirender ke PNG di <canvas>.
 *   2. Ilustrasi — Pollinations (open source, gratis) lewat proksi server.
 *   3. Berkas guru — unggah/tempel sendiri (paling bisa dipercaya).
 */

import { prosesDanUnggah } from "@/lib/unggah-gambar";

const LEBAR_PNG = 1200;

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || `Permintaan gagal (${res.status}).`);
  return data;
}

export { postJson };

/** Render SVG ke PNG. Dimuat sebagai <img> (skrip di SVG tidak jalan). */
export async function svgKeFilePng(svg: string, nama = "diagram"): Promise<File> {
  const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(svg);
  const lebarAsli = vb ? Number(vb[1]) : 800;
  const tinggiAsli = vb ? Number(vb[2]) : 560;
  const rasio = tinggiAsli > 0 && lebarAsli > 0 ? tinggiAsli / lebarAsli : 0.7;
  const lebar = LEBAR_PNG;
  const tinggi = Math.max(1, Math.round(LEBAR_PNG * rasio));

  // Pastikan ukuran eksplisit — tanpa width/height sebagian browser
  // merender SVG di 300×150.
  const svgBerukuran = svg.replace(
    /<svg\b([^>]*)>/i,
    (_m, atr: string) =>
      `<svg${atr.replace(/\s(width|height)\s*=\s*("[^"]*"|'[^']*')/gi, "")} width="${lebar}" height="${tinggi}">`
  );

  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgBerukuran)}`;
  const img = new Image();
  img.decoding = "async";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Diagram tidak bisa dirender. Coba buat ulang."));
    img.src = src;
  });

  const canvas = document.createElement("canvas");
  canvas.width = lebar;
  canvas.height = tinggi;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Browser tidak mendukung canvas.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, lebar, tinggi);
  ctx.drawImage(img, 0, 0, lebar, tinggi);

  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  if (!blob) throw new Error("Gagal mengubah diagram jadi gambar.");
  return new File([blob], `${nama}.png`, { type: "image/png" });
}

export async function buatDiagram(opsi: {
  jenjang?: number;
  deskripsi: string;
  pertanyaan?: string;
}): Promise<{ url: string; svg: string }> {
  const { svg } = await postJson<{ svg: string }>("/api/ai/diagram", opsi);
  const file = await svgKeFilePng(svg);
  const { url } = await prosesDanUnggah(file);
  return { url, svg };
}

/** Galat batas laju generator gratis — pemanggil boleh menunggu lalu ulang. */
export class GalatBatasGambar extends Error {
  constructor(public tungguDetik: number) {
    super(
      `Generator gambar gratis membatasi 1 gambar per ±45 detik. Tunggu ${tungguDetik} detik lalu coba lagi.`
    );
  }
}

async function ambilLangsung(url: string): Promise<Blob> {
  const pengendali = new AbortController();
  const timer = setTimeout(() => pengendali.abort(), 120_000);
  try {
    const res = await fetch(url, { signal: pengendali.signal, cache: "no-store" });
    if (res.status === 402 || res.status === 429) {
      const ra = Number(res.headers.get("retry-after"));
      throw new GalatBatasGambar(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 90) : 46);
    }
    const jenis = res.headers.get("content-type") ?? "";
    if (!res.ok || !jenis.startsWith("image/")) {
      throw new Error("Generator gambar gratis tidak mengirim gambar. Coba lagi atau unggah sendiri.");
    }
    return await res.blob();
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      throw new Error("Generator gambar terlalu lama (lebih dari 2 menit). Coba lagi.");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ilustrasi Pollinations → Cloudinary. Mengembalikan juga `jedaDetik`:
 * berapa lama sebaiknya menunggu sebelum ilustrasi berikutnya (dipakai
 * tombol "Buat semua gambar").
 */
export async function buatIlustrasi(opsi: {
  jenjang?: number;
  prompt: string;
  seed?: number;
}): Promise<{ url: string; jedaDetik: number }> {
  const res = await fetch("/api/ai/gambar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opsi),
  });
  const jenisRes = res.headers.get("content-type") ?? "";
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `Generator gambar gagal (${res.status}).`);
  }

  let blob: Blob;
  let jedaDetik: number;
  if (jenisRes.includes("application/json")) {
    // Mode gratis: server hanya merakit URL, browser yang mengambil.
    const data = (await res.json()) as { urlLangsung: string; jedaDetik?: number };
    blob = await ambilLangsung(data.urlLangsung);
    jedaDetik = data.jedaDetik ?? 46;
  } else {
    blob = await res.blob();
    jedaDetik = Number(res.headers.get("x-jeda-berikut")) || 3;
  }

  const jenis = blob.type || "image/jpeg";
  const ext = jenis.includes("png") ? "png" : jenis.includes("webp") ? "webp" : "jpg";
  const file = new File([blob], `ilustrasi-${Date.now()}.${ext}`, { type: jenis });
  const { url } = await prosesDanUnggah(file);
  return { url, jedaDetik };
}

export async function unggahBerkasGuru(file: File): Promise<{ url: string }> {
  const { url } = await prosesDanUnggah(file);
  return { url };
}
