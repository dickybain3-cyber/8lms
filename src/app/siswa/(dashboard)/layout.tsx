import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "@/components/LogoutButton";
import { LOGO_URL_KECIL, SEKOLAH } from "@/lib/branding";

/**
 * Chrome dashboard siswa, mengikuti desain acuan: header putih sticky
 * (logo + nama sekolah di kiri, "pil" identitas siswa + tombol keluar di
 * kanan), isi di tengah, footer selalu menempel di bawah layar walau
 * isinya pendek (itu gunanya flex-col + flex-1 di sini, bukan sekadar
 * margin).
 */
export default async function SiswaDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: siswa } = await supabase
    .from("siswa")
    .select("nama, kelas_id")
    .eq("auth_id", user?.id ?? "")
    .maybeSingle();

  // Query terpisah: embed `kelas(nama)` ambigu kalau ada >1 relasi siswa↔kelas.
  const { data: kelasRow } = siswa?.kelas_id
    ? await supabase
        .from("kelas")
        .select("nama")
        .eq("id", siswa.kelas_id)
        .maybeSingle()
    : { data: null };
  const kelasNama = kelasRow?.nama as string | undefined;

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      {/* Satu baris di HP 360 px: logo + identitas siswa + tombol keluar.
          Dulu header terlipat jadi dua baris dan memakan ±130 px layar. */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-2.5 sm:px-6">
          <Image
            src={LOGO_URL_KECIL}
            alt={`Logo ${SEKOLAH.nama}`}
            width={40}
            height={40}
            className="h-10 w-auto shrink-0 object-contain"
          />
          <div className="hidden min-w-0 flex-col leading-tight sm:flex">
            <span className="font-serif text-[1rem] font-bold tracking-wide text-ink">
              LMS {SEKOLAH.nama}
            </span>
            <span className="text-[0.68rem] font-bold tracking-[0.1em] text-[--primary]">
              {SEKOLAH.kota}
            </span>
          </div>

          <div className="ml-auto flex min-w-0 items-center gap-2">
            <div className="flex min-w-0 items-center gap-2.5 rounded-full border border-slate-200 bg-paper py-1.5 pl-4 pr-3">
              <div className="flex min-w-0 flex-col text-right leading-tight">
                <span className="truncate text-sm font-bold text-ink">
                  {siswa?.nama ?? "Siswa"}
                </span>
                <span className="text-[0.72rem] font-semibold text-slate-500">
                  {kelasNama ? `Kelas ${kelasNama}` : "—"}
                </span>
              </div>
              <i className="fas fa-user-graduate shrink-0 text-base text-[--success]" aria-hidden />
            </div>
            <LogoutButton ringkas />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-7 sm:px-6">
        {children}
      </main>

      <footer className="mt-auto w-full border-t border-dashed border-slate-300 bg-white px-5 py-6 text-center">
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2.5">
            <Image
              src={LOGO_URL_KECIL}
              alt=""
              width={24}
              height={24}
              className="h-6 w-auto opacity-40 grayscale"
            />
            <span className="text-[0.85rem] font-bold text-slate-500">
              {SEKOLAH.namaPendek}
            </span>
          </div>
          <p className="text-[0.75rem] text-slate-400">
            &copy; {SEKOLAH.tahun} Hak Cipta Dilindungi.
          </p>
          <p className="font-mono text-[0.75rem] font-semibold text-slate-400">
            Created with{" "}
            <i className="fas fa-heart text-[--danger]" aria-hidden /> by{" "}
            <span className="text-[--primary]">{SEKOLAH.pembuat}</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
