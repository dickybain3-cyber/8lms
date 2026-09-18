import { createClient } from "@/lib/supabase/server";
import { getJenjangFromServerCookies } from "@/lib/jenjang-server";
import type { Jenjang } from "@/lib/jenjang";

/**
 * Siapa yang sedang login di panel /admin, dan sejauh apa haknya.
 *
 * SERVER-ONLY (memakai `server.ts` yang membaca `next/headers`).
 *
 * Perlu dibaca sebelum mengubah apa pun di sini — ada dua "admin" yang
 * beda artinya di project ini, dan gampang tertukar:
 *
 *  1. `role === "admin"` di `middleware.ts` → artinya cuma "punya baris
 *     di tabel guru", yaitu boleh masuk ke /admin/*. SEMUA guru masuk
 *     kategori ini. Ini soal ROUTING (guru vs siswa), bukan hak istimewa.
 *
 *  2. `isAdmin` di file ini → kolom `guru.is_admin` (migrasi 0011),
 *     artinya boleh melihat/mengubah data LINTAS JENJANG lewat
 *     service_role. Ini yang benar-benar hak istimewa, dan defaultnya
 *     `false` untuk semua orang.
 *
 * Guru biasa TIDAK kehilangan apa pun: seluruh halaman /admin tetap
 * terbuka untuknya, cuma terbatas pada project jenjang tempat dia login
 * — persis seperti sebelum ada flag ini.
 */
export interface SesiGuru {
  /** Jenjang project yang sedang aktif di sesi ini (dari cookie). */
  jenjang: Jenjang | null;
  guruId: string | null;
  nama: string | null;
  email: string | null;
  /** `guru.is_admin` — boleh lintas jenjang. */
  isAdmin: boolean;
}

export async function getSesiGuru(): Promise<SesiGuru> {
  const jenjang = getJenjangFromServerCookies();

  // Tanpa cookie jenjang, `createClient()` memang sengaja melempar error
  // (lihat server.ts). Di sini itu bukan kondisi luar biasa — middleware
  // akan melempar orangnya ke /login — jadi cukup kembalikan sesi kosong.
  if (!jenjang) {
    return { jenjang: null, guruId: null, nama: null, email: null, isAdmin: false };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { jenjang, guruId: null, nama: null, email: null, isAdmin: false };
  }

  // RLS `guru_select_guru` mengizinkan guru membaca baris guru (termasuk
  // barisnya sendiri), jadi ini tidak perlu service_role.
  const { data: guru } = await supabase
    .from("guru")
    .select("id, nama, is_admin")
    .eq("auth_id", user.id)
    .maybeSingle();

  return {
    jenjang,
    guruId: guru?.id ?? null,
    nama: guru?.nama ?? null,
    email: user.email ?? null,
    // `?? false` bukan cuma soal tipe: kalau migrasi 0011 belum dijalankan
    // di project ini, kolomnya belum ada dan query di atas gagal (guru
    // jadi null) — hasilnya "bukan admin", yang merupakan default yang
    // aman. Halaman tetap jalan dalam mode satu jenjang.
    isAdmin: guru?.is_admin ?? false,
  };
}

/**
 * Dipakai Server Action yang menerima `jenjang` dari BARIS YANG DIKLIK
 * (bukan dari cookie). Mengembalikan pesan error siap tampil kalau tidak
 * boleh, atau `null` kalau boleh.
 *
 * Aturannya:
 *  - admin  -> boleh ke jenjang mana pun (itu gunanya flag ini);
 *  - guru   -> hanya ke jenjang yang sedang dia login-i. Jadi parameter
 *              `jenjang` yang dikirim dari client TIDAK bisa dipakai guru
 *              biasa untuk menjangkau project tetangga — nilai yang datang
 *              dari browser selalu diverifikasi ulang di server.
 */
export async function pastikanBolehKeJenjang(
  sesi: SesiGuru,
  jenjangTarget: Jenjang
): Promise<string | null> {
  if (!sesi.guruId) {
    return "Kamu harus login sebagai guru untuk melakukan aksi ini.";
  }
  if (sesi.isAdmin) return null;
  if (sesi.jenjang === jenjangTarget) return null;

  return `Aksi ini menyasar data kelas ${jenjangTarget}, sementara kamu login di kelas ${sesi.jenjang}. Hanya akun admin yang boleh mengubah data lintas jenjang.`;
}
