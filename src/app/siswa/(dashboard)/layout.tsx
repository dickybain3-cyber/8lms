import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "@/components/LogoutButton";
import { LOGO_URL, SEKOLAH } from "@/lib/branding";

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
    .select("nama, kelas(nama)")
    .eq("auth_id", user?.id ?? "")
    .maybeSingle();

  const kelasNama = (siswa?.kelas as unknown as { nama: string } | null)?.nama;

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-3.5 shadow-[0_4px_20px_rgba(0,0,0,0.03)] sm:px-8">
        <div className="flex items-center gap-3">
          <Image
            src={LOGO_URL}
            alt={`Logo ${SEKOLAH.nama}`}
            width={50}
            height={50}
            className="h-[50px] w-auto object-contain"
          />
          <div className="flex flex-col leading-tight">
            <span className="font-serif text-[1.05rem] font-extrabold tracking-wide text-ink">
              LMS {SEKOLAH.nama}
            </span>
            <span className="text-[0.7rem] font-bold tracking-[0.1em] text-[--primary]">
              {SEKOLAH.kota}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-paper px-5 py-2">
            <div className="flex flex-col text-right leading-tight">
              <span className="text-sm font-bold text-ink">
                {siswa?.nama ?? "Siswa"}
              </span>
              <span className="text-[0.72rem] font-semibold text-slate-500">
                {kelasNama ? `Kelas ${kelasNama}` : "—"}
              </span>
            </div>
            <i
              className="fas fa-user-graduate text-lg text-[--success]"
              aria-hidden
            />
          </div>

          <LogoutButton />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-7 sm:px-6">
        {children}
      </main>

      <footer className="mt-auto w-full border-t border-dashed border-slate-300 bg-white px-5 py-6 text-center">
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2.5">
            <Image
              src={LOGO_URL}
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
