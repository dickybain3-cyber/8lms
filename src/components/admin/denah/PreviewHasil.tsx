import type { HasilDenah } from "@/lib/denah";
import { KartuPeserta, TabelPresensi } from "@/components/admin/cetak/LembarCetak";

/**
 * Kartu angka & pratinjau layar (denah/kartu/presensi) hasil pengacakan.
 *
 * Dipisah dari `DenahClient.tsx` supaya halaman "Pembagian Ruang Ujian"
 * (RuangClient.tsx, dibuka dari dalam satu kegiatan) menampilkan pratinjau
 * yang PERSIS SAMA dengan halaman /admin/denah yang berdiri sendiri —
 * satu tempat yang menentukan bagaimana hasil pengacakan ditampilkan di
 * layar, terlepas dari halaman mana yang memanggilnya.
 */

export function KotakAngka({
  label,
  nilai,
  tebal,
  peringatan,
}: {
  label: string;
  nilai: number;
  tebal?: boolean;
  peringatan?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        peringatan
          ? "border-danger/30 bg-danger/5"
          : "border-ink/10 bg-white"
      }`}
    >
      <p className="text-xs font-semibold text-ink/40">{label}</p>
      <p
        className={`mt-1 tabular-nums ${
          tebal ? "text-3xl font-extrabold" : "text-2xl font-bold"
        } ${peringatan ? "text-danger" : "text-ink"}`}
      >
        {nilai}
      </p>
    </div>
  );
}

function warnaTingkat(tingkat: 7 | 8 | 9): string {
  return tingkat === 7
    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
    : tingkat === 8
      ? "bg-blue-50 text-blue-700 ring-blue-200"
      : "bg-amber-50 text-amber-700 ring-amber-200";
}

export function PratinjauDenah({ hasil }: { hasil: HasilDenah }) {
  return (
    <div className="space-y-8">
      {hasil.ruang.map((r) => (
        <section key={r.nama}>
          <h3 className="mb-3 font-serif text-lg text-ink">
            {r.nama}{" "}
            <span className="text-sm font-normal text-ink/40">
              · {r.kursi.length} siswa · {r.meja.length} meja
            </span>
          </h3>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {r.meja.map((m) => (
              <div
                key={m.nomor}
                className={`rounded-xl border p-3 ${
                  m.setingkat
                    ? "border-amber-300 bg-amber-50/60"
                    : "border-ink/10 bg-white"
                }`}
              >
                <p className="mb-2 font-mono text-[0.7rem] font-bold text-ink/35">
                  MEJA {String(m.nomor).padStart(2, "0")}
                </p>
                <ul className="space-y-1.5">
                  {m.kursi.map((k) => (
                    <li key={k.kode} className="flex items-center gap-2">
                      <span className="w-4 shrink-0 font-mono text-xs font-bold text-ink/40">
                        {k.posisi}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">
                        {k.siswa.nama}
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[0.68rem] font-bold ring-1 ${warnaTingkat(k.siswa.tingkat)}`}
                      >
                        {k.siswa.kelasNama}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function PratinjauKartu({
  hasil,
  namaKegiatan,
}: {
  hasil: HasilDenah;
  namaKegiatan: string;
}) {
  const contoh = hasil.ruang[0]?.kursi.slice(0, 4) ?? [];
  const total = hasil.ringkasan.totalTerpasang;
  return (
    <div>
      <p className="mb-4 text-sm text-ink/60">
        {total} kartu akan dicetak, 8 kartu per halaman A4 ({Math.ceil(total / 8)}{" "}
        lembar). Di bawah ini contoh empat kartu pertama.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {contoh.map((k) => (
          <div key={k.kode} className="max-w-md">
            <KartuPeserta kursi={k} ruangNama={hasil.ruang[0].nama} namaKegiatan={namaKegiatan} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function PratinjauPresensi({
  hasil,
  namaKegiatan,
}: {
  hasil: HasilDenah;
  namaKegiatan: string;
}) {
  return (
    <div className="space-y-8">
      {hasil.ruang.map((r) => (
        <TabelPresensi key={r.nama} ruang={r} namaKegiatan={namaKegiatan} />
      ))}
    </div>
  );
}
