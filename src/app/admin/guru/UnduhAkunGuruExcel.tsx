"use client";

import { useState } from "react";
import { unduhExcelAkunGuru } from "@/lib/excel-akun";
import { daftarSemuaAkunGuru } from "./actions";

/** Unduh semua akun guru (Nama, NIP, Mapel, Username) sebagai Excel rapi. */
export default function UnduhAkunGuruExcel() {
  const [proses, setProses] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  async function unduh() {
    setProses(true);
    setGalat(null);
    const r = await daftarSemuaAkunGuru();
    if (r.error) setGalat(r.error);
    else await unduhExcelAkunGuru(r.baris, { namaFile: "daftar-akun-guru", denganPassword: false });
    setProses(false);
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void unduh()}
        disabled={proses}
        className="rounded-md border border-ink/15 bg-white px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-[--primary] disabled:opacity-50"
      >
        <i className={`fas ${proses ? "fa-circle-notch fa-spin" : "fa-file-excel text-emerald-600"} mr-1.5`} aria-hidden />
        Unduh Excel
      </button>
      {galat && <span className="text-xs text-danger">{galat}</span>}
    </span>
  );
}
