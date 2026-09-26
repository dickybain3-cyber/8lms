/**
 * Pengawasan ujian — deteksi siswa meninggalkan halaman ujian sedang
 * berlangsung (pindah tab, minimize, pindah ke aplikasi lain).
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
 * Kode pembuka kunci setelah `BATAS_PERINGATAN` pelanggaran.
 *
 * ── PERINGATAN KEAMANAN — BACA SEBELUM MENGANDALKAN INI ──
 *
 * String ini ikut ter-bundle ke JavaScript yang dikirim ke BROWSER
 * SISWA. Siapa pun yang membuka DevTools (klik kanan → Inspect →
 * Sources, atau bahkan cukup "View Page Source" pada bundle produksi)
 * bisa membacanya langsung sebagai teks polos — ini BUKAN rahasia yang
 * aman secara teknis, cuma FRIKSI: cukup untuk mencegah siswa awam
 * membuka kunci sendiri dengan asal klik, tidak cukup untuk melawan
 * siswa yang sengaja mencari-cari di kode sumber.
 *
 * Kalau ini perlu benar-benar aman (bukan cuma friksi), pindahkan
 * pengecekannya ke Server Action/RPC yang membandingkan kode di server
 * (atau bahkan lebih baik: satu RPC yang dipanggil PENGAWAS dari
 * `MonitoringClient.tsx` untuk membuka kunci siswa tertentu dari jarak
 * jauh, tanpa kode sama sekali). Itu perubahan terpisah yang lebih
 * besar — di luar cakupan revisi ini, sengaja tidak dikerjakan di sini
 * supaya tidak diam-diam memperbesar lingkup tanpa sepengetahuanmu.
 */
export const KODE_BUKA_KUNCI = "DPWopen69";

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
    // localStorage tidak tersedia/penuh — bukan fatal. Catatan pelanggaran
    // ini murni pengaman sisi klien; kalau nanti dipindah ke server (lihat
    // catatan di atas `KODE_BUKA_KUNCI`), baris ini jadi tidak relevan lagi.
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
