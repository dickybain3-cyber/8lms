"use client";

import { useCallback, useEffect, useState } from "react";
import EditorKaya from "./EditorKaya";
import { teksKeHtml } from "@/lib/html-soal";
import type { KontenUraianSingkat } from "./types";

/**
 * Pertanyaan memakai editor kaya; KUNCI JAWABAN TIDAK.
 *
 * Kunci jawaban dicocokkan sebagai string (lihat `hitung_nilai` di
 * 0007_scoring.sql). Kalau kolomnya diberi format, guru yang tidak
 * sengaja menebalkan satu huruf akan menyimpan `<b>a</b>ir` sebagai
 * kunci — dan jawaban "air" dari siswa tidak akan pernah cocok, tanpa
 * ada yang bisa melihat sebabnya dari layar. Jadi kolom ini tetap
 * `<input type="text">` polos, disengaja.
 */

const inputCls =
  "w-full rounded-md border border-ink/15 bg-white px-3.5 py-2.5 text-ink placeholder:text-ink/30 outline-none focus:border-gold";

export default function UraianSingkatForm({
  onContentChange,
  initial,
}: {
  onContentChange: (konten: KontenUraianSingkat) => void;
  initial?: Record<string, unknown>;
}) {
  const awal = initial as Partial<KontenUraianSingkat> | undefined;
  const [pertanyaan, setPertanyaan] = useState(awal?.pertanyaan ?? "");
  const [pertanyaanHtml, setPertanyaanHtml] = useState(
    awal?.pertanyaan_html ?? teksKeHtml(awal?.pertanyaan)
  );
  const gambarPertanyaan = awal?.gambar_pertanyaan_url ?? null;
  const [kunciJawaban, setKunciJawaban] = useState<string[]>(
    awal?.kunci_jawaban && awal.kunci_jawaban.length > 0
      ? awal.kunci_jawaban
      : [""]
  );

  useEffect(() => {
    onContentChange({
      pertanyaan,
      pertanyaan_html: pertanyaanHtml,
      gambar_pertanyaan_url: gambarPertanyaan,
      kunci_jawaban: kunciJawaban,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pertanyaan, pertanyaanHtml, gambarPertanyaan, kunciJawaban]);

  const ubahPertanyaan = useCallback(
    ({ html, teks }: { html: string; teks: string }) => {
      setPertanyaanHtml(html);
      setPertanyaan(teks);
    },
    []
  );

  function ubahKunci(idx: number, val: string) {
    setKunciJawaban((prev) => prev.map((k, i) => (i === idx ? val : k)));
  }

  function tambahKunci() {
    setKunciJawaban((prev) => [...prev, ""]);
  }

  function hapusKunci(idx: number) {
    setKunciJawaban((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="mb-1.5 block text-sm text-ink/70">Pertanyaan</label>
        <EditorKaya
          nilaiAwal={pertanyaanHtml}
          onChange={ubahPertanyaan}
          placeholder="Tulis pertanyaan… (bisa tempel gambar dengan Ctrl+V)"
          minTinggi="7rem"
        />
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-sm text-ink/70">
            Kata kunci jawaban{" "}
            <span className="text-ink/40">
              (dicocokkan case-insensitive, boleh lebih dari satu)
            </span>
          </label>
          <button
            type="button"
            onClick={tambahKunci}
            className="text-xs font-medium text-teal hover:text-teal-light"
          >
            + Tambah kata kunci
          </button>
        </div>
        <div className="space-y-2">
          {kunciJawaban.map((k, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                type="text"
                value={k}
                onChange={(e) => ubahKunci(idx, e.target.value)}
                placeholder={`Kata kunci ${idx + 1}`}
                required
                className={inputCls}
              />
              {kunciJawaban.length > 1 && (
                <button
                  type="button"
                  onClick={() => hapusKunci(idx)}
                  aria-label={`Hapus kata kunci ${idx + 1}`}
                  className="text-ink/30 hover:text-danger"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
