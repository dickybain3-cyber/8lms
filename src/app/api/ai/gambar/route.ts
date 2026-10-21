import { NextResponse } from "next/server";
import { aksesAi, bacaBody, gagal } from "@/lib/ai/akses";
import { rapikanTeks } from "@/lib/ai/rencana-soal";
import { kunciDariDatabase } from "@/lib/ai/kunci";

/**
 * POST /api/ai/gambar — ilustrasi lewat Pollinations
 * (github.com/pollinations/pollinations, open source).
 *
 * Dua mode, dipilih otomatis dari env server:
 *
 *   1. ADA token (env `POLLINATIONS_TOKEN` atau baris `ai_kunci` dengan
 *      penyedia 'pollinations') → server memanggil gen.pollinations.ai
 *      dengan kunci itu dan mengembalikan byte gambarnya. Kunci tidak
 *      pernah sampai ke browser.
 *
 *   2. TIDAK ADA token (gratis, anonim) → server hanya MERAKIT URL
 *      endpoint klasik image.pollinations.ai (gaya & `safe=true`
 *      dipaksakan di sini) lalu browser guru yang mengambilnya langsung.
 *      Alasannya batas anonim: ±1 gambar per 45 detik PER IP (dicek
 *      Oktober 2026). Hosting seperti Vercel memakai IP bersama dengan
 *      ribuan aplikasi lain, jadi jatah itu hampir selalu sudah habis di
 *      sisi server; IP sekolah/HP guru jauh lebih longgar. Endpoint ini
 *      mengizinkan CORS (`Access-Control-Allow-Origin: *`).
 *
 * Apa pun modenya, browser lalu mengunggah hasilnya lewat jalur gambar
 * biasa (`prosesDanUnggah` → Cloudinary jenjang), sehingga soal tidak
 * bergantung pada Pollinations saat ujian berlangsung.
 *
 * Body: { jenjang?, prompt, seed? }
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const GAYA =
  "simple flat educational illustration for junior high school textbook, clean lines, soft colors, plain white background, no text, no letters, no watermark, child safe";

/** Detik tunggu yang disarankan sebelum meminta ilustrasi berikutnya. */
const JEDA_ANONIM = 46;
const JEDA_BERKUNCI = 3;

export async function POST(req: Request) {
  const body = await bacaBody(req);
  if (!body) return gagal("Body permintaan tidak valid.");

  const akses = await aksesAi(body.jenjang);
  if (akses instanceof NextResponse) return akses;

  const prompt = rapikanTeks(body.prompt, 500);
  if (!prompt) return gagal("Prompt gambar kosong.");
  const seed = Math.abs(Math.floor(Number(body.seed))) || Math.floor(Math.random() * 1e6);
  const teks = encodeURIComponent(`${prompt}, ${GAYA}`);

  const token =
    process.env.POLLINATIONS_TOKEN?.trim() ||
    (await kunciDariDatabase(akses.jenjang, "pollinations"))[0];

  if (!token) {
    const url = new URL(`https://image.pollinations.ai/prompt/${teks}`);
    url.searchParams.set("width", "1024");
    url.searchParams.set("height", "720");
    url.searchParams.set("seed", String(seed));
    url.searchParams.set("nologo", "true");
    url.searchParams.set("safe", "true");
    url.searchParams.set("private", "true");
    return NextResponse.json({ urlLangsung: url.toString(), jedaDetik: JEDA_ANONIM });
  }

  const url = new URL(`https://gen.pollinations.ai/image/${teks}`);
  url.searchParams.set(
    "model",
    process.env.POLLINATIONS_MODEL?.trim() || "black-forest-labs/flux.1-schnell"
  );
  url.searchParams.set("width", "1024");
  url.searchParams.set("height", "720");
  url.searchParams.set("seed", String(seed));
  url.searchParams.set("nologo", "true");
  url.searchParams.set("safe", "true");

  const pengendali = new AbortController();
  const timer = setTimeout(() => pengendali.abort(), 55_000);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: pengendali.signal,
      cache: "no-store",
    });
    const jenis = res.headers.get("content-type") ?? "";
    if (res.status === 401 || res.status === 403) {
      return gagal("Kunci Pollinations ditolak. Cek POLLINATIONS_TOKEN di server.", 502);
    }
    if (res.status === 402 || res.status === 429) {
      return gagal("Saldo/batas Pollinations habis. Coba lagi nanti, atau unggah gambar sendiri.", 429);
    }
    if (!res.ok || !jenis.startsWith("image/")) {
      return gagal("Generator gambar tidak merespons dengan gambar. Coba lagi, atau unggah gambar sendiri.", 502);
    }
    const data = await res.arrayBuffer();
    if (data.byteLength > 8 * 1024 * 1024) {
      return gagal("Gambar hasil generator terlalu besar.", 502);
    }
    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type": jenis,
        "Cache-Control": "no-store",
        "X-Jeda-Berikut": String(JEDA_BERKUNCI),
      },
    });
  } catch (e) {
    const habis = (e as Error).name === "AbortError";
    return gagal(
      habis
        ? "Generator gambar terlalu lama merespons. Coba lagi sebentar lagi."
        : "Tidak bisa menghubungi generator gambar.",
      504
    );
  } finally {
    clearTimeout(timer);
  }
}
