import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Identitas yang SUDAH diperiksa middleware, diteruskan ke Server Component
 * lewat header request internal — supaya layout/halaman tidak mengulang
 * `getUser()` (1 round-trip ke Supabase Auth) + kueri guru/siswa (1-2
 * round-trip ke database) yang baru saja dikerjakan middleware.
 *
 * KEAMANAN: header ini hanya boleh dipercaya karena middleware SELALU
 * menghapus header bernama sama yang dikirim browser (lihat
 * `tanpaHeaderSesi`), di setiap request yang melewatinya — termasuk server
 * action dan /api yang tidak dicek sesinya. Jadi nilai yang sampai ke
 * Server Component pasti tulisan middleware sendiri. RLS tetap memakai JWT
 * di cookie; header ini cuma menggantikan "siapa aku", bukan izin data.
 *
 * Berkas ini dipakai middleware (Edge) DAN server — jangan impor
 * `next/headers` di sini. Pembacanya ada di `sesi-middleware-server.ts`.
 */
export const HEADER_SESI_GURU = "x-lms-sesi-guru";
export const HEADER_SESI_SISWA = "x-lms-sesi-siswa";
const SEMUA_HEADER_SESI = [HEADER_SESI_GURU, HEADER_SESI_SISWA];

export type BarisGuru = {
  id: string;
  nama: string;
  is_admin: boolean | null;
  username?: string | null;
  foto_url?: string | null;
};

export type BarisSiswa = {
  id: string;
  nama: string | null;
  kelas_id: string | null;
};

export interface SesiGuruMiddleware {
  authId: string;
  email: string | null;
  guru: BarisGuru;
}

export interface SesiSiswaMiddleware {
  authId: string;
  siswa: BarisSiswa;
}

/** Salinan header request TANPA header sesi apa pun dari browser. */
export function tanpaHeaderSesi(asal: Headers): Headers {
  const h = new Headers(asal);
  for (const nama of SEMUA_HEADER_SESI) h.delete(nama);
  return h;
}

/** Header hanya boleh ByteString — nama guru bisa berisi huruf non-ASCII. */
export function kodekan(nilai: unknown): string {
  return encodeURIComponent(JSON.stringify(nilai));
}

export function dekodekan<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(raw)) as T;
  } catch {
    return null;
  }
}

/**
 * Baris guru milik `authId`, dengan jatuh-mundur bertahap: `foto_url`/
 * `username` (migrasi 0015/0016) dan `is_admin` (0011) belum tentu ada di
 * ketiga project. Kalau select lengkap gagal karena satu kolom, ulangi
 * dengan kolom lebih sedikit — jangan sampai akun admin dianggap "bukan
 * guru" hanya karena kolom foto belum dimigrasi.
 */
export async function muatBarisGuru(
  supabase: SupabaseClient,
  authId: string
): Promise<BarisGuru | null> {
  const lengkap = await supabase
    .from("guru")
    .select("id, nama, is_admin, username, foto_url")
    .eq("auth_id", authId)
    .maybeSingle();
  if (!lengkap.error) return (lengkap.data as BarisGuru | null) ?? null;

  const lama = await supabase
    .from("guru")
    .select("id, nama, is_admin")
    .eq("auth_id", authId)
    .maybeSingle();
  if (!lama.error) return (lama.data as BarisGuru | null) ?? null;

  const minimal = await supabase
    .from("guru")
    .select("id, nama")
    .eq("auth_id", authId)
    .maybeSingle();
  return minimal.data
    ? ({ ...(minimal.data as { id: string; nama: string }), is_admin: false } as BarisGuru)
    : null;
}

export async function muatBarisSiswa(
  supabase: SupabaseClient,
  authId: string
): Promise<BarisSiswa | null> {
  const { data } = await supabase
    .from("siswa")
    .select("id, nama, kelas_id")
    .eq("auth_id", authId)
    .maybeSingle();
  return (data as BarisSiswa | null) ?? null;
}
