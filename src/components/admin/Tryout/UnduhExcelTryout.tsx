"use client";

import { useState } from "react";
import { unduhExcel, type SheetExcel } from "@/lib/excel";
import { TOMBOL_BIASA } from "@/components/ui/Panel";

/** Tombol unduh rekap tryout (.xlsx). Data disusun di server. */
export default function UnduhExcelTryout({
  namaFile,
  sheets,
}: {
  namaFile: string;
  sheets: Omit<SheetExcel, "sorotBaris">[];
}) {
  const [sibuk, setSibuk] = useState(false);
  return (
    <button
      type="button"
      disabled={sibuk}
      onClick={async () => {
        setSibuk(true);
        try {
          await unduhExcel(namaFile, sheets);
        } finally {
          setSibuk(false);
        }
      }}
      className={TOMBOL_BIASA}
    >
      <i className="fas fa-file-excel" aria-hidden />
      {sibuk ? "Menyiapkan…" : "Unduh Excel"}
    </button>
  );
}
