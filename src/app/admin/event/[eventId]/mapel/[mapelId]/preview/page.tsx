import { notFound } from "next/navigation";
import { muatPratinjauSoal } from "@/lib/pratinjau-soal";
import PreviewClient from "./PreviewClient";

/**
 * Pratinjau ujian untuk guru. Data (kunci jawaban sudah dibuang, supaya
 * bentuknya sama dengan yang diterima siswa) dimuat `muatPratinjauSoal`
 * — lihat catatannya di src/lib/pratinjau-soal.ts. Tombol "HP" di
 * PreviewClient membuka /pratinjau/[eventId]/[mapelId] di iframe
 * selebar HP.
 */
export default async function PreviewPage(
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

  if (!data) {
    notFound();
  }

  const qs = data.jenjangAdmin ? `?jenjang=${data.jenjangAdmin}` : "";
  const kembaliHref = `/admin/event/${params.eventId}/mapel/${params.mapelId}${qs}`;
  const hpSrc = `/pratinjau/${params.eventId}/${params.mapelId}${qs}`;

  // Tidak ada soal = tidak ada yang bisa dipratinjau. Tombol pratinjau di
  // halaman daftar sudah dinonaktifkan untuk keadaan ini, tapi alamatnya
  // masih bisa diketik/di-bookmark — jadi tetap ditangani di sini.
  if (data.soalList.length === 0) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-12 text-center">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-xl text-slate-400 shadow-sm">
          <i className="fas fa-eye-slash" aria-hidden />
        </span>
        <p className="font-serif text-lg font-semibold text-ink">
          Belum ada yang bisa dipratinjau
        </p>
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-slate-500">
          Mapel {data.mapelNama} belum punya satu soal pun. Tambahkan soal dulu,
          lalu buka pratinjau untuk melihat tampilannya di sisi siswa.
        </p>
        <a
          href={kembaliHref}
          className="mt-5 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          <i className="fas fa-arrow-left" aria-hidden />
          Kembali
        </a>
      </div>
    );
  }

  return (
    <PreviewClient
      soalList={data.soalList}
      mapelNama={data.mapelNama}
      kembaliHref={kembaliHref}
      totalSkor={data.totalSkor}
      hpSrc={hpSrc}
    />
  );
}
