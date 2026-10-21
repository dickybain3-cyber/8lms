"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Jenjang } from "@/lib/jenjang";
import { labelJenisEvent, jenisEventValid } from "@/lib/jenis-event";
import { KATA_KONFIRMASI, type ModeBersih, type RingkasanKegiatan } from "@/lib/bersih-data";
import { bersihkanKegiatanAksi } from "./actions";

const PILIHAN: Record<ModeBersih, { judul: string; ikon: string; ket: string; hapus: string[]; tetap: string[] }> = {
  data_siswa: {
    judul: "Kosongkan data siswa saja",
    ikon: "fa-eraser",
    ket: "Kegiatan & soal tetap ada, bisa dipakai lagi.",
    hapus: ["Jawaban ujian & nilai", "Pengumpulan tugas + berkasnya", "Pesan & poin forum"],
    tetap: ["Kegiatan, mapel, jadwal", "Semua soal", "Tugas & topik forum"],
  },
  total: {
    judul: "Hapus total beserta datanya",
    ikon: "fa-trash-can",
    ket: "Kegiatan hilang dari daftar, semua isinya ikut terhapus.",
    hapus: ["Kegiatan, mapel, soal", "Jawaban, nilai", "Tugas, pengumpulan, forum"],
    tetap: ["Salinan soal di Bank Soal", "Data siswa & guru", "Log aktivitas"],
  },
};

