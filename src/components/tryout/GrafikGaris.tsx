/**
 * Grafik garis nilai 0–100 antar paket tryout (SVG murni, tanpa library,
 * bisa dirender di server). Titik null = belum ada nilai; garis disambung
 * melewatinya supaya tren tetap terbaca.
 */

export const WARNA_SERI = ["#1e3a8a", "#d97706", "#059669", "#be123c", "#7c3aed", "#0891b2"];

export interface SeriGaris {
  nama: string;
  nilai: (number | null)[];
  warna?: string;
  tebal?: boolean;
}

export default function GrafikGaris({
  kategori,
  seri,
  tinggi = 220,
  judul,
}: {
  kategori: string[];
  seri: SeriGaris[];
  tinggi?: number;
  judul?: string;
}) {
  const lebar = 640;
  const kiri = 34;
  const kanan = 16;
  const atas = 14;
  const bawah = 40;
  const w = lebar - kiri - kanan;
  const h = tinggi - atas - bawah;
  const n = kategori.length;
  const x = (i: number) => kiri + (n <= 1 ? w / 2 : (i / (n - 1)) * w);
  const y = (v: number) => atas + h - (Math.max(0, Math.min(100, v)) / 100) * h;
  const adaData = seri.some((s) => s.nilai.some((v) => v !== null));

  return (
    <figure className="w-full">
      {judul && <figcaption className="mb-2 text-sm font-semibold text-ink">{judul}</figcaption>}
      {!adaData ? (
        <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">Belum ada nilai.</p>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${lebar} ${tinggi}`}
            className="h-auto w-full"
            role="img"
            aria-label={judul ?? "Grafik nilai antar paket"}
          >
            {[0, 25, 50, 75, 100].map((g) => (
              <g key={g}>
                <line x1={kiri} x2={lebar - kanan} y1={y(g)} y2={y(g)} stroke="#e2e8f0" strokeWidth={1} />
                <text x={kiri - 6} y={y(g) + 4} textAnchor="end" fontSize={11} fill="#64748b">
                  {g}
                </text>
              </g>
            ))}
            {kategori.map((k, i) => (
              <text
                key={`${k}-${i}`}
                x={x(i)}
                y={tinggi - bawah + 18}
                textAnchor="middle"
                fontSize={11}
                fill="#475569"
              >
                {k.length > 16 ? `${k.slice(0, 15)}…` : k}
              </text>
            ))}
            {seri.map((s, si) => {
              const warna = s.warna ?? WARNA_SERI[si % WARNA_SERI.length];
              const titik = s.nilai
                .map((v, i) => (v === null ? null : { cx: x(i), cy: y(v), v }))
                .filter((t): t is { cx: number; cy: number; v: number } => t !== null);
              return (
                <g key={s.nama}>
                  {titik.length > 1 && (
                    <polyline
                      points={titik.map((t) => `${t.cx},${t.cy}`).join(" ")}
                      fill="none"
                      stroke={warna}
                      strokeWidth={s.tebal ? 3.5 : 2.25}
                      strokeLinejoin="round"
                    />
                  )}
                  {titik.map((t, i) => (
                    <g key={i}>
                      <circle cx={t.cx} cy={t.cy} r={s.tebal ? 5 : 4} fill="#fff" stroke={warna} strokeWidth={2.5} />
                      {seri.length <= 3 && (
                        <text x={t.cx} y={t.cy - 9} textAnchor="middle" fontSize={11} fontWeight={700} fill={warna}>
                          {Number.isInteger(t.v) ? t.v : t.v.toFixed(1)}
                        </text>
                      )}
                    </g>
                  ))}
                </g>
              );
            })}
          </svg>
          <div className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-slate-600">
            {seri.map((s, si) => (
              <span key={s.nama} className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-4 rounded-sm"
                  style={{ background: s.warna ?? WARNA_SERI[si % WARNA_SERI.length] }}
                />
                {s.nama}
              </span>
            ))}
          </div>
        </>
      )}
    </figure>
  );
}

/** Lencana naik/turun. */
export function LencanaPerubahan({ selisih, arah }: { selisih: number; arah: "naik" | "turun" | "tetap" }) {
  const gaya =
    arah === "naik"
      ? "bg-emerald-50 text-emerald-700"
      : arah === "turun"
        ? "bg-red-50 text-red-700"
        : "bg-slate-100 text-slate-600";
  const ikon = arah === "naik" ? "fa-arrow-trend-up" : arah === "turun" ? "fa-arrow-trend-down" : "fa-minus";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${gaya}`}>
      <i className={`fas ${ikon}`} aria-hidden />
      {selisih > 0 ? "+" : ""}
      {selisih.toLocaleString("id-ID", { maximumFractionDigits: 1 })}
    </span>
  );
}
