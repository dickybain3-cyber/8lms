import { notFound } from "next/navigation";
import { muatPratinjauSoal } from "@/lib/pratinjau-soal";
import PreviewClient from "@/app/admin/event/[eventId]/mapel/[mapelId]/preview/PreviewClient";

/**
 * Isi iframe "tampilan HP" pada pratinjau soal.
 *
 * Sengaja di LUAR /admin: layout admin (sidebar, banner jenjang) akan
 * ikut masuk ke iframe dan memakan lebar layar HP tiruan. Dan sengaja
 * iframe, bukan sekadar <div> sempit: SoalViewer memakai ukuran berbasis
 * layar (`max-h-[45svh]` pada gambar, breakpoint `sm:`, `sizes=100vw`),
 * yang hanya benar bila "layarnya" memang selebar/setinggi HP.
 *
 * Penjaga akses ada di `muatPratinjauSoal` (wajib sesi guru), karena
 * middleware tidak melempar non-guru dari path ini.
 */
export const metadata = { robots: { index: false, follow: false } };

export default async function PratinjauHpPage(
  props: {
    params: Promise<{ eventId: string; mapelId: string }>;
    searchParams: Promise<{ jenjang?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const data = await muatPratinjauSoal(
    params.eventId,
    params.mapelId,
    searchParams.jenjang
  );

  if (!data || data.soalList.length === 0) {
    notFound();
  }

  return (
    <main className="min-h-svh bg-slate-50 px-3 py-4">
      <PreviewClient
        soalList={data.soalList}
        mapelNama={data.mapelNama}
        totalSkor={data.totalSkor}
        tertanam
      />
    </main>
  );
}
