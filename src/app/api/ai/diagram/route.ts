import { NextResponse } from "next/server";
import { aksesAi, bacaBody, gagal, responsGalat } from "@/lib/ai/akses";
import { panggilGeminiJson } from "@/lib/ai/gemini";
import { rapikanTeks } from "@/lib/ai/rencana-soal";
import { bersihkanSvg } from "@/lib/ai/svg";

/**
 * POST /api/ai/diagram — gambar diagram (grafik, bangun datar, skema,
 * tabel) sebagai SVG.
 *
 * Kenapa SVG dari model TEKS, bukan model gambar: generator gambar
 * (termasuk yang gratis) hampir selalu salah menulis angka dan label —
 * segitiga "sisi 5 cm" keluar dengan tulisan acak. Untuk soal, label
 * yang salah = soal salah. Model teks menulis SVG dengan angka persis,
 * dan biayanya sama dengan satu panggilan teks biasa (gratis di kuota
 * Gemini yang sama, tanpa API gambar berbayar).
 *
 * Body: { jenjang?, deskripsi, pertanyaan? }
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SISTEM = [
  "Kamu ilustrator diagram untuk buku pelajaran SMP Indonesia. Keluaranmu HANYA kode SVG yang valid.",
  'Aturan: viewBox="0 0 800 560", latar persegi putih penuh, garis hitam/biru tua tebal 2-3 px, warna isian lembut.',
  "Font: font-family Arial, ukuran minimal 22 px, label Bahasa Indonesia, angka dan satuan PERSIS seperti deskripsi.",
  "Gambar harus proporsional dan akurat (sudut, panjang, skala grafik). Semua elemen di dalam viewBox dengan margin 30 px.",
  "Dilarang: <script>, <image>, <foreignObject>, tautan eksternal, animasi, teks kunci jawaban.",
].join("\n");

export async function POST(req: Request) {
  const body = await bacaBody(req);
  if (!body) return gagal("Body permintaan tidak valid.");

  const akses = await aksesAi(body.jenjang);
  if (akses instanceof NextResponse) return akses;

  const deskripsi = rapikanTeks(body.deskripsi, 1000);
  if (!deskripsi) return gagal("Deskripsi gambar kosong.");
  const pertanyaan = rapikanTeks(body.pertanyaan, 600);

  const prompt = [
    `Buat diagram SVG sesuai deskripsi berikut:\n${deskripsi}`,
    pertanyaan
      ? `Diagram ini dipakai untuk soal: "${pertanyaan}". JANGAN tampilkan jawabannya di gambar.`
      : "",
    'Keluarkan JSON {"svg": "<svg ...>...</svg>"}.',
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const hasil = await panggilGeminiJson<{ svg?: string }>(akses.jenjang, prompt, {
      sistem: SISTEM,
      skema: {
        type: "OBJECT",
        properties: { svg: { type: "STRING" } },
        required: ["svg"],
      },
      suhu: 0.3,
    });
    const svg = bersihkanSvg(String(hasil?.svg ?? ""));
    if (!svg) return gagal("AI tidak menghasilkan diagram yang valid. Coba lagi.", 502);
    return NextResponse.json({ svg });
  } catch (e) {
    return responsGalat(e);
  }
}
