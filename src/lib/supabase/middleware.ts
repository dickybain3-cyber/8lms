import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { getJenjangFromRequestCookies } from "@/lib/jenjang";

/**
 * Refresh sesi Supabase (kalau perlu) dan kembalikan { supabase, response,
 * jenjang } supaya middleware.ts bisa query role user sekaligus meneruskan
 * cookie yang sudah di-refresh ke browser.
 *
 * Sesi 16: `jenjang` dikembalikan eksplisit (beda dari `client.ts`/
 * `server.ts` yang menyembunyikannya) karena middleware.ts (root) perlu
 * tahu nilainya SENDIRI untuk logika redirect (mis. jenjang belum
 * dipilih sama sekali -> lempar ke /login), bukan cuma untuk membuat
 * client. `supabase`/`jenjang` dikembalikan `null` bersamaan kalau
 * cookie `lms_jenjang` belum ada — pemanggil WAJIB cek itu dulu sebelum
 * pakai `supabase`.
 */
export function createMiddlewareClient(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const jenjang = getJenjangFromRequestCookies(request.cookies);

  if (!jenjang) {
    return { supabase: null, response, jenjang: null };
  }

  const { url, anonKey } = getSupabaseConfig(jenjang);

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        request.cookies.set({ name, value, ...options });
        response = NextResponse.next({
          request: { headers: request.headers },
        });
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        request.cookies.set({ name, value: "", ...options });
        response = NextResponse.next({
          request: { headers: request.headers },
        });
        response.cookies.set({ name, value: "", ...options });
      },
    },
  });

  return { supabase, response, jenjang };
}
