/**
 * Klien Gemini — SERVER-ONLY. Jangan pernah mengimpor file ini dari
 * Client Component: kunci API dibaca dari env TANPA prefix `NEXT_PUBLIC_`,
 * jadi di browser nilainya kosong (dan memang tidak boleh sampai sana).
 *
 * ── KUNCI PER JENJANG, BERGILIR ──
 *
 * Tiap project Supabase (kelas 7/8/9) punya kumpulan kuncinya sendiri,
 * DISARANKAN di tabel `ai_kunci` project itu (migrasi 0022, lihat
 * `kunci.ts`). Alternatif lewat env server:
 *
 *   GEMINI_API_KEYS_7="kunci1,kunci2,...,kunci10"
 *   GEMINI_API_KEYS_8="..."
 *   GEMINI_API_KEYS_9="..."
 *   GEMINI_API_KEYS="..."      (opsional — cadangan bersama)
 *
 * Pemisahnya boleh koma, titik koma, spasi, atau baris baru. Setiap
 * panggilan mulai dari kunci berikutnya (round-robin) supaya kuota harian
 * terbagi rata. Kunci yang kena 429 (kuota/limit per menit) diistirahatkan
 * sebentar dan panggilan langsung dicoba dengan kunci lain; kunci yang
 * ditolak (401/403, kunci salah/dicabut) diistirahatkan lebih lama.
 *
 * Status giliran disimpan di memori proses. Di hosting serverless tiap
 * instance punya salinannya sendiri — tidak masalah: yang terburuk,
 * satu kunci yang sedang penuh dicoba sekali lagi oleh instance lain,
 * lalu instance itu ikut pindah ke kunci berikutnya.
 *
 * ── MODEL ──
 *
 * Default `gemini-flash-latest`: alias resmi yang selalu menunjuk model
 * Flash terbaru, jadi aplikasi tidak mati saat versi bernomor dipensiunkan
 * (gemini-2.5-flash dijadwalkan berhenti Oktober 2026). Bisa ditimpa
 * lewat `GEMINI_MODEL`. Kalau model utama tidak ditemukan (404), dicoba
 * `GEMINI_MODEL_CADANGAN` (default `gemini-flash-lite-latest`).
 */

import type { Jenjang } from "@/lib/jenjang";
import { kunciDariDatabase } from "@/lib/ai/kunci";

const MODEL_UTAMA = process.env.GEMINI_MODEL?.trim() || "gemini-flash-latest";
const MODEL_CADANGAN =
  process.env.GEMINI_MODEL_CADANGAN?.trim() || "gemini-flash-lite-latest";

const ISTIRAHAT_429_MS = 65_000;
const ISTIRAHAT_DITOLAK_MS = 30 * 60_000;
const BATAS_WAKTU_MS = 50_000;

export class GalatAi extends Error {
  constructor(
    message: string,
    /** Kode HTTP yang pantas dikembalikan route ke browser. */
    public status = 502
  ) {
    super(message);
  }
}

function pecahKunci(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(/[\s,;]+/)
    .map((k) => k.trim())
    .filter((k) => k.length > 10);
}

/**
 * Gabungan dua sumber: tabel `ai_kunci` di project Supabase jenjang itu
 * (migrasi 0022 — cara yang disarankan untuk sekolah) dan env server.
 * Duplikat dibuang.
 */
async function kunciUntuk(jenjang: Jenjang): Promise<string[]> {
  // Akses dinamis aman: var tanpa NEXT_PUBLIC_ hanya ada di runtime server.
  const milikJenjang = pecahKunci(process.env[`GEMINI_API_KEYS_${jenjang}`]);
  const bersama = pecahKunci(process.env.GEMINI_API_KEYS);
  const dariDb = await kunciDariDatabase(jenjang, "gemini");
  return Array.from(new Set([...dariDb, ...milikJenjang, ...bersama]));
}

export async function aiTersedia(jenjang: Jenjang): Promise<boolean> {
  return (await kunciUntuk(jenjang)).length > 0;
}

const giliran = new Map<Jenjang, number>();
const istirahat = new Map<string, number>();

/** Urutan kunci untuk satu panggilan: mulai dari giliran berikutnya,
 *  kunci yang sedang istirahat ditaruh paling belakang (tetap dicoba
 *  kalau semua kunci lain gagal — lebih baik daripada langsung menyerah). */
async function urutanKunci(jenjang: Jenjang): Promise<string[]> {
  const semua = await kunciUntuk(jenjang);
  if (semua.length === 0) return [];
  const mulai = (giliran.get(jenjang) ?? 0) % semua.length;
  giliran.set(jenjang, mulai + 1);
  const berputar = [...semua.slice(mulai), ...semua.slice(0, mulai)];
  const sekarang = Date.now();
  const siap = berputar.filter((k) => (istirahat.get(k) ?? 0) <= sekarang);
  const lelah = berputar.filter((k) => (istirahat.get(k) ?? 0) > sekarang);
  return [...siap, ...lelah];
}

export interface OpsiPanggilan {
  sistem?: string;
  /** Skema `responseSchema`. Kosong = minta JSON tanpa skema. */
  skema?: Record<string, unknown>;
  suhu?: number;
}

interface ResponsGemini {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string };
}

