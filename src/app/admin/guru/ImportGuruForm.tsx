"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import TabelRingkas from "@/components/admin/TabelRingkas";
import { bacaExcelGuru } from "@/lib/excel-import";
import { unduhExcelAkunGuru, unduhTemplateGuru } from "@/lib/excel-akun";
import { buatPasswordGuru, cocokkanMapel } from "@/lib/akun-impor";
import { PASSWORD_AWAL_GURU, nipValid, normalkanUsername } from "@/lib/akun";
import { importGuruBatch, type ImportGuruInputRow, type ImportGuruRowResult } from "./actions";

const BATCH_SIZE = 50;

type Mode = "impor" | "generate";
type Status = "idle" | "parsed" | "generated" | "running" | "done";

type BarisGenerate = ImportGuruInputRow & { mapel: string; username: string; password: string; galat: string | null };

/**
 * Dua pintu membuat akun guru dari Excel (pasangan ImportSiswaForm):
 *
 *  1. IMPOR AKUN — kolom No, Nama, NIP, Mapel, Username, Password.
 *     Username kosong = NIP, password kosong = guru123456.
 *  2. GENERATE — kolom No, Nama, NIP, Mapel. Username = NIP, password
 *     acak 4 huruf + 4 angka; unduh Excel, lalu "Import akun sekarang".
 *
 * Mapel di template berupa dropdown (DAFTAR_MAPEL) supaya ejaannya sama.
 */
export default function ImportGuruForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("impor");
  const [status, setStatus] = useState<Status>("idle");
  const [namaFile, setNamaFile] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<ImportGuruInputRow[]>([]);
  const [generate, setGenerate] = useState<BarisGenerate[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<ImportGuruRowResult[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [membaca, setMembaca] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    const { rows, error } = await bacaExcelGuru(file);
    setMembaca(false);
    if (error || rows.length === 0) {
      setParseError(error ?? "Tidak ada baris data yang terbaca dari file ini.");
      return;
    }
    setResults([]);

    if (mode === "impor") {
      setParsedRows(rows);
      setStatus("parsed");
      return;
    }

    const dipakai = new Set<string>();
    setGenerate(
      rows.map((r) => {
        const nip = r.nip.replace(/\s+/g, "");
        const mapel = cocokkanMapel(r.mapel);
        const username = normalkanUsername(nip);
        let galat: string | null = null;
        if (!r.nama || !nip) galat = "Nama/NIP kosong.";
        else if (!nipValid(nip)) galat = `NIP '${nip}' tidak valid (8-25 digit angka).`;
        else if (mapel === null) galat = `Mapel '${r.mapel}' tidak dikenal.`;
        else if (dipakai.has(username)) galat = "NIP dobel di file ini.";
        dipakai.add(username);
        return {
          ...r,
          nip,
          mapel: mapel || "",
          username: galat ? "" : username,
          password: galat ? "" : buatPasswordGuru(),
          galat,
        };
      })
    );
    setStatus("generated");
  }

  async function jalankanImpor(rows: ImportGuruInputRow[]) {
    setStatus("running");
    setProgress({ done: 0, total: rows.length });
    const semua: ImportGuruRowResult[] = [];
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      semua.push(...(await importGuruBatch(rows.slice(i, i + BATCH_SIZE))));
      setProgress({ done: Math.min(i + BATCH_SIZE, rows.length), total: rows.length });
      setResults([...semua]);
    }
    setStatus("done");
    router.refresh();
  }

  const siapGenerate = generate.filter((g) => !g.galat);
  const galatGenerate = generate.filter((g) => g.galat);
  const berhasil = results.flatMap((r) => (r.status === "berhasil" ? [r] : []));
  const dilewati = results.flatMap((r) => (r.status === "dilewati" ? [r] : []));

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
          Import Guru dari Excel
        </h2>
        <div className="mt-3 flex gap-1 rounded-lg bg-paper-dark/60 p-1">
          {tab("impor", "Import akun", "fa-file-import")}
          {tab("generate", "Belum punya akun? Generate", "fa-wand-magic-sparkles")}
        </div>
        <p className="mt-2 text-xs text-ink/50">
          {mode === "impor" ? (
            <>
              Kolom: <b>No, Nama, NIP, Mapel, Username, Password</b>. Username kosong = NIP, password kosong ={" "}
              <code className="rounded bg-ink/5 px-1">{PASSWORD_AWAL_GURU}</code>.
            </>
          ) : (
            <>
              Cukup kolom <b>No, Nama, NIP, Mapel</b>. Username = NIP, password dibuatkan acak. Unduh Excel-nya, lalu
              pilih <b>Import akun sekarang</b>.
            </>
          )}{" "}
          Mapel dipilih dari dropdown di template.
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
            {membaca ? "Membaca file…" : "Pilih file .xlsx"}
          </button>
          <button
            type="button"
            onClick={() => void unduhTemplateGuru(mode === "impor")}
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
            Ditemukan <strong>{parsedRows.length}</strong> baris. NIP/username yang sudah dipakai atau mapel yang
            tidak dikenal akan dilewati.
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
            kepala={["Nama", "Mapel", "Username", "Password"]}
            baris={siapGenerate.slice(0, 8).map((g) => [g.nama, g.mapel || "—", g.username, g.password])}
            sisa={Math.max(0, siapGenerate.length - 8)}
          />
          {galatGenerate.length > 0 && (
            <TabelRingkas
              kepala={["Baris", "Nama", "Masalah"]}
              baris={galatGenerate.map((g) => [String(g.nomorBaris), g.nama || "—", g.galat ?? ""])}
              bahaya
            />
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={siapGenerate.length === 0}
              onClick={() => void unduhExcelAkunGuru(siapGenerate, { namaFile: "akun-guru-generate", denganPassword: true })}
              className="rounded-md border border-ink/15 bg-white px-4 py-2 text-sm font-medium text-ink hover:border-[--primary] disabled:opacity-50"
            >
              <i className="fas fa-file-excel mr-1.5 text-emerald-600" aria-hidden />
              Unduh Excel akun
            </button>
            <button
              type="button"
              disabled={siapGenerate.length === 0}
              onClick={() => {
                if (!confirm(`Buat ${siapGenerate.length} akun guru sekarang dengan username & password di Excel tadi?`)) return;
                void jalankanImpor(siapGenerate);
              }}
              className="rounded-md bg-teal px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-teal-light disabled:opacity-50"
            >
              <i className="fas fa-file-import mr-1.5" aria-hidden />
              Import akun sekarang ({siapGenerate.length})
            </button>
          </div>
          <p className="text-xs text-ink/50">Unduh dulu Excel-nya — itu satu-satunya salinan password.</p>
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
            <button
              type="button"
              onClick={() =>
                void unduhExcelAkunGuru(
                  berhasil.map((r) => ({ nama: r.nama, nip: r.nip, mapel: r.mapel, username: r.username, password: r.password })),
                  { namaFile: "hasil-import-akun-guru", denganPassword: true }
                )
              }
              className="w-full rounded-md bg-ink py-2.5 text-sm font-medium text-paper transition-colors hover:bg-ink-light sm:w-auto sm:px-6"
            >
              <i className="fas fa-file-excel mr-1.5" aria-hidden />
              Unduh Excel hasil (username + password)
            </button>
          )}

          {dilewati.length > 0 && (
            <TabelRingkas
              kepala={["Baris", "Nama", "NIP", "Alasan"]}
              baris={dilewati.map((r) => [String(r.nomorBaris), r.nama || "—", r.nip || "—", r.alasan])}
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
