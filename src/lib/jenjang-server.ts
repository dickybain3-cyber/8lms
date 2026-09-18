import { cookies } from "next/headers";
import { JENJANG_COOKIE, parseJenjang, type Jenjang } from "@/lib/jenjang";

/**
 * Baca jenjang dari Server Component/Server Action/Route Handler.
 * Dipakai HANYA oleh `src/lib/supabase/server.ts` dan `admin.ts` —
 * kedua file itu memang khusus konteks server dan sudah mengimpor
 * `next/headers` sendiri sejak awal, jadi menambah import ini tidak
 * mengubah "keamanan bundling"-nya. File `jenjang.ts` (tanpa suffix
 * `-server`) SENGAJA tidak boleh mengimpor `next/headers` karena file
 * itu juga dipakai Client Component.
 */
export function getJenjangFromServerCookies(): Jenjang | null {
  return parseJenjang(cookies().get(JENJANG_COOKIE)?.value);
}
