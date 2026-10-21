import { NextResponse } from "next/server";
import { aksesAi, bacaBody, gagal, responsGalat } from "@/lib/ai/akses";
import { panggilGeminiJson } from "@/lib/ai/gemini";
import { INSTRUKSI_SISTEM, rapikanTeks } from "@/lib/ai/rencana-soal";
import { susunLembarKerja, JENIS_LK, type JenisLembarKerja } from "@/lib/ai/lembar-kerja";

/**
 * POST /api/ai/lembar-kerja — draf judul + instruksi untuk kegiatan Tugas.
 *
 * Body: { jenjang?, eventId, mapel, topik[], jenis, jumlahPertanyaan, catatan,
 *         mintaTeks, mintaBerkas }
 *
 * Hasilnya hanya MENGISI kolom form Tugas; guru tetap meninjau lalu
 * menekan Simpan sendiri.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await bacaBody(req);
  if (!body) return gagal("Body permintaan tidak valid.");

  const akses = await aksesAi(body.jenjang);
  if (akses instanceof NextResponse) return akses;

  const eventId = String(body.eventId ?? "");
  const { data: event } = await akses.client
    .from("event")
    .select("id, nama")
    .eq("id", eventId)
    .maybeSingle();
  if (!event) return gagal("Kegiatan tidak ditemukan.", 404);

  const topik = Array.isArray(body.topik)
    ? body.topik.map((t) => rapikanTeks(t, 200)).filter(Boolean).slice(0, 6)
    : [];
  if (topik.length === 0) return gagal("Isi minimal satu topik/materi.");

  const mapel = rapikanTeks(body.mapel, 100) || "umum";
  const jenis: JenisLembarKerja = (Object.keys(JENIS_LK) as JenisLembarKerja[]).includes(
    body.jenis as JenisLembarKerja
  )
    ? (body.jenis as JenisLembarKerja)
    : "lkpd";
  const jumlahPertanyaan = Math.min(15, Math.max(0, Math.floor(Number(body.jumlahPertanyaan)) || 5));
  const catatan = rapikanTeks(body.catatan, 600);
  const bentuk = [
    body.mintaTeks !== false ? "jawaban tulisan langsung di aplikasi" : "",
    body.mintaBerkas !== false ? "unggah berkas/foto hasil kerja" : "",
  ]
    .filter(Boolean)
    .join(" dan ");

  const prompt = [
    `Susun ${JENIS_LK[jenis].label} untuk mata pelajaran ${mapel}, kelas ${akses.jenjang} SMP, kegiatan "${event.nama}".`,
    `Topik: ${topik.map((t) => `"${t}"`).join(", ")}.`,
    JENIS_LK[jenis].arahan,
    `Jumlah pertanyaan/tugas yang dijawab siswa: ${jumlahPertanyaan}.`,
    bentuk ? `Siswa mengumpulkan lewat: ${bentuk}. Sebutkan di petunjuk pengumpulan.` : "",
    "Langkah kerja harus bisa dikerjakan siswa sendiri di rumah/kelas dengan alat sederhana dan aman.",
    catatan ? `Catatan guru: ${catatan}` : "",
    "Keluarkan JSON sesuai skema.",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const hasil = await panggilGeminiJson<Record<string, unknown>>(akses.jenjang, prompt, {
      sistem: INSTRUKSI_SISTEM,
      skema: {
        type: "OBJECT",
        properties: {
          judul: { type: "STRING" },
          tujuan: { type: "ARRAY", items: { type: "STRING" } },
          alat_bahan: { type: "ARRAY", items: { type: "STRING" } },
          langkah: { type: "ARRAY", items: { type: "STRING" } },
          pertanyaan: { type: "ARRAY", items: { type: "STRING" } },
          pengumpulan: { type: "STRING" },
          kriteria: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: ["judul", "tujuan", "langkah", "pertanyaan", "pengumpulan", "kriteria"],
      },
      suhu: 0.7,
    });
    const lk = susunLembarKerja(hasil);
    if (!lk) return gagal("AI tidak menghasilkan lembar kerja yang lengkap. Coba lagi.", 502);
    return NextResponse.json(lk);
  } catch (e) {
    return responsGalat(e);
  }
}
