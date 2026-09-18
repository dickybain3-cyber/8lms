import { NextResponse, type NextRequest } from "next/server";
import { createMiddlewareClient } from "@/lib/supabase/middleware";

/**
 * Aturan:
 * - Cookie jenjang (`lms_jenjang`) belum ada sama sekali + akses
 *   /admin/* atau /siswa/* -> lempar ke /login (tidak tahu project mana
 *   yang harus dihubungi, jadi tidak mungkin cek sesi sama sekali)
 * - Belum login (jenjang ada, tapi sesi Supabase-nya tidak ada/invalid)
 *   + akses /admin/* atau /siswa/* -> lempar ke /login
 * - Sudah login tapi role tidak cocok (guru buka /siswa/*, siswa buka
 *   /admin/*) -> lempar ke dashboard sesuai role-nya sendiri
 * - Sudah login + buka /login atau / -> lempar ke dashboard sesuai role
 *
 * Role ditentukan dari keberadaan baris di tabel `guru` atau `siswa`
 * yang auth_id-nya cocok dengan user login (bukan dari custom claim),
 * supaya konsisten dengan skema di README. Query itu otomatis jalan ke
 * PROJECT YANG BENAR karena `createMiddlewareClient` sudah resolve
 * client dari jenjang di cookie (Sesi 16).
 *
 * ── PERBAIKAN BUG "login benar tapi dilempar balik ke halaman login" ──
 *
 * Penyebabnya ada di cara redirect dibuat. `createMiddlewareClient`
 * memakai `@supabase/ssr`, yang MENULIS ULANG cookie sesi setiap kali
 * access token perlu di-refresh — tulisannya masuk ke objek `response`
 * yang dikembalikan helper itu. Versi sebelumnya membuat redirect lewat
 * `NextResponse.redirect(url)` yang BARU dan polos, sehingga cookie
 * hasil refresh tadi ikut hilang bersama `response` yang dibuang.
 * Akibatnya browser masih memegang token lama yang sudah tidak berlaku,
 * request berikutnya `getUser()`-nya null, dan orangnya dilempar ke
 * /login — padahal barusan login dengan benar.
 *
 * Sekarang semua redirect dibuat lewat `redirectKe()` di bawah, yang
 * menyalin dulu setiap cookie dari `response` ke respons redirect-nya.
 */

/**
 * Bikin redirect TANPA membuang cookie yang sudah diset di `response`
 * (lihat catatan panjang di atas). Semua `return NextResponse.redirect`
 * di file ini harus lewat sini.
 */
function redirectKe(
  request: NextRequest,
  response: NextResponse,
  pathname: string
) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";

  const redirect = NextResponse.redirect(url);
  for (const cookie of response.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  return redirect;
}

export async function middleware(request: NextRequest) {
  const { supabase, response, jenjang } = createMiddlewareClient(request);
  const path = request.nextUrl.pathname;

  const isAdminPath = path.startsWith("/admin");
  const isSiswaPath = path.startsWith("/siswa");
  const isLoginPath = path === "/login";
  const isRootPath = path === "/";

  // Belum pernah pilih jenjang sama sekali (mis. cookie kadaluarsa saat
  // tab ditutup, atau baru pertama kali buka) — tidak ada cara tahu mau
  // connect ke project mana, jadi diperlakukan sama seperti "belum login".
  if (!supabase || !jenjang) {
    if (isAdminPath || isSiswaPath) {
      return redirectKe(request, response, "/login");
    }
    return response;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (isAdminPath || isSiswaPath) {
      return redirectKe(request, response, "/login");
    }
    return response;
  }

  // User sudah login — tentukan role sekali di sini.
  let role: "admin" | "siswa" | null = null;

  const { data: guruRow } = await supabase
    .from("guru")
    .select("id")
    .eq("auth_id", user.id)
    .maybeSingle();

  if (guruRow) {
    role = "admin";
  } else {
    const { data: siswaRow } = await supabase
      .from("siswa")
      .select("id")
      .eq("auth_id", user.id)
      .maybeSingle();
    if (siswaRow) role = "siswa";
  }

  if (!role) {
    // Akun auth ada tapi tidak terdaftar di tabel guru/siswa manapun DI
    // PROJECT JENJANG INI. Dulu di sini cuma `return response`, yang
    // untuk path "/" berarti: halaman root meneruskan ke /login, dan
    // orangnya lihat form login lagi tanpa penjelasan apa pun.
    //
    // Sekarang dia diarahkan ke /login secara eksplisit. Pesan
    // penyebabnya sendiri ditampilkan oleh `LoginForm.tsx`, yang sudah
    // memeriksa hal yang sama tepat setelah sign-in berhasil (di sana
    // konteksnya masih lengkap: tahu jenjang mana yang barusan dipilih).
    // Tidak ada risiko loop: di /login role tetap null, tapi cabang ini
    // hanya memulangkan `response` biasa untuk path /login.
    if (isLoginPath) return response;
    return redirectKe(request, response, "/login");
  }

  const homePath = role === "admin" ? "/admin" : "/siswa";

  if (isLoginPath || isRootPath) {
    return redirectKe(request, response, homePath);
  }

  if (role === "siswa" && isAdminPath) {
    return redirectKe(request, response, "/siswa");
  }

  if (role === "admin" && isSiswaPath) {
    return redirectKe(request, response, "/admin");
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
