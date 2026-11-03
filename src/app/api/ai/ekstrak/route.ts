import { NextResponse } from "next/server";
import { aksesAi, gagal, responsGalat } from "@/lib/ai/akses";
import { panggilGeminiJson } from "@/lib/ai/gemini";
import { MAKS_CONTOH, rapikanTeks } from "@/lib/ai/rencana-soal";

/**
 * POST /api/ai/ekstrak — ubah berkas contoh soal guru jadi teks polos
 * yang bisa dipahami AI. Body: FormData { berkas | url, jenjang? }.
 *
 * `url` = tautan artikel/berita yang dijadikan BAHAN BACAAN stimulus.
 * Halamannya diambil server lalu isi artikelnya dipisahkan dari menu &
 * iklan dengan Mozilla Readability (github.com/mozilla/readability,
 * Apache-2.0) di atas linkedom (ISC). Lihat `ambilArtikel`.
 *
 * Jalurnya per jenis berkas:
 *   - .docx        → mammoth (teks mentah, urutan paragraf terjaga)
 *   - .xlsx        → exceljs (tiap baris jadi "sel | sel | sel")
 *   - .txt/.md/.csv→ dibaca apa adanya
 *   - .pdf, gambar → dikirim ke Gemini sebagai berkas (multimodal) dan
 *                    diminta menyalin teksnya. Ini juga menangani PDF hasil
 *                    pindai/foto soal, yang tidak punya lapisan teks.
 *
 * Tidak memakai kuota harian (belum ada soal yang dibuat), tapi tetap
 * lewat `aksesAi` — login guru + pembatas laju.
 *
 * Hasilnya dipotong ke MAKS_CONTOH karakter: teks ini ikut ke setiap
 * prompt batch, jadi panjangnya langsung jadi biaya token.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAKS_BYTE = 4 * 1024 * 1024;

const MIME_GEMINI: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return gagal("Berkas tidak terbaca. Coba unggah ulang.");
  }

  const akses = await aksesAi(form.get("jenjang"));
  if (akses instanceof NextResponse) return akses;

  const tautan = String(form.get("url") ?? "").trim();
  if (tautan) {
    try {
      const a = await ambilArtikel(tautan);
      const bersih = rapikanTeks(a.teks, MAKS_CONTOH * 2);
      if (bersih.length < 80) return gagal("Isi artikel tidak terbaca dari tautan ini. Salin teksnya manual.");
      return NextResponse.json({
        teks: bersih.slice(0, MAKS_CONTOH),
        terpotong: bersih.length > MAKS_CONTOH,
        judul: a.judul,
        sumber: a.sumber,
      });
    } catch (e) {
      return gagal((e as Error).message || "Gagal mengambil artikel.", 400);
    }
  }

  const berkas = form.get("berkas");
  if (!(berkas instanceof File) || berkas.size === 0) return gagal("Pilih berkas dulu.");
  if (berkas.size > MAKS_BYTE) return gagal("Berkas terlalu besar (maks 4 MB).");

  const ext = (berkas.name.split(".").pop() ?? "").toLowerCase();
  const buf = Buffer.from(await berkas.arrayBuffer());

  try {
    let teks = "";
    if (ext === "docx") {
      const mammoth = await import("mammoth");
      teks = (await mammoth.extractRawText({ buffer: buf })).value;
    } else if (ext === "xlsx") {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf as unknown as ArrayBuffer);
      const baris: string[] = [];
      wb.eachSheet((ws) => {
        ws.eachRow((row) => {
          const sel = (row.values as unknown[])
            .slice(1)
            .map((v) => (v && typeof v === "object" && "text" in v ? String((v as { text: unknown }).text) : String(v ?? "")))
            .filter((v) => v.trim());
          if (sel.length) baris.push(sel.join(" | "));
        });
      });
      teks = baris.join("\n");
    } else if (ext === "txt" || ext === "md" || ext === "csv") {
      teks = buf.toString("utf8");
    } else if (MIME_GEMINI[ext]) {
      const hasil = await panggilGeminiJson<{ teks?: string }>(
        akses.jenjang,
        [
          {
            text:
              "Salin seluruh isi soal pada berkas ini menjadi teks polos Bahasa Indonesia, urut sesuai nomor. " +
              "Pertahankan pertanyaan, opsi jawaban (A, B, C, ...), dan kunci bila ada. Gambar/diagram cukup " +
              'dijelaskan singkat dalam kurung siku, mis. [gambar: segitiga siku-siku 3 cm, 4 cm]. Keluarkan JSON {"teks": "..."}.',
          },
          { inlineData: { mimeType: MIME_GEMINI[ext], data: buf.toString("base64") } },
        ],
        {
          skema: { type: "OBJECT", properties: { teks: { type: "STRING" } }, required: ["teks"] },
          suhu: 0.1,
        }
      );
      teks = String(hasil?.teks ?? "");
    } else {
      return gagal("Format belum didukung. Pakai .docx, .pdf, .xlsx, .txt, atau foto (.jpg/.png).");
    }

    const bersih = rapikanTeks(teks, MAKS_CONTOH * 2).slice(0, MAKS_CONTOH);
    if (!bersih) return gagal("Tidak ada teks yang bisa dibaca dari berkas ini.");
    return NextResponse.json({
      teks: bersih,
      terpotong: rapikanTeks(teks, MAKS_CONTOH * 2).length > MAKS_CONTOH,
    });
  } catch (e) {
    return responsGalat(e);
  }
}

// ---------------------------------------------------------------------------
// Ambil artikel dari web
// ---------------------------------------------------------------------------

const MAKS_HTML = 3 * 1024 * 1024;

/** Tolak alamat lokal/privat supaya server tidak bisa dipakai menembak jaringan internal (SSRF). */
function ipPrivat(ip: string): boolean {
  if (ip.includes(":")) {
    const x = ip.toLowerCase();
    return x === "::1" || x === "::" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe80") || x.startsWith("::ffff:");
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
  );
}

