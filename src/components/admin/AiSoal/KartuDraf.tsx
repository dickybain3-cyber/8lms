"use client";

import { useRef, useState } from "react";
import type { TipeSoal } from "@/types";
import { TIPE_LABEL } from "@/lib/soal";
import { ACCEPT_GAMBAR, gambarDariClipboard } from "@/lib/unggah-gambar";
import {
  drafButuhGambar,
  htmlSatuSoal,
  kontenFinalDraf,
  teksKunci,
  type DrafTinjau,
} from "@/lib/ai/draf";
import {
  JENIS_STIMULUS,
  stimulusKeTeks,
  stimulusPerluRender,
  teksKeStimulus,
  type Stimulus,
} from "@/lib/ai/stimulus";
import { cariFoto, type KandidatFoto } from "@/lib/ai/gambar-klien";
import type { Jenjang } from "@/lib/jenjang";
import PilganForm from "@/components/admin/SoalForm/PilganForm";
import UraianSingkatForm from "@/components/admin/SoalForm/UraianSingkatForm";
import BenarSalahForm from "@/components/admin/SoalForm/BenarSalahForm";
import MultiBenarSalahForm from "@/components/admin/SoalForm/MultiBenarSalahForm";
import MenjodohkanForm from "@/components/admin/SoalForm/MenjodohkanForm";

/**
 * Satu kartu draf di langkah "Edit soal".
 *
 * Tampilan biasa = naskah soal + kunci (sama dengan "Lihat draf"). Tombol
 * Edit membuka sub-form yang SAMA dengan form soal manual (editor kaya:
 * tebal/miring, tempel gambar per opsi, tambah/hapus opsi). Sejak itu
 * draf ditandai `diedit` — kontennya sudah final apa adanya.
 *
 * Gambar yang diminta AI (diagram/ilustrasi/unggah) disiapkan SEBELUM
 * membuka editor: begitu editor dibuka, gambar yang sudah jadi ikut masuk
 * ke kolom pertanyaan dan sesudahnya dikelola di editor.
 */

export type { DrafTinjau, StatusGambar } from "@/lib/ai/draf";

const IKON: Record<TipeSoal, string> = {
  pilgan_biasa: "fa-circle-dot",
  pilgan_kompleks: "fa-square-check",
  uraian_singkat: "fa-pen-to-square",
  benar_salah: "fa-toggle-on",
  multi_benar_salah: "fa-list-check",
  menjodohkan: "fa-link",
};

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-navy-600 focus:ring-2 focus:ring-navy-600/10";

