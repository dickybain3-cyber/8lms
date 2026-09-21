/**
 * Jenis kegiatan (`event.jenis`, migrasi 0018) dan aturan tampilannya.
 *
 * Ditaruh terpisah dari `event-status.ts` (itu soal WAKTU — berjalan/
 * terjadwal/selesai — orthogonal terhadap jenis) supaya kedua sumbu tidak
 * tercampur di satu file, dan supaya bisa diimpor dari file plain (tanpa
 * `next/headers` maupun Supabase) baik di server, client, maupun di uji.
 *
 * ── PERUBAHAN TAHAP 4 ──
 *
 * Sampai Tahap 3, file ini cuma punya satu sumbu biner: `pakaiMesinUjian`
 * (true = mapel/soal, false = "belum ada apa-apa"). Itu cukup selama cuma
 * ada SATU mesin. Sekarang ada dua yang jalan (ujian dan tugas) dan satu
 * yang belum (forum), jadi satu boolean tidak lagi bisa menjawab dua
 * pertanyaan yang berbeda:
 *
 *   "Mesin apa yang dipakai jenis ini?"        -> `mesin`
 *   "Apakah fiturnya sudah bisa dipakai?"      -> `siap`
 *
 * `pakaiMesinUjian()` SENGAJA dipertahankan dengan arti yang persis sama
 * seperti sebelumnya (mapel/soal atau bukan) — dia dipakai `createMapel`
 * dan trigger DB 0018 sebagai penjaga, dan mengubah artinya diam-diam
 * adalah cara paling rapi untuk melubangi penjaga itu.
 */

import type { JenisEvent } from "@/types";

export type { JenisEvent };

/** Mesin penyimpanan konten di balik sebuah jenis kegiatan. */
export type MesinKegiatan = "ujian" | "tugas" | "forum";

export interface DefinisiJenisEvent {
  value: JenisEvent;
  /** Label di sisi guru — form buat event, badge di daftar/detail. */
  label: string;
  /** Label di sisi siswa — sengaja beda kata untuk asesmen_akhir vs
   *  kuis_harian ("Ujian" vs "Kuis") walau keduanya satu mesin yang sama. */
  labelSiswa: string;
  ikon: string; // kelas FontAwesome, tanpa "fas fa-" (mis. "clipboard-check")
  deskripsi: string;
  /**
   * Mesin mana yang menyimpan isinya:
   *   "ujian" -> mapel/soal/jawaban_siswa/nilai   (0002-0007)
   *   "tugas" -> tugas/tugas_kelas/pengumpulan_tugas (0019, Tahap 4)
   *   "forum" -> forum_topik                      (Tahap 5, belum ada)
   */
  mesin: MesinKegiatan;
  /** true = mesin ujian (mapel/soal). Dipertahankan apa adanya dari Tahap
   *  3 karena dipakai sebagai PENJAGA di `createMapel` dan dicerminkan
   *  trigger DB 0018 — jangan diubah artinya. Sekarang setara dengan
   *  `mesin === "ujian"`, dan dijaga tetap begitu oleh uji. */
  pakaiMesinUjian: boolean;
  /** false = kegiatan boleh dibuat (fondasinya ada), tapi halaman untuk
   *  mengisi kontennya belum dibangun. */
  siap: boolean;
  /** Tahap keberapa fiturnya direncanakan, kalau `siap` masih false. */
  tahapRencana: number | null;
}

export const DAFTAR_JENIS_EVENT: DefinisiJenisEvent[] = [
  {
    value: "asesmen_akhir",
    label: "Asesmen Akhir",
    labelSiswa: "Ujian",
    ikon: "clipboard-check",
    deskripsi: "PTS, PAS, ujian sekolah — mapel/soal seperti biasa.",
    mesin: "ujian",
    pakaiMesinUjian: true,
    siap: true,
    tahapRencana: null,
  },
  {
    value: "kuis_harian",
    label: "Kuis Harian",
    labelSiswa: "Kuis",
    ikon: "bolt",
    deskripsi:
      "Kuis singkat harian — mesin yang sama, cuma beda label & durasi default.",
    mesin: "ujian",
    pakaiMesinUjian: true,
    siap: true,
    tahapRencana: null,
  },
  {
    value: "assignment",
    label: "Tugas",
    labelSiswa: "Tugas",
    ikon: "file-arrow-up",
    deskripsi:
      "Siswa mengumpulkan tulisan dan/atau berkas, lalu guru menilainya satu per satu.",
    mesin: "tugas",
    pakaiMesinUjian: false,
    siap: true,
    tahapRencana: null,
  },
  {
    value: "forum",
    label: "Forum Diskusi",
    labelSiswa: "Forum",
    ikon: "comments",
    deskripsi: "Diskusi kelas dengan poin keaktifan — menyusul di Tahap 5.",
    mesin: "forum",
    pakaiMesinUjian: false,
    siap: false,
    tahapRencana: 5,
  },
];

const PETA_JENIS_EVENT: Record<JenisEvent, DefinisiJenisEvent> =
  Object.fromEntries(DAFTAR_JENIS_EVENT.map((j) => [j.value, j])) as Record<
    JenisEvent,
    DefinisiJenisEvent
  >;

export function jenisEventValid(value: unknown): value is JenisEvent {
  return DAFTAR_JENIS_EVENT.some((j) => j.value === value);
}

export function definisiJenisEvent(jenis: JenisEvent): DefinisiJenisEvent {
  return PETA_JENIS_EVENT[jenis];
}

/** Dipakai `createMapel`/trigger DB 0018 untuk menolak mapel di event yang
 *  tidak memakai mesin ujian. */
export function pakaiMesinUjian(jenis: JenisEvent): boolean {
  return PETA_JENIS_EVENT[jenis].pakaiMesinUjian;
}

/** Cermin `pakaiMesinUjian` untuk Tahap 4 — dipakai `createTugas` dan
 *  dicerminkan trigger DB `cegah_tugas_di_event_bukan_assignment` (0019). */
export function pakaiMesinTugas(jenis: JenisEvent): boolean {
  return PETA_JENIS_EVENT[jenis].mesin === "tugas";
}

/** false = halaman pengisian kontennya belum dibangun (forum). */
export function jenisEventSiap(jenis: JenisEvent): boolean {
  return PETA_JENIS_EVENT[jenis].siap;
}

export function labelJenisEvent(jenis: JenisEvent): string {
  return PETA_JENIS_EVENT[jenis].label;
}

export function labelSiswaJenisEvent(jenis: JenisEvent): string {
  return PETA_JENIS_EVENT[jenis].labelSiswa;
}

/**
 * Kata benda untuk "isi" sebuah kegiatan, dipakai di kalimat UI generik
 * ("Belum ada {isi}"). Dipusatkan di sini supaya halaman detail event
 * tidak perlu menulis rantai ternary sendiri tiap kali ada jenis baru.
 */
export function istilahIsiKegiatan(jenis: JenisEvent): string {
  switch (PETA_JENIS_EVENT[jenis].mesin) {
    case "ujian":
      return "mata pelajaran";
    case "tugas":
      return "tugas";
    case "forum":
      return "topik diskusi";
  }
}
