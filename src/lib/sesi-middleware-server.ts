import { headers } from "next/headers";
import {
  HEADER_SESI_GURU,
  HEADER_SESI_SISWA,
  dekodekan,
  type SesiGuruMiddleware,
  type SesiSiswaMiddleware,
} from "@/lib/sesi-middleware";

/**
 * SERVER-ONLY. Baca identitas yang sudah diperiksa middleware (lihat
 * `sesi-middleware.ts`). `null` = middleware tidak menyetelnya (server
 * action, /api, atau halaman di luar /admin & /siswa) — pemanggil wajib
 * jatuh-mundur ke `getUser()` seperti biasa.
 */
export async function bacaSesiGuruMiddleware(): Promise<SesiGuruMiddleware | null> {
  const s = dekodekan<SesiGuruMiddleware>((await headers()).get(HEADER_SESI_GURU));
  return s?.authId && s.guru?.id ? s : null;
}

export async function bacaSesiSiswaMiddleware(): Promise<SesiSiswaMiddleware | null> {
  const s = dekodekan<SesiSiswaMiddleware>((await headers()).get(HEADER_SESI_SISWA));
  return s?.authId && s.siswa?.id ? s : null;
}
