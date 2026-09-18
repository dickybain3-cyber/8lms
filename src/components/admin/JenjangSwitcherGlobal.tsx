"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { JENJANG_LABEL, JENJANG_LIST, parseJenjang, type Jenjang } from "@/lib/jenjang";

/**
 * Saklar jenjang yang selalu ada di header admin — bukan hanya di dua-tiga
 * halaman seperti `JenjangSwitcher` yang lama (komponen itu TIDAK dihapus;
 * halaman yang sudah memakainya tetap jalan apa adanya).
 *
 * ── MASALAH YANG DIPECAHKAN ──
 *
 * Mesin lintas jenjang di aplikasi ini sebenarnya sudah lengkap: server
 * action soal & nilai sudah menerima `?jenjang=`, sudah memverifikasi
 * ulang hak akses lewat `pastikanBolehKeJenjang()`, dan sudah menulis
 * lewat service_role ke project yang benar. Yang hilang cuma PINTUNYA.
 * Saklar lama hanya muncul di /admin/nilai dan di halaman detail mapel —
 * dan untuk sampai ke halaman detail mapel, admin butuh eventId+mapelId
 * milik jenjang lain, yang hanya bisa didapat dari /admin/event, yang
 * dulu masih terkunci ke jenjang sesi login. Lingkaran tertutup: admin
 * kelas 7 tidak punya jalan sama sekali menuju input soal kelas 8.
 *
 * ── KENAPA PINDAH JENJANG TIDAK BISA SEKADAR MENGGANTI COOKIE ──
 *
 * Ini pertanyaan pertama yang wajar muncul, dan jawabannya menentukan
 * bentuk komponen ini. Cookie `lms_jenjang` menentukan project Supabase
 * mana yang dihubungi — TERMASUK untuk memeriksa sesi login. Akun admin
 * yang login di project kelas 7 sama sekali tidak dikenal oleh project
 * kelas 8 (`auth.users` ketiganya terpisah total). Jadi kalau cookie-nya
 * diganti diam-diam ke 8, `getUser()` mengembalikan null, middleware
 * menganggapnya belum login, dan admin dilempar ke /login di tengah
 * pekerjaan. Itu sebabnya perpindahan jenjang ditempuh lewat `?jenjang=`
 * di URL + service_role di server, bukan lewat cookie.
 *
 * ── KENAPA PINDAH JENJANG SELALU MEMULANGKAN KE DAFTAR ──
 *
 * `eventId`, `mapelId`, dan `soalId` hanya berarti DI DALAM satu project.
 * Membawa id yang sama ke jenjang lain hampir selalu berakhir di layar
 * "tidak ditemukan" — dan itulah yang terjadi pada saklar lama di halaman
 * detail mapel. Di sini, menekan jenjang lain dari halaman mana pun di
 * bawah /admin/event akan mendarat di /admin/event jenjang itu, tempat
 * admin bisa memilih event yang benar-benar ada di sana.
 */

/** Halaman yang datanya bisa dibaca lintas jenjang. Di luar daftar ini,
 *  saklar tidak ditampilkan — lebih baik tidak ada saklar daripada ada
 *  saklar yang ditekan lalu tidak terjadi apa-apa. */
function tujuanPindah(pathname: string, jenjang: Jenjang): string | null {
  if (pathname.startsWith("/admin/event")) {
    return `/admin/event?jenjang=${jenjang}`;
  }
  if (pathname.startsWith("/admin/nilai")) {
    return `/admin/nilai?jenjang=${jenjang}`;
  }
  return null;
}

export default function JenjangSwitcherGlobal({
  jenjangSesi,
}: {
  /** Jenjang tempat admin LOGIN. Dipakai sebagai nilai bawaan kalau URL
   *  belum punya `?jenjang=`, supaya admin yang login di kelas 9 tidak
   *  tiba-tiba ditandai sedang melihat kelas 7. */
  jenjangSesi: Jenjang | null;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (!pathname || tujuanPindah(pathname, 7) === null) return null;

  const jenjangAktif =
    parseJenjang(searchParams.get("jenjang")) ?? jenjangSesi ?? 7;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[0.7rem] font-bold uppercase tracking-wide text-white/70">
        Kelola data
      </span>
      <div className="inline-flex items-center gap-1 rounded-xl bg-black/20 p-1">
        {JENJANG_LIST.map((j) => {
          const aktif = j === jenjangAktif;
          const href = tujuanPindah(pathname, j) as string;
          return (
            <Link
              key={j}
              href={href}
              aria-current={aktif ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm font-bold transition-colors ${
                aktif
                  ? "bg-white text-ink shadow-sm"
                  : "text-white/75 hover:bg-white/15 hover:text-white"
              }`}
            >
              {JENJANG_LABEL[j]}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
