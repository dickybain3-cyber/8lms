import { NextResponse } from "next/server";
import { aksesAi, bacaBody, gagal, responsGalat } from "@/lib/ai/akses";
import { panggilGeminiJson } from "@/lib/ai/gemini";
import { pakaiTiket } from "@/lib/ai/kuota";
import {
  INSTRUKSI_SISTEM,
  buatPromptBatch,
  normalisasiItem,
  pecahBatch,
  POTONGAN_BATCH,
  potongBatch,
  rapikanTeks,
  skemaRespons,
  validasiRencana,
  type DraftSoal,
} from "@/lib/ai/rencana-soal";

/**
 * POST /api/ai/soal — buat SATU batch draf soal.
 *
 * Body: { jenjang?, mapelId? | mapelNama?, rencana, indeksBatch, potong?, hindari?, tiket }
 *
 * `potong` = { ke, dari }: hanya potongan ke-`ke` dari batch itu (dipakai
 * browser saat satu batch gagal berulang). Lihat `potongBatch`.
 *
 * `tiket` = id `ai_sesi_generate` dari server action `mulaiGenerateAi`
 * (satu kuota harian). Tiap panggilan memakai satu jatah panggilan tiket.
 * `mapelNama` dipakai halaman "Buat Soal AI" di sidebar yang tidak
 * terikat mapel kegiatan mana pun.
 *
 * Browser memanggil route ini berulang (indeksBatch 0, 1, 2, …) dan
 * menampilkan kemajuan. Rencana dipecah ULANG di server dengan fungsi
 * yang sama (`pecahBatch`), jadi isi batch — jumlah, skor, jatah gambar —
 * tidak bisa diatur dari browser.
 *
 * Tidak ada yang disimpan ke database di sini. Hasilnya draf untuk
 * layar tinjauan; penyimpanan tetap lewat `createSoal`/`createSoalAdmin`.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await bacaBody(req);
  if (!body) return gagal("Body permintaan tidak valid.");

  const akses = await aksesAi(body.jenjang);
  if (akses instanceof NextResponse) return akses;

  const rencana = validasiRencana(body.rencana);
  if (typeof rencana === "string") return gagal(rencana);

  const daftarBatch = pecahBatch(rencana);
  const indeks = Math.floor(Number(body.indeksBatch));
  const batchUtuh = daftarBatch[indeks];
  if (!batchUtuh) return gagal("Nomor batch di luar jangkauan.");
  // `potong` = batch yang gagal berulang diminta per potongan (lihat potongBatch).
  const potong = body.potong as { ke?: unknown; dari?: unknown } | undefined;
  const dari = Number(potong?.dari ?? 1);
  if (!(POTONGAN_BATCH as readonly number[]).includes(dari)) return gagal("Potongan batch tidak valid.");
  const batch = potongBatch(batchUtuh, Number(potong?.ke ?? 0), dari);
  if (!batch) return gagal("Potongan batch di luar jangkauan.");

  const mapelId = String(body.mapelId ?? "");
  let namaMapel: string;
  if (mapelId) {
    const { data: mapel } = await akses.client
      .from("mapel")
      .select("id, nama")
      .eq("id", mapelId)
      .maybeSingle();
    if (!mapel) return gagal("Mapel tidak ditemukan di kelas ini.", 404);
    namaMapel = mapel.nama as string;
  } else {
    namaMapel = rapikanTeks(body.mapelNama, 80);
    if (!namaMapel) return gagal("Isi nama mata pelajaran dulu.");
  }

  const galatTiket = await pakaiTiket(akses.sesi, body.tiket);
  if (galatTiket) return gagal(galatTiket, 403);

  const hindari = Array.isArray(body.hindari)
    ? body.hindari.map((h) => rapikanTeks(h, 120)).filter(Boolean).slice(-40)
    : [];

  const prompt = buatPromptBatch(batch, {
    mapel: namaMapel,
    jenjang: akses.jenjang,
    topik: rencana.topik,
    kesulitan: rencana.kesulitan,
    persenKesulitan: rencana.persenKesulitan,
    jumlahOpsi: rencana.jumlahOpsi,
    catatan: rencana.catatan,
    pemandu: rencana.pemandu,
    hindari,
  });

  try {
    const hasil = await panggilGeminiJson<{ soal?: unknown[] }>(akses.jenjang, prompt, {
      sistem: INSTRUKSI_SISTEM,
      skema: skemaRespons(batch.tipe),
      suhu: 0.8,
    });

    const mentah = Array.isArray(hasil?.soal) ? hasil.soal : [];
    const draf: DraftSoal[] = [];
    for (const item of mentah) {
      if (draf.length >= batch.jumlah) break;
      const d = normalisasiItem(
        batch.tipe,
        item,
        batch.skor[draf.length] ?? batch.skor[batch.skor.length - 1] ?? 1,
        rencana.jumlahOpsi,
        rencana.pemandu?.jenisStimulus
      );
      if (d) draf.push(d);
    }

    // Jatah gambar ditegakkan di sini juga: AI kadang menandai lebih
    // banyak soal bergambar daripada yang diminta.
    let jatah = batch.jumlahBergambar;
    for (const d of draf) {
      if (!d.gambar) continue;
      if (jatah > 0) jatah--;
      else d.gambar = null;
    }

    return NextResponse.json({
      soal: draf,
      diminta: batch.jumlah,
      dibuang: Math.max(0, batch.jumlah - draf.length),
      totalBatch: daftarBatch.length,
    });
  } catch (e) {
    return responsGalat(e);
  }
}
