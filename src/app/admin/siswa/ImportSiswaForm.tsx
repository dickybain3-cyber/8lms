"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import TabelRingkas from "@/components/admin/TabelRingkas";
import { bacaExcelSiswa } from "@/lib/excel-import";
import { unduhExcelAkunSiswa, unduhTemplateSiswa } from "@/lib/excel-akun";
import {
  importSiswaBatch,
  siapkanAkunSiswa,
  type BarisGenerateSiswa,
  type ImportSiswaInputRow,
  type ImportSiswaRowResult,
} from "./actions";

const BATCH_SIZE = 50;

type Mode = "impor" | "generate";
type Status = "idle" | "parsed" | "generated" | "running" | "done";

/**
 * Dua pintu membuat akun siswa dari Excel:
 *
 *  1. IMPOR AKUN — Excel sudah berisi Username & Password (mis. dari
 *     kartu login tahun lalu). Kolom kosong dibuatkan otomatis.
 *  2. GENERATE — Excel cuma No, Nama, Kelas. Aplikasi membuatkan
 *     username & password, guru mengunduh Excel-nya (per kelas), lalu
 *     memilih "Import akun sekarang" -> akun langsung dibuat dengan
 *     username & password yang SAMA dengan yang ada di Excel itu.
 *
 * Password hanya ada di Excel hasil — di database tersimpan sebagai hash.
 */
