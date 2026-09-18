"use client";

import { useCallback, useEffect, useState } from "react";
import EditorKaya from "./EditorKaya";
import { htmlKeTeks, teksKeHtml } from "@/lib/html-soal";
import {
  buatId,
  type ItemMenjodohkan,
  type JawabanMenjodohkan,
  type KontenMenjodohkan,
} from "./types";

const inputCls =
  "w-full rounded-md border border-ink/15 bg-white px-3.5 py-2.5 text-ink placeholder:text-ink/30 outline-none focus:border-gold";

export default function MenjodohkanForm({
  onContentChange,
  initial,
}: {
  onContentChange: (konten: KontenMenjodohkan) => void;
  initial?: Record<string, unknown>;
}) {
  const awal = initial as Partial<KontenMenjodohkan> | undefined;
  const [instruksi, setInstruksi] = useState(awal?.instruksi ?? "");
  const [instruksiHtml, setInstruksiHtml] = useState(
    awal?.instruksi_html ?? teksKeHtml(awal?.instruksi)
  );
  const gambarPertanyaan = awal?.gambar_pertanyaan_url ?? null;
  const [soal, setSoal] = useState<ItemMenjodohkan[]>(
    awal?.soal && awal.soal.length > 0
      ? awal.soal
      : [
          { id: buatId("s"), teks: "", teks_html: "", gambar_url: null },
          { id: buatId("s"), teks: "", teks_html: "", gambar_url: null },
        ]
  );
  const [jawaban, setJawaban] = useState<JawabanMenjodohkan[]>(
    awal?.jawaban && awal.jawaban.length > 0
      ? awal.jawaban
      : [
          { id: buatId("j"), teks: "" },
          { id: buatId("j"), teks: "" },
        ]
  );
  const [pasangan, setPasangan] = useState<Record<string, string>>(
    awal?.pasangan_benar ?? {}
  );

  useEffect(() => {
    onContentChange({
      instruksi,
      instruksi_html: instruksiHtml,
      gambar_pertanyaan_url: gambarPertanyaan,
      soal,
      jawaban,
      pasangan_benar: pasangan,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instruksi, instruksiHtml, gambarPertanyaan, soal, jawaban, pasangan]);

  const ubahInstruksi = useCallback(
    ({ html, teks }: { html: string; teks: string }) => {
      setInstruksiHtml(html);
      setInstruksi(teks);
    },
    []
  );

  function tambahSoal() {
    setSoal((prev) => [
      ...prev,
      { id: buatId("s"), teks: "", teks_html: "", gambar_url: null },
    ]);
  }
  function hapusSoal(id: string) {
    setSoal((prev) => prev.filter((s) => s.id !== id));
    setPasangan((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }
  function ubahSoalTeks(id: string, html: string, teks: string) {
    setSoal((prev) =>
      prev.map((s) => (s.id === id ? { ...s, teks, teks_html: html } : s))
    );
  }

  function tambahJawaban() {
    setJawaban((prev) => [...prev, { id: buatId("j"), teks: "" }]);
  }
  function hapusJawaban(id: string) {
    setJawaban((prev) => prev.filter((j) => j.id !== id));
    setPasangan((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (next[k] === id) delete next[k];
      }
      return next;
    });
  }
  function ubahJawabanTeks(id: string, teks: string) {
    setJawaban((prev) => prev.map((j) => (j.id === id ? { ...j, teks } : j)));
  }

  function ubahPasangan(soalId: string, jawabanId: string) {
    setPasangan((prev) => {
      if (!jawabanId) {
        const next = { ...prev };
        delete next[soalId];
        return next;
      }
      return { ...prev, [soalId]: jawabanId };
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="mb-1.5 block text-sm text-ink/70">Instruksi</label>
        <EditorKaya
          nilaiAwal={instruksiHtml}
          onChange={ubahInstruksi}
          placeholder="mis. Jodohkan istilah di kolom kiri dengan definisinya di kolom kanan."
          minTinggi="5rem"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-sm text-ink/70">Kolom kiri (soal)</label>
            <button
              type="button"
              onClick={tambahSoal}
              className="text-xs font-medium text-teal hover:text-teal-light"
            >
              + Tambah
            </button>
          </div>
          <div className="space-y-3">
            {soal.map((s, idx) => (
              <div
                key={s.id}
                className="rounded-md border border-ink/15 bg-white p-3"
              >
                <div className="flex items-start gap-2">
                  <span className="mt-2 text-xs font-bold text-ink/40">
                    {idx + 1}.
                  </span>
                  <div className="flex-1 space-y-2">
                    {/*
                      Kolom kiri diberi editor karena inilah sisi yang
                      isinya sering berupa gambar — bangun datar, simbol
                      unsur, potongan peta — untuk dijodohkan dengan
                      namanya di kolom kanan.
                    */}
                    <EditorKaya
                      nilaiAwal={s.teks_html ?? teksKeHtml(s.teks)}
                      onChange={({ html, teks }) =>
                        ubahSoalTeks(s.id, html, teks)
                      }
                      placeholder={`Item soal ${idx + 1} — boleh tempel gambar`}
                      minTinggi="3rem"
                      ringkas
                    />
                    <select
                      value={pasangan[s.id] ?? ""}
                      onChange={(e) => ubahPasangan(s.id, e.target.value)}
                      className={inputCls}
                    >
                      <option value="">— pasangkan dengan… —</option>
                      {jawaban.map((j, jIdx) => (
                        <option key={j.id} value={j.id}>
                          {htmlKeTeks(j.teks).trim() ||
                            `Item jawaban ${jIdx + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                  {soal.length > 2 && (
                    <button
                      type="button"
                      onClick={() => hapusSoal(s.id)}
                      aria-label={`Hapus item soal ${idx + 1}`}
                      className="mt-1 text-ink/30 hover:text-danger"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-sm text-ink/70">Kolom kanan (jawaban)</label>
            <button
              type="button"
              onClick={tambahJawaban}
              className="text-xs font-medium text-teal hover:text-teal-light"
            >
              + Tambah
            </button>
          </div>
          <div className="space-y-3">
            {jawaban.map((j, idx) => (
              <div key={j.id} className="flex items-center gap-2">
                <span className="text-xs text-ink/40">
                  {String.fromCharCode(65 + idx)}.
                </span>
                {/*
                  Kolom kanan tetap teks polos. Isinya muncul di dalam
                  <option> pada dropdown pemasangan di atas, dan <option>
                  tidak bisa merender HTML — kalau kolom ini diberi
                  format, guru akan melihat "<b>Jakarta</b>" di dropdown
                  saat menautkan pasangan.
                */}
                <input
                  type="text"
                  value={j.teks}
                  onChange={(e) => ubahJawabanTeks(j.id, e.target.value)}
                  placeholder={`Item jawaban ${idx + 1}`}
                  required
                  className={inputCls}
                />
                {jawaban.length > 2 && (
                  <button
                    type="button"
                    onClick={() => hapusJawaban(j.id)}
                    aria-label={`Hapus item jawaban ${idx + 1}`}
                    className="text-ink/30 hover:text-danger"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink/40">
            Boleh lebih banyak dari kolom kiri (jadi ada pengecoh).
          </p>
        </div>
      </div>
    </div>
  );
}
