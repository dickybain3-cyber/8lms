"use client";

import { useRef } from "react";
import type { TipeSoal } from "@/types";
import { TIPE_LABEL } from "@/lib/soal";
import { ACCEPT_GAMBAR, gambarDariClipboard } from "@/lib/unggah-gambar";
import type { DraftSoal } from "@/lib/ai/rencana-soal";

/**
 * Satu kartu draf di layar tinjauan.
 *
 * Penyuntingan di sini SENGAJA teks polos (textarea/input), bukan editor
 * kaya: tujuannya membetulkan cepat — salah ketik, kunci yang keliru,
 * pengecoh yang terlalu jelas. Untuk format tebal/miring atau gambar per
 * opsi, guru menyimpan dulu lalu membuka "Edit" soal itu di daftar soal;
 * form edit biasa memuat isi draf ini apa adanya.
 */

export interface StatusGambar {
  url: string | null;
  proses: "diagram" | "ilustrasi" | "unggah" | null;
  galat: string | null;
}

export interface DrafTinjau extends DraftSoal {
  dipakai: boolean;
  gambarStatus: StatusGambar;
  galatSimpan: string | null;
}

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

type Obj = Record<string, unknown>;

export default function KartuDraf({
  nomor,
  draf,
  onUbah,
  onBuatGambar,
  onUnggahGambar,
  onGantiSoal,
  sedangSibuk,
}: {
  nomor: number;
  draf: DrafTinjau;
  onUbah: (d: DrafTinjau) => void;
  onBuatGambar: (jenis: "diagram" | "ilustrasi") => void;
  onUnggahGambar: (file: File) => void;
  onGantiSoal: () => void;
  sedangSibuk: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const k = draf.konten as Obj;
  const fieldTanya = "pertanyaan" in k ? "pertanyaan" : "instruksi";
  const butuhGambar = !!draf.gambar;
  const gambarBelum = butuhGambar && !draf.gambarStatus.url;

  function ubahKonten(patch: Obj) {
    onUbah({ ...draf, konten: { ...k, ...patch }, galatSimpan: null });
  }

  function ubahDaftar(field: string, id: string, patch: Obj) {
    const arr = (k[field] as Obj[]) ?? [];
    ubahKonten({ [field]: arr.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  }

  return (
    <article
      className={`rounded-2xl border bg-white transition-all ${
        draf.dipakai
          ? draf.galatSimpan
            ? "border-red-300 shadow-sm"
            : "border-slate-200 shadow-sm"
          : "border-dashed border-slate-300 opacity-60"
      }`}
    >
      {/* Kepala kartu */}
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={draf.dipakai}
            onChange={(e) => onUbah({ ...draf, dipakai: e.target.checked })}
            className="h-4 w-4 accent-navy-700"
            aria-label={`Pakai soal ${nomor}`}
          />
          <span className="flex h-7 min-w-7 items-center justify-center rounded-lg bg-navy-800 px-2 text-xs font-bold text-white">
            {nomor}
          </span>
        </label>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-navy-50 px-2.5 py-1 text-[0.72rem] font-semibold text-navy-700">
          <i className={`fas ${IKON[draf.tipe]}`} aria-hidden />
          {TIPE_LABEL[draf.tipe]}
        </span>
        {draf.topik && (
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[0.72rem] font-semibold text-amber-700">
            {draf.topik}
          </span>
        )}
        {butuhGambar && (
          <span
            className={`rounded-full px-2.5 py-1 text-[0.72rem] font-semibold ${
              gambarBelum ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-700"
            }`}
          >
            <i className="fas fa-image mr-1" aria-hidden />
            {gambarBelum ? "Butuh gambar" : "Gambar siap"}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
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
          <button
            type="button"
            onClick={onGantiSoal}
            disabled={sedangSibuk}
            title="Minta AI membuat soal pengganti untuk butir ini"
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            <i className="fas fa-rotate mr-1" aria-hidden />
            Ganti
          </button>
        </div>
      </header>

      <div className="space-y-3 p-4">
        {/* Gambar */}
        {butuhGambar && (
          <div className="rounded-xl border border-navy-100 bg-navy-50/50 p-3">
            {draf.gambarStatus.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={draf.gambarStatus.url}
                alt={draf.gambar!.deskripsi}
                className="mx-auto mb-3 max-h-64 rounded-lg border border-slate-200 bg-white object-contain"
              />
            ) : null}
            <label className="mb-1 block text-[0.7rem] font-bold uppercase tracking-wide text-navy-700">
              Deskripsi gambar ({draf.gambar!.jenis === "diagram" ? "diagram" : "ilustrasi"})
            </label>
            <textarea
              value={draf.gambar!.deskripsi}
              rows={2}
              onChange={(e) =>
                onUbah({ ...draf, gambar: { ...draf.gambar!, deskripsi: e.target.value } })
              }
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
                ikon="fa-upload"
                label="Unggah sendiri"
                proses={draf.gambarStatus.proses === "unggah"}
                disabled={!!draf.gambarStatus.proses}
                onClick={() => fileRef.current?.click()}
              />
              <button
                type="button"
                onClick={() =>
                  onUbah({
                    ...draf,
                    gambar: null,
                    gambarStatus: { url: null, proses: null, galat: null },
                  })
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
              Tip: klik baris ini lalu Ctrl+V untuk menempel tangkapan layar.
              Diagram dibuat dari deskripsi di atas — betulkan angkanya dulu
              kalau perlu.
            </p>
            {draf.gambarStatus.galat && (
              <p className="mt-2 text-xs font-medium text-rose-600">
                <i className="fas fa-circle-exclamation mr-1" aria-hidden />
                {draf.gambarStatus.galat}
              </p>
            )}
          </div>
        )}

        {/* Pertanyaan / instruksi */}
        <textarea
          value={String(k[fieldTanya] ?? "")}
          rows={3}
          onChange={(e) => ubahKonten({ [fieldTanya]: e.target.value })}
          className={`${inputCls} font-medium leading-relaxed`}
          aria-label="Teks pertanyaan"
        />

        <IsiPerTipe draf={draf} ubahKonten={ubahKonten} ubahDaftar={ubahDaftar} />

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

function TombolBS({
  nilai,
  onPilih,
}: {
  nilai: boolean;
  onPilih: (v: boolean) => void;
}) {
  return (
    <div className="inline-flex shrink-0 overflow-hidden rounded-lg border border-slate-200 text-xs font-bold">
      {[true, false].map((v) => (
        <button
          key={String(v)}
          type="button"
          onClick={() => onPilih(v)}
          className={`px-3 py-1.5 ${
            nilai === v
              ? v
                ? "bg-emerald-500 text-white"
                : "bg-rose-500 text-white"
              : "bg-white text-slate-500 hover:bg-slate-50"
          }`}
        >
          {v ? "Benar" : "Salah"}
        </button>
      ))}
    </div>
  );
}

function IsiPerTipe({
  draf,
  ubahKonten,
  ubahDaftar,
}: {
  draf: DrafTinjau;
  ubahKonten: (patch: Obj) => void;
  ubahDaftar: (field: string, id: string, patch: Obj) => void;
}) {
  const k = draf.konten as Obj;

  switch (draf.tipe) {
    case "pilgan_biasa":
    case "pilgan_kompleks": {
      const opsi = (k.opsi as Obj[]) ?? [];
      const kompleks = draf.tipe === "pilgan_kompleks";
      return (
        <ul className="space-y-1.5">
          {opsi.map((o, i) => (
            <li key={String(o.id)} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  kompleks
                    ? ubahDaftar("opsi", String(o.id), { benar: !o.benar })
                    : ubahKonten({
                        opsi: opsi.map((x) => ({ ...x, benar: x.id === o.id })),
                      })
                }
                aria-label={`Tandai opsi ${String.fromCharCode(65 + i)} sebagai benar`}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold transition-colors ${
                  o.benar
                    ? "bg-emerald-500 text-white"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                {o.benar ? <i className="fas fa-check" aria-hidden /> : String.fromCharCode(65 + i)}
              </button>
              <input
                value={String(o.teks ?? "")}
                onChange={(e) => ubahDaftar("opsi", String(o.id), { teks: e.target.value })}
                className={inputCls}
              />
            </li>
          ))}
        </ul>
      );
    }

    case "uraian_singkat": {
      const kunci = (k.kunci_jawaban as string[]) ?? [];
      return (
        <div>
          <label className="mb-1 block text-[0.7rem] font-bold uppercase tracking-wide text-slate-500">
            Kunci jawaban (pisahkan dengan ; )
          </label>
          <input
            value={kunci.join("; ")}
            onChange={(e) =>
              ubahKonten({
                kunci_jawaban: e.target.value
                  .split(";")
                  .map((s) => s.trim())
                  .filter((s, i, arr) => s || i === arr.length - 1),
              })
            }
            onBlur={() => ubahKonten({ kunci_jawaban: kunci.filter((s) => s.trim()) })}
            className={inputCls}
          />
          <p className="mt-1 text-[0.7rem] text-slate-400">
            Jawaban siswa dianggap benar bila memuat salah satu kunci ini.
          </p>
        </div>
      );
    }

    case "benar_salah":
      return (
        <div className="flex items-center gap-3 text-sm text-slate-600">
          Kunci:
          <TombolBS
            nilai={k.jawaban_benar === true}
            onPilih={(v) => ubahKonten({ jawaban_benar: v })}
          />
        </div>
      );

    case "multi_benar_salah": {
      const pernyataan = (k.pernyataan as Obj[]) ?? [];
      return (
        <ul className="space-y-1.5">
          {pernyataan.map((p) => (
            <li key={String(p.id)} className="flex items-center gap-2">
              <input
                value={String(p.teks ?? "")}
                onChange={(e) =>
                  ubahDaftar("pernyataan", String(p.id), { teks: e.target.value })
                }
                className={inputCls}
              />
              <TombolBS
                nilai={p.jawaban_benar === true}
                onPilih={(v) => ubahDaftar("pernyataan", String(p.id), { jawaban_benar: v })}
              />
            </li>
          ))}
        </ul>
      );
    }

    case "menjodohkan": {
      const soal = (k.soal as Obj[]) ?? [];
      const jawaban = (k.jawaban as Obj[]) ?? [];
      const pasangan = (k.pasangan_benar as Record<string, string>) ?? {};
      const terpakai = new Set(Object.values(pasangan));
      return (
        <div className="space-y-1.5">
          {soal.map((s) => {
            const jId = pasangan[String(s.id)];
            const j = jawaban.find((x) => x.id === jId);
            return (
              <div key={String(s.id)} className="grid grid-cols-1 gap-1.5 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                <input
                  value={String(s.teks ?? "")}
                  onChange={(e) => ubahDaftar("soal", String(s.id), { teks: e.target.value })}
                  className={inputCls}
                />
                <i className="fas fa-arrow-right-long hidden text-slate-300 sm:block" aria-hidden />
                <input
                  value={String(j?.teks ?? "")}
                  onChange={(e) =>
                    j && ubahDaftar("jawaban", String(j.id), { teks: e.target.value })
                  }
                  className={inputCls}
                />
              </div>
            );
          })}
          {jawaban
            .filter((j) => !terpakai.has(String(j.id)))
            .map((j) => (
              <div key={String(j.id)} className="flex items-center gap-2 sm:pl-[calc(50%+0.75rem)]">
                <span className="shrink-0 text-[0.7rem] font-semibold uppercase text-slate-400">
                  Pengecoh
                </span>
                <input
                  value={String(j.teks ?? "")}
                  onChange={(e) => ubahDaftar("jawaban", String(j.id), { teks: e.target.value })}
                  className={inputCls}
                />
              </div>
            ))}
          <p className="text-[0.7rem] text-slate-400">
            Kolom kanan diacak otomatis saat ujian.
          </p>
        </div>
      );
    }
  }
}