async function pastikanAlamatPublik(u: URL) {
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Tautan harus diawali http:// atau https://");
  if (u.username || u.password || (u.port && !["80", "443"].includes(u.port))) throw new Error("Tautan tidak didukung.");
  const { lookup } = await import("node:dns/promises");
  const alamat = await lookup(u.hostname, { all: true }).catch(() => []);
  if (alamat.length === 0) throw new Error("Situs tidak ditemukan. Periksa tautannya.");
  if (alamat.some((a) => ipPrivat(a.address))) throw new Error("Tautan ini tidak bisa diambil.");
}

async function ambilArtikel(mentah: string): Promise<{ teks: string; judul: string; sumber: string }> {
  let u: URL;
  try {
    u = new URL(mentah);
  } catch {
    throw new Error("Tautan tidak valid.");
  }

  let res: Response | null = null;
  for (let lompat = 0; lompat < 4; lompat++) {
    await pastikanAlamatPublik(u);
    const pengendali = new AbortController();
    const timer = setTimeout(() => pengendali.abort(), 15_000);
    try {
      res = await fetch(u, {
        redirect: "manual",
        signal: pengendali.signal,
        cache: "no-store",
        headers: { "User-Agent": "Mozilla/5.0 (LMS-CBT; pengambil bahan bacaan)", Accept: "text/html" },
      });
    } catch {
      throw new Error("Situs tidak merespons.");
    } finally {
      clearTimeout(timer);
    }
    const ke = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && ke) {
      u = new URL(ke, u);
      continue;
    }
    break;
  }
  if (!res || !res.ok) throw new Error("Halaman tidak bisa dibuka (mungkin butuh login atau diblokir).");
  if (!(res.headers.get("content-type") ?? "").includes("html")) throw new Error("Tautan bukan halaman artikel.");
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAKS_HTML) throw new Error("Halaman terlalu besar.");
  const html = new TextDecoder("utf-8").decode(buf);

  const [{ parseHTML }, { Readability }] = await Promise.all([import("linkedom"), import("@mozilla/readability")]);
  const { document } = parseHTML(html);
  const artikel = new Readability(document as unknown as Document).parse();
  // Dari HTML isi artikel (bukan textContent) supaya batas paragraf terjaga.
  const teks = String(artikel?.content ?? "")
    .replace(/<\/(p|h[1-6]|li|div|blockquote|tr)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 30)
    .join("\n\n");
  const judul = rapikanTeks(artikel?.title, 160);
  const situs = artikel?.siteName ? rapikanTeks(artikel.siteName, 60) : u.hostname.replace(/^www\./, "");
  return { teks, judul, sumber: `${situs}${judul ? `, "${judul}"` : ""} (${u.toString().slice(0, 200)})` };
}
