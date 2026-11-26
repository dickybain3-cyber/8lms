import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getJenjangFromServerCookies } from "@/lib/jenjang-server";
import { kelompokkanNilaiSaya, perubahan, type BarisNilaiSaya } from "@/lib/tryout";
import GrafikGaris, { LencanaPerubahan } from "@/components/tryout/GrafikGaris";

export const dynamic = "force-dynamic";

/**
 * Nilai tryout milik siswa yang login (RPC tryout_nilai_saya, 0029).
 * Hanya nilai — tanpa kunci jawaban maupun pembahasan.
 */
export default async function HalamanNilaiTryoutSiswa() {
  const jenjang = await getJenjangFromServerCookies();

  let paket: ReturnType<typeof kelompokkanNilaiSaya> = [];
  let galat: string | null = null;
  if (jenjang !== 9) {
    galat = "Tryout hanya untuk kelas 9.";
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("tryout_nilai_saya");
    if (error) galat = "Nilai tryout belum bisa dimuat.";
    else paket = kelompokkanNilaiSaya((data ?? []) as BarisNilaiSaya[]);
  }

  const subtes = [...new Map(paket.flatMap((p) => p.subtes.map((s) => [s.kode, s.nama] as const))).entries()];
  const seri = [
    ...subtes.map(([kode, nama]) => ({
      nama,
      nilai: paket.map((p) => p.subtes.find((s) => s.kode === kode)?.nilai ?? null),
    })),
    { nama: "Rata-rata", tebal: true, warna: "#0f172a", nilai: paket.map((p) => p.rata) },
  ];
  const denganNilai = paket.filter((p) => p.rata !== null);
  const naik =
    denganNilai.length >= 2
      ? perubahan(denganNilai[denganNilai.length - 2].rata, denganNilai[denganNilai.length - 1].rata)
      : null;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/siswa" className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-navy-700">
        <i className="fas fa-arrow-left text-xs" aria-hidden />
        Dashboard
      </Link>
      <h1 className="mb-1 font-serif text-2xl font-extrabold text-navy-900">Nilai Tryout</h1>
      <p className="mb-5 text-sm text-slate-500">Nilai 0–100 tiap subtes dan perkembanganmu dari paket ke paket.</p>

      {galat ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-600">{galat}</p>
      ) : paket.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-600">
          Belum ada nilai tryout. Nilai muncul di sini setelah kamu mengumpulkan subtes tryout.
        </p>
      ) : (
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-ink">Grafik peningkatan</p>
              {naik && (
                <span className="text-xs text-slate-500">
                  Dibanding paket sebelumnya: <LencanaPerubahan {...naik} />
                </span>
              )}
            </div>
            <GrafikGaris kategori={paket.map((p) => p.paketNama)} seri={seri} />
          </div>

          <div className="space-y-3">
            {[...paket].reverse().map((p) => (
              <div key={p.paketId} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500">{p.eventNama}</p>
                    <p className="font-semibold text-ink">{p.paketNama}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[0.65rem] font-semibold uppercase text-slate-500">Rata-rata</p>
                    <p className="font-serif text-2xl font-extrabold tabular-nums text-navy-900">
                      {p.rata === null ? "—" : p.rata.toLocaleString("id-ID", { maximumFractionDigits: 1 })}
                    </p>
                  </div>
                </div>
                <ul className="grid grid-cols-2 gap-2">
                  {p.subtes.map((s) => (
                    <li key={s.kode} className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="truncate text-xs text-slate-500">{s.nama}</p>
                      <p className="text-lg font-bold tabular-nums text-ink">
                        {s.nilai === null ? "—" : s.nilai.toLocaleString("id-ID", { maximumFractionDigits: 1 })}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-slate-400">Kunci jawaban dan pembahasan tidak ditampilkan.</p>
        </div>
      )}
    </div>
  );
}