export default function KartuDraf({
  nomor,
  draf,
  onUbah,
  onHapus,
  onBuatGambar,
  onUnggahGambar,
  onGantiSoal,
  sedangSibuk,
  jenjang,
  onPilihFoto,
  onRenderStimulus,
}: {
  nomor: number;
  draf: DrafTinjau;
  onUbah: (d: DrafTinjau) => void;
  onHapus: () => void;
  onBuatGambar: (jenis: "diagram" | "ilustrasi") => void;
  onUnggahGambar: (file: File) => void;
  onGantiSoal: () => void;
  sedangSibuk: boolean;
  jenjang?: Jenjang;
  onPilihFoto: (k: KandidatFoto) => void;
  onRenderStimulus: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [mengedit, setMengedit] = useState(false);
  const [awalEditor, setAwalEditor] = useState<Record<string, unknown> | null>(null);
  const [foto, setFoto] = useState<KandidatFoto[] | null>(null);
  const [cariFotoQ, setCariFotoQ] = useState("");
  const [mencariFoto, setMencariFoto] = useState(false);
  const [galatFoto, setGalatFoto] = useState<string | null>(null);

  async function jalankanCariFoto() {
    const q = (cariFotoQ || draf.gambar?.promptEn || draf.gambar?.deskripsi || "").trim().slice(0, 120);
    if (!q) return;
    setCariFotoQ(q);
    setMencariFoto(true);
    setGalatFoto(null);
    try {
      const hasil = await cariFoto({ jenjang, q });
      setFoto(hasil);
      if (hasil.length === 0) {
        setGalatFoto("Tidak ada foto berlisensi bebas. Coba kata kunci lain (bahasa Inggris lebih banyak hasilnya).");
      }
    } catch (e) {
      setGalatFoto((e as Error).message);
    } finally {
      setMencariFoto(false);
    }
  }

  // Sub-form memanggil onContentChange dari efek yang TIDAK memasukkan
  // callback-nya ke dependensi (lihat SoalForm) — jadi yang dioper harus
  // selalu membaca draf & onUbah terbaru lewat ref.
  const terbaru = useRef({ draf, onUbah });
  terbaru.current = { draf, onUbah };
  const kontenBerubahRef = useRef((konten: unknown) => {
    const { draf: d, onUbah: ubah } = terbaru.current;
    ubah({ ...d, konten: konten as Record<string, unknown>, diedit: true, galatSimpan: null });
  });
  const kontenBerubah = kontenBerubahRef.current;

  const panelGambar = !!draf.gambar && !draf.diedit;
  const gambarBelum = drafButuhGambar(draf);
  const kontenTampil = kontenFinalDraf(draf);

  function bukaEditor() {
    setAwalEditor(kontenFinalDraf(draf));
    setMengedit(true);
  }

  return (
    <article
      className={`rounded-2xl border bg-white transition-all ${
        draf.galatSimpan ? "border-red-300 shadow-sm" : "border-slate-200 shadow-sm"
      }`}
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
        <span className="flex h-7 min-w-7 items-center justify-center rounded-lg bg-navy-800 px-2 text-xs font-bold text-white">
          {nomor}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-navy-50 px-2.5 py-1 text-[0.72rem] font-semibold text-navy-700">
          <i className={`fas ${IKON[draf.tipe]}`} aria-hidden />
          {TIPE_LABEL[draf.tipe]}
        </span>
        {draf.topik && (
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[0.72rem] font-semibold text-amber-700">
            {draf.topik}
          </span>
        )}
        {draf.diedit && (
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[0.72rem] font-semibold text-emerald-700">
            <i className="fas fa-pen mr-1" aria-hidden />
            Diedit
          </span>
        )}
        {panelGambar && (
          <span
            className={`rounded-full px-2.5 py-1 text-[0.72rem] font-semibold ${
              gambarBelum ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-700"
            }`}
          >
            <i className="fas fa-image mr-1" aria-hidden />
            {gambarBelum ? "Butuh gambar" : "Gambar siap"}
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            Skor
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={draf.skor}
              onChange={(e) => onUbah({ ...draf, skor: Number(e.target.value) })}
              className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-center text-sm font-bold tabular-nums text-ink outline-none focus:border-navy-600"
            />
          </label>
          {mengedit ? (
            <button
              type="button"
              onClick={() => setMengedit(false)}
              className="rounded-lg bg-navy-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-navy-800"
            >
              <i className="fas fa-check mr-1" aria-hidden />
              Selesai edit
            </button>
          ) : (
            <button
              type="button"
              onClick={bukaEditor}
              disabled={sedangSibuk || !!draf.gambarStatus.proses}
              className="rounded-lg border border-navy-200 px-2.5 py-1.5 text-xs font-semibold text-navy-700 hover:bg-navy-50 disabled:opacity-40"
            >
              <i className="fas fa-pen mr-1" aria-hidden />
              Edit
            </button>
          )}
          <button
            type="button"
            onClick={onGantiSoal}
            disabled={sedangSibuk || mengedit}
            title="Minta AI membuat soal pengganti untuk butir ini"
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            <i className="fas fa-rotate mr-1" aria-hidden />
            Ganti
          </button>
          <button
            type="button"
            onClick={onHapus}
            disabled={sedangSibuk}
            title="Hapus soal ini dari paket"
            aria-label={`Hapus soal ${nomor}`}
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
          >
            <i className="fas fa-trash" aria-hidden />
          </button>
        </div>
      </header>

      <div className="space-y-3 p-4">
        {draf.stimulus && !draf.diedit && !mengedit && (
          <PanelStimulus
            key={JSON.stringify(draf.stimulus)}
            stimulus={draf.stimulus}
            status={draf.stimulusStatus}
            sibuk={sedangSibuk}
            onUbah={(baru) =>
              onUbah({
                ...draf,
                stimulus: baru,
                // Data berubah → gambar lama tidak berlaku lagi.
                stimulusStatus: { url: null, proses: null, galat: null },
              })
            }
            onRender={onRenderStimulus}
            onHapus={() => onUbah({ ...draf, stimulus: null, stimulusStatus: undefined })}
          />
        )}

        {panelGambar && !mengedit && (
          <div className="rounded-xl border border-navy-100 bg-navy-50/50 p-3">
            <label className="mb-1 block text-[0.7rem] font-bold uppercase tracking-wide text-navy-700">
              Deskripsi gambar ({draf.gambar!.jenis === "diagram" ? "diagram" : "ilustrasi"})
            </label>
            <textarea
              value={draf.gambar!.deskripsi}
              rows={2}
              onChange={(e) => onUbah({ ...draf, gambar: { ...draf.gambar!, deskripsi: e.target.value } })}
              className={inputCls}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <TombolKecil
                ikon="fa-chart-simple"
                label="Diagram (AI teks)"
                proses={draf.gambarStatus.proses === "diagram"}
                disabled={sedangSibuk || !!draf.gambarStatus.proses}
                onClick={() => onBuatGambar("diagram")}
                utama={draf.gambar!.jenis === "diagram"}
              />
              <TombolKecil
                ikon="fa-palette"
                label="Ilustrasi (gratis)"
                proses={draf.gambarStatus.proses === "ilustrasi"}
                disabled={sedangSibuk || !!draf.gambarStatus.proses}
                onClick={() => onBuatGambar("ilustrasi")}
                utama={draf.gambar!.jenis === "ilustrasi"}
              />
              <TombolKecil
                ikon="fa-camera"
                label="Foto asli (Wikimedia)"
                proses={mencariFoto || draf.gambarStatus.proses === "foto"}
                disabled={sedangSibuk || !!draf.gambarStatus.proses}
                onClick={() => (foto ? setFoto(null) : jalankanCariFoto())}
              />
              <TombolKecil
                ikon="fa-upload"
                label="Unggah sendiri"
                proses={draf.gambarStatus.proses === "unggah"}
                disabled={!!draf.gambarStatus.proses}
                onClick={() => fileRef.current?.click()}
              />
              <button
                type="button"
                onClick={() =>
                  onUbah({ ...draf, gambar: null, gambarStatus: { url: null, proses: null, galat: null } })
                }
                className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:text-rose-600"
                title="Soal disimpan tanpa gambar — pastikan teks pertanyaan tidak menyebut gambar"
              >
                <i className="fas fa-xmark mr-1" aria-hidden />
                Tanpa gambar
              </button>
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPT_GAMBAR}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUnggahGambar(f);
                  e.target.value = "";
                }}
              />
            </div>
            <p
              className="mt-2 text-[0.7rem] text-slate-500"
              tabIndex={0}
              onPaste={(e) => {
                const f = gambarDariClipboard(e.clipboardData);
                if (f) {
                  e.preventDefault();
                  onUnggahGambar(f);
                }
              }}
            >
              Tip: klik baris ini lalu Ctrl+V untuk menempel tangkapan layar. Diagram dibuat dari
              deskripsi di atas — betulkan angkanya dulu kalau perlu.
            </p>
            {foto && (
              <div className="mt-3 rounded-lg border border-slate-200 bg-white p-2">
                <div className="mb-2 flex gap-2">
                  <input
                    value={cariFotoQ}
                    onChange={(e) => setCariFotoQ(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        jalankanCariFoto();
                      }
                    }}
                    className={inputCls}
                    aria-label="Kata kunci foto"
                  />
                  <button type="button" onClick={jalankanCariFoto} disabled={mencariFoto} className="btn-ghost shrink-0">
                    <i className={`fas ${mencariFoto ? "fa-circle-notch fa-spin" : "fa-magnifying-glass"}`} aria-hidden />
                    Cari
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {foto.map((k) => (
                    <button
                      key={k.thumb}
                      type="button"
                      onClick={() => {
                        onPilihFoto(k);
                        setFoto(null);
                      }}
                      title={`${k.judul} — ${k.kredit}`}
                      className="overflow-hidden rounded-lg border border-slate-200 text-left hover:border-navy-500"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={k.thumb} alt={k.judul} className="h-24 w-full object-cover" loading="lazy" />
                      <span className="block truncate px-1.5 py-1 text-[0.62rem] text-slate-500">{k.kredit}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[0.65rem] text-slate-400">
                  Foto dari Wikimedia Commons (lisensi bebas). Kredit otomatis ditulis di bawah gambar.
                </p>
              </div>
            )}
            {galatFoto && <p className="mt-2 text-xs font-medium text-amber-700">{galatFoto}</p>}
            {draf.gambarStatus.url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={draf.gambarStatus.url}
                alt=""
                className="mx-auto mt-3 max-h-48 rounded-lg border border-slate-200 bg-white object-contain"
              />
            )}
            {draf.gambarStatus.galat && (
              <p className="mt-2 text-xs font-medium text-rose-600">
                <i className="fas fa-circle-exclamation mr-1" aria-hidden />
                {draf.gambarStatus.galat}
              </p>
            )}
          </div>
        )}

        {mengedit && awalEditor ? (
          <div className="rounded-xl border border-navy-100 p-3">
            {(draf.tipe === "pilgan_biasa" || draf.tipe === "pilgan_kompleks") && (
              <PilganForm
                kompleks={draf.tipe === "pilgan_kompleks"}
                onContentChange={kontenBerubah}
                initial={awalEditor}
              />
            )}
            {draf.tipe === "uraian_singkat" && (
              <UraianSingkatForm onContentChange={kontenBerubah} initial={awalEditor} />
            )}
            {draf.tipe === "benar_salah" && (
              <BenarSalahForm onContentChange={kontenBerubah} initial={awalEditor} />
            )}
            {draf.tipe === "multi_benar_salah" && (
              <MultiBenarSalahForm onContentChange={kontenBerubah} initial={awalEditor} />
            )}
            {draf.tipe === "menjodohkan" && (
              <MenjodohkanForm onContentChange={kontenBerubah} initial={awalEditor} />
            )}
          </div>
        ) : (
          <>
            <div
              className="naskah-soal text-sm leading-relaxed text-ink"
              // Aman: htmlSatuSoal hanya memakai bersihkanHtml/teksKeHtml.
              dangerouslySetInnerHTML={{ __html: htmlSatuSoal({ tipe: draf.tipe, skor: draf.skor, konten: kontenTampil }) }}
            />
            <p className="text-xs font-semibold text-emerald-700">
              <i className="fas fa-key mr-1.5" aria-hidden />
              Kunci: {teksKunci(draf.tipe, kontenTampil) || "–"}
            </p>
          </>
        )}

        {draf.pembahasan && (
          <details className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <summary className="cursor-pointer font-semibold text-slate-500">
              Pembahasan (hanya untuk guru, tidak disimpan)
            </summary>
            <p className="mt-1.5 leading-relaxed">{draf.pembahasan}</p>
          </details>
        )}

        {draf.galatSimpan && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
            <i className="fas fa-circle-exclamation mr-1.5" aria-hidden />
            {draf.galatSimpan}
          </p>
        )}
      </div>
    </article>
  );
}

