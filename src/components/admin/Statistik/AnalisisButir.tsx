"use client";

import { Fragment, useState } from "react";
import { LABEL_DAYA_BEDA, type RincianJawaban } from "@/lib/analisis-jawaban";
import PanelJawaban, { GAYA_DAYA_BEDA } from "./PanelJawaban";
import { muatAnalisisButir } from "@/app/admin/statistik/actions";
import { unduhExcelAnalisisButir } from "@/lib/excel";
import type { Jenjang } from "@/lib/jenjang";
import type { AnalisisButirSoal } from "@/types";

/**
 * Analisis butir soal satu mapel — dimuat lazy saat diklik (sama seperti
 * `DistribusiNilai`), supaya halaman yang memuat banyak mapel sekaligus
 * (/admin/statistik) tidak menghitung analisis semua mapel di awal.
 *
 * Dipakai di dua tempat: kartu mapel di /admin/statistik dan di bawah
 * tabel nilai di /admin/nilai. `jenjang` WAJIB dioper dari baris/halaman
 * pemanggil, bukan ditebak dari cookie — alasannya sama dengan
 * `DistribusiNilai` (lihat komentarnya).
 */

const LABEL_TIPE: Record<string, string> = {
  pilgan_biasa: "Pilihan Ganda",
  pilgan_kompleks: "PG Kompleks",
  uraian_singkat: "Uraian Singkat",
  benar_salah: "Benar/Salah",
  multi_benar_salah: "Benar/Salah Majemuk",
  menjodohkan: "Menjodohkan",
};

const GAYA_KATEGORI: Record<string, string> = {
  mudah: "bg-emerald-50 text-emerald-700",
  sedang: "bg-amber-50 text-amber-700",
  sulit: "bg-red-50 text-red-700",
};

