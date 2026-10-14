import type { Rentang } from "@/lib/statistik";

/**
 * Grafik statistik tanpa pustaka grafik: batang dari <div> biasa, dirender di
 * server. Alasannya: halaman ini juga dibuka guru dari HP murah — pustaka
 * seperti Recharts menambah ±100 KB JavaScript, sedangkan batang <div> tidak
 * butuh JavaScript sama sekali, menyesuaikan lebar layar, dan ikut tercetak
 * rapi saat "Unduh PDF" (lihat aturan print di globals.css).
 */

/** Warna nilai: merah < 60, kuning 60–74, biru 75–89, hijau ≥ 90. */
export function warnaNilai(n: number): string {
  if (n >= 90) return "bg-emerald-500";
  if (n >= 75) return "bg-blue-500";
  if (n >= 60) return "bg-amber-400";
  return "bg-red-400";
}

export function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Histogram sebaran nilai 0–100 (10 rentang). */
export function GrafikSebaran({ data, judul }: { data: Rentang[]; judul?: string }) {
  const maks = Math.max(1, ...data.map((d) => d.jumlah));
  const total = data.reduce((a, b) => a + b.jumlah, 0);
  return (
    <figure className="w-full">
      {judul && <figcaption className="mb-3 text-sm font-semibold text-ink">{judul}</figcaption>}
      <div className="flex h-44 items-end gap-1 border-b border-slate-200 sm:gap-2" role="img" aria-label={`Sebaran nilai ${total} siswa`}>
        {data.map((d) => (
          <div key={d.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
            <span className="mb-1 text-[0.65rem] font-semibold tabular-nums text-slate-600">{d.jumlah || ""}</span>
            <div
              className={`w-full rounded-t ${warnaNilai(d.dari + 5)}`}
              style={{ height: `${(d.jumlah / maks) * 85}%`, minHeight: d.jumlah ? 3 : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1 sm:gap-2">
        {data.map((d) => (
          <span key={d.label} className="min-w-0 flex-1 text-center text-[0.58rem] leading-tight text-slate-500 sm:text-[0.65rem]">
            {d.dari}
          </span>
        ))}
      </div>
      <p className="mt-1 text-center text-[0.65rem] text-slate-400">rentang nilai (0–100) · {total} siswa</p>
    </figure>
  );
}

/** Batang mendatar 0–100, mis. rata-rata per kelas atau per mapel. */
export function GrafikBatangMendatar({
  baris,
}: {
  baris: { label: string; nilai: number | null; catatan?: string }[];
}) {
  return (
    <ul className="space-y-2.5">
      {baris.map((b) => (
        <li key={b.label} className="grid grid-cols-[4.5rem_1fr_3rem] items-center gap-2 text-sm sm:grid-cols-[8rem_1fr_3.5rem]">
          <span className="truncate font-semibold text-ink" title={b.label}>{b.label}</span>
          <span className="relative h-5 overflow-hidden rounded-md bg-slate-100">
            {b.nilai !== null && (
              <span className={`absolute inset-y-0 left-0 rounded-md ${warnaNilai(b.nilai)}`} style={{ width: `${b.nilai}%` }} />
            )}
            {b.catatan && (
              <span className="absolute inset-y-0 left-2 flex items-center text-[0.65rem] font-semibold text-slate-700">{b.catatan}</span>
            )}
          </span>
          <span className="text-right font-bold tabular-nums text-ink">{fmt(b.nilai)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Bilah tumpuk proporsi soal mudah / sedang / sulit. */
export function BilahKesukaran({ mudah, sedang, sulit }: { mudah: number; sedang: number; sulit: number }) {
  const total = Math.max(1, mudah + sedang + sulit);
  const bagian = [
    { label: "Mudah", n: mudah, warna: "bg-emerald-500", teks: "text-emerald-700" },
    { label: "Sedang", n: sedang, warna: "bg-amber-400", teks: "text-amber-700" },
    { label: "Sulit", n: sulit, warna: "bg-red-400", teks: "text-red-700" },
  ];
  return (
    <div>
      <div className="flex h-4 overflow-hidden rounded-full bg-slate-100">
        {bagian.map((b) => b.n > 0 && <span key={b.label} className={b.warna} style={{ width: `${(b.n / total) * 100}%` }} />)}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        {bagian.map((b) => (
          <div key={b.label}>
            <p className={`text-lg font-bold tabular-nums ${b.teks}`}>{b.n}</p>
            <p className="text-[0.7rem] font-medium uppercase tracking-wide text-slate-500">{b.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Kartu angka statistik dengan garis warna di kiri. */
export function KartuNilai({
  label,
  nilai,
  sub,
  aksen = "border-l-blue-500",
}: {
  label: string;
  nilai: React.ReactNode;
  sub?: React.ReactNode;
  aksen?: string;
}) {
  return (
    <div className={`rounded-xl border border-slate-200 border-l-4 bg-white px-4 py-3 shadow-sm ${aksen}`}>
      <p className="text-[0.68rem] font-bold uppercase leading-snug tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-serif text-[1.45rem] font-bold leading-tight tabular-nums text-ink">{nilai}</p>
      {sub && <p className="mt-0.5 truncate text-[0.72rem] text-slate-500">{sub}</p>}
    </div>
  );
}