function tanggal(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

export default function BersihDataClient({
  jenjang,
  kegiatan,
}: {
  jenjang: Jenjang;
  kegiatan: RingkasanKegiatan[];
}) {
  const router = useRouter();
  const [dipilih, setDipilih] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<ModeBersih | null>(null);
  const [ketik, setKetik] = useState("");
  const [paham, setPaham] = useState(false);
  const [proses, setProses] = useState(false);
  const [pesan, setPesan] = useState<{ ok: boolean; teks: string } | null>(null);

  const terpilih = kegiatan.filter((k) => dipilih.has(k.id));
  const jumlah = useMemo(
    () =>
      terpilih.reduce(
        (a, k) => ({
          soal: a.soal + k.soal,
          jawaban: a.jawaban + k.jawaban,
          nilai: a.nilai + k.nilai,
          pengumpulan: a.pengumpulan + k.pengumpulan,
          berkas: a.berkas + k.berkas,
          pesan: a.pesan + k.pesan,
        }),
        { soal: 0, jawaban: 0, nilai: 0, pengumpulan: 0, berkas: 0, pesan: 0 }
      ),
    [terpilih]
  );
  const adaBerjalan = terpilih.some((k) => !k.selesai && new Date(`${k.tglMulai}T00:00:00`) <= new Date());

  function tukar(id: string) {
    setDipilih((s) => {
      const b = new Set(s);
      if (b.has(id)) b.delete(id);
      else b.add(id);
      return b;
    });
  }

  function pilihSelesai() {
    setDipilih(new Set(kegiatan.filter((k) => k.selesai).map((k) => k.id)));
  }

  async function jalankan() {
    if (!mode) return;
    setProses(true);
    setPesan(null);
    const r = await bersihkanKegiatanAksi(jenjang, Array.from(dipilih), mode, ketik, paham);
    setProses(false);
    if (r.error !== null) {
      setPesan({ ok: false, teks: r.error });
      return;
    }
    const h = r.hasil;
    setPesan({
      ok: true,
      teks:
        `${mode === "total" ? `${h.kegiatan} kegiatan dihapus total` : `Data siswa dari ${h.kegiatan} kegiatan dikosongkan`}: ` +
        `${h.jawaban} jawaban, ${h.nilai} nilai, ${h.pengumpulan} pengumpulan tugas, ${h.berkas} berkas, ${h.pesan} pesan forum.` +
        (h.peringatan.length ? ` Catatan: ${h.peringatan.join(" ")}` : ""),
    });
    setMode(null);
    setKetik("");
    setPaham(false);
    setDipilih(new Set());
    router.refresh();
  }

  if (kegiatan.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-500">
        Tidak ada kegiatan di database kelas {jenjang}. Sudah bersih.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {pesan && (
        <p
          className={`rounded-xl border px-4 py-3 text-sm font-medium ${
            pesan.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          <i className={`fas ${pesan.ok ? "fa-circle-check" : "fa-circle-exclamation"} mr-2`} aria-hidden />
          {pesan.teks}
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2.5 text-xs">
          <span className="font-semibold text-slate-600">{kegiatan.length} kegiatan</span>
          <button type="button" onClick={pilihSelesai} className="rounded-lg bg-navy-50 px-2.5 py-1 font-semibold text-navy-700 hover:bg-navy-100">
            Pilih semua yang sudah selesai
          </button>
          {dipilih.size > 0 && (
            <button type="button" onClick={() => setDipilih(new Set())} className="px-2 py-1 font-semibold text-slate-500 hover:text-ink">
              Batal pilih
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="thead-navy w-full min-w-[760px] text-sm">
            <thead>
              <tr>
                <th className="w-10" />
                <th>Kegiatan</th>
                <th className="!text-right">Mapel/Soal</th>
                <th className="!text-right">Jawaban</th>
                <th className="!text-right">Nilai</th>
                <th className="!text-right">Tugas</th>
                <th className="!text-right">Forum</th>
              </tr>
            </thead>
            <tbody>
              {kegiatan.map((k) => {
                const aktif = dipilih.has(k.id);
                return (
                  <tr
                    key={k.id}
                    onClick={() => tukar(k.id)}
                    className={`cursor-pointer border-b border-slate-100 last:border-0 ${aktif ? "bg-rose-50/60" : "hover:bg-slate-50"}`}
                  >
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        checked={aktif}
                        onChange={() => tukar(k.id)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Pilih ${k.nama}`}
                        className="h-4 w-4 accent-rose-600"
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="font-semibold text-ink">{k.nama}</p>
                      <p className="text-[0.72rem] text-slate-500">
                        {k.jenis && jenisEventValid(k.jenis) ? `${labelJenisEvent(k.jenis)} · ` : ""}
                        {tanggal(k.tglMulai)} – {tanggal(k.tglSelesai)}{" "}
                        <span className={`pil ml-1 ${k.selesai ? "bg-slate-100 text-slate-500" : "bg-emerald-50 text-emerald-700"}`}>
                          {k.selesai ? "Selesai" : "Aktif/terjadwal"}
                        </span>
                      </p>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{k.mapel} / {k.soal}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{k.jawaban}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{k.nilai}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {k.tugas ? `${k.pengumpulan} kumpul` : "–"}
                      {k.berkas ? <span className="block text-[0.68rem] text-slate-400">{k.berkas} berkas</span> : null}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{k.forum ? `${k.pesan} pesan` : "–"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(Object.keys(PILIHAN) as ModeBersih[]).map((m) => (
          <button
            key={m}
            type="button"
            disabled={dipilih.size === 0}
            onClick={() => {
              setMode(m);
              setKetik("");
              setPaham(false);
              setPesan(null);
            }}
            className={`flex items-start gap-3 rounded-2xl border-2 bg-white p-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
              m === "total" ? "border-rose-200 hover:border-rose-400" : "border-amber-200 hover:border-amber-400"
            }`}
          >
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                m === "total" ? "bg-rose-100 text-rose-600" : "bg-amber-100 text-amber-700"
              }`}
            >
              <i className={`fas ${PILIHAN[m].ikon}`} aria-hidden />
            </span>
            <span>
              <span className="block font-serif font-bold text-ink">
                {PILIHAN[m].judul}
                {dipilih.size > 0 && <span className="ml-1 text-slate-400">({dipilih.size})</span>}
              </span>
              <span className="block text-[0.78rem] text-slate-500">{PILIHAN[m].ket}</span>
            </span>
          </button>
        ))}
      </div>
      {dipilih.size === 0 && (
        <p className="text-xs text-slate-500">Centang kegiatan di tabel dulu, lalu pilih salah satu cara di atas.</p>
      )}

      {mode && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-navy-950/60 p-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className={`px-5 py-4 text-white ${mode === "total" ? "bg-rose-600" : "bg-amber-600"}`}>
              <p className="font-serif text-lg font-bold">
                <i className={`fas ${PILIHAN[mode].ikon} mr-2`} aria-hidden />
                {PILIHAN[mode].judul}
              </p>
              <p className="text-xs text-white/85">
                {terpilih.length} kegiatan · database kelas {jenjang}
              </p>
            </div>
            <div className="space-y-3 p-5 text-sm">
              <ul className="max-h-28 overflow-y-auto rounded-lg bg-slate-50 px-3 py-2 text-[0.8rem] text-ink">
                {terpilih.map((k) => (
                  <li key={k.id}>• {k.nama}</li>
                ))}
              </ul>
              <div className="grid grid-cols-2 gap-3 text-[0.78rem]">
                <div>
                  <p className="mb-1 font-bold text-rose-700">Dihapus</p>
                  <ul className="space-y-0.5 text-slate-600">
                    {PILIHAN[mode].hapus.map((x) => (
                      <li key={x}>✕ {x}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-1 font-bold text-emerald-700">Tetap aman</p>
                  <ul className="space-y-0.5 text-slate-600">
                    {PILIHAN[mode].tetap.map((x) => (
                      <li key={x}>✓ {x}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[0.78rem] text-rose-800">
                Akan hilang permanen: <b>{jumlah.jawaban}</b> jawaban, <b>{jumlah.nilai}</b> nilai,{" "}
                <b>{jumlah.pengumpulan}</b> pengumpulan tugas ({jumlah.berkas} berkas), <b>{jumlah.pesan}</b> pesan forum
                {mode === "total" && (
                  <>
                    , dan <b>{jumlah.soal}</b> soal (salinannya tetap di Bank Soal)
                  </>
                )}
                .
              </p>
              {adaBerjalan && (
                <label className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[0.78rem] text-amber-900">
                  <input type="checkbox" checked={paham} onChange={(e) => setPaham(e.target.checked)} className="mt-0.5 accent-amber-600" />
                  Ada kegiatan yang masih berlangsung. Saya paham siswa yang sedang mengerjakan akan kehilangan jawabannya.
                </label>
              )}
              <label className="block">
                <span className="mb-1 block text-[0.78rem] text-slate-600">
                  Ketik <b className="font-mono text-rose-700">{KATA_KONFIRMASI}</b> untuk melanjutkan:
                </span>
                <input
                  value={ketik}
                  onChange={(e) => setKetik(e.target.value)}
                  autoFocus
                  className="field font-mono"
                  placeholder={KATA_KONFIRMASI}
                />
              </label>
              {pesan && !pesan.ok && <p className="text-[0.8rem] font-medium text-rose-700">{pesan.teks}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
              <button type="button" onClick={() => setMode(null)} className="btn-ghost" disabled={proses}>
                Batal
              </button>
              <button
                type="button"
                onClick={jalankan}
                disabled={proses || ketik.trim() !== KATA_KONFIRMASI || (adaBerjalan && !paham)}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 ${
                  mode === "total" ? "bg-rose-600 hover:bg-rose-700" : "bg-amber-600 hover:bg-amber-700"
                }`}
              >
                <i className={`fas ${proses ? "fa-circle-notch fa-spin" : PILIHAN[mode].ikon}`} aria-hidden />
                {proses ? "Memproses…" : mode === "total" ? "Hapus Total" : "Kosongkan Data"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
