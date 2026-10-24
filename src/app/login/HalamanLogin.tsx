import Image from "next/image";
import Link from "next/link";
import LoginForm from "./LoginForm";
import { BG_LOGIN_URL, LOGO_URL_KECIL, SEKOLAH } from "@/lib/branding";
import { JENJANG_LABEL, JENJANG_LOGIN_PATH, JENJANG_LIST, type Jenjang } from "@/lib/jenjang";
import { getJenjangFromServerCookies } from "@/lib/jenjang-server";

/**
 * Halaman login satu jenjang (/kelas7, /kelas8, /kelas9). Jenjang dikunci oleh
 * alamatnya, jadi tidak ada pilihan "kelas utama" yang bisa salah dipilih.
 *
 * Ringan untuk HP murah: tanpa backdrop-blur dan tanpa background-attachment
 * fixed (keduanya membuat GPU HP kelas bawah tersendat saat menggulir/mengetik).
 */
export default async function HalamanLogin({ jenjang }: { jenjang: Jenjang }) {
  // Middleware sudah memulangkan orang yang login di jenjang INI ke dashboard.
  // Kalau cookie menunjuk jenjang lain, berarti masih ada sesi kelas lain di
  // browser ini: beri tahu bahwa sesi itu akan ditutup saat masuk di sini.
  const jenjangLain = await getJenjangFromServerCookies();
  const adaSesiLain = jenjangLain !== null && jenjangLain !== jenjang;

  return (
    <main
      className="relative flex min-h-[100dvh] flex-col items-center justify-center px-4 py-8"
      style={{ background: `#0f2a4a url('${BG_LOGIN_URL}') center/cover no-repeat` }}
    >
      <div className="absolute inset-0 bg-slate-900/55" aria-hidden />

      <div className="relative w-full max-w-[400px] animasi-muncul rounded-2xl bg-white px-6 py-8 shadow-xl sm:px-8">
        <div className="mb-6 text-center">
          <Image
            src={LOGO_URL_KECIL}
            alt={`Logo ${SEKOLAH.nama} ${SEKOLAH.kota}`}
            width={72}
            height={72}
            priority
            className="mx-auto h-[72px] w-auto object-contain"
          />
          <p className="mt-3 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-slate-500">
            LMS {SEKOLAH.nama} {SEKOLAH.kota}
          </p>
          <h1 className="mt-1 font-serif text-[1.6rem] font-bold leading-tight text-ink">
            Masuk {JENJANG_LABEL[jenjang]}
          </h1>
          <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-navy-50 px-3 py-1 text-[0.72rem] font-semibold text-teal">
            <i className="fas fa-database text-[0.65rem]" aria-hidden />
            Database khusus {JENJANG_LABEL[jenjang]}
          </span>
        </div>

        {adaSesiLain && (
          <p className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[0.8rem] leading-relaxed text-amber-800">
            <i className="fas fa-circle-info mr-1.5" aria-hidden />
            Browser ini masih masuk di <strong>{JENJANG_LABEL[jenjangLain]}</strong>. Sesi itu
            akan ditutup otomatis saat kamu masuk di {JENJANG_LABEL[jenjang]}.
          </p>
        )}

        <LoginForm jenjang={jenjang} />

        <nav
          aria-label="Halaman login kelas lain"
          className="mt-6 border-t border-slate-100 pt-4 text-center text-[0.78rem] text-slate-500"
        >
          Bukan {JENJANG_LABEL[jenjang]}?{" "}
          {JENJANG_LIST.filter((j) => j !== jenjang).map((j, i) => (
            <span key={j}>
              {i > 0 && " · "}
              <Link href={JENJANG_LOGIN_PATH[j]} className="font-semibold text-teal underline-offset-2 hover:underline">
                {JENJANG_LABEL[j]}
              </Link>
            </span>
          ))}
        </nav>
      </div>

      <p className="relative mt-5 text-center text-[0.72rem] leading-relaxed text-white/80">
        &copy; {SEKOLAH.tahun} SMP Negeri 8 Probolinggo · dibuat oleh {SEKOLAH.pembuat}
      </p>
    </main>
  );
}
