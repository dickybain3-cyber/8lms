import { NextResponse } from "next/server";
import { aksesAi, bacaBody, gagal } from "@/lib/ai/akses";
import { rapikanTeks } from "@/lib/ai/rencana-soal";

/**
 * POST /api/ai/foto — cari foto ASLI berlisensi bebas di Wikimedia Commons
 * (MediaWiki API, tanpa kunci). Body: { jenjang?, q }.
 *
 * Mengembalikan beberapa kandidat (thumbnail 800 px + kredit). Guru memilih
 * sendiri; browser mengambil gambarnya langsung dari upload.wikimedia.org
 * (CORS terbuka) lalu mengunggahnya ke Cloudinary lewat jalur biasa, dan
 * kreditnya ditulis di bawah gambar (wajib untuk lisensi CC BY / BY-SA).
 *
 * Hanya lisensi yang aman dipakai ulang di soal: domain publik, CC0,
 * CC BY, CC BY-SA. Tidak memakai kuota AI.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 20;

const LISENSI_BOLEH = /^(cc0|cc[- ]by(?:[- ]sa)?(?:[- ][\d.]+)?|public domain|pd\b)/i;

function polos(html: unknown): string {
  return String(html ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export interface KandidatFoto {
  thumb: string;
  halaman: string;
  judul: string;
  kredit: string;
}

export async function POST(req: Request) {
  const body = await bacaBody(req);
  if (!body) return gagal("Body permintaan tidak valid.");
  const akses = await aksesAi(body.jenjang);
  if (akses instanceof NextResponse) return akses;

  const q = rapikanTeks(body.q, 120);
  if (!q) return gagal("Kata kunci foto kosong.");

  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.search = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "search",
    gsrsearch: `${q} filetype:bitmap`,
    gsrnamespace: "6",
    gsrlimit: "12",
    prop: "imageinfo",
    iiprop: "url|extmetadata|mime",
    iiurlwidth: "800",
    origin: "*",
  }).toString();

  const pengendali = new AbortController();
  const timer = setTimeout(() => pengendali.abort(), 15_000);
  try {
    const res = await fetch(url, {
      signal: pengendali.signal,
      cache: "no-store",
      headers: { "User-Agent": "LMS-CBT-Sekolah/1.0 (pembuat soal edukasi)" },
    });
    if (!res.ok) return gagal("Wikimedia Commons tidak merespons. Coba lagi.", 502);
    const data = (await res.json()) as {
      query?: { pages?: Record<string, { title?: string; imageinfo?: Record<string, unknown>[] }> };
    };
    const hasil: KandidatFoto[] = [];
    for (const p of Object.values(data.query?.pages ?? {})) {
      const info = p.imageinfo?.[0] as
        | { thumburl?: string; descriptionurl?: string; mime?: string; extmetadata?: Record<string, { value?: unknown }> }
        | undefined;
      if (!info?.thumburl || !/^image\/(jpeg|png|webp)$/.test(info.mime ?? "")) continue;
      const meta = info.extmetadata ?? {};
      const lisensi = polos(meta.LicenseShortName?.value);
      if (!LISENSI_BOLEH.test(lisensi)) continue;
      const pembuat = polos(meta.Artist?.value).slice(0, 80) || "Tanpa nama";
      hasil.push({
        thumb: info.thumburl,
        halaman: info.descriptionurl ?? "",
        judul: polos(p.title).replace(/^File:/, "").slice(0, 100),
        kredit: `Foto: ${pembuat}, ${lisensi}, via Wikimedia Commons`,
      });
      if (hasil.length >= 8) break;
    }
    return NextResponse.json({ foto: hasil });
  } catch {
    return gagal("Tidak bisa menghubungi Wikimedia Commons.", 504);
  } finally {
    clearTimeout(timer);
  }
}
