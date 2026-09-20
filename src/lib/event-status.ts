/**
 * Status sebuah event (kegiatan) berdasarkan `tgl_mulai` & `tgl_selesai`.
 *
 * ── KENAPA FILE INI ADA ──
 *
 * Kolom `tgl_mulai` / `tgl_selesai` bertipe DATE (tanpa jam) — form-nya
 * memakai <input type="date"> dan nilainya "2026-09-18". Kode lama
 * membandingkannya begini:
 *
 *   new Date("2026-09-18").getTime() >= Date.now()
 *
 * `new Date("YYYY-MM-DD")` dibaca sebagai 00:00 UTC, yaitu 07:00 WIB.
 * Akibatnya event dianggap SELESAI mulai pukul 07:00 WIB di hari
 * TERAKHIRnya sendiri — padahal ujian hari itu baru saja dimulai. Di
 * halaman mana pun yang memfilter/menyembunyikan event "selesai", event
 * itu lenyap dari daftar di tengah hari pelaksanaan.
 *
 * Aturan yang benar: `tgl_selesai` itu INKLUSIF. Event baru selesai
 * setelah hari `tgl_selesai` berakhir (00:00 WIB hari berikutnya).
 * Semua perbandingan dilakukan dalam zona WIB, bukan zona server —
 * server (Vercel dsb.) hampir selalu berjalan di UTC.
 *
 * Pakai fungsi ini di SEMUA tempat yang perlu tahu status event
 * (daftar kegiatan, dashboard, sisi siswa) supaya tidak ada dua definisi
 * "selesai" yang saling bertentangan.
 */

export type StatusEvent = "berjalan" | "terjadwal" | "selesai";

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const HARI_MS = 24 * 60 * 60 * 1000;

/** "2026-09-18" (atau ISO yang diawali tanggal itu) → epoch ms 00:00 WIB. */
function awalHariWib(tgl: string): number {
  const [y, m, d] = tgl.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d) - WIB_OFFSET_MS;
}

export function statusEvent(
  tglMulai: string,
  tglSelesai: string,
  sekarang: number = Date.now()
): StatusEvent {
  const mulai = awalHariWib(tglMulai);
  // Batas atas eksklusif: awal hari SETELAH tgl_selesai.
  const batas = awalHariWib(tglSelesai) + HARI_MS;

  if (sekarang < mulai) return "terjadwal";
  if (sekarang >= batas) return "selesai";
  return "berjalan";
}

/**
 * Urutan tampil di daftar: yang sedang berlangsung paling atas, lalu yang
 * akan datang, lalu yang sudah selesai paling bawah. Di dalam tiap
 * kelompok:
 *   - berjalan  → yang mulai lebih dulu di atas
 *   - terjadwal → yang paling dekat dimulai di atas
 *   - selesai   → yang baru saja berakhir di atas (paling mungkin dibuka
 *                 ulang untuk susulan)
 */
export const URUTAN_STATUS: StatusEvent[] = ["berjalan", "terjadwal", "selesai"];

export function kelompokkanEvent<
  T extends { tgl_mulai: string; tgl_selesai: string },
>(daftar: T[], sekarang: number = Date.now()): Record<StatusEvent, T[]> {
  const hasil: Record<StatusEvent, T[]> = {
    berjalan: [],
    terjadwal: [],
    selesai: [],
  };

  for (const e of daftar) {
    hasil[statusEvent(e.tgl_mulai, e.tgl_selesai, sekarang)].push(e);
  }

  const byMulai = (a: T, b: T) => a.tgl_mulai.localeCompare(b.tgl_mulai);
  hasil.berjalan.sort(byMulai);
  hasil.terjadwal.sort(byMulai);
  hasil.selesai.sort((a, b) => b.tgl_selesai.localeCompare(a.tgl_selesai));

  return hasil;
}
