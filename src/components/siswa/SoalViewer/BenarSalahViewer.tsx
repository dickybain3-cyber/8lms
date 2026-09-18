"use client";

import GambarSoal from "./GambarSoal";
import KontenKaya from "./KontenKaya";
import type { JawabanBenarSalah, KontenBenarSalahSiswa } from "./types";

export default function BenarSalahViewer({
  konten,
  value,
  onChange,
  disabled,
}: {
  konten: KontenBenarSalahSiswa;
  value: JawabanBenarSalah | undefined;
  onChange: (val: JawabanBenarSalah) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-4">
      <KontenKaya html={konten.pertanyaan_html} teks={konten.pertanyaan} />
      {konten.gambar_pertanyaan_url && (
        <GambarSoal url={konten.gambar_pertanyaan_url} />
      )}

      <div className="flex gap-3">
        {[
          { label: "Benar", val: true },
          { label: "Salah", val: false },
        ].map((opt) => (
          <label
            key={opt.label}
            className={`flex min-h-[3.5rem] flex-1 cursor-pointer items-center justify-center gap-2.5 rounded-xl border text-[15px] font-semibold transition-colors touch-manipulation ${
              value === opt.val
                ? "border-gold bg-gold/10 text-ink"
                : "border-ink/15 bg-white text-ink/60 active:bg-ink/[0.05] hover:bg-ink/[0.03]"
            } ${disabled ? "cursor-default" : ""}`}
          >
            <input
              type="radio"
              name="benar_salah_jawaban"
              checked={value === opt.val}
              onChange={() => onChange(opt.val)}
              disabled={disabled}
              className="h-5 w-5 accent-gold"
            />
            {opt.label}
          </label>
        ))}
      </div>
    </div>
  );
}
