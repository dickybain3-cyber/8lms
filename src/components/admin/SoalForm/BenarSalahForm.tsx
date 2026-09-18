"use client";

import { useCallback, useEffect, useState } from "react";
import EditorKaya from "./EditorKaya";
import { teksKeHtml } from "@/lib/html-soal";
import type { KontenBenarSalah } from "./types";

export default function BenarSalahForm({
  onContentChange,
  initial,
}: {
  onContentChange: (konten: KontenBenarSalah) => void;
  initial?: Record<string, unknown>;
}) {
  const awal = initial as Partial<KontenBenarSalah> | undefined;
  const [pertanyaan, setPertanyaan] = useState(awal?.pertanyaan ?? "");
  const [pertanyaanHtml, setPertanyaanHtml] = useState(
    awal?.pertanyaan_html ?? teksKeHtml(awal?.pertanyaan)
  );
  const gambarPertanyaan = awal?.gambar_pertanyaan_url ?? null;
  const [jawabanBenar, setJawabanBenar] = useState<boolean | null>(
    awal?.jawaban_benar ?? null
  );

  useEffect(() => {
    onContentChange({
      pertanyaan,
      pertanyaan_html: pertanyaanHtml,
      gambar_pertanyaan_url: gambarPertanyaan,
      jawaban_benar: jawabanBenar ?? false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pertanyaan, pertanyaanHtml, gambarPertanyaan, jawabanBenar]);

  const ubahPernyataan = useCallback(
    ({ html, teks }: { html: string; teks: string }) => {
      setPertanyaanHtml(html);
      setPertanyaan(teks);
    },
    []
  );

  return (
    <div className="space-y-5">
      <div>
        <label className="mb-1.5 block text-sm text-ink/70">Pernyataan</label>
        <EditorKaya
          nilaiAwal={pertanyaanHtml}
          onChange={ubahPernyataan}
          placeholder="Tulis pernyataan… (bisa tempel gambar dengan Ctrl+V)"
          minTinggi="7rem"
        />
      </div>

      <fieldset>
        <legend className="mb-1.5 block text-sm text-ink/70">
          Kunci jawaban
        </legend>
        <div className="flex gap-3">
          {[
            { label: "Benar", val: true },
            { label: "Salah", val: false },
          ].map((opt) => (
            <label
              key={opt.label}
              className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border border-ink/15 bg-white py-2.5 text-sm text-ink has-[:checked]:border-gold has-[:checked]:bg-gold/10"
            >
              <input
                type="radio"
                name="jawaban_benar"
                required
                checked={jawabanBenar === opt.val}
                onChange={() => setJawabanBenar(opt.val)}
                className="accent-gold"
              />
              {opt.label}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
