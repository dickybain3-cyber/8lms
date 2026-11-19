"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { unduhExcelAkunSiswa } from "@/lib/excel-akun";
import { KONFIRMASI_HAPUS_SEMUA_SISWA } from "@/lib/akun-impor";
import { daftarSemuaAkunSiswa, hapusSemuaSiswaBatch } from "./actions";

/** Unduh SEMUA akun siswa (bukan cuma 200 baris di layar), satu sheet per kelas. */
export function UnduhAkunSiswaExcel() {
  const [proses, setProses] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  async function unduh() {
    setProses(true);
    setGalat(null);
    const r = await daftarSemuaAkunSiswa();
    if (r.error) setGalat(r.error);
    else await unduhExcelAkunSiswa(r.baris, { namaFile: "daftar-akun-siswa", denganPassword: false });
    setProses(false);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void unduh()}
        disabled={proses}
        className="rounded-md border border-ink/15 bg-white px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-[--primary] disabled:opacity-50"
      >
        <i className={`fas ${proses ? "fa-circle-notch fa-spin" : "fa-file-excel text-emerald-600"} mr-1.5`} aria-hidden />
        Unduh Excel (per kelas)
      </button>
      {galat && <span className="text-xs text-danger">{galat}</span>}
    </div>
  );
}

/**
 * Hapus SELURUH akun siswa jenjang ini — awal tahun ajaran. Khusus admin
 * (dijaga ulang di server). Konfirmasi dengan mengetik kalimat tetap,
 * lalu dihapus per 40 akun sampai habis.
 */
export function HapusSemuaSiswa({ totalSiswa }: { totalSiswa: number }) {
  const router = useRouter();
  const [buka, setBuka] = useState(false);
  const [ketik, setKetik] = useState("");
  const [proses, setProses] = useState<{ dihapus: number } | null>(null);
  const [pesan, setPesan] = useState<{ ok: boolean; teks: string } | null>(null);

  async function hapus() {
    setPesan(null);
    let total = 0;
    setProses({ dihapus: 0 });
    for (let putaran = 0; putaran < 200; putaran++) {
      const r = await hapusSemuaSiswaBatch(ketik);
      if (r.error) {
        setPesan({ ok: false, teks: `${r.error}${total ? ` (${total} akun sudah terhapus)` : ""}` });
        break;
      }
      total += r.dihapus;
      setProses({ dihapus: total });
      if (r.sisa === 0) {
        setPesan({ ok: true, teks: `${total} akun siswa terhapus. Sekarang impor siswa tahun ajaran baru.` });
        setBuka(false);
        setKetik("");
        break;
      }
      if (r.dihapus === 0) {
        setPesan({ ok: false, teks: `Berhenti: ${r.sisa} akun tidak bisa dihapus.` });
        break;
      }
    }
    setProses(null);
    router.refresh();
  }

  return (
    <div className="mt-8 rounded-xl border border-danger/25 bg-danger/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-base font-bold text-danger">
            <i className="fas fa-triangle-exclamation mr-1.5" aria-hidden />
            Ganti tahun ajaran: hapus seluruh data siswa
          </h2>
          <p className="mt-1 max-w-2xl text-xs text-ink/60">
            Menghapus <b>{totalSiswa} akun siswa</b> beserta jawaban ujian & nilainya di jenjang ini. Daftar kelas
            tetap ada. Unduh dulu rekap nilai yang masih dibutuhkan. Tidak bisa dibatalkan.
          </p>
        </div>
        {!buka && (
          <button
            type="button"
            onClick={() => setBuka(true)}
            disabled={totalSiswa === 0}
            className="rounded-md border border-danger/40 bg-white px-3 py-1.5 text-xs font-semibold text-danger hover:bg-danger/10 disabled:opacity-50"
          >
            Hapus seluruh siswa…
          </button>
        )}
      </div>

      {buka && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-xs text-ink/70">
            Ketik <b className="font-mono">{KONFIRMASI_HAPUS_SEMUA_SISWA}</b>
            <input
              value={ketik}
              onChange={(e) => setKetik(e.target.value)}
              disabled={!!proses}
              className="mt-1 block w-64 rounded-md border border-danger/30 bg-white px-2 py-1.5 font-mono text-sm"
              autoComplete="off"
            />
          </label>
          <button
            type="button"
            onClick={() => void hapus()}
            disabled={ketik !== KONFIRMASI_HAPUS_SEMUA_SISWA || !!proses}
            className="rounded-md bg-danger px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
          >
            {proses ? (
              <>
                <i className="fas fa-circle-notch fa-spin mr-1.5" aria-hidden />
                Menghapus… {proses.dihapus}/{totalSiswa}
              </>
            ) : (
              "Hapus permanen"
            )}
          </button>
          {!proses && (
            <button type="button" onClick={() => setBuka(false)} className="px-2 py-2 text-xs text-ink/50">
              Batal
            </button>
          )}
        </div>
      )}

      {pesan && (
        <p className={`mt-3 text-xs font-medium ${pesan.ok ? "text-emerald-700" : "text-danger"}`}>{pesan.teks}</p>
      )}
    </div>
  );
}
