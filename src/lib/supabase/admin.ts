import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminConfig } from "@/lib/supabase/config";
import { getJenjangFromServerCookies } from "@/lib/jenjang-server";
import type { Jenjang } from "@/lib/jenjang";

/**
 * Client Supabase dengan `service_role` key — hak akses superuser yang
 * melewati RLS sepenuhnya. HANYA boleh dipanggil dari kode yang jalan di
 * server (Server Action / Route Handler), TIDAK PERNAH dari Client
 * Component atau dikirim ke browser dengan cara apa pun.
 *
 * Dipisah sengaja dari `client.ts` (anon key, browser) dan `server.ts`
 * (anon key + cookie sesi user login) supaya key ini tidak ketuker
 * dipakai di tempat yang salah — file ini TIDAK mengimpor `next/headers`
 * LANGSUNG, tapi `jenjang-server.ts` yang diimpornya juga server-only,
 * jadi properti "tidak tergoda dipakai di Server Component biasa" tetap
 * terjaga (server-only itu sendiri bukan proteksi teknis, cuma konvensi
 * yang dipegang ketat, sama seperti sejak Sesi 1).
 *
 * Dipakai untuk: provisioning akun siswa massal (`supabase.auth.admin.
 * createUser` / `deleteUser`, lihat `/admin/siswa/actions.ts`) — operasi
 * yang menulis ke `auth.users` langsung, di luar jangkauan RLS. Sejak
 * Sesi 7, dipakai juga untuk import guru (`/admin/guru/actions.ts`) —
 * client yang sama di-reuse, sengaja TIDAK dibuat helper service-role
 * terpisah untuk guru.
 *
 * Sesi 16: jenjang diambil OTOMATIS dari cookie `lms_jenjang` (parameter
 * `jenjangOverride` disediakan tapi hampir tidak pernah dipakai di kode
 * yang sudah ada — semua pemanggil lama tetap `createAdminClient()`
 * tanpa argumen dan otomatis dapat project yang benar, karena guru yang
 * memanggil action ini sudah login ke jenjang tertentu).
 */
export function createAdminClient(jenjangOverride?: Jenjang) {
  const jenjang = jenjangOverride ?? getJenjangFromServerCookies();

  if (!jenjang) {
    throw new Error(
      "Jenjang (kelas 7/8/9) belum dipilih (cookie lms_jenjang tidak ada) — tidak tahu project Supabase mana yang dituju."
    );
  }

  const { url, serviceRoleKey } = getSupabaseAdminConfig(jenjang);

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
