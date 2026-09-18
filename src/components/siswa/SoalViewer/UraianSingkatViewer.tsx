"use client";

import GambarSoal from "./GambarSoal";
import KontenKaya from "./KontenKaya";
import type { JawabanUraianSingkat, KontenUraianSingkatSiswa } from "./types";

export default function UraianSingkatViewer({
  konten,
  value,
  onChange,
  disabled,
}: {
  konten: KontenUraianSingkatSiswa;
  value: JawabanUraianSingkat | undefined;
  onChange: (val: JawabanUraianSingkat) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-4">
      <KontenKaya html={konten.pertanyaan_html} teks={konten.pertanyaan} />
      {konten.gambar_pertanyaan_url && (
        <GambarSoal url={konten.gambar_pertanyaan_url} />
      )}

      {/*
        `text-base` (16 px) di sini BUKAN pilihan estetika. Safari iOS
        otomatis memperbesar (zoom) seluruh halaman ketika fokus masuk ke
        input dengan ukuran font di bawah 16 px, lalu tidak mengembalikan
        zoom-nya — siswa jadi terjebak di tampilan melar setelah mengetik
        satu jawaban. Jangan turunkan nilainya.
      */}
      <textarea
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={3}
        inputMode="text"
        autoCapitalize="sentences"
        placeholder="Tulis jawabanmu…"
        className="w-full rounded-xl border border-ink/15 bg-white px-3.5 py-3 text-base text-ink outline-none focus:border-gold disabled:bg-paper-dark/40 disabled:text-ink/60"
      />
    </div>
  );
}