async function satuPanggilan(
  model: string,
  kunci: string,
  prompt: string,
  opsi: OpsiPanggilan,
  pakaiSkema: boolean
): Promise<{ status: number; body: ResponsGemini | null }> {
  const pengendali = new AbortController();
  const timer = setTimeout(() => pengendali.abort(), BATAS_WAKTU_MS);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model
      )}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": kunci,
        },
        body: JSON.stringify({
          ...(opsi.sistem
            ? { systemInstruction: { parts: [{ text: opsi.sistem }] } }
            : {}),
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: opsi.suhu ?? 0.8,
            responseMimeType: "application/json",
            ...(pakaiSkema && opsi.skema ? { responseSchema: opsi.skema } : {}),
          },
        }),
        signal: pengendali.signal,
        cache: "no-store",
      }
    );
    const body = (await res.json().catch(() => null)) as ResponsGemini | null;
    return { status: res.status, body };
  } catch (e) {
    if ((e as Error).name === "AbortError") return { status: 504, body: null };
    return { status: 503, body: null };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Panggil Gemini dan kembalikan JSON hasil parse.
 *
 * Melempar `GalatAi` berbahasa manusia. Pesan error dari Google TIDAK
 * diteruskan mentah ke browser — kadang memuat potongan kunci/proyek.
 */
export async function panggilGeminiJson<T = unknown>(
  jenjang: Jenjang,
  prompt: string,
  opsi: OpsiPanggilan = {}
): Promise<T> {
  const daftar = await urutanKunci(jenjang);
  if (daftar.length === 0) {
    throw new GalatAi(
      `Kunci Gemini untuk kelas ${jenjang} belum dipasang. Isi tabel ai_kunci di Supabase kelas ${jenjang} (lihat docs/FITUR-AI-SOAL.md), atau env GEMINI_API_KEYS_${jenjang}.`,
      503
    );
  }

  let model = MODEL_UTAMA;
  let pakaiSkema = true;
  let alasanTerakhir = "";

  // Setiap kunci paling banyak dicoba sekali per panggilan; perubahan
  // model/skema mengulang kunci yang sama tanpa dihitung.
  for (let i = 0; i < daftar.length; i++) {
    const kunci = daftar[i];
    const { status, body } = await satuPanggilan(model, kunci, prompt, opsi, pakaiSkema);

    if (status === 200 && body) {
      if (body.promptFeedback?.blockReason) {
        throw new GalatAi(
          "Permintaan ditolak filter keamanan AI. Ubah kata-kata topik/catatan lalu coba lagi.",
          422
        );
      }
      const teks = (body.candidates?.[0]?.content?.parts ?? [])
        .map((p) => p.text ?? "")
        .join("")
        .trim();
      if (!teks) {
        alasanTerakhir = "respons kosong";
        continue;
      }
      try {
        return JSON.parse(bersihkanJson(teks)) as T;
      } catch {
        // Biasanya JSON terpotong karena kepanjangan. Coba kunci lain
        // sekali; kalau tetap, pemanggil sebaiknya memperkecil batch.
        alasanTerakhir = "JSON tidak utuh";
        continue;
      }
    }

    if (status === 429) {
      istirahat.set(kunci, Date.now() + ISTIRAHAT_429_MS);
      alasanTerakhir = "kuota/limit tercapai";
      continue;
    }
    // Kunci salah/kedaluwarsa dikembalikan Google sebagai 400
    // INVALID_ARGUMENT berisi "API key not valid" (dicek Oktober 2026),
    // bukan 401 — jadi harus dikenali dari pesannya supaya giliran
    // tetap pindah ke kunci berikutnya.
    const kunciTidakSah =
      status === 400 &&
      /api[_ ]key|API_KEY_INVALID|expired/i.test(JSON.stringify(body?.error ?? ""));
    if (status === 401 || status === 403 || kunciTidakSah) {
      istirahat.set(kunci, Date.now() + ISTIRAHAT_DITOLAK_MS);
      alasanTerakhir = "kunci ditolak";
      continue;
    }
    if (status === 404 && model !== MODEL_CADANGAN) {
      model = MODEL_CADANGAN;
      i--; // ulangi kunci yang sama dengan model cadangan
      continue;
    }
    if (status === 400 && pakaiSkema && /schema/i.test(body?.error?.message ?? "")) {
      // Model tertentu menolak sebagian fitur responseSchema. Prompt
      // sudah menjelaskan bentuk JSON-nya, jadi cukup minta JSON biasa.
      pakaiSkema = false;
      i--;
      continue;
    }
    if (status === 400) {
      throw new GalatAi(
        "Permintaan ke AI tidak valid. Coba kurangi panjang catatan/topik.",
        400
      );
    }
    // 5xx / jaringan / batas waktu -> coba kunci berikutnya.
    alasanTerakhir = status === 504 ? "batas waktu" : `server AI sibuk (${status})`;
  }

  throw new GalatAi(
    `Semua kunci Gemini kelas ${jenjang} sedang tidak bisa dipakai (${alasanTerakhir}). Tunggu 1-2 menit lalu coba lagi.`,
    503
  );
}

/** Beberapa model membungkus JSON dengan ```json … ``` walau diminta JSON. */
function bersihkanJson(teks: string): string {
  const pagar = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(teks);
  return pagar ? pagar[1] : teks;
}
