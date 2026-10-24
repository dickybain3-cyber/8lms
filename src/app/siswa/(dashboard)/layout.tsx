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
  const supabase = await createClient();
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
      {/* Tema biru tua logo sekolah. Murni warna CSS — tidak ada gambar
          latar atau font tambahan, jadi tidak menambah beban di HP. */}
      <header className="sticky top-0 z-40 bg-gradient-to-r from-navy-800 to-navy-900 shadow-[0_4px_16px_rgba(14,20,64,0.25)]">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-2.5 sm:px-6">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white p-0.5 shadow-md">
            <Image
              src={LOGO_URL_KECIL}
              alt={`Logo ${SEKOLAH.nama}`}
              width={36}
              height={36}
              className="h-9 w-9 object-contain"
            />
          </span>
          <div className="hidden min-w-0 flex-col leading-tight sm:flex">
            <span className="font-serif text-[1rem] font-extrabold tracking-wide text-white">
              LMS {SEKOLAH.nama}
            </span>
            <span className="text-[0.68rem] font-bold tracking-[0.14em] text-kuning">
              {SEKOLAH.kota}
            </span>
          </div>

          <div className="ml-auto flex min-w-0 items-center gap-2">
            <div className="flex min-w-0 items-center gap-2.5 rounded-full bg-white/10 py-1.5 pl-4 pr-1.5 ring-1 ring-white/15">
              <div className="flex min-w-0 flex-col text-right leading-tight">
                <span className="truncate text-sm font-bold text-white">
                  {siswa?.nama ?? "Siswa"}
                </span>
                <span className="text-[0.7rem] font-semibold text-navy-200">
                  {kelasNama ? `Kelas ${kelasNama}` : "—"}
                </span>
              </div>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-kuning text-sm text-navy-900">
                <i className="fas fa-user-graduate" aria-hidden />
              </span>
            </div>
            <LogoutButton ringkas />
          </div>
        </div>
        <div className="h-1 bg-gradient-to-r from-kuning via-kuning-light to-kuning" />
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
