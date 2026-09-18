import Link from "next/link";
import { JENJANG_LIST, JENJANG_LABEL, type Jenjang } from "@/lib/jenjang";

/**
 * Saklar "Lihat: Kelas 7 / 8 / 9" — dipakai admin di halaman input soal &
 * cek nilai untuk berpindah project Supabase tanpa logout (pola yang sama
 * dengan /admin/monitoring & export, lihat src/lib/supabase/admin-multi.ts).
 *
 * HARUS DIRENDER HANYA KALAU `sesi.isAdmin` TRUE. Komponen ini sendiri
 * tidak melakukan pengecekan hak akses apa pun — ia murni tiga link.
 * Keputusan "siapa yang boleh melihat saklar ini" tetap tanggung jawab
 * halaman pemanggil (baca `getSesiGuru()` di src/lib/admin-guard.ts), dan
 * biarpun saklar ini entah bagaimana ter-render untuk guru biasa, setiap
 * Server Action di baliknya tetap menolak lewat `pastikanBolehKeJenjang()`
 * — jadi ini murni soal UI yang rapi, bukan lapisan keamanan.
 *
 * Sengaja `<Link>` biasa, bukan tombol + client state: setiap halaman yang
 * memakai saklar ini membaca datanya lewat Server Component berdasarkan
 * `?jenjang=` di URL (beda dari /admin/monitoring, yang menarik ketiga
 * jenjang sekaligus lalu memfilter di client — di sini datanya per mapel
 * bisa berat, jadi cuma jenjang yang sedang dilihat yang ditarik dari
 * server). Akibatnya pindah jenjang = navigasi/request baru, dan saklar
 * ini tetap berfungsi tanpa JavaScript.
 *
 * `buatHref` sengaja diserahkan ke pemanggil, bukan dibangun otomatis dari
 * `usePathname()`/query string saat ini — supaya tiap halaman bisa
 * memutuskan sendiri parameter mana yang ikut terbawa dan mana yang harus
 * di-reset. Contoh nyata: halaman cek nilai (/admin/nilai) MEMBUANG
 * `mapelId` saat pindah jenjang — mapel adalah milik satu project, tidak
 * valid dipakai untuk project lain — dan mengarahkan admin kembali ke
 * daftar mapel jenjang yang baru dipilih, bukan mencoba memuat mapel yang
 * sama di database yang salah.
 */
export default function JenjangSwitcher({
  jenjangAktif,
  buatHref,
}: {
  /** Jenjang yang SEDANG dilihat admin di halaman ini — bukan jenjang sesi
   *  login-nya (keduanya bisa berbeda, itulah gunanya saklar ini). */
  jenjangAktif: Jenjang;
  /** Bangun URL tujuan untuk tiap opsi jenjang. Dipanggil sekali per opsi
   *  (7, 8, 9) — bukan cuma untuk jenjang yang aktif. */
  buatHref: (jenjang: Jenjang) => string;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-ink/10 bg-white p-1">
      <span className="pl-2 pr-1 text-[0.68rem] font-semibold uppercase tracking-wide text-ink/35">
        Lihat
      </span>
      {JENJANG_LIST.map((j) => {
        const aktif = j === jenjangAktif;
        return (
          <Link
            key={j}
            href={buatHref(j)}
            aria-current={aktif ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
              aktif
                ? "bg-ink text-paper"
                : "text-ink/60 hover:bg-ink/5 hover:text-ink"
            }`}
          >
            {JENJANG_LABEL[j]}
          </Link>
        );
      })}
    </div>
  );
}