function fmt(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export default function AnalisisButir({
  mapelId,
  jenjang,
  mapelNama,
  eventNama,
  tahunAjaran,
}: {
  mapelId: string;
  jenjang: Jenjang;
  mapelNama: string;
  eventNama: string;
  tahunAjaran: string;
}) {
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "error"; pesan: string }
    | { status: "loaded"; data: AnalisisButirSoal[]; rincian: RincianJawaban[] }
  >({ status: "idle" });
  const [mengunduh, setMengunduh] = useState(false);
  const [pesanUnduh, setPesanUnduh] = useState<string | null>(null);
  const [terbuka, setTerbuka] = useState<Set<string>>(new Set());

  function bukaTutup(id: string, paksaBuka = false) {
    setTerbuka((s) => {
      const b = new Set(s);
      if (b.has(id) && !paksaBuka) b.delete(id);
      else b.add(id);
      return b;
    });
  }

  async function muat() {
    setState({ status: "loading" });
    const hasil = await muatAnalisisButir(jenjang, mapelId);
    if (!hasil.ok) {
      setState({ status: "error", pesan: hasil.error });
      return;
    }
    setState({ status: "loaded", data: hasil.data, rincian: hasil.rincian });
  }

  async function unduh(data: AnalisisButirSoal[]) {
    setMengunduh(true);
    setPesanUnduh(null);
    try {
      await unduhExcelAnalisisButir({
        mapelNama,
        eventNama,
        tahunAjaran,
        baris: data,
      });
    } catch (e) {
      setPesanUnduh(
        e instanceof Error
          ? `Gagal menyiapkan file Excel: ${e.message}`
          : "Gagal menyiapkan file Excel."
      );
    } finally {
      setMengunduh(false);
    }
  }

  if (state.status === "idle") {
    return (
      <button
        type="button"
        onClick={muat}
        className="text-xs font-medium text-teal hover:underline"
      >
        Lihat analisis butir soal
      </button>
    );
  }

  if (state.status === "loading") {
    return <p className="text-xs text-ink/40">Memuat analisis butir…</p>;
  }

  if (state.status === "error") {
    return (
      <div className="text-xs">
        <p className="text-danger">{state.pesan}</p>
        <button
          type="button"
          onClick={muat}
          className="mt-1 font-medium text-teal hover:underline"
        >
          Coba lagi
        </button>
      </div>
    );
  }

  const { data, rincian } = state;
  const rincianPer = new Map(rincian.map((r) => [r.soalId, r]));
  const temuan = rincian.filter((r) => r.miskonsepsi || r.kategoriDayaBeda === "negatif");

  if (data.length === 0) {
    return (
      <p className="text-xs text-ink/40">
        Belum ada soal di mapel ini, jadi belum ada yang bisa dianalisis.
      </p>
    );
  }

  const adaPeserta = data.some((d) => d.jumlah_peserta > 0);

  return (
    <div className="mt-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-ink/70">
          Analisis butir soal
          <span className="ml-1.5 font-normal text-ink/40">
            ({data[0]?.jumlah_peserta ?? 0} peserta yang sudah submit)
          </span>
        </p>
        <button
          type="button"
          disabled={mengunduh || !adaPeserta}
          onClick={() => void unduh(data)}
          className="rounded-md bg-ok px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-ok/90 disabled:opacity-50"
        >
          <i
            className={`fas ${mengunduh ? "fa-circle-notch fa-spin" : "fa-file-excel"} mr-1.5`}
            aria-hidden
          />
          {mengunduh ? "Menyiapkan…" : "Unduh Analisis (Excel)"}
        </button>
      </div>

      {!adaPeserta && (
        <p className="mb-2 text-xs text-ink/40">
          Belum ada siswa yang submit — angka di bawah baru terisi setelah ada
          yang mengumpulkan.
        </p>
      )}
      {pesanUnduh && <p className="mb-2 text-xs text-danger">{pesanUnduh}</p>}

      {temuan.length > 0 && (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="mb-1.5 text-xs font-bold text-amber-900">
            <i className="fas fa-magnifying-glass-chart mr-1.5" aria-hidden />
            Temuan yang perlu dibahas ({temuan.length} soal)
          </p>
          <ul className="space-y-1 text-[0.75rem] leading-snug text-amber-900">
            {temuan.slice(0, 8).map((r) => (
              <li key={r.soalId}>
                <button
                  type="button"
                  onClick={() => bukaTutup(r.soalId, true)}
                  className="mr-1.5 rounded bg-amber-200/70 px-1.5 font-bold hover:bg-amber-300"
                >
                  No {r.urutan}
                </button>
                {r.kategoriDayaBeda === "negatif"
                  ? "Daya pembeda negatif: siswa bernilai tinggi justru lebih banyak salah. Cek kunci jawaban. "
                  : ""}
                {r.miskonsepsi}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-ink/10 bg-white">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead>
            <tr className="border-b border-ink/10 uppercase tracking-wide text-ink/40">
              <th className="px-3 py-2 font-medium">No</th>
              <th className="px-3 py-2 font-medium">Tipe</th>
              <th className="px-2 py-2 text-center font-medium">Benar</th>
              <th className="px-2 py-2 text-center font-medium">Sebagian</th>
              <th className="px-2 py-2 text-center font-medium">Salah</th>
              <th className="px-2 py-2 text-center font-medium">Kosong</th>
              <th className="px-2 py-2 text-center font-medium">Rata skor</th>
              <th className="px-2 py-2 text-center font-medium">% Benar</th>
              <th className="px-3 py-2 text-center font-medium">Kategori</th>
              <th className="px-2 py-2 text-center font-medium" title="Selisih proporsi benar kelompok atas (27%) dan bawah (27%)">
                Daya beda
              </th>
              <th className="px-2 py-2 text-center font-medium">Jawaban</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => {
              const r = rincianPer.get(d.soal_id);
              const buka = terbuka.has(d.soal_id);
              return (
              <Fragment key={d.soal_id}>
              <tr className="border-b border-ink/5 last:border-0">
                <td className="px-3 py-2 font-medium text-ink">{d.urutan}</td>
                <td className="px-3 py-2 text-ink/70">
                  {LABEL_TIPE[d.tipe] ?? d.tipe}
                </td>
                <td className="px-2 py-2 text-center">{d.jumlah_benar}</td>
                <td className="px-2 py-2 text-center">{d.jumlah_sebagian}</td>
                <td className="px-2 py-2 text-center">{d.jumlah_salah}</td>
                <td className="px-2 py-2 text-center">{d.jumlah_kosong}</td>
                <td className="px-2 py-2 text-center">
                  {fmt(d.rata_skor)}
                  <span className="text-ink/40"> / {fmt(d.skor_maks)}</span>
                </td>
                <td className="px-2 py-2 text-center font-medium text-ink">
                  {fmt(d.persen_benar)}%
                </td>
                <td className="px-3 py-2 text-center">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[0.7rem] font-semibold capitalize ${
                      GAYA_KATEGORI[d.kategori] ?? "bg-ink/5 text-ink/50"
                    }`}
                  >
                    {d.kategori}
                  </span>
                </td>
                <td className="px-2 py-2 text-center">
                  {r?.dayaBeda == null ? (
                    <span className="text-ink/30">–</span>
                  ) : (
                    <span
                      title={r.kategoriDayaBeda ? LABEL_DAYA_BEDA[r.kategoriDayaBeda] : ""}
                      className={`rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${
                        GAYA_DAYA_BEDA[r.kategoriDayaBeda ?? "jelek"]
                      }`}
                    >
                      {r.dayaBeda.toFixed(2)}
                    </span>
                  )}
                </td>
                <td className="px-2 py-2 text-center">
                  {r && (
                    <button
                      type="button"
                      onClick={() => bukaTutup(d.soal_id)}
                      aria-expanded={buka}
                      className={`rounded-md px-2 py-1 text-[0.7rem] font-semibold transition-colors ${
                        buka ? "bg-navy-800 text-white" : "bg-navy-50 text-navy-700 hover:bg-navy-100"
                      }`}
                    >
                      {r.miskonsepsi && <i className="fas fa-triangle-exclamation mr-1 text-amber-500" aria-hidden />}
                      {buka ? "Tutup" : "Lihat"}
                    </button>
                  )}
                </td>
              </tr>
              {buka && r && (
                <tr className="border-b border-ink/5 bg-slate-50/70">
                  <td colSpan={11} className="px-3 py-3">
                    <PanelJawaban r={r} />
                  </td>
                </tr>
              )}
              </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[0.7rem] leading-relaxed text-ink/40">
        Kategori mengikuti persentase siswa yang menjawab benar penuh: lebih
        dari 70% mudah, 30–70% sedang, kurang dari 30% sulit. Daya beda:
        ≥ 0,40 sangat baik · 0,30–0,39 baik · 0,20–0,29 cukup · &lt; 0,20
        jelek · negatif = cek kunci. Klik &ldquo;Lihat&rdquo; untuk sebaran
        jawaban siswa.
      </p>
    </div>
  );
}
