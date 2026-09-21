/**
 * Status password akun guru (`guru.password_status`, migrasi 0017) dan
 * teks tampilannya untuk unduhan detail guru (Tahap 2, /admin/guru).
 *
 * Ditaruh di satu file terpisah, bukan ditulis inline di ExportExcel.tsx —
 * dua alasan:
 *
 *  1. Pola yang sama dengan `akun.ts`: aturan yang bisa dibaca dari lebih
 *     dari satu tempat (di sini: `admin-multi.ts` butuh tipenya,
 *     `guru/actions.ts` menulis nilainya, `ExportExcel.tsx` menampilkan
 *     labelnya) sebaiknya hidup di satu tempat yang tidak mengimpor
 *     apa-apa yang khusus server maupun khusus browser.
 *  2. Supaya bisa diuji (`tsx` + `node:assert`) tanpa ikut menyeret
 *     `@/lib/supabase/server` (lewat ExportExcel.tsx -> actions-export.ts)
 *     yang mengimpor `next/headers` dan gagal dijalankan di luar runtime
 *     Next.js.
 */

import { PASSWORD_AWAL_GURU } from "@/lib/akun";

export type StatusPasswordGuru =
  | "awal"
  | "direset_admin"
  | "diganti_guru"
  | "tidak_diketahui";

/**
 * Teks status untuk kolom "Status Password". `null` (bukan salah satu dari
 * empat status di atas) berarti migrasi 0017 belum dijalankan di jenjang
 * itu — beda pesan dari `'tidak_diketahui'` (migrasinya sudah jalan, tapi
 * riwayat akun itu sendiri memang tidak tercatat), supaya admin tahu
 * tindakannya beda: yang satu "jalankan migrasinya", yang lain "verifikasi
 * atau minta guru ganti password".
 */
export function labelStatusPassword(status: StatusPasswordGuru | null): string {
  switch (status) {
    case "awal":
      return "Awal (belum pernah diganti)";
    case "direset_admin":
      return "Direset admin";
    case "diganti_guru":
      return "Sudah diganti guru";
    case "tidak_diketahui":
      return "Tidak diketahui (akun lama, riwayat sebelum migrasi 0017 tidak tercatat)";
    case null:
      return "Tidak diketahui (migrasi 0017 belum dijalankan di jenjang ini)";
  }
}

/**
 * Isi kolom "Password". HANYA menuliskan password awal yang sungguhan
 * kalau statusnya memang `'awal'` — semua kasus lain (termasuk `null` /
 * migrasi belum jalan) ditulis keterangan, bukan menebak passwordnya.
 * Persis permintaan di bagian 6 prompt Tahap 2: jangan mengklaim `'awal'`
 * untuk akun yang riwayatnya tidak diketahui.
 */
export function isiKolomPassword(status: StatusPasswordGuru | null): string {
  switch (status) {
    case "awal":
      return PASSWORD_AWAL_GURU;
    case "direset_admin":
      return "Sudah diganti — password baru hanya tampil saat direset";
    case "diganti_guru":
      return "Sudah diganti guru (tidak bisa dibaca sistem)";
    case "tidak_diketahui":
    case null:
      return "Tidak diketahui — reset untuk memastikan";
  }
}

/** Baris dianggap "perlu ditindaklanjuti admin" untuk keperluan sorot baris
 *  Excel — status password apa pun yang tidak pasti, baik karena akun lama
 *  tak tercatat maupun migrasi belum jalan. */
export function statusPasswordPerluDitindaklanjuti(
  status: StatusPasswordGuru | null
): boolean {
  return status === "tidak_diketahui" || status === null;
}
