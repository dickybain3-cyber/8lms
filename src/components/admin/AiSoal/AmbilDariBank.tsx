"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { TipeSoal } from "@/types";
import type { Jenjang } from "@/lib/jenjang";
import { TIPE_LABEL, TIPE_SOAL_LIST, ringkasanKonten } from "@/lib/soal";
import { normalisasiNamaMapel, type BarisBankSoal } from "@/lib/bank-soal";
import { cariSoalDiBank, pakaiSoalDariBank } from "@/app/admin/bank-soal/actions";

/**
 * Jendela "Ambil dari Bank Soal" di halaman mapel / Tambah Soal.
 *
 * Memakai aksi yang SAMA dengan halaman Bank Soal (`cariSoalDiBank`,
 * `pakaiSoalDariBank`) — jadi aturan akses, penyalinan (salinan, bukan
 * referensi), dan urutan nomor soal identik. Bedanya cuma tujuan mapel
 * sudah pasti: mapel yang sedang dibuka.
 *
 * Bawaannya menyaring ke mapel bernama sama ("Matematika" menemukan soal
 * Matematika dari kegiatan mana pun); centang bisa dilepas untuk mencari
 * di semua mapel.
 */
export default function AmbilDariBank({
  mapelId,
  mapelNama,
  jenjang,
  renderPemicu,
}: {
  mapelId: string;
  mapelNama: string;
  /** Hanya mode admin lintas jenjang. */
  jenjang?: Jenjang;
  renderPemicu?: (buka: () => void) => React.ReactNode;
}) {
  const router = useRouter();
  const [buka, setBuka] = useState(false);
  const [cari, setCari] = useState("");
  const [tipe, setTipe] = useState<TipeSoal | "">("");
  const [mapelIni, setMapelIni] = useState(true);
  const [hasil, setHasil] = useState<BarisBankSoal[]>([]);
  const [dipilih, setDipilih] = useState<Set<string>>(new Set());
  const [memuat, setMemuat] = useState(false);
  const [menyimpan, setMenyimpan] = useState(false);
  const [pesan, setPesan] = useState<{ ok: boolean; teks: string } | null>(null);

  async function muat() {
    setMemuat(true);
    const r = await cariSoalDiBank(jenjang ?? null, {
      mapelNorm: mapelIni ? normalisasiNamaMapel(mapelNama) : null,
      cari: cari || null,
      tipe: tipe || null,
    });
    setHasil(r.soal);
    if (r.error) setPesan({ ok: false, teks: r.error });
    setMemuat(false);
  }

  useEffect(() => {
    if (!buka) return;
    const t = setTimeout(muat, cari ? 350 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buka, cari, tipe, mapelIni]);

  useEffect(() => {
    if (!buka) return;
    const lama = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = lama;
    };
  }, [buka]);

  function tukar(id: string) {
    setDipilih((s) => {
      const b = new Set(s);
      if (b.has(id)) b.delete(id);
      else b.add(id);
      return b;
    });
  }

  async function tambahkan() {
    setMenyimpan(true);
    setPesan(null);
    const r = await pakaiSoalDariBank(jenjang ?? null, Array.from(dipilih), mapelId);
    setMenyimpan(false);
    if (r.error) {
      setPesan({ ok: false, teks: r.error });
      return;
    }
    setPesan({ ok: true, teks: `${r.jumlah} soal ditambahkan ke ${mapelNama}.` });
    setDipilih(new Set());
    router.refresh();
  }

  const totalSkorDipilih = hasil
    .filter((h) => dipilih.has(h.id))
    .reduce((n, h) => n + Number(h.skor || 0), 0);

  return (
    <>
      {renderPemicu ? (
        renderPemicu(() => setBuka(true))
      ) : (
        <button type="button" onClick={() => setBuka(true)} className="btn-navy-outline">
          <i className="fas fa-box-archive" aria-hidden />
          Bank Soal
        </button>
      )}

      {buka && (
        <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-navy-950/60 backdrop-blur-sm sm:items-center sm:p-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Ambil soal dari Bank Soal"
            className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden bg-paper shadow-2xl sm:max-h-[90vh] sm:rounded-3xl"
          >
            <div className="flex items-center gap-3 bg-navy-800 px-5 py-3.5 text-white">
              <i className="fas fa-box-archive" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-serif font-bold leading-tight">Ambil dari Bank Soal</p>
                <p className="truncate text-xs text-white/70">Tujuan: {mapelNama}</p>
              </div>
              <button
                type="button"
                onClick={() => setBuka(false)}
                aria-label="Tutup"
                className="rounded-lg p-2 text-white/80 hover:bg-white/10"
              >
                <i className="fas fa-xmark" aria-hidden />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-3">
              <div className="relative min-w-[12rem] flex-1">
                <i className="fas fa-magnifying-glass pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400" aria-hidden />
                <input
                  value={cari}
                  onChange={(e) => setCari(e.target.value)}
                  placeholder="Cari isi soal…"
                  className="w-full rounded-lg border border-slate-200 py-2 pl-8 pr-3 text-sm outline-none focus:border-navy-600"
                />
              </div>
              <select
                value={tipe}
                onChange={(e) => setTipe(e.target.value as TipeSoal | "")}
                className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-navy-600"
              >
                <option value="">Semua bentuk</option>
                {TIPE_SOAL_LIST.map((t) => (
                  <option key={t} value={t}>
                    {TIPE_LABEL[t]}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                <input
                  type="checkbox"
                  checked={mapelIni}
                  onChange={(e) => setMapelIni(e.target.checked)}
                  className="accent-navy-700"
                />
                Hanya mapel &ldquo;{mapelNama}&rdquo;
              </label>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
              {pesan && (
                <p
                  className={`mb-3 rounded-xl px-4 py-2.5 text-sm font-medium ${
                    pesan.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"
                  }`}
                >
                  {pesan.teks}
                </p>
              )}
              {memuat ? (
                <p className="py-10 text-center text-sm text-slate-500">
                  <i className="fas fa-circle-notch fa-spin mr-2" aria-hidden />
                  Memuat…
                </p>
              ) : hasil.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-500">
                  Tidak ada soal di bank yang cocok.
                  {mapelIni && " Coba lepas centang “Hanya mapel ini”."}
                </p>
              ) : (
                <ul className="space-y-2">
                  {hasil.map((h) => {
                    const aktif = dipilih.has(h.id);
                    return (
                      <li key={h.id}>
                        <label
                          className={`flex cursor-pointer items-start gap-3 rounded-xl border bg-white p-3 transition-colors ${
                            aktif ? "border-navy-600 bg-navy-50/60" : "border-slate-200 hover:border-slate-300"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={aktif}
                            onChange={() => tukar(h.id)}
                            className="mt-1 h-4 w-4 accent-navy-700"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="mb-1 flex flex-wrap items-center gap-1.5">
                              <span className="pil bg-navy-50 text-navy-700">{TIPE_LABEL[h.tipe]}</span>
                              <span className="pil bg-amber-50 text-amber-700">Skor {h.skor}</span>
                              {!mapelIni && (
                                <span className="pil bg-slate-100 text-slate-600">{h.mapel_nama}</span>
                              )}
                              {h.asal_event_nama && (
                                <span className="truncate text-[0.7rem] text-slate-400">
                                  dari {h.asal_event_nama}
                                </span>
                              )}
                            </span>
                            <span className="line-clamp-2 block text-sm text-ink">
                              {ringkasanKonten(h.konten_jsonb) || "(tanpa teks)"}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="flex flex-col gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center">
              <p className="text-xs text-slate-500 sm:mr-auto">
                <b className="text-ink">{dipilih.size}</b> dipilih · skor {totalSkorDipilih}
                {hasil.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setDipilih(
                        dipilih.size === hasil.length ? new Set() : new Set(hasil.map((h) => h.id))
                      )
                    }
                    className="ml-3 font-semibold text-navy-700 underline-offset-2 hover:underline"
                  >
                    {dipilih.size === hasil.length ? "Batal pilih semua" : "Pilih semua"}
                  </button>
                )}
              </p>
              <button type="button" onClick={() => setBuka(false)} className="btn-ghost">
                Tutup
              </button>
              <button
                type="button"
                onClick={tambahkan}
                disabled={dipilih.size === 0 || menyimpan}
                className="btn-navy"
              >
                <i className={`fas ${menyimpan ? "fa-circle-notch fa-spin" : "fa-plus"}`} aria-hidden />
                Tambahkan {dipilih.size || ""} Soal
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
