import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Pengawasan ujian — deteksi siswa meninggalkan halaman ujian sedang
 * berlangsung (pindah tab, minimize, pindah ke aplikasi lain), keluar dari
 * layar penuh, atau membagi layar. Pengganti aplikasi ujian untuk siswa
 * yang membuka ujian lewat browser biasa.
 *
 * Keluar layar penuh dan layar terbagi dihitung SEKETIKA (tidak ada alasan
 * sah melakukannya). Pindah tab/aplikasi tetap memakai ambang di bawah.
 *
 * ── KENAPA AMBANG WAKTU, BUKAN MENDETEKSI "INI NOTIFIKASI" ──
 *
 * JavaScript di halaman TIDAK PUNYA cara membedakan "jendela kehilangan
 * fokus karena notifikasi OS muncul sebentar" dari "siswa sungguhan
 * pindah ke aplikasi lain" — keduanya sama-sama cuma terlihat sebagai
 * `visibilitychange`/`blur`. Pembedanya dibuat lewat DURASI: notifikasi
 * (baik cuma dilihat sekilas maupun diklik untuk ditutup) selesai dalam
 * waktu singkat dan jendela kembali fokus; pindah tab/aplikasi yang
 * disengaja bertahan lebih lama. `AMBANG_MENINGGALKAN_MS` adalah garis
 * pembedanya — di bawah itu diabaikan total, di atas itu satu
 * pelanggaran tercatat.
 *
 * Konsekuensinya: siswa yang membuka notifikasi dan MEMBACANYA (bukan
 * cuma menutup) selama lebih dari ambang ini AKAN tercatat sebagai
 * pelanggaran juga — itu yang memang diinginkan (dia sungguhan berhenti
 * memperhatikan ujian), bukan celah yang perlu ditambal.
 */

export const AMBANG_MENINGGALKAN_MS = 10_000; // 10 detik

/** Setelah pelanggaran ke berapa, ujian dikunci dan minta kode pengawas. */
export const BATAS_PERINGATAN = 3;

/**
 * Kode pembuka kunci TIDAK ada di kode klien. Kode 6 angka dihitung di
 * database tiap project (migrasi 0026) dan berganti tiap
 * `MENIT_KODE_PENGAMAN` menit; admin melihatnya di menu "Kode Pengaman".
 * Harus sama dengan `300` detik di 0026_pengaman_ujian.sql.
 */
export const MENIT_KODE_PENGAMAN = 5;

export type JenisPelanggaran =
  | "keluar_layar_penuh"
  | "pindah_aplikasi"
  | "layar_terbagi";

export const LABEL_PELANGGARAN: Record<JenisPelanggaran, string> = {
  keluar_layar_penuh: "keluar dari layar penuh",
  pindah_aplikasi: "pindah tab atau aplikasi",
  layar_terbagi: "membagi layar (split screen)",
};

/**
 * Split screen di HP: jendela browser tinggal kira-kira separuh layar.
 * Keyboard di layar juga memendekkan tinggi, jadi saat kolom isian sedang
 * aktif tinggi diabaikan dan hanya lebar yang dihitung.
 */
export function terlihatLayarTerbagi(u: {
  lebarJendela: number;
  tinggiJendela: number;
  lebarLayar: number;
  tinggiLayar: number;
  sedangMengetik: boolean;
}): boolean {
  if (u.lebarLayar <= 0 || u.tinggiLayar <= 0) return false;
  if (u.lebarJendela < u.lebarLayar * 0.7) return true;
  if (u.sedangMengetik) return false;
  // 0.6, bukan 0.7: di luar layar penuh bilah alamat + bilah status +
  // navigasi Android sudah memakan sampai ~25% tinggi.
  return u.tinggiJendela < u.tinggiLayar * 0.6;
}

// ---------------------------------------------------------------------------
// Layar penuh. Awalan webkit untuk Safari iPad dan browser Android lama.
// iPhone Safari tidak mendukung layar penuh untuk halaman sama sekali:
// di sana `dukungLayarPenuh()` false dan pengawasan memakai deteksi
// pindah aplikasi + layar terbagi saja.
// ---------------------------------------------------------------------------
type DokumenWebkit = Document & {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
};
type ElemenWebkit = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

/**
 * Dibuka dari aplikasi ExamSafer (examsafer-android, UjianActivity.kt
 * menambahkan `ExamSaferSMPN8/<versi>` ke user agent). Aplikasi itu sudah
 * menyematkan layar (lock task) dan menangkap layar terbagi sendiri, dan
 * WebView-nya tidak menangani layar penuh HTML. Tanpa pengecualian ini,
 * permintaan layar penuh yang gagal/keluar sendiri di WebView bisa terbaca
 * sebagai pelanggaran.
 */
export function diAplikasiExamSafer(): boolean {
  if (typeof navigator === "undefined") return false;
  return /ExamSaferSMPN8\//.test(navigator.userAgent);
}

export function dukungLayarPenuh(): boolean {
  if (typeof document === "undefined") return false;
  if (diAplikasiExamSafer()) return false;
  const d = document as DokumenWebkit;
  return Boolean(d.fullscreenEnabled || d.webkitFullscreenEnabled);
}

export function sedangLayarPenuh(): boolean {
  if (typeof document === "undefined") return false;
  const d = document as DokumenWebkit;
  return Boolean(d.fullscreenElement || d.webkitFullscreenElement);
}

