import { LABEL_DAYA_BEDA, type RincianJawaban } from "@/lib/analisis-jawaban";

/**
 * Sebaran jawaban satu butir soal (batang per pilihan, kelompok atas/bawah,
 * pengecoh, catatan miskonsepsi). Tanpa state — dipakai di komponen client
 * `AnalisisButir` maupun di halaman server Statistik per Kegiatan.
 */

function fmt(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export const GAYA_DAYA_BEDA: Record<string, string> = {
  sangat_baik: "bg-emerald-50 text-emerald-700",
  baik: "bg-sky-50 text-sky-700",
  cukup: "bg-amber-50 text-amber-700",
  jelek: "bg-red-50 text-red-700",
  negatif: "bg-red-600 text-white",
};

/** Sebaran jawaban satu butir: batang per pilihan + catatan miskonsepsi. */
export default function PanelJawaban({ r }: { r: RincianJawaban }) {
  const maks = Math.max(1, ...r.baris.map((b) => b.jumlah));
  const adaKelompok = r.baris.some((b) => b.atas !== undefined);

  return (
    <div className="space-y-2.5">
      <p className="text-[0.78rem] font-medium text-ink">
        <span className="mr-1.5 rounded bg-navy-800 px-1.5 py-0.5 text-[0.68rem] font-bold text-white">
          No {r.urutan}
        </span>
        {r.pertanyaan}
      </p>

      {r.miskonsepsi && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[0.75rem] text-amber-900">
          <i className="fas fa-lightbulb mr-1.5 text-amber-500" aria-hidden />
          {r.miskonsepsi}
        </p>
      )}

      {r.baris.length === 0 ? (
        <p className="text-[0.75rem] text-ink/50">
          {r.jenisBaris === "keliru" ? "Tidak ada yang keliru — bagus!" : "Belum ada jawaban."}
        </p>
      ) : (
        <div>
          <p className="mb-1 text-[0.68rem] font-semibold uppercase tracking-wide text-ink/40">
            {r.jenisBaris === "keliru"
              ? r.tipe === "menjodohkan"
                ? "Pasangan yang paling sering salah"
                : "Siswa yang keliru per pernyataan"
              : r.tipe === "uraian_singkat"
                ? "Jawaban yang paling sering diketik"
                : "Sebaran pilihan jawaban"}
            {adaKelompok && " · A = kelompok atas, B = kelompok bawah"}
          </p>
          <ul className="space-y-1">
            {r.baris.map((b) => (
              <li key={b.label + b.teks} className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-2 text-[0.75rem]">
                <span
                  className={`flex h-6 items-center justify-center rounded-md text-[0.7rem] font-bold ${
                    b.benar ? "bg-emerald-500 text-white" : "bg-white text-ink/60 ring-1 ring-ink/10"
                  }`}
                  title={b.benar ? "Kunci / jawaban benar" : undefined}
                >
                  {b.benar ? <i className="fas fa-check" aria-hidden /> : b.label}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-ink/80" title={b.teks}>
                    {b.benar && <span className="mr-1 font-semibold text-emerald-700">{b.label}.</span>}
                    {b.teks}
                  </p>
                  <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-ink/5">
                    <div
                      className={`h-full rounded-full ${
                        b.benar ? "bg-emerald-500" : r.jenisBaris === "keliru" ? "bg-rose-400" : "bg-navy-400"
                      }`}
                      style={{ width: `${(b.jumlah / maks) * 100}%` }}
                    />
                  </div>
                </div>
                <span className="whitespace-nowrap text-right tabular-nums text-ink/70">
                  <b className="text-ink">{b.jumlah}</b> ({fmt(b.persen)}%)
                  {b.atas !== undefined && (
                    <span className="ml-1.5 text-ink/40">
                      A{b.atas}·B{b.bawah}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="flex flex-wrap gap-x-4 gap-y-1 text-[0.7rem] text-ink/50">
        <span>{r.kosong} tidak menjawab</span>
        {r.pengecoh && (
          <span>
            Pengecoh berfungsi: {r.pengecoh.berfungsi}/{r.pengecoh.total}
            {r.pengecoh.berfungsi < r.pengecoh.total && " (yang dipilih < 5% sebaiknya diganti)"}
          </span>
        )}
        {r.kategoriDayaBeda && <span>Daya beda: {LABEL_DAYA_BEDA[r.kategoriDayaBeda]}</span>}
        {r.tipe.startsWith("pilgan") && <span>Huruf = urutan opsi di editor soal</span>}
      </p>
    </div>
  );
}
