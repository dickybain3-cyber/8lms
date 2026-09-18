"use client";

import { useRef, useState } from "react";
import { gambarPratinjau, gambarTampil } from "@/lib/gambar";
import {
  ACCEPT_GAMBAR,
  gambarDariClipboard,
  prosesDanUnggah,
  SISI_MAKS,
} from "@/lib/unggah-gambar";

/**
 * Kotak unggah gambar TERPISAH — sekarang jadi jalur kedua, bukan jalur
 * utama.
 *
 * Sejak kolom pertanyaan & opsi memakai `EditorKaya`, cara yang wajar
 * memasang gambar adalah menempelkannya langsung di tempat gambar itu
 * seharusnya berada. Kotak ini tetap ada karena dua alasan, dan keduanya
 * bukan alasan estetika:
 *
 *   1. Soal yang SUDAH ADA memakainya. Field `gambar_pertanyaan_url` dan
 *      `soal.gambar_url` masih terisi di ratusan soal dan masih dirender
 *      ke siswa. Menghapus kotak ini akan membuat gambar pada soal-soal
 *      itu lenyap tanpa peringatan begitu gurunya membuka lalu menyimpan
 *      ulang soalnya — karena nilainya tidak lagi punya tempat di form.
 *   2. Gambar opsi versi kecil (mode `compact`) masih dipakai di
 *      PilganForm & MenjodohkanForm sebagai pratinjau kotak.
 *
 * Seluruh logika pengecilan & unggah sudah dipindah ke
 * `src/lib/unggah-gambar.ts` supaya kotak ini dan editor kaya memakai
 * jalur yang sama persis. Kalau batas ukuran atau mutu kompresi perlu
 * diubah, ubah di sana — satu tempat, bukan dua.
 */

export default function ImageUpload({
  value,
  onChange,
  label = "Gambar (opsional)",
  compact = false,
}: {
  value: string | null | undefined;
  onChange: (url: string | null) => void;
  label?: string;
  compact?: boolean;
}) {
  const [status, setStatus] = useState<"diam" | "bekerja">("diam");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sibuk = status !== "diam";

  async function handleFile(file: File | null | undefined) {
    if (!file) return;

    setError(null);
    setInfo(null);
    setStatus("bekerja");

    try {
      const { url, info: keterangan } = await prosesDanUnggah(file);
      onChange(url);
      setInfo(keterangan);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload gambar gagal.");
    } finally {
      setStatus("diam");
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const berkas = gambarDariClipboard(e.clipboardData);
    if (berkas) {
      e.preventDefault();
      void handleFile(berkas);
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    void handleFile(gambarDariClipboard(e.dataTransfer));
  }

  if (value) {
    return (
      <div className={compact ? "" : "space-y-1.5"}>
        {!compact && <p className="mb-1.5 block text-sm text-ink/70">{label}</p>}
        <div className="relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={compact ? gambarPratinjau(value, 160) : gambarTampil(value, 540)}
            alt=""
            className={`rounded-md border border-ink/15 object-contain ${
              compact ? "h-16 w-16" : "max-h-48"
            }`}
          />
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setInfo(null);
            }}
            aria-label="Hapus gambar"
            className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-ink text-sm text-paper transition-colors hover:bg-danger"
          >
            ×
          </button>
        </div>
        {!compact && (
          <>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-1 block text-xs font-medium text-teal hover:underline"
            >
              Ganti gambar
            </button>
            {info && <p className="text-xs text-ink/40">{info}</p>}
            <p className="text-xs text-ink/40">
              Siswa bisa mengetuk gambar ini untuk memperbesarnya.
            </p>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_GAMBAR}
          className="hidden"
          onChange={(e) => {
            void handleFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div className={compact ? "" : "space-y-1.5"}>
      {!compact && <p className="mb-1.5 block text-sm text-ink/70">{label}</p>}
      <div
        tabIndex={0}
        onPaste={handlePaste}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => !sibuk && fileInputRef.current?.click()}
        role="button"
        aria-label="Tempel, seret, atau pilih gambar"
        aria-busy={sibuk}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-ink/25 bg-white text-center text-ink/50 outline-none transition-colors hover:border-gold focus-visible:border-gold ${
          compact ? "h-16 w-16 text-xs" : "px-4 py-6 text-sm"
        } ${sibuk ? "opacity-60" : ""}`}
      >
        {sibuk ? (
          <span>Memproses…</span>
        ) : (
          <>
            <span>{compact ? "+" : "Klik untuk pilih gambar"}</span>
            {!compact && (
              <>
                <span className="text-xs text-ink/35">
                  atau seret berkas ke sini
                </span>
                <span className="mt-1 text-[0.7rem] text-ink/30">
                  Foto besar otomatis dikecilkan ke {SISI_MAKS} px — tidak perlu
                  diedit dulu
                </span>
              </>
            )}
          </>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT_GAMBAR}
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