export default function ImportSiswaForm({
  kelasList,
}: {
  kelasList: { id: string; nama: string }[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("impor");
  const [status, setStatus] = useState<Status>("idle");
  const [namaFile, setNamaFile] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<ImportSiswaInputRow[]>([]);
  const [generate, setGenerate] = useState<BarisGenerateSiswa[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<ImportSiswaRowResult[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [membaca, setMembaca] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contohKelas = kelasList[0]?.nama ?? "7.1";

  function reset(modeBaru: Mode = mode) {
    setMode(modeBaru);
    setNamaFile(null);
    setParsedRows([]);
    setGenerate([]);
    setResults([]);
    setStatus("idle");
    setParseError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFile(file: File | null | undefined) {
    if (!file) return;
    setNamaFile(file.name);
    setParseError(null);
    setMembaca(true);
    setStatus("idle");

    const { rows, error } = await bacaExcelSiswa(file);
    if (error || rows.length === 0) {
      setMembaca(false);
      setParseError(error ?? "Tidak ada baris data yang terbaca dari file ini.");
      return;
    }
    setResults([]);

    if (mode === "impor") {
      setParsedRows(
        rows.map((r) => ({
          nomorBaris: r.nomorBaris,
          nama: r.nama,
          username: r.username,
          kelas: r.kelas,
          password: r.password,
        }))
      );
      setMembaca(false);
      setStatus("parsed");
      return;
    }

    const hasil = await siapkanAkunSiswa(
      rows.map((r) => ({ nomorBaris: r.nomorBaris, nama: r.nama, kelas: r.kelas }))
    );
    setMembaca(false);
    if (hasil.error) {
      setParseError(hasil.error);
      return;
    }
    setGenerate(hasil.baris);
    setStatus("generated");
  }

  async function jalankanImpor(rows: ImportSiswaInputRow[]) {
    setStatus("running");
    setProgress({ done: 0, total: rows.length });
    const semua: ImportSiswaRowResult[] = [];
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      semua.push(...(await importSiswaBatch(rows.slice(i, i + BATCH_SIZE))));
      setProgress({ done: Math.min(i + BATCH_SIZE, rows.length), total: rows.length });
      setResults([...semua]);
    }
    setStatus("done");
    router.refresh();
  }

  function imporHasilGenerate() {
    const siap = generate.filter((g) => !g.galat);
    if (!confirm(`Buat ${siap.length} akun siswa sekarang dengan username & password di Excel tadi?`)) return;
    void jalankanImpor(
      siap.map((g) => ({
        nomorBaris: g.nomorBaris,
        nama: g.nama,
        kelas: g.kelas,
        username: g.username,
        password: g.password,
      }))
    );
  }

  const siapGenerate = generate.filter((g) => !g.galat);
  const galatGenerate = generate.filter((g) => g.galat);
  const berhasil = results.filter((r) => r.status === "berhasil");
  const dilewati = results.filter((r) => r.status === "dilewati");

  const tab = (m: Mode, label: string, ikon: string) => (
    <button
      type="button"
      onClick={() => status !== "running" && reset(m)}
      className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
        mode === m ? "bg-white text-ink shadow-sm" : "text-ink/50 hover:text-ink"
      }`}
    >
      <i className={`fas ${ikon} mr-1.5`} aria-hidden />
      {label}
    </button>
  );

  return (
    <div className="card-mewah space-y-4 p-5">
      <div>
        <h2 className="mb-1 flex items-center gap-2 font-serif text-base font-bold text-ink">
          <i className="fas fa-file-excel text-emerald-600" aria-hidden />
          Import Siswa dari Excel
        </h2>
        <div className="mt-3 flex gap-1 rounded-lg bg-paper-dark/60 p-1">
          {tab("impor", "Import akun", "fa-file-import")}
          {tab("generate", "Belum punya akun? Generate", "fa-wand-magic-sparkles")}
        </div>
        <p className="mt-2 text-xs text-ink/50">
          {mode === "impor" ? (
            <>
              Kolom: <b>No, Nama, Kelas, Username, Password</b>. Username/Password kosong dibuatkan otomatis
              (password 3 huruf + 3 angka).
            </>
          ) : (
            <>
              Cukup kolom <b>No, Nama, Kelas</b>. Aplikasi membuatkan username & password, kamu unduh Excel-nya
              (satu sheet per kelas), lalu pilih <b>Import akun sekarang</b>.
            </>
          )}
        </p>
      </div>

      {(status === "idle" || status === "parsed" || status === "generated") && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={membaca}
            className="rounded-md border border-ink/15 bg-white px-3.5 py-2 text-sm text-ink hover:border-[--primary] disabled:opacity-50"
          >
            <i className={`fas ${membaca ? "fa-circle-notch fa-spin" : "fa-upload"} mr-1.5`} aria-hidden />
            {membaca ? (mode === "generate" ? "Membuatkan akun…" : "Membaca file…") : "Pilih file .xlsx"}
          </button>
          <button
            type="button"
            onClick={() => void unduhTemplateSiswa(mode === "impor", contohKelas)}
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
      )}

      {namaFile && !parseError && status !== "done" && (
        <p className="text-xs text-ink/50">
          <i className="fas fa-file-excel mr-1 text-emerald-600" aria-hidden />
          {namaFile}
        </p>
      )}

      {parseError && (
        <p className="rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">{parseError}</p>
      )}

      {status === "parsed" && (
        <>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-ink/70">
            Ditemukan <strong>{parsedRows.length}</strong> baris
            {parsedRows.some((r) => r.password) && (
              <> ({parsedRows.filter((r) => r.password).length} sudah berisi password)</>
            )}
            . Kelas harus sama dengan yang ada di sistem — yang tidak cocok dilewati.
          </div>
          <button
            type="button"
            onClick={() => void jalankanImpor(parsedRows)}
            className="rounded-md bg-teal px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-teal-light"
          >
            Mulai Import ({parsedRows.length} baris)
          </button>
        </>
      )}

      {status === "generated" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md bg-emerald-50 p-3">
              <p className="text-2xl font-bold text-emerald-600">{siapGenerate.length}</p>
              <p className="text-xs text-ink/60">akun siap dibuat</p>
            </div>
            <div className="rounded-md bg-danger/10 p-3">
              <p className="text-2xl font-bold text-danger">{galatGenerate.length}</p>
              <p className="text-xs text-ink/60">baris bermasalah</p>
            </div>
          </div>

          <TabelRingkas
            baris={siapGenerate.slice(0, 8).map((g) => [g.kelas, g.nama, g.username, g.password])}
            kepala={["Kelas", "Nama", "Username", "Password"]}
            sisa={Math.max(0, siapGenerate.length - 8)}
          />

          {galatGenerate.length > 0 && (
            <TabelRingkas
              baris={galatGenerate.map((g) => [String(g.nomorBaris), g.nama || "—", g.galat ?? ""])}
              kepala={["Baris", "Nama", "Masalah"]}
              bahaya
            />
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={siapGenerate.length === 0}
              onClick={() =>
                void unduhExcelAkunSiswa(siapGenerate, { namaFile: "akun-siswa-generate", denganPassword: true })
              }
              className="rounded-md border border-ink/15 bg-white px-4 py-2 text-sm font-medium text-ink hover:border-[--primary] disabled:opacity-50"
            >
              <i className="fas fa-file-excel mr-1.5 text-emerald-600" aria-hidden />
              Unduh Excel akun (per kelas)
            </button>
            <button
              type="button"
              disabled={siapGenerate.length === 0}
              onClick={imporHasilGenerate}
              className="rounded-md bg-teal px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-teal-light disabled:opacity-50"
            >
              <i className="fas fa-file-import mr-1.5" aria-hidden />
              Import akun sekarang ({siapGenerate.length})
            </button>
          </div>
          <p className="text-xs text-ink/50">
            Unduh dulu Excel-nya — itu satu-satunya salinan password. Belum mau dibuat? Cukup unduh Excel-nya; nanti
            bisa diimpor lewat tab <b>Import akun</b>.
          </p>
        </div>
      )}

      {status === "running" && (
        <div className="rounded-lg border border-ink/10 bg-white p-4">
          <div className="mb-2 flex justify-between text-sm text-ink/70">
            <span>Membuat akun…</span>
            <span>
              {progress.done} / {progress.total}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-paper-dark">
            <div
              className="h-full bg-[--primary] transition-all"
              style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-ink/40">Jangan tutup atau refresh halaman ini sampai proses selesai.</p>
        </div>
      )}

      {status === "done" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md bg-emerald-50 p-3">
              <p className="text-2xl font-bold text-emerald-600">{berhasil.length}</p>
              <p className="text-xs text-ink/60">akun berhasil dibuat</p>
            </div>
            <div className="rounded-md bg-danger/10 p-3">
              <p className="text-2xl font-bold text-danger">{dilewati.length}</p>
              <p className="text-xs text-ink/60">baris dilewati</p>
            </div>
          </div>

          {berhasil.length > 0 && (
            <>
              <button
                type="button"
                onClick={() =>
                  void unduhExcelAkunSiswa(
                    results.flatMap((r) =>
                      r.status === "berhasil"
                        ? [{ nama: r.nama, kelas: r.kelasNama, username: r.username, password: r.password }]
                        : []
                    ),
                    { namaFile: "hasil-import-akun-siswa", denganPassword: true }
                  )
                }
                className="w-full rounded-md bg-ink py-2.5 text-sm font-medium text-paper transition-colors hover:bg-ink-light sm:w-auto sm:px-6"
              >
                <i className="fas fa-file-excel mr-1.5" aria-hidden />
                Unduh Excel hasil (username + password, per kelas)
              </button>
              <p className="rounded-md border border-ink/10 bg-paper px-3 py-2 text-xs text-ink/60">
                Password hanya bisa diunduh di sini — pastikan sudah diunduh sebelum meninggalkan halaman.
              </p>
            </>
          )}

          {dilewati.length > 0 && (
            <TabelRingkas
              baris={dilewati.map((r) => [
                String(r.nomorBaris),
                r.nama || "—",
                r.username || "—",
                r.status === "dilewati" ? r.alasan : "",
              ])}
              kepala={["Baris", "Nama", "Username", "Alasan"]}
              bahaya
            />
          )}

          <button
            type="button"
            onClick={() => reset()}
            className="rounded-md border border-ink/15 bg-white px-4 py-2 text-sm text-ink hover:border-[--primary]"
          >
            Import file lain
          </button>
        </div>
      )}
    </div>
  );
}
