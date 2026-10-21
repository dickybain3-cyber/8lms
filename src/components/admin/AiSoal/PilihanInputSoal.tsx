"use client";

import Link from "next/link";
import type { Jenjang } from "@/lib/jenjang";
import GeneratorSoalAi from "./GeneratorSoalAi";
import AmbilDariBank from "./AmbilDariBank";

/**
 * Tiga cara mengisi soal sebuah mapel, ditampilkan berdampingan:
 *   1. Input manual       — form soal biasa
 *   2. Generate dengan AI — GeneratorSoalAi
 *   3. Ambil dari Bank    — AmbilDariBank
 */
export default function PilihanInputSoal({
  eventId,
  mapelId,
  mapelNama,
  jenjang,
  jenjangData,
  aiSiap,
  hrefManual,
}: {
  eventId: string;
  mapelId: string;
  mapelNama: string;
  jenjang?: Jenjang;
  jenjangData: Jenjang | null;
  aiSiap: boolean;
  /** Tautan ke form manual. Diawali "#" = gulir ke form di halaman ini. */
  hrefManual: string;
}) {
  const ubin =
    "group flex h-full w-full items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-navy-300 hover:shadow-md";

  const isi = (ikon: string, warna: string, judul: string, ket: string) => (
    <>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-base ${warna}`}>
        <i className={`fas ${ikon}`} aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block font-serif text-[0.95rem] font-bold text-navy-900">{judul}</span>
        <span className="mt-0.5 block text-[0.75rem] leading-snug text-slate-500">{ket}</span>
      </span>
    </>
  );

  return (
    <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
      {hrefManual.startsWith("#") ? (
        <a href={hrefManual} className={ubin}>
          {isi("fa-keyboard", "bg-navy-50 text-navy-700", "Input manual", "Ketik soal satu per satu, tempel gambar langsung.")}
        </a>
      ) : (
        <Link href={hrefManual} className={ubin}>
          {isi("fa-keyboard", "bg-navy-50 text-navy-700", "Input manual", "Ketik soal satu per satu, tempel gambar langsung.")}
        </Link>
      )}

      <GeneratorSoalAi
        eventId={eventId}
        mapelId={mapelId}
        mapelNama={mapelNama}
        jenjang={jenjang}
        jenjangData={jenjangData}
        aiSiap={aiSiap}
        renderPemicu={(buka) => (
          <button type="button" onClick={buka} className={ubin}>
            {isi(
              "fa-wand-magic-sparkles",
              "bg-kuning/25 text-amber-700",
              "Generate dengan AI",
              "Tulis topik & jumlah soal, AI membuat drafnya."
            )}
          </button>
        )}
      />

      <AmbilDariBank
        mapelId={mapelId}
        mapelNama={mapelNama}
        jenjang={jenjang}
        renderPemicu={(buka) => (
          <button type="button" onClick={buka} className={ubin}>
            {isi(
              "fa-box-archive",
              "bg-emerald-50 text-emerald-700",
              "Ambil dari Bank Soal",
              "Pakai lagi soal dari ujian sebelumnya."
            )}
          </button>
        )}
      />
    </div>
  );
}
