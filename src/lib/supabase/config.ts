import type { Jenjang } from "@/lib/jenjang";

/**
 * Sesi 16 — 3 project Supabase terpisah, satu per jenjang, masing-masing
 * kredensial sendiri di `.env.local` dengan akhiran `_7`/`_8`/`_9`. Modul
 * ini SATU-SATUNYA tempat yang tahu pola penamaan env var itu — kalau
 * nanti pola penamaan berubah, cuma file ini yang perlu disentuh, bukan
 * puluhan pemanggil `createClient()` yang tersebar di seluruh app.
 *
 * PENTING — kenapa akses env var-nya ditulis literal per jenjang
 * (bukan `process.env[\`NEXT_PUBLIC_..._${jenjang}\`]` yang lebih
 * ringkas): Next.js meng-inline nilai `NEXT_PUBLIC_*` ke bundle
 * BROWSER lewat static replacement saat build — itu cuma jalan kalau
 * akses propertinya literal (`process.env.NEXT_PUBLIC_SUPABASE_URL_7`).
 * Akses dinamis/computed (`process.env[nama]`) TIDAK ke-inline sama
 * sekali di kode yang jalan di browser, hasilnya `undefined` diam-diam
 * (baru ketahuan pas testing, bukan pas build/`tsc`). Karena jenjang
 * cuma 3 nilai tetap (7/8/9), literal per-cabang di bawah ini lebih
 * aman daripada ringkas tapi diam-diam rusak di production.
 */

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export interface SupabaseAdminConfig extends SupabaseConfig {
  serviceRoleKey: string;
}

export interface CloudinaryConfig {
  cloudName: string;
  uploadPreset: string;
}

function wajib(value: string | undefined, namaVar: string): string {
  if (!value) {
    throw new Error(
      `Variabel environment "${namaVar}" belum diset di .env.local — cek .env.local.example untuk daftar lengkap 3 set kredensial (jenjang 7/8/9).`
    );
  }
  return value;
}

export function getSupabaseConfig(jenjang: Jenjang): SupabaseConfig {
  switch (jenjang) {
    case 7:
      return {
        url: wajib(process.env.NEXT_PUBLIC_SUPABASE_URL_7, "NEXT_PUBLIC_SUPABASE_URL_7"),
        anonKey: wajib(
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_7,
          "NEXT_PUBLIC_SUPABASE_ANON_KEY_7"
        ),
      };
    case 8:
      return {
        url: wajib(process.env.NEXT_PUBLIC_SUPABASE_URL_8, "NEXT_PUBLIC_SUPABASE_URL_8"),
        anonKey: wajib(
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_8,
          "NEXT_PUBLIC_SUPABASE_ANON_KEY_8"
        ),
      };
    case 9:
      return {
        url: wajib(process.env.NEXT_PUBLIC_SUPABASE_URL_9, "NEXT_PUBLIC_SUPABASE_URL_9"),
        anonKey: wajib(
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_9,
          "NEXT_PUBLIC_SUPABASE_ANON_KEY_9"
        ),
      };
  }
}

/**
 * `SUPABASE_SERVICE_ROLE_KEY_*` SENGAJA TIDAK diberi prefix
 * `NEXT_PUBLIC_` — key ini tidak boleh pernah terkirim ke browser.
 * Fungsi ini hanya boleh dipanggil dari `admin.ts` (server-only,
 * ditegaskan lewat komentar di sana, sama seperti keputusan desain
 * `admin.ts` sejak Sesi 1). Akses dinamis di sini AMAN (beda dari dua
 * fungsi di atas) karena var TANPA prefix `NEXT_PUBLIC_` memang tidak
 * pernah di-inline ke bundle browser oleh Next.js — hanya ada di
 * runtime server.
 */
export function getSupabaseAdminConfig(jenjang: Jenjang): SupabaseAdminConfig {
  const base = getSupabaseConfig(jenjang);
  const namaVar = `SUPABASE_SERVICE_ROLE_KEY_${jenjang}`;
  return {
    ...base,
    serviceRoleKey: wajib(process.env[namaVar], namaVar),
  };
}

export function getCloudinaryConfig(jenjang: Jenjang): CloudinaryConfig {
  switch (jenjang) {
    case 7:
      return {
        cloudName: wajib(
          process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME_7,
          "NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME_7"
        ),
        uploadPreset: wajib(
          process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET_7,
          "NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET_7"
        ),
      };
    case 8:
      return {
        cloudName: wajib(
          process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME_8,
          "NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME_8"
        ),
        uploadPreset: wajib(
          process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET_8,
          "NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET_8"
        ),
      };
    case 9:
      return {
        cloudName: wajib(
          process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME_9,
          "NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME_9"
        ),
        uploadPreset: wajib(
          process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET_9,
          "NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET_9"
        ),
      };
  }
}
