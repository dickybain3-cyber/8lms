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

  // `createBrowserClient` (@supabase/ssr) di browser secara bawaan adalah
  // SINGLETON: klien pertama dipakai ulang untuk SEMUA panggilan berikutnya,
  // apa pun URL-nya. Akibatnya dulu: login ke kelas 8 setelah sebelumnya
  // menyentuh kelas 7 (ganti pilihan, atau keluar lalu masuk lagi tanpa
  // muat ulang halaman) diam-diam tetap memakai database kelas 7.
  // Sekarang satu klien per jenjang, disimpan sendiri.
  let klien = klienPerJenjang.get(jenjang);
  if (!klien) {
    const { url, anonKey } = getSupabaseConfig(jenjang);
    klien = createBrowserClient(url, anonKey, { isSingleton: false });
    // Hanya di browser: di server modul ini dipakai bersama semua pengguna.
    if (typeof window !== "undefined") klienPerJenjang.set(jenjang, klien);
  }
  return klien;
}

const klienPerJenjang = new Map<Jenjang, ReturnType<typeof createBrowserClient>>();