/** Harus dipanggil langsung dari ketukan siswa (aturan browser). */
export async function masukLayarPenuh(): Promise<boolean> {
  if (!dukungLayarPenuh()) return false;
  if (sedangLayarPenuh()) return true;
  const el = document.documentElement as ElemenWebkit;
  try {
    if (el.requestFullscreen) {
      await el.requestFullscreen({ navigationUI: "hide" });
    } else if (el.webkitRequestFullscreen) {
      await el.webkitRequestFullscreen();
    }
  } catch {
    return false;
  }
  return sedangLayarPenuh();
}

export async function keluarLayarPenuh(): Promise<void> {
  if (!sedangLayarPenuh()) return;
  try {
    await document.exitFullscreen?.();
  } catch {
    // abaikan
  }
}

/** Status dari server. `null` = gagal (offline / migrasi 0026 belum jalan). */
export async function bacaPelanggaranServer(
  client: Pick<SupabaseClient, "from">,
  siswaId: string,
  mapelId: string
): Promise<StatusPelanggaran | null> {
  const { data, error } = await client
    .from("pelanggaran_ujian")
    .select("jumlah, terkunci")
    .eq("siswa_id", siswaId)
    .eq("mapel_id", mapelId)
    .maybeSingle();
  if (error) return null;
  const row = data as Partial<StatusPelanggaran> | null;
  return {
    jumlah: typeof row?.jumlah === "number" ? row.jumlah : 0,
    terkunci: Boolean(row?.terkunci),
  };
}

export async function catatPelanggaranServer(
  client: Pick<SupabaseClient, "rpc">,
  mapelId: string,
  jenis: JenisPelanggaran
): Promise<StatusPelanggaran | null> {
  const { data, error } = await client.rpc("catat_pelanggaran_ujian", {
    p_mapel_id: mapelId,
    p_jenis: jenis,
  });
  if (error) return null;
  const row = (Array.isArray(data) ? data[0] : data) as
    | Partial<StatusPelanggaran>
    | undefined;
  if (!row || typeof row.jumlah !== "number") return null;
  return { jumlah: row.jumlah, terkunci: Boolean(row.terkunci) };
}

export type HasilBukaKunci =
  | { ok: true }
  | { ok: false; pesan: string };

export async function bukaKunciServer(
  client: Pick<SupabaseClient, "rpc">,
  mapelId: string,
  kode: string
): Promise<HasilBukaKunci> {
  const { data, error } = await client.rpc("buka_kunci_pelanggaran", {
    p_mapel_id: mapelId,
    p_kode: kode.replace(/\s/g, ""),
  });
  if (error) {
    return {
      ok: false,
      pesan: /terlalu banyak/i.test(error.message)
        ? error.message
        : "Gagal memeriksa kode. Pastikan internet menyala lalu coba lagi.",
    };
  }
  return data === true
    ? { ok: true }
    : { ok: false, pesan: "Kode salah atau sudah kedaluwarsa. Minta kode terbaru ke admin." };
}

const PREFIX = "lms_pelanggaran";

function storageKey(siswaId: string, mapelId: string): string {
  return `${PREFIX}:${siswaId}:${mapelId}`;
}

export interface StatusPelanggaran {
  jumlah: number;
  terkunci: boolean;
}

const KOSONG: StatusPelanggaran = { jumlah: 0, terkunci: false };

/**
 * Baca status pelanggaran dari localStorage — dipanggil SEKALI saat
 * `ExamClient` mount, supaya refresh halaman TIDAK mereset hitungan.
 * Kalau ini murni state React (tanpa localStorage), siswa yang sudah
 * kena 3 pelanggaran dan dikunci tinggal me-refresh halaman untuk lolos
 * — persis celah yang mau ditutup fitur ini.
 */
export function bacaPelanggaranLokal(
  siswaId: string,
  mapelId: string
): StatusPelanggaran {
  try {
    const raw = localStorage.getItem(storageKey(siswaId, mapelId));
    if (!raw) return { ...KOSONG };
    const parsed = JSON.parse(raw) as Partial<StatusPelanggaran>;
    return {
      jumlah: typeof parsed.jumlah === "number" ? parsed.jumlah : 0,
      terkunci: Boolean(parsed.terkunci),
    };
  } catch {
    return { ...KOSONG };
  }
}

export function simpanPelanggaranLokal(
  siswaId: string,
  mapelId: string,
  status: StatusPelanggaran
) {
  try {
    localStorage.setItem(storageKey(siswaId, mapelId), JSON.stringify(status));
  } catch {
    // localStorage tidak tersedia/penuh — bukan fatal. Sumber kebenaran
    // ada di tabel `pelanggaran_ujian`; ini hanya cadangan saat offline.
  }
}

/** Dipanggil setelah ujian berhasil dikumpulkan — sama seperti
 *  `hapusJawabanLokal`/`hapusPaketSoal`, supaya catatan pelanggaran mapel
 *  yang sudah selesai tidak "nyangkut" kalau siswa membuka mapel lain. */
export function hapusPelanggaranLokal(siswaId: string, mapelId: string) {
  try {
    localStorage.removeItem(storageKey(siswaId, mapelId));
  } catch {
    // abaikan
  }
}
