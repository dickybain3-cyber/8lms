/**
 * Satu tempat untuk identitas visual sekolah (nama, logo, foto gedung).
 *
 * Kenapa dikumpulkan di sini, bukan ditulis langsung di tiap komponen:
 * URL Cloudinary-nya panjang dan dipakai di banyak tempat (halaman
 * login, header siswa, sidebar admin, footer). Kalau nanti logonya
 * diganti/di-reupload, cukup ubah satu baris di file ini.
 *
 * Domain `res.cloudinary.com` sudah terdaftar di `next.config.js`
 * (`images.remotePatterns`), jadi URL di bawah aman dipakai lewat
 * `next/image`.
 */

export const SEKOLAH = {
  nama: "SMP NEGERI 8",
  kota: "PROBOLINGGO",
  namaPendek: "LMS SMPN 8 Probolinggo",
  tahun: 2026,
  pembuat: "dhickz666",
} as const;

/** Logo sekolah (PNG transparan). */
export const LOGO_URL =
  "https://res.cloudinary.com/dugvpuniy/image/upload/v1776474064/logosmp8-png_1_hrq8fu.png";

/** Foto gedung sekolah — latar halaman login. */
export const BG_LOGIN_URL =
  "https://res.cloudinary.com/dugvpuniy/image/upload/v1776474151/smpn8prob_t0nmah.jpg";
