"use client";

import { useMemo, useState } from "react";
import SoalViewer from "@/components/siswa/SoalViewer/SoalViewer";
import type { SoalSiswa } from "@/types";
import { TIPE_LABEL } from "@/lib/soal";
import { formatAngka } from "@/lib/ai/rencana-soal";
import { periksaJawaban, tanpaKunci, teksKunci, type SoalDokumen } from "@/lib/ai/draf";

/**
 * Preview hasil Buat Soal AI dalam bentuk kuis: satu soal per layar,
 * memakai `SoalViewer` yang sama dengan halaman ujian siswa (konten sudah
 * dibuang kuncinya, seperti yang diterima siswa). Guru bisa mencoba
 * menjawab lalu menekan "Periksa" untuk melihat benar/salah dan kuncinya.
 * Tidak ada yang dikirim ke server.
 */
export default function PreviewKuis({ soal }: { soal: SoalDokumen[] }) {
  const [i, setI] = useState(0);
  const [jawaban, setJawaban] = useState<Record<number, unknown>>({});
  const [diperiksa, setDiperiksa] = useState<Record<number, boolean>>({});

  const siswa: SoalSiswa[] = useMemo(
    () =>
      soal.map((s, n) => ({
        id: `pratinjau-${n}`,
        tipe: s.tipe,
        urutan: n + 1,
        skor: s.skor,
        konten_jsonb: tanpaKunci(s.konten),
        gambar_url: null,
      })),
    [soal]
  );

  if (soal.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-500">Belum ada soal.</p>;
  }

  const sekarang = soal[Math.min(i, soal.length - 1)];
  const hasil = diperiksa[i] ? periksaJawaban(sekarang.tipe, sekarang.konten, jawaban[i]) : undefined;
  const nilai = soal.reduce(
    (n, s, k) => (diperiksa[k] && periksaJawaban(s.tipe, s.konten, jawaban[k]) ? n + Number(s.skor) : n),
    0
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3 text-sm">
        <span className="font-serif font-bold text-navy-900">
          Soal {i + 1} / {soal.length}
        </span>
        <span className="rounded-full bg-navy-50 px-2.5 py-0.5 text-[0.72rem] font-semibold text-navy-700">
          {TIPE_LABEL[sekarang.tipe]} · skor {formatAngka(Number(sekarang.skor))}
        </span>
        <span className="ml-auto text-xs text-slate-500">
          Nilai percobaan: <b className="text-ink">{formatAngka(nilai)}</b>
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-slate-100 px-4 py-2.5">
        {soal.map((s, k) => {
          const h = diperiksa[k] ? periksaJawaban(s.tipe, s.konten, jawaban[k]) : undefined;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setI(k)}
              className={`h-7 min-w-7 rounded-md px-1.5 text-xs font-bold ${
                k === i
                  ? "bg-navy-800 text-white"
                  : h === true
                    ? "bg-emerald-100 text-emerald-700"
                    : h === false
                      ? "bg-rose-100 text-rose-700"
                      : jawaban[k] !== undefined
                        ? "bg-navy-100 text-navy-700"
                        : "bg-slate-100 text-slate-500"
              }`}
            >
              {k + 1}
            </button>
          );
        })}
      </div>

      <div className="p-4 sm:p-5">
        <SoalViewer
          key={i}
          soal={siswa[i]}
          value={jawaban[i]}
          onChange={(v) => {
            setJawaban((j) => ({ ...j, [i]: v }));
            setDiperiksa((d) => ({ ...d, [i]: false }));
          }}
        />
        {diperiksa[i] && (
          <div
            className={`mt-4 rounded-xl px-4 py-3 text-sm font-semibold ${
              hasil === true
                ? "bg-emerald-50 text-emerald-800"
                : hasil === false
                  ? "bg-rose-50 text-rose-700"
                  : "bg-amber-50 text-amber-800"
            }`}
          >
            {hasil === true ? "Benar." : hasil === false ? "Belum tepat." : "Jawaban belum lengkap."} Kunci:{" "}
            {teksKunci(sekarang.tipe, sekarang.konten) || "–"}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-3">
        <button type="button" className="btn-ghost" disabled={i === 0} onClick={() => setI(i - 1)}>
          <i className="fas fa-arrow-left" aria-hidden />
          Sebelumnya
        </button>
        <button
          type="button"
          className="btn-navy-outline ml-auto"
          onClick={() => setDiperiksa((d) => ({ ...d, [i]: true }))}
        >
          <i className="fas fa-check-double" aria-hidden />
          Periksa
        </button>
        <button
          type="button"
          className="btn-ghost"
          disabled={i >= soal.length - 1}
          onClick={() => setI(i + 1)}
        >
          Berikutnya
          <i className="fas fa-arrow-right" aria-hidden />
        </button>
      </div>
    </div>
  );
}
