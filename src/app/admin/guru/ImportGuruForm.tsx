"use client";

import { useRef, useState } from "react";
import { bacaExcelGuru } from "@/lib/excel-import";
import { unduhExcel } from "@/lib/excel";
import {
  importGuruBatch,
  type ImportGuruInputRow,
  type ImportGuruRowResult,
} from "./actions";

const BATCH_SIZE = 50;

type Status = "idle" | "parsed" | "running" | "done";

/**
 * ── DIGANTI DARI CSV KE EXCEL, DAN DARI (nama, email) KE (nama, NIP) ──
 *
 * Dua perubahan dalam satu form ini, keduanya permintaan eksplisit:
 * "jangan dari csv" dan username/password tidak lagi diminta dari
 * file — cuma nama+NIP, sisanya otomatis (lihat `actions.ts`).
 *
 * Alur file-nya: pilih .xlsx -> `bacaExcelGuru` membacanya jadi array
 * di memori browser -> pratinjau -> `importGuruBatch` per 50 baris.
 * Textarea CSV yang dulu ada sudah tidak relevan sama sekali karena
 * sumber datanya sekarang murni file, bukan teks yang ditempel.
 */
export default function ImportGuruForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [namaFile, setNamaFile] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<ImportGuruInputRow[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<ImportGuruRowResult[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [membaca, setMembaca] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | null | undefined) {
    if (!file) return;
    setNamaFile(file.name);
    setParseError(null);
    setMembaca(true);
    setStatus("idle");

    const { rows, error } = await bacaExcelGuru(file);
    setMembaca(false);

    if (error) {
      setParseError(error);
      return;
    }
    if (rows.length === 0) {
      setParseError("Tidak ada baris data yang terbaca dari file ini.");
      return;
    }

    setParsedRows(rows);
    setResults([]);
    setStatus("parsed");
  }

  async function handleImport() {
    setStatus("running");
    setProgress({ done: 0, total: parsedRows.length });
    const allResults: ImportGuruRowResult[] = [];

    for (let i = 0; i < parsedRows.length; i += BATCH_SIZE) {
      const batch = parsedRows.slice(i, i + BATCH_SIZE);
      const batchResults = await importGuruBatch(batch);
      allResults.push(...batchResults);
      setProgress({
        done: Math.min(i + BATCH_SIZE, parsedRows.length),
        total: parsedRows.length,
      });
      setResults([...allResults]);
    }

    setStatus("done");
  }

  async function unduhTemplate() {
    await unduhExcel("template_import_guru.xlsx", [
      {
        nama: "Guru",
        judul: "Template Import Data Guru",
        subjudul: "Isi mulai baris di bawah header. Jangan ubah nama kolom.",
        kolom: [
          { header: "No", key: "no", lebar: 6, tengah: true },
          { header: "Nama", key: "nama", lebar: 32 },
          { header: "NIP", key: "nip", lebar: 24 },
        ],
        baris: [
          { no: 1, nama: "Budi Santoso, S.Pd.", nip: "196504121990031005" },
          { no: 2, nama: "Rina Wulandari, S.Pd.", nip: "197803152005012004" },
        ],
      },
    ]);
  }

  function downloadHasil() {
    const berhasil = results.filter((r) => r.status === "berhasil");
    const header = "nama,username,password\n";
    const body = berhasil
      .map((r) =>
        r.status === "berhasil" ? `"${r.nama}","${r.username}","${r.password}"` : ""
      )
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hasil-import-guru-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function reset() {
    setNamaFile(null);
    setParsedRows([]);
    setResults([]);
    setStatus("idle");
    setParseError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const jumlahBerhasil = results.filter((r) => r.status === "berhasil").length;
  const jumlahDilewati = results.filter((r) => r.status === "dilewati").length;

  return (
    <div className="card-mewah space-y-5 p-5">
      <div>
        <h2 className="mb-1 flex items-center gap-2 font-serif text-base font-bold text-ink">
          <i className="fas fa-file-excel text-emerald-600" aria-hidden />
          Import Guru dari Excel
        </h2>
        <p className="text-xs text-ink/50">
          Kolom: Nama, NIP. Username = NIP, password awal ={" "}
          <code className="rounded bg-ink/5 px-1">guru123456</code> —
          otomatis, tidak perlu diisi di file.
        </p>
      </div>

      {status !== "done" && (
        <>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={membaca}
              className="rounded-md border border-ink/15 bg-white px-3.5 py-2 text-sm text-ink hover:border-[--primary] disabled:opacity-50"
            >
              <i className="fas fa-upload mr-1.5" aria-hidden />
              {membaca ? "Membaca file…" : "Pilih file .xlsx"}
            </button>
            <button
              type="button"
              onClick={() => void unduhTemplate()}
              className="rounded-md border border-dashed border-ink/20 bg-white px-3.5 py-2 text-sm text-ink/60 hover:border-[--primary] hover:text-ink"
            >
              <i className="fas fa-download mr-1.5" aria-hidden />
              Unduh template
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => void handleFile(e.target.files?.[0])}
            />
          </div>

          {namaFile && !parseError && (
            <p className="text-xs text-ink/50">
              <i className="fas fa-file-excel mr-1 text-emerald-600" aria-hidden />
              {namaFile}
            </p>
          )}

          {parseError && (
            <p className="rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
              {parseError}
            </p>
          )}

          {status === "parsed" && (
            <>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-ink/70">
                Ditemukan <strong>{parsedRows.length}</strong> baris data.
                Baris dengan NIP yang tidak valid atau sudah terdaftar akan
                dilewati otomatis saat import (dicatat di ringkasan).
              </div>
              <button
                type="button"
                onClick={() => void handleImport()}
                className="rounded-md bg-teal px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-teal-light"
              >
                Mulai Import ({parsedRows.length} baris)
              </button>
            </>
          )}

          {status === "running" && (
            <div className="rounded-lg border border-ink/10 bg-white p-4">
              <div className="mb-2 flex justify-between text-sm text-ink/70">
                <span>Memproses…</span>
                <span>
                  {progress.done} / {progress.total}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-paper-dark">
                <div
                  className="h-full bg-[--primary] transition-all"
                  style={{
                    width: `${
                      progress.total > 0 ? (progress.done / progress.total) * 100 : 0
                    }%`,
                  }}
                />
              </div>
              <p className="mt-2 text-xs text-ink/40">
                Jangan tutup atau refresh halaman ini sampai proses selesai.
              </p>
            </div>
          )}
        </>
      )}

      {status === "done" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md bg-emerald-50 p-3">
              <p className="text-2xl font-bold text-emerald-600">{jumlahBerhasil}</p>
              <p className="text-xs text-ink/60">akun berhasil dibuat</p>
            </div>
            <div className="rounded-md bg-danger/10 p-3">
              <p className="text-2xl font-bold text-danger">{jumlahDilewati}</p>
              <p className="text-xs text-ink/60">baris dilewati</p>
            </div>
          </div>

          {jumlahBerhasil > 0 && (
            <>
              <button
                type="button"
                onClick={downloadHasil}
                className="w-full rounded-md bg-ink py-2.5 text-sm font-medium text-paper transition-colors hover:bg-ink-light sm:w-auto sm:px-6"
              >
                Download CSV hasil (username + password)
              </button>
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-ink/70">
                Password ini ditampilkan sekali di sini — pastikan sudah
                diunduh sebelum meninggalkan halaman.
              </p>
            </>
          )}

          {jumlahDilewati > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-ink/70">
                Baris yang dilewati
              </h3>
              <div className="max-h-64 overflow-y-auto rounded-md border border-ink/10">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-paper-dark/60">
                    <tr>
                      <th className="px-3 py-2">Baris</th>
                      <th className="px-3 py-2">Nama</th>
                      <th className="px-3 py-2">NIP</th>
                      <th className="px-3 py-2">Alasan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results
                      .filter((r) => r.status === "dilewati")
                      .map((r) => (
                        <tr key={r.nomorBaris} className="border-t border-ink/5">
                          <td className="px-3 py-2">{r.nomorBaris}</td>
                          <td className="px-3 py-2">{r.nama || "—"}</td>
                          <td className="px-3 py-2">{r.nip || "—"}</td>
                          <td className="px-3 py-2 text-danger">
                            {r.status === "dilewati" ? r.alasan : ""}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={reset}
            className="rounded-md border border-ink/15 bg-white px-4 py-2 text-sm text-ink hover:border-[--primary]"
          >
            Import batch lain
          </button>
        </div>
      )}
    </div>
  );
}
