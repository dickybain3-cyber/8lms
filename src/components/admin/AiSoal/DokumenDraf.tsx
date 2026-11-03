"use client";

import { useMemo, useState } from "react";
import { htmlDokumenSoal, namaBerkas, type SoalDokumen } from "@/lib/ai/draf";

/**
 * "Lihat draf soal" — naskah soal seperti dokumen cetak. Isinya sama
 * persis dengan berkas yang diunduh (satu fungsi `htmlDokumenSoal`), dan
 * ditampilkan di iframe ber-sandbox tanpa skrip.
 */
export default function DokumenDraf({
  soal,
  judul,
  subjudul,
}: {
  soal: SoalDokumen[];
  judul: string;
  subjudul?: string;
}) {
  const [denganKunci, setDenganKunci] = useState(true);
  const html = useMemo(
    () => htmlDokumenSoal(soal, { judul, subjudul, kunci: denganKunci ? "lampiran" : "tidak" }),
    [soal, judul, subjudul, denganKunci]
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2.5">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={denganKunci}
            onChange={(e) => setDenganKunci(e.target.checked)}
            className="h-4 w-4 accent-navy-700"
          />
          Tampilkan lembar kunci jawaban
        </label>
        <div className="ml-auto flex gap-2">
          <button type="button" className="btn-ghost" onClick={() => cetakHtml(html)}>
            <i className="fas fa-print" aria-hidden />
            Cetak / PDF
          </button>
          <button
            type="button"
            className="btn-navy-outline"
            onClick={() => unduhHtml(html, namaBerkas(judul, "doc"))}
          >
            <i className="fas fa-file-word" aria-hidden />
            Unduh .doc
          </button>
        </div>
      </div>
      <iframe
        title="Draf soal"
        srcDoc={html}
        sandbox=""
        className="h-[60vh] w-full bg-white"
      />
    </div>
  );
}

/** Unduh HTML sebagai .doc — Word membukanya sebagai dokumen biasa. */
export function unduhHtml(html: string, nama: string) {
  const blob = new Blob(["﻿", html], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nama;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Cetak lewat jendela baru (simpan sebagai PDF dari dialog cetak). */
export function cetakHtml(html: string) {
  const w = window.open("", "_blank");
  if (!w) {
    alert("Jendela cetak diblokir browser. Izinkan pop-up untuk situs ini.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
}
