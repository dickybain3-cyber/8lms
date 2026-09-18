import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { getJenjangFromDocumentCookie, type Jenjang } from "@/lib/jenjang";

/**
 * Client Supabase untuk dipakai di Client Component ("use client").
 * Panggil createClient() di dalam komponen/hook, jangan disimpan sebagai
 * singleton modul-level (masalah umum dengan Next.js App Router + HMR).
 *
 * Sesi 16: jenjang project MANA yang dihubungi ditentukan dari cookie
 * `lms_jenjang` (lihat `src/lib/jenjang.ts`), dibaca otomatis lewat
 * `document.cookie` — kebanyakan pemanggil TIDAK perlu berubah sama
 * sekali dibanding sebelum Sesi 16, cukup pastikan cookie-nya sudah
 * ada (diset `LoginForm.tsx` sebelum login). Parameter `jenjangOverride`
 * cuma dipakai `LoginForm.tsx` sendiri, tepat setelah set cookie di
 * baris yang sama — supaya tidak bergantung pada urutan render React
 * antara "cookie sudah keset" vs "cookie sudah kebaca ulang".
 */
export function createClient(jenjangOverride?: Jenjang) {
  const jenjang = jenjangOverride ?? getJenjangFromDocumentCookie();

  if (!jenjang) {
    throw new Error(
      "Jenjang (kelas 7/8/9) belum dipilih — tidak tahu harus terhubung ke project Supabase yang mana. Ini seharusnya tidak terjadi di luar halaman login; kalau muncul, coba login ulang."
    );
  }

  const { url, anonKey } = getSupabaseConfig(jenjang);
  return createBrowserClient(url, anonKey);
}
