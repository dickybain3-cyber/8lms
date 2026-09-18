"use client";

import { useCallback, useEffect, useState } from "react";
import EditorKaya from "./EditorKaya";
import { teksKeHtml } from "@/lib/html-soal";
import {
  buatId,
  type KontenMultiBenarSalah,
  type PernyataanMultiBS,
} from "./types";

/**
 * Tipe soal inilah yang paling diuntungkan perubahan ini. Bentuk umumnya
 * adalah satu STIMULUS — tabel data, grafik, atau kutipan bacaan — lalu
 * beberapa pernyataan yang dinilai benar/salah terhadap stimulus itu.
 * Sebelumnya sub-form ini sama sekali tidak punya kotak gambar, jadi
 * satu-satunya cara memasang stimulus adalah lewat "Gambar soal umum" di
 * luar sub-form. Sekarang stimulusnya bisa ditempel langsung ke kolom
 * instruksi, dan tiap pernyataan pun bisa punya gambarnya sendiri.
 */

export default function MultiBenarSalahForm({
  onContentChange,
  initial,
}: {
  onContentChange: (konten: KontenMultiBenarSalah) => void;
  initial?: Record<string, unknown>;
}) {
  const awal = initial as Partial<KontenMultiBenarSalah> | undefined;
  const [instruksi, setInstruksi] = useState(awal?.instruksi ?? "");
  const [instruksiHtml, setInstruksiHtml] = useState(
    awal?.instruksi_html ?? teksKeHtml(awal?.instruksi)
  );
  const gambarPertanyaan = awal?.gambar_pertanyaan_url ?? null;
  const [pernyataan, setPernyataan] = useState<PernyataanMultiBS[]>(
    awal?.pernyataan && awal.pernyataan.length > 0
      ? awal.pernyataan
      : [
          { id: buatId("p"), teks: "", teks_html: "", jawaban_benar: false },
          { id: buatId("p"), teks: "", teks_html: "", jawaban_benar: false },
        ]
  );

  useEffect(() => {
    onContentChange({
      instruksi,
      instruksi_html: instruksiHtml,
      gambar_pertanyaan_url: gambarPertanyaan,
      pernyataan,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instruksi, instruksiHtml, gambarPertanyaan, pernyataan]);

  const ubahInstruksi = useCallback(
    ({ html, teks }: { html: string; teks: string }) => {
      setInstruksiHtml(html);
      setInstruksi(teks);
    },
    []
  );

  function tambah() {
    setPernyataan((prev) => [
      ...prev,
      { id: buatId("p"), teks: "", teks_html: "", jawaban_benar: false },
    ]);
  }

  function hapus(id: string) {
    setPernyataan((prev) => prev.filter((p) => p.id !== id));
  }

  function ubahTeks(id: string, html: string, teks: string) {
    setPernyataan((prev) =>
      prev.map((p) => (p.id === id ? { ...p, teks, teks_html: html } : p))
    );
  }

  function ubahJawaban(id: string, val: boolean) {
    setPernyataan((prev) =>
      prev.map((p) => (p.id === id ? { ...p, jawaban_benar: val } : p))
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="mb-1.5 block text-sm text-ink/70">
          Instruksi / stimulus
        </label>
        <EditorKaya
          nilaiAwal={instruksiHtml}
          onChange={ubahInstruksi}
          placeholder="mis. Perhatikan tabel berikut, lalu tentukan Benar atau Salah tiap pernyataan. (tempel tabel/grafik dengan Ctrl+V)"
          minTinggi="7rem"
        />
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-sm text-ink/70">Pernyataan</label>
          <button
            type="button"
            onClick={tambah}
            className="text-xs font-medium text-teal hover:text-teal-light"
          >
            + Tambah pernyataan
          </button>
        </div>
        <div className="space-y-3">
          {pernyataan.map((p, idx) => (
            <div
              key={p.id}
              className="rounded-md border border-ink/15 bg-white p-3"
            >
              <div className="flex items-start gap-2">
                <span className="mt-2 text-xs font-bold text-ink/40">
                  {idx + 1}.
                </span>
                <div className="flex-1 space-y-2">
                  <EditorKaya
                    nilaiAwal={p.teks_html ?? teksKeHtml(p.teks)}
                    onChange={({ html, teks }) => ubahTeks(p.id, html, teks)}
                    placeholder={`Pernyataan ${idx + 1}`}
                    minTinggi="3rem"
                    ringkas
                  />
                  <div className="flex items-center gap-2">
                    <div className="flex overflow-hidden rounded-md border border-ink/15">
                      {[
                        { label: "Benar", val: true },
                        { label: "Salah", val: false },
                      ].map((opt) => (
                        <button
                          key={opt.label}
                          type="button"
                          onClick={() => ubahJawaban(p.id, opt.val)}
                          className={`px-3 py-2 text-xs font-medium transition-colors ${
                            p.jawaban_benar === opt.val
                              ? "bg-gold/20 text-ink"
                              : "bg-white text-ink/50 hover:bg-ink/5"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {pernyataan.length > 2 && (
                      <button
                        type="button"
                        onClick={() => hapus(p.id)}
                        aria-label={`Hapus pernyataan ${idx + 1}`}
                        className="text-ink/30 hover:text-danger"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
