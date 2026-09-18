/**
 * Sesi 16 — autosave local-first. Jawaban siswa ditulis ke localStorage
 * SETIAP kali berubah (instan, tidak butuh internet), lalu disinkron ke
 * Supabase secara berkala dengan jeda ACAK per siswa (bukan interval
 * tetap) supaya ratusan siswa tidak nge-hit server di detik yang sama.
 *
 * Kenapa localStorage, bukan IndexedDB (rencana awal Sesi 1)? Data yang
 * disimpan di sini kecil (jawaban satu mapel — string/angka per soal,
 * biasanya di bawah beberapa KB), dan localStorage API-nya SINKRON &
 * jauh lebih sedikit kode untuk kasus sekecil ini. IndexedDB unggul
 * untuk data besar/butuh query — bukan kasus kita. Kalau nanti satu
 * mapel bisa punya ratusan soal bergambar ter-embed (harusnya tidak,
 * gambar selalu di Cloudinary sebagai URL, bukan blob), baru layak
 * dipertimbangkan ulang.
 */

const PREFIX = "lms_jawaban";

function storageKey(siswaId: string, mapelId: string): string {
  return `${PREFIX}:${siswaId}:${mapelId}`;
}

interface SnapshotLokal {
  jawaban: Record<string, unknown>;
  savedAt: number; // epoch ms — dipakai cuma untuk debug/observability, bukan logika pemilihan
}

/** Simpan snapshot jawaban ke localStorage. Gagal diam-diam (mis. quota penuh/Safari private mode) — autosave tetap coba ke server seperti biasa, ini murni lapis tambahan. */
export function simpanJawabanLokal(
  siswaId: string,
  mapelId: string,
  jawaban: Record<string, unknown>
) {
  try {
    const snapshot: SnapshotLokal = { jawaban, savedAt: Date.now() };
    localStorage.setItem(storageKey(siswaId, mapelId), JSON.stringify(snapshot));
  } catch {
    // localStorage tidak tersedia/penuh — bukan fatal, lanjut saja.
  }
}

/**
 * Baca snapshot lokal kalau ada. Dipakai SEKALI saat halaman ujian
 * dibuka (lihat `ExamClient.tsx`) — kalau ada, dipakai sebagai state
 * awal MENGGANTIKAN `jawabanAwal` dari server, karena localStorage
 * cuma terisi lewat perubahan jawaban siswa sendiri di perangkat ini,
 * jadi lebih baru atau sama dengan yang di server, tidak pernah lebih
 * lama (skenario yang mau ditutup: tab ketutup sebelum sinkron sempat
 * jalan, jawaban terakhir "ketinggalan" di localStorage doang).
 */
export function bacaJawabanLokal(
  siswaId: string,
  mapelId: string
): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(storageKey(siswaId, mapelId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SnapshotLokal;
    return parsed.jawaban ?? null;
  } catch {
    return null;
  }
}

/** Hapus snapshot lokal — dipanggil setelah submit final berhasil, supaya tidak "nyangkut" kalau siswa buka mapel lain lalu balik lagi. */
export function hapusJawabanLokal(siswaId: string, mapelId: string) {
  try {
    localStorage.removeItem(storageKey(siswaId, mapelId));
  } catch {
    // abaikan
  }
}

/**
 * Jeda sinkron acak per siswa — dipanggil SEKALI per mount komponen
 * (lihat `useRef` di `ExamClient.tsx`), bukan di-random ulang tiap
 * tick, supaya periodenya stabil selama satu sesi ujian, bukan
 * "mengembara" tiap kali fire.
 */
export function jedaSinkronAcakMs(): number {
  const MIN = 70_000; // 70 detik
  const MAX = 180_000; // 3 menit
  return Math.floor(Math.random() * (MAX - MIN)) + MIN;
}

/**
 * Jitter submit final (0-15 detik) — HANYA dipakai untuk auto-submit
 * saat waktu habis (bukan submit manual siswa klik tombol). Lihat
 * komentar di `kumpulkan()` (`ExamClient.tsx`) soal kenapa jitter ini
 * diterapkan SETELAH kunci input, bukan menunda waktu ujiannya.
 */
export function jitterSubmitMs(): number {
  return Math.floor(Math.random() * 15_000);
}
