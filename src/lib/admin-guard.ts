import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getJenjangFromServerCookies } from "@/lib/jenjang-server";
import type { Jenjang } from "@/lib/jenjang";
import { muatBarisGuru } from "@/lib/sesi-middleware";
import { bacaSesiGuruMiddleware } from "@/lib/sesi-middleware-server";

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
  /** `guru.username` (migrasi 0015). NULL untuk akun lama yang login pakai email. */
  username: string | null;
  /** `guru.foto_url` (migrasi 0016). NULL = tampilkan avatar bulat bawaan. */
  fotoUrl: string | null;
}

/**
 * Dibungkus `cache()`: layout admin DAN halamannya sama-sama memanggil ini;
 * tanpa cache, getUser + kueri guru berjalan dua kali per halaman.
 */
export const getSesiGuru = cache(muatSesiGuru);

async function muatSesiGuru(): Promise<SesiGuru> {
  const jenjang = await getJenjangFromServerCookies();

  // Tanpa cookie jenjang, `await createClient()` memang sengaja melempar error
  // (lihat server.ts). Di sini itu bukan kondisi luar biasa — middleware
  // akan melempar orangnya ke /login — jadi cukup kembalikan sesi kosong.
  if (!jenjang) {
    return sesiKosong(null);
  }

  // Jalur cepat: middleware baru saja memeriksa getUser + baris guru untuk
  // request halaman ini dan meneruskannya lewat header (lihat
  // `sesi-middleware.ts`). Hemat 2 round-trip ke Supabase per pindah menu.
  // Server action / route handler tidak membawa header itu -> jalur lama.
  const dariMiddleware = await bacaSesiGuruMiddleware();

  let email: string | null;
  let guru: Awaited<ReturnType<typeof muatBarisGuru>>;

  if (dariMiddleware) {
    email = dariMiddleware.email;
    guru = dariMiddleware.guru;
  } else {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return sesiKosong(jenjang);
    }

    // RLS `guru_select_guru` mengizinkan guru membaca barisnya sendiri.
    // `muatBarisGuru` jatuh-mundur bertahap bila kolom baru (foto_url,
    // username, is_admin) belum dimigrasi di project ini, supaya akun
    // admin tidak mendadak dianggap "bukan admin" hanya karena foto profil.
    email = user.email ?? null;
    guru = await muatBarisGuru(supabase, user.id);
  }

  return {
    jenjang,
    guruId: guru?.id ?? null,
    nama: guru?.nama ?? null,
    email,
    // `?? false` bukan cuma soal tipe: kalau migrasi 0011 belum dijalankan
    // di project ini, kolomnya belum ada dan kedua query di atas gagal
    // (guru jadi null) — hasilnya "bukan admin", yang merupakan default
    // yang aman. Halaman tetap jalan dalam mode satu jenjang.
    isAdmin: guru?.is_admin ?? false,
    username: guru?.username ?? null,
    fotoUrl: guru?.foto_url ?? null,
  };
}

function sesiKosong(jenjang: Jenjang | null): SesiGuru {
  return {
    jenjang,
    guruId: null,
    nama: null,
    email: null,
    isAdmin: false,
    username: null,
    fotoUrl: null,
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
