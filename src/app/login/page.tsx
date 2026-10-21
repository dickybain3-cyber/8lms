import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BG_LOGIN_URL, LOGO_URL_KECIL, SEKOLAH } from "@/lib/branding";
import { JENJANG_LABEL, JENJANG_LIST, JENJANG_LOGIN_PATH } from "@/lib/jenjang";

export const metadata: Metadata = { title: "Pilih Kelas | LMS SMPN 8 Probolinggo" };

/**
 * /login sekarang hanya PEMILIH kelas. Login sesungguhnya ada di /kelas7,
 * /kelas8, dan /kelas9 — satu alamat per database. Halaman ini tetap ada
 * supaya tautan dan bookmark lama tidak mati.
 */
export default function PilihKelasPage() {
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
          <h1 className="mt-1 font-serif text-[1.5rem] font-bold leading-tight text-ink">
            Kamu kelas berapa?
          </h1>
          <p className="mt-1 text-[0.82rem] text-slate-500">
            Setiap kelas punya halaman masuk sendiri.
          </p>
        </div>

        <ul className="space-y-3">
          {JENJANG_LIST.map((j) => (
            <li key={j}>
              <Link
                href={JENJANG_LOGIN_PATH[j]}
                className="flex min-h-[64px] items-center gap-4 rounded-xl border border-slate-200 px-4 py-3 transition-colors hover:border-teal hover:bg-navy-50 active:bg-navy-100"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal font-serif text-lg font-bold text-white">
                  {j}
                </span>
                <span className="flex-1">
                  <span className="block font-semibold text-ink">{JENJANG_LABEL[j]}</span>
                  <span className="block text-[0.75rem] text-slate-500">
                    8lms.vercel.app{JENJANG_LOGIN_PATH[j]}
                  </span>
                </span>
                <i className="fas fa-chevron-right text-sm text-slate-400" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <p className="relative mt-5 text-center text-[0.72rem] leading-relaxed text-white/80">
        &copy; {SEKOLAH.tahun} SMP Negeri 8 Probolinggo · dibuat oleh {SEKOLAH.pembuat}
      </p>
    </main>
  );
}
