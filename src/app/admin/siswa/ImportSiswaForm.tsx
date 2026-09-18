"use client";

import { useRef, useState } from "react";
import { csvToSiswaRows } from "@/lib/csv";
import {
  importSiswaBatch,
  type ImportSiswaInputRow,
  type ImportSiswaRowResult,
} from "./actions";

const BATCH_SIZE = 50;

const inputCls =
  "w-full rounded-md border border-ink/15 bg-white px-3.5 py-2.5 text-ink placeholder:text-ink/30 outline-none focus:border-gold";

const CONTOH_CSV = `nama,username,kelas
Ahmad Fauzi,ahmad.fauzi,7.1
Siti Nurhaliza,siti.nurhaliza,7.1`;

type Status = "idle" | "parsed" | "running" | "done";

export default function ImportSiswaForm({
  kelasList,
}: {
  kelasList: { id: string; nama: string }[];
}) {
  const [csvText, setCsvText] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [parsedRows, setParsedRows] = useState<ImportSiswaInputRow[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<ImportSiswaRowResult[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const kelasValid = new Set(kelasList.map((k) => k.nama));

  function handleFile(file: File | null | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCsvText(String(reader.result ?? ""));
      setStatus("idle");
    };
    reader.readAsText(file);
  }

  function handleParse() {
    setParseError(null);
    if (!csvText.trim()) {
      setParseError("Tempel isi CSV atau upload file dulu.");
      return;
    }
    const rows = csvToSiswaRows(csvText);
    if (rows.length === 0) {
      setParseError(
        "Tidak ada baris data terbaca. Pastikan baris pertama adalah header 'nama,username,kelas'."
      );
      return;
    }
    const withNomor: ImportSiswaInputRow[] = rows.map((r, idx) => ({
      nomorBaris: idx + 1,
      ...r,
    }));
    setParsedRows(withNomor);
    setResults([]);
    setStatus("parsed");
  }

  async function handleImport() {
    setStatus("running");
    setProgress({ done: 0, total: parsedRows.length });
    const allResults: ImportSiswaRowResult[] = [];

    for (let i = 0; i < parsedRows.length; i += BATCH_SIZE) {
      const batch = parsedRows.slice(i, i + BATCH_SIZE);
      const batchResults = await importSiswaBatch(batch);
      allResults.push(...batchResults);
      setProgress({ done: Math.min(i + BATCH_SIZE, parsedRows.length), total: parsedRows.length });
      setResults([...allResults]);
    }

    setStatus("done");
  }

  function downloadHasil() {
    const berhasil = results.filter((r) => r.status === "berhasil");
    const header = "nama,username,password,kelas\n";
    const body = berhasil
      .map((r) => {
        if (r.status !== "berhasil") return "";
        return `"${r.nama}","${r.username}","${r.password}","${r.kelasNama}"`;
      })
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hasil-import-siswa-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function reset() {
    setCsvText("");
    setParsedRows([]);
    setResults([]);
    setStatus("idle");
    setParseError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const jumlahBerhasil = results.filter((r) => r.status === "berhasil").length;
  const jumlahDilewati = results.filter((r) => r.status === "dilewati").length;

  return (
    <div className="max-w-3xl space-y-6">
      {status !== "done" && (
        <>
          <div className="rounded-lg border border-ink/10 bg-white p-4 sm:p-5">
            <p className="mb-3 text-sm text-ink/70">
              Kolom minimal wajib: <code className="text-xs">nama</code>,{" "}
              <code className="text-xs">username</code>,{" "}
              <code className="text-xs">kelas</code> (harus persis sama
              dengan nama kelas yang sudah ada, mis. &quot;7.1&quot; —
              baris dengan kelas yang tidak cocok akan dilewati, bukan
              membuat kelas baru).
            </p>
            <div className="mb-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-md border border-ink/15 bg-white px-3.5 py-2 text-sm text-ink hover:border-gold"
              >
                Upload file CSV
              </button>
              <button
                type="button"
                onClick={() => setCsvText(CONTOH_CSV)}
                className="rounded-md border border-ink/15 bg-white px-3.5 py-2 text-sm text-ink/60 hover:border-gold"
              >
                Isi contoh
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </div>
            <textarea
              value={csvText}
              onChange={(e) => {
                setCsvText(e.target.value);
                setStatus("idle");
              }}
              rows={8}
              placeholder={CONTOH_CSV}
              className={`${inputCls} font-mono text-xs`}
            />
            {parseError && (
              <p className="mt-2 rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
                {parseError}
              </p>
            )}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={handleParse}
                disabled={status === "running"}
                className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-ink-light disabled:opacity-50"
              >
                Pratinjau
              </button>
              {status === "parsed" && (
                <button
                  type="button"
                  onClick={handleImport}
                  className="rounded-md bg-teal px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-teal-light"
                >
                  Mulai Import ({parsedRows.length} baris)
                </button>
              )}
            </div>
          </div>

          {status === "parsed" && (
            <div className="rounded-lg border border-gold/30 bg-gold/5 p-4 text-sm text-ink/70">
              Ditemukan <strong>{parsedRows.length}</strong> baris data.
              Kelas yang dikenal sistem saat ini:{" "}
              {kelasList.length === 0 ? (
                <span className="text-danger">belum ada kelas sama sekali</span>
              ) : (
                Array.from(kelasValid).sort().join(", ")
              )}
              . Baris dengan kelas di luar daftar ini akan dilewati otomatis
              saat import.
            </div>
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
                  className="h-full bg-gold transition-all"
                  style={{
                    width: `${
                      progress.total > 0
                        ? (progress.done / progress.total) * 100
                        : 0
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
          <div className="rounded-lg border border-ink/10 bg-white p-5">
            <h2 className="mb-3 font-serif text-lg text-ink">
              Ringkasan Import
            </h2>
            <div className="mb-4 grid grid-cols-2 gap-3">
              <div className="rounded-md bg-ok/10 p-3">
                <p className="text-2xl font-medium text-ok">{jumlahBerhasil}</p>
                <p className="text-xs text-ink/60">akun berhasil dibuat</p>
              </div>
              <div className="rounded-md bg-danger/10 p-3">
                <p className="text-2xl font-medium text-danger">{jumlahDilewati}</p>
                <p className="text-xs text-ink/60">baris dilewati</p>
              </div>
            </div>

            {jumlahBerhasil > 0 && (
              <button
                type="button"
                onClick={downloadHasil}
                className="mb-4 w-full rounded-md bg-ink py-2.5 text-sm font-medium text-paper transition-colors hover:bg-ink-light sm:w-auto sm:px-6"
              >
                Download CSV hasil (username + password)
              </button>
            )}

            {jumlahBerhasil > 0 && (
              <p className="mb-4 rounded-md border border-gold/30 bg-gold/5 px-3 py-2 text-xs text-ink/70">
                Password acak per siswa hanya ditampilkan sekali di sini —
                pastikan sudah diunduh sebelum meninggalkan halaman ini.
                Kalau hilang, satu-satunya jalan adalah reset password lewat
                dashboard Supabase Auth, bukan lihat ulang di sini.
              </p>
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
                        <th className="px-3 py-2">Username</th>
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
                            <td className="px-3 py-2">{r.username || "—"}</td>
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
          </div>

          <button
            type="button"
            onClick={reset}
            className="rounded-md border border-ink/15 bg-white px-4 py-2 text-sm text-ink hover:border-gold"
          >
            Import batch lain
          </button>
        </div>
      )}
    </div>
  );
}
