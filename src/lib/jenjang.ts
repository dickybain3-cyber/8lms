/**
 * Sesi 16 — inti dari arsitektur "3 project Supabase terpisah per
 * jenjang". Satu siswa/guru cuma pernah terhubung ke SATU project dalam
 * satu sesi login, ditentukan dari pilihan jenjang di halaman login.
 * Modul ini murni baca/tulis penanda pilihan itu (cookie), TIDAK tahu
 * apa-apa soal URL/key Supabase — itu tanggung jawab `config.ts`.
 *
 * Kenapa cookie, bukan mis. query param atau context React? Karena
 * penanda ini perlu terbaca di TIGA tempat yang beda-beda cara
 * eksekusinya: Server Component/Action (lewat `next/headers`), Client
 * Component (lewat `document.cookie`), dan Middleware (lewat
 * `NextRequest.cookies`, format beda lagi). Cookie adalah satu-satunya
 * mekanisme yang otomatis ikut kebawa ke ketiganya tanpa perlu
 * di-thread manual lewat parameter di puluhan file yang sudah ada.
 *
 * SENGAJA bukan httpOnly: nilainya cuma angka jenjang (7/8/9), bukan
 * rahasia — dan Client Component (`ImageUpload.tsx`, `client.ts`) perlu
 * membacanya langsung dari `document.cookie` tanpa round-trip ke server.
 */

export type Jenjang = 7 | 8 | 9;

export const JENJANG_LIST: Jenjang[] = [7, 8, 9];

export const JENJANG_COOKIE = "lms_jenjang";

export function isJenjangValid(value: unknown): value is Jenjang {
  return value === 7 || value === 8 || value === 9;
}

export function parseJenjang(raw: string | undefined | null): Jenjang | null {
  if (!raw) return null;
  const n = Number(raw);
  return isJenjangValid(n) ? n : null;
}

/**
 * Baca jenjang dari Server Component/Server Action lewat `next/headers`.
 * SENGAJA dipisah ke `jenjang-server.ts`, bukan di file ini — file ini
 * (`jenjang.ts`) diimpor juga dari Client Component (`ImageUpload.tsx`,
 * `LoginForm.tsx`), dan `next/headers` akan membuat build gagal kalau
 * sampai ikut ter-bundle ke kode browser. Import statis `next/headers`
 * di file terpisah memastikan itu, beda dari pendekatan `require()`
 * dinamis yang tidak bisa diandalkan lolos analisis bundler Next.js.
 */

/** Baca jenjang dari `NextRequest` di dalam Middleware (edge runtime). */
export function getJenjangFromRequestCookies(cookies: {
  get: (name: string) => { value: string } | undefined;
}): Jenjang | null {
  return parseJenjang(cookies.get(JENJANG_COOKIE)?.value);
}

/** Baca jenjang dari `document.cookie` — dipakai di Client Component. */
export function getJenjangFromDocumentCookie(): Jenjang | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${JENJANG_COOKIE}=([^;]*)`)
  );
  return parseJenjang(match ? decodeURIComponent(match[1]) : null);
}

/**
 * Set cookie jenjang dari Client Component (dipanggil `LoginForm.tsx`
 * SEBELUM `signInWithPassword`, supaya `createClient()` browser yang
 * dipanggil setelahnya langsung baca nilai yang benar — set/read
 * `document.cookie` itu sinkron, tidak ada delay).
 *
 * Sengaja TANPA `max-age`/`expires` (jadi session cookie, hilang saat
 * browser/tab benar-benar ditutup) — bukan cuma soal keamanan, tapi
 * supaya siswa yang lupa logout di komputer lab sekolah tidak
 * "nyangkut" ke jenjang yang salah di sesi berikutnya siapa pun yang
 * pakai komputer itu.
 */
export function setJenjangCookie(jenjang: Jenjang) {
  document.cookie = `${JENJANG_COOKIE}=${jenjang}; path=/; SameSite=Lax`;
}

/** Hapus cookie jenjang — dipanggil `LogoutButton.tsx` sekaligus dengan signOut. */
export function clearJenjangCookie() {
  document.cookie = `${JENJANG_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}

export const JENJANG_LABEL: Record<Jenjang, string> = {
  7: "Kelas 7",
  8: "Kelas 8",
  9: "Kelas 9",
};