function TombolKecil({
  ikon,
  label,
  proses,
  disabled,
  onClick,
  utama,
}: {
  ikon: string;
  label: string;
  proses: boolean;
  disabled: boolean;
  onClick: () => void;
  utama?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
        utama
          ? "bg-navy-700 text-white hover:bg-navy-800"
          : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      <i className={`fas ${proses ? "fa-circle-notch fa-spin" : ikon}`} aria-hidden />
      {label}
    </button>
  );
}

function PanelStimulus({
  stimulus,
  status,
  sibuk,
  onUbah,
  onRender,
  onHapus,
}: {
  stimulus: Stimulus;
  status?: { url: string | null; proses: string | null; galat: string | null };
  sibuk: boolean;
  onUbah: (s: Stimulus) => void;
  onRender: () => void;
  onHapus: () => void;
}) {
  const [isi, setIsi] = useState(() => stimulusKeTeks(stimulus));
  const [judul, setJudul] = useState(stimulus.judul);
  const [sumber, setSumber] = useState(stimulus.sumber);
  const info = JENIS_STIMULUS.find((j) => j.jenis === stimulus.jenis);
  const perluRender = stimulusPerluRender(stimulus);
  const bentuk = stimulus.jenis === "grafik" || stimulus.jenis === "infografis" ? ` (${stimulus.bentuk})` : "";
  const petunjuk =
    stimulus.jenis === "tabel"
      ? "Baris pertama = judul kolom. Pisahkan sel dengan | (garis tegak)."
      : stimulus.jenis === "grafik"
        ? "Satu baris = satu data: label | nilai | seri (seri boleh kosong)."
        : stimulus.jenis === "infografis"
          ? "Satu baris = satu poin: judul | keterangan | ciri tambahan (untuk perbandingan)."
          : "Teks bacaan. Pisahkan paragraf dengan baris kosong.";

  const berubah = isi !== stimulusKeTeks(stimulus) || judul !== stimulus.judul || sumber !== stimulus.sumber;
  function terapkan() {
    onUbah({ ...teksKeStimulus(stimulus, isi), judul: judul.trim(), sumber: sumber.trim() } as Stimulus);
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-[0.72rem] font-bold text-amber-800">
          <i className={`fas ${info?.ikon ?? "fa-book-open"}`} aria-hidden />
          Stimulus: {info?.label ?? stimulus.jenis}
          {bentuk}
        </span>
        <button
          type="button"
          onClick={onHapus}
          className="ml-auto text-[0.7rem] font-semibold text-slate-500 hover:text-rose-600"
          title="Soal tanpa stimulus (tidak disarankan untuk soal TKA)"
        >
          <i className="fas fa-xmark mr-1" aria-hidden />
          Hapus stimulus
        </button>
      </div>
      {perluRender && status?.url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={status.url}
          alt={stimulus.judul}
          className="mx-auto mb-2 max-h-72 rounded-lg border border-slate-200 bg-white object-contain"
        />
      )}
      <input
        value={judul}
        onChange={(e) => setJudul(e.target.value)}
        placeholder="Judul stimulus"
        className="mb-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold outline-none focus:border-navy-600"
      />
      <textarea
        value={isi}
        rows={Math.min(10, Math.max(3, isi.split(/\n/).length + 1))}
        onChange={(e) => setIsi(e.target.value)}
        className={`${inputCls} ${perluRender ? "font-mono text-xs" : ""}`}
        aria-label="Isi stimulus"
      />
      <p className="mt-1 text-[0.68rem] text-slate-500">{petunjuk}</p>
      <input
        value={sumber}
        onChange={(e) => setSumber(e.target.value)}
        placeholder="Sumber (opsional)"
        className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-navy-600"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        {berubah && (
          <button
            type="button"
            onClick={terapkan}
            className="rounded-lg bg-navy-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-navy-800"
          >
            <i className="fas fa-check mr-1" aria-hidden />
            Terapkan perubahan
          </button>
        )}
        {perluRender && !berubah && (
          <button
            type="button"
            onClick={onRender}
            disabled={sibuk || status?.proses === "stimulus"}
            className="rounded-lg border border-navy-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-navy-700 hover:bg-navy-50 disabled:opacity-40"
          >
            <i
              className={`fas ${status?.proses === "stimulus" ? "fa-circle-notch fa-spin" : "fa-wand-magic-sparkles"} mr-1`}
              aria-hidden
            />
            {status?.url ? "Gambar ulang" : "Gambar stimulus"}
          </button>
        )}
      </div>
      {status?.galat && (
        <p className="mt-2 text-xs font-medium text-rose-600">
          <i className="fas fa-circle-exclamation mr-1" aria-hidden />
          {status.galat}
        </p>
      )}
    </div>
  );
}
