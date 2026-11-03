import { NextResponse } from "next/server";
import { aksesAi, gagal, responsGalat } from "@/lib/ai/akses";
import { panggilGeminiJson } from "@/lib/ai/gemini";
import { MAKS_CONTOH, rapikanTeks } from "@/lib/ai/rencana-soal";

/**
 * POST /api/ai/ekstrak — ubah berkas contoh soal guru jadi teks polos
 * yang bisa dipahami AI. Body: FormData { berkas, jenjang? }.
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
