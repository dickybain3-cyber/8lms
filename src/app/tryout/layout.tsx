import Image from "next/image";
import type { Metadata } from "next";
import { LOGO_URL_KECIL, SEKOLAH } from "@/lib/branding";

export const metadata: Metadata = {
  title: `Tryout Kelas 9 — ${SEKOLAH.namaPendek}`,
  robots: { index: false, follow: false },
};

/**
 * Layout publik tryout: tanpa login, tanpa navigasi dashboard. Ringan
 * untuk HP (siswa mengerjakan dari rumah).
 */
export default function TryoutLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="bg-gradient-to-r from-navy-800 to-navy-900 shadow-[0_4px_16px_rgba(14,20,64,0.25)]">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white p-0.5 shadow-md">
            <Image src={LOGO_URL_KECIL} alt={`Logo ${SEKOLAH.nama}`} width={32} height={32} className="h-8 w-8 object-contain" />
          </span>
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate font-serif text-[0.95rem] font-extrabold tracking-wide text-white">
              Tryout Kelas 9
            </span>
            <span className="truncate text-[0.68rem] font-bold tracking-[0.12em] text-kuning">
              {SEKOLAH.nama}
            </span>
          </div>
        </div>
        <div className="h-1 bg-gradient-to-r from-kuning via-kuning-light to-kuning" />
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
