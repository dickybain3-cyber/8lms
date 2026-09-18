"use client";

import GambarSoal from "./GambarSoal";
import KontenKaya from "./KontenKaya";
import type { JawabanMenjodohkan, KontenMenjodohkanSiswa } from "./types";

/**
 * Menjodohkan tetap memakai <select>, bukan seret-dan-lepas (drag & drop).
 * Itu keputusan sadar untuk HP: seret-lepas di layar sentuh yang sedang
 * digulir hampir selalu berebut dengan gerakan gulir halaman, dan tidak
 * ada cara membatalkan seretan yang salah. <select> memunculkan pemilih
 * bawaan sistem yang sudah dikenal siswa dan mustahil "lepas di tempat
 * yang salah".
 *
 * Yang diperbaiki: daftar pilihan kanan sekarang juga ditampilkan sebagai
 * daftar bernomor huruf DI ATAS, bukan hanya tersembunyi di dalam
 * <select>. Sebelumnya siswa harus membuka dropdown satu per satu hanya
 * untuk tahu ada pilihan apa saja — di kertas, kolom kanan selalu
 * terlihat sekaligus, dan itu yang mereka harapkan.
 */
export default function MenjodohkanViewer({
  konten,
  value,
  onChange,
  disabled,
}: {
  konten: KontenMenjodohkanSiswa;
  value: JawabanMenjodohkan | undefined;
  onChange: (val: JawabanMenjodohkan) => void;
  disabled?: boolean;
}) {
  const pasangan = value ?? {};

  function pilih(soalId: string, jawabanId: string) {
    if (disabled) return;
    if (!jawabanId) {
      const next = { ...pasangan };
      delete next[soalId];
      onChange(next);
      return;
    }
    onChange({ ...pasangan, [soalId]: jawabanId });
  }

  return (
    <div className="space-y-4">
      <KontenKaya html={konten.instruksi_html} teks={konten.instruksi} />
      {konten.gambar_pertanyaan_url && (
        <GambarSoal url={konten.gambar_pertanyaan_url} />
      )}

      <div className="rounded-xl border border-ink/10 bg-paper-dark/40 p-3.5">
        <p className="mb-2 text-xs font-semibold text-ink/50">
          Pilihan jawaban
        </p>
        <ul className="space-y-1.5">
          {konten.jawaban.map((j, jIdx) => (
            <li key={j.id} className="text-sm leading-relaxed text-ink/80">
              <span className="mr-1.5 font-bold text-ink/45">
                {String.fromCharCode(65 + jIdx)}.
              </span>
              {j.teks}
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-2.5">
        {konten.soal.map((s, idx) => {
          const terisi = Boolean(pasangan[s.id]);
          return (
            <div
              key={s.id}
              className={`space-y-2.5 rounded-xl border p-3.5 ${
                terisi ? "border-gold/40 bg-gold/[0.04]" : "border-ink/15 bg-white"
              }`}
            >
              <div className="text-[15px] leading-relaxed text-ink">
                <span className="mr-1.5 font-bold text-ink/45">{idx + 1}.</span>
                {/*
                  Kolom kiri boleh berisi gambar tempelan (bangun datar,
                  simbol, potongan peta). Kolom KANAN tidak — isinya harus
                  muat di dalam <option>, dan <option> tidak bisa merender
                  HTML apa pun.
                */}
                <KontenKaya
                  html={s.teks_html}
                  teks={s.teks}
                  kecil
                  className="inline-block w-full align-top"
                />
                {s.gambar_url && <GambarSoal url={s.gambar_url} kecil />}
              </div>
              {/*
                `text-base` wajib — sama alasannya dengan textarea di
                UraianSingkatViewer: Safari iOS memaksa zoom halaman pada
                kontrol form berukuran font di bawah 16 px.
              */}
              <select
                value={pasangan[s.id] ?? ""}
                onChange={(e) => pilih(s.id, e.target.value)}
                disabled={disabled}
                aria-label={`Pasangan untuk nomor ${idx + 1}`}
                className="min-h-[2.75rem] w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-base text-ink outline-none focus:border-gold disabled:bg-paper-dark/40"
              >
                <option value="">— pilih pasangan —</option>
                {konten.jawaban.map((j, jIdx) => (
                  <option key={j.id} value={j.id}>
                    {String.fromCharCode(65 + jIdx)}. {j.teks}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}
