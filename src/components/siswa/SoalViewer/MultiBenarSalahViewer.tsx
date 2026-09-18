"use client";

import GambarSoal from "./GambarSoal";
import KontenKaya from "./KontenKaya";
import type {
  JawabanMultiBenarSalah,
  KontenMultiBenarSalahSiswa,
} from "./types";

/**
 * Dua perubahan penting:
 *
 *  1. Tipe soal ini sekarang BISA punya gambar. Sebelumnya tidak ada satu
 *     pun jalur gambar yang sampai ke layar untuk tipe ini (lihat catatan
 *     di SoalViewer.tsx), padahal justru tipe inilah yang paling sering
 *     butuh stimulus — tabel data, grafik, atau teks bacaan yang lalu
 *     dinilai benar/salah per pernyataan.
 *
 *  2. Baris pernyataan tidak lagi memakai `sm:flex-row sm:justify-between`.
 *     Di HP versi lama menumpuk teks di atas dan tombol Benar/Salah di
 *     bawah dengan lebar seadanya; sekarang dua tombolnya selalu
 *     berdampingan dengan lebar sama (grid-cols-2) dan tinggi 44 px, jadi
 *     tidak berubah-ubah posisi antar baris — mata siswa bisa menyusuri
 *     satu kolom, bukan mencari-cari tombolnya per baris.
 */
export default function MultiBenarSalahViewer({
  konten,
  value,
  onChange,
  disabled,
}: {
  konten: KontenMultiBenarSalahSiswa;
  value: JawabanMultiBenarSalah | undefined;
  onChange: (val: JawabanMultiBenarSalah) => void;
  disabled?: boolean;
}) {
  const jawaban = value ?? {};
  const jumlahTerisi = konten.pernyataan.filter(
    (p) => jawaban[p.id] !== undefined
  ).length;

  function set(pernyataanId: string, val: boolean) {
    if (disabled) return;
    onChange({ ...jawaban, [pernyataanId]: val });
  }

  return (
    <div className="space-y-4">
      <KontenKaya html={konten.instruksi_html} teks={konten.instruksi} />
      {konten.gambar_pertanyaan_url && (
        <GambarSoal url={konten.gambar_pertanyaan_url} />
      )}

      <p className="text-xs font-medium text-ink/50">
        {jumlahTerisi} dari {konten.pernyataan.length} pernyataan sudah
        dijawab — semuanya harus diisi.
      </p>

      <div className="space-y-2.5">
        {konten.pernyataan.map((p, idx) => {
          const belumDijawab = jawaban[p.id] === undefined;
          return (
            <div
              key={p.id}
              className={`space-y-2.5 rounded-xl border p-3.5 ${
                belumDijawab
                  ? "border-ink/15 bg-white"
                  : "border-gold/40 bg-gold/[0.04]"
              }`}
            >
              <div className="text-[15px] leading-relaxed text-ink">
                <span className="mr-1.5 font-bold text-ink/45">{idx + 1}.</span>
                <KontenKaya
                  html={p.teks_html}
                  teks={p.teks}
                  kecil
                  className="inline-block w-full align-top"
                />
                {p.gambar_url && <GambarSoal url={p.gambar_url} kecil />}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Benar", val: true },
                  { label: "Salah", val: false },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => set(p.id, opt.val)}
                    disabled={disabled}
                    aria-pressed={jawaban[p.id] === opt.val}
                    className={`min-h-[2.75rem] rounded-lg border text-sm font-semibold transition-colors touch-manipulation ${
                      jawaban[p.id] === opt.val
                        ? "border-gold bg-gold/20 text-ink"
                        : "border-ink/15 bg-white text-ink/50 active:bg-ink/[0.05] hover:bg-ink/5"
                    } disabled:cursor-default`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
