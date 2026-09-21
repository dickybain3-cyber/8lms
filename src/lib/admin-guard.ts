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
  /** `guru.username` (migrasi 0015). NULL untuk akun lama yang login pakai email. */
  username: string | null;
  /** `guru.foto_url` (migrasi 0016). NULL = tampilkan avatar bulat bawaan. */
  fotoUrl: string | null;
}

export async function getSesiGuru(): Promise<SesiGuru> {
  const jenjang = getJenjangFromServerCookies();

  // Tanpa cookie jenjang, `createClient()` memang sengaja melempar error
  // (lihat server.ts). Di sini itu bukan kondisi luar biasa — middleware
  // akan melempar orangnya ke /login — jadi cukup kembalikan sesi kosong.
  if (!jenjang) {
    return sesiKosong(null);
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return sesiKosong(jenjang);
  }

  // RLS `guru_select_guru` mengizinkan guru membaca baris guru (termasuk
  // barisnya sendiri), jadi ini tidak perlu service_role.
  //
  // Dua tahap, BUKAN satu select yang langsung memuat kolom baru:
  // `foto_url` (migrasi 0016) belum tentu sudah ada di ketiga project.
  // Kalau select-nya gagal karena satu kolom itu, hasilnya `guru = null`
  // dan akun admin mendadak dianggap "bukan admin" — hanya karena sebuah
  // foto profil. Jadi kalau select lengkap gagal, ulangi dengan kolom lama
  // saja; foto dan username jadi kosong, sisanya persis seperti sebelum
  // fitur profil ada.
  type BarisGuru = {
    id: string;
    nama: string;
    is_admin: boolean | null;
    username?: string | null;
    foto_url?: string | null;
  };

  let guru: BarisGuru | null = null;

  const lengkap = await supabase
    .from("guru")
    .select("id, nama, is_admin, username, foto_url")
    .eq("auth_id", user.id)
    .maybeSingle();

  if (!lengkap.error) {
    guru = lengkap.data as BarisGuru | null;
  } else {
    const lama = await supabase
      .from("guru")
      .select("id, nama, is_admin")
      .eq("auth_id", user.id)
      .maybeSingle();
    guru = (lama.data as BarisGuru | null) ?? null;
  }

  return {
    jenjang,
    guruId: guru?.id ?? null,
    nama: guru?.nama ?? null,
    email: user.email ?? null,
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
