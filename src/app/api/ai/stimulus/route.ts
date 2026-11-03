import { NextResponse } from "next/server";
import { aksesAi, bacaBody, gagal } from "@/lib/ai/akses";
import { normalisasiStimulus, stimulusPerluRender } from "@/lib/ai/stimulus";
import { renderStimulusSvg } from "@/lib/ai/stimulus-server";
import { bersihkanSvg } from "@/lib/ai/svg";

/**
 * POST /api/ai/stimulus — render stimulus tabel/grafik/infografis jadi SVG.
 * Body: { jenjang?, stimulus }. Tidak memanggil AI dan tidak memakai kuota;
 * tetap lewat `aksesAi` (login guru + pembatas laju).
 *
 * Stimulus dinormalisasi ulang di sini (jangan percaya browser), dan SVG
 * hasilnya disaring `bersihkanSvg` sebelum dikirim, sama seperti diagram.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  const body = await bacaBody(req);
  if (!body) return gagal("Body permintaan tidak valid.");

  const akses = await aksesAi(body.jenjang);
  if (akses instanceof NextResponse) return akses;

  const s = normalisasiStimulus(body.stimulus);
  if (!s || !stimulusPerluRender(s)) return gagal("Data stimulus tidak lengkap. Periksa isinya lalu coba lagi.");

  try {
    const svg = bersihkanSvg(await renderStimulusSvg(s));
    if (!svg) return gagal("Stimulus gagal dirender.", 500);
    return NextResponse.json({ svg });
  } catch (e) {
    console.error("[ai-stimulus]", e);
    return gagal("Stimulus gagal dirender. Periksa datanya (angka/kolom) lalu coba lagi.", 500);
  }
}
