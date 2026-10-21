"use client";

import { useState } from "react";
import { postJson } from "@/lib/ai/gambar-klien";
import { JENIS_LK, type JenisLembarKerja } from "@/lib/ai/lembar-kerja";

/**
 * Tombol "Buat Lembar Kerja dengan AI" di form Tugas.
 *
 * Hasilnya hanya MENGISI kolom judul & instruksi lewat `onHasil` — tidak
 * menyimpan apa pun. Guru tetap membaca, mengubah, lalu menekan Simpan.
 */
export default function LembarKerjaAi({
  eventId,
  aiSiap,
  bacaBentuk,
  onHasil,
}: {
  eventId: string;
  aiSiap: boolean;
  /** Dibaca saat tombol ditekan — kotak centang di form tidak terkendali. */
  bacaBentuk: () => { mintaTeks: boolean; mintaBerkas: boolean };
  onHasil: (h: { judul: string; deskripsi: string }) => void;
}) {
  const [buka, setBuka] = useState(false);
  const [mapel, setMapel] = useState("");
  const [topik, setTopik] = useState("");
  const [jenis, setJenis] = useState<JenisLembarKerja>("lkpd");
  const [jumlah, setJumlah] = useState("5");
  const [catatan, setCatatan] = useState("");
  const [proses, setProses] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  async function buat() {
    const daftarTopik = topik
      .split(/[\n,]/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (daftarTopik.length === 0) {
      setGalat("Isi minimal satu topik.");
      return;
    }
    setProses(true);
    setGalat(null);
    try {
      const hasil = await postJson<{ judul: string; deskripsi: string }>(
        "/api/ai/lembar-kerja",
        {
          eventId,
          mapel,
          topik: daftarTopik,
          jenis,
          jumlahPertanyaan: Number(jumlah) || 5,
          catatan,
          ...bacaBentuk(),
        }
      );
      onHasil(hasil);
      setBuka(false);
    } catch (e) {
      setGalat((e as Error).message);
    } finally {
      setProses(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setBuka(true)} className="btn-navy-outline">
        <i className="fas fa-wand-magic-sparkles" aria-hidden />
        Buat Lembar Kerja dengan AI
      </button>

      {buka && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-navy-950/60 backdrop-blur-sm sm:items-center sm:p-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Buat lembar kerja dengan AI"
            className="w-full max-w-lg overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
          >
            <div className="flex items-center gap-3 bg-navy-800 px-5 py-4 text-white">
              <i className="fas fa-file-lines" aria-hidden />
              <p className="flex-1 font-serif font-bold">Lembar Kerja AI</p>
              <button
                type="button"
                onClick={() => setBuka(false)}
                aria-label="Tutup"
                className="rounded-lg p-2 text-white/80 hover:bg-white/10"
              >
                <i className="fas fa-xmark" aria-hidden />
              </button>
            </div>
            <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
              {!aiSiap && (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Kunci Gemini untuk kelas ini belum dipasang di server.
                </p>
              )}
              <div>
                <label className="label-field" htmlFor="lk-mapel">Mata pelajaran</label>
                <input id="lk-mapel" value={mapel} onChange={(e) => setMapel(e.target.value)} placeholder="mis. IPA" className="field" />
              </div>
              <div>
                <label className="label-field" htmlFor="lk-topik">Topik / materi</label>
                <textarea
                  id="lk-topik"
                  rows={2}
                  value={topik}
                  onChange={(e) => setTopik(e.target.value)}
                  placeholder="Pisahkan dengan koma atau baris baru"
                  className="field"
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_7rem]">
                <div>
                  <label className="label-field" htmlFor="lk-jenis">Bentuk</label>
                  <select id="lk-jenis" value={jenis} onChange={(e) => setJenis(e.target.value as JenisLembarKerja)} className="field">
                    {(Object.keys(JENIS_LK) as JenisLembarKerja[]).map((k) => (
                      <option key={k} value={k}>{JENIS_LK[k].label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label-field" htmlFor="lk-jumlah">Pertanyaan</label>
                  <input id="lk-jumlah" type="number" min={1} max={15} value={jumlah} onChange={(e) => setJumlah(e.target.value)} className="field text-center" />
                </div>
              </div>
              <div>
                <label className="label-field" htmlFor="lk-catatan">Catatan (opsional)</label>
                <textarea id="lk-catatan" rows={2} value={catatan} onChange={(e) => setCatatan(e.target.value)} className="field" />
              </div>
              {galat && (
                <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{galat}</p>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
              <button type="button" onClick={() => setBuka(false)} className="btn-ghost">Batal</button>
              <button type="button" onClick={buat} disabled={proses} className="btn-navy">
                <i className={`fas ${proses ? "fa-circle-notch fa-spin" : "fa-wand-magic-sparkles"}`} aria-hidden />
                {proses ? "Menyusun…" : "Buat & isi form"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
