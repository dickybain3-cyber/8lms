import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { getJenjangFromServerCookies } from "@/lib/jenjang-server";

/**
 * Client Supabase untuk dipakai di Server Component, Server Action,
 * atau Route Handler. Membaca/menulis cookie sesi lewat next/headers.
 *
 * Sesi 16: jenjang project ditentukan dari cookie `lms_jenjang` (diset
 * `LoginForm.tsx` saat login). Kalau cookie itu tidak ada (mis. dipanggil
 * dari halaman di luar alur login/siswa/admin), fungsi ini melempar
 * error jelas alih-alih diam-diam connect ke project yang salah —
 * SENGAJA fail loudly, karena connect ke project yang salah jauh lebih
 * berbahaya (data nyasar/RLS salah konteks) daripada sekadar error.
 *
 * Catatan: di dalam Server Component murni, `set`/`remove` akan gagal
 * (Next melarang mutasi cookie di luar Server Action/Route Handler) —
 * ini di-try/catch supaya tidak crash; refresh token tetap ditangani
 * oleh middleware.ts di setiap request.
 */
export function createClient() {
  const cookieStore = cookies();
  const jenjang = getJenjangFromServerCookies();

  if (!jenjang) {
    throw new Error(
      "Jenjang (kelas 7/8/9) belum dipilih (cookie lms_jenjang tidak ada) — tidak tahu harus terhubung ke project Supabase yang mana."
    );
  }

  const { url, anonKey } = getSupabaseConfig(jenjang);

  return createServerClient(url, anonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // Dipanggil dari Server Component — abaikan, middleware yang urus.
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: "", ...options });
        } catch {
          // Dipanggil dari Server Component — abaikan, middleware yang urus.
        }
      },
    },
  });
}
