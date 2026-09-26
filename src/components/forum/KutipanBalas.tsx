"use client";

import type { ReactNode } from "react";
import { useGeserBalas } from "@/lib/useGeserBalas";

/**
 * Tiga potongan UI balasan untuk sisi GURU (Part 5). Ketiganya cuma
 * tampilan — pengiriman `balas_ke_id` dan validasi ruangnya tetap di
 * `kirimPesanGuru`.
 *
 *  - <BubbleGeserBalas>  : pembungkus bubble; geser kanan = pilih pesan ini
 *  - <PratinjauBalasan>  : kutipan di atas kotak ketik, dengan tombol batal
 *  - <KutipanDiBubble>   : kutipan kecil di dalam bubble yang berupa balasan
 */

/** Data minimal pesan yang dikutip. */
export interface PesanKutipan {
  id: string;
  /** Nama yang tampil: nama siswa, atau "Guru". */
  pengirim: string;
  jenis_isi: "teks" | "sticker" | "emoticon" | "gambar";
  isi: string;
}

/** Satu baris ringkas isi pesan untuk kutipan. */
export function ringkasIsiKutipan(p: Pick<PesanKutipan, "jenis_isi" | "isi">) {
  if (p.jenis_isi === "gambar") {
    const caption = p.isi.trim();
    return caption && caption !== "[Foto]" ? `Foto · ${caption}` : "Foto";
  }
  return p.isi;
}

function IkonBalas({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <polyline points="9 14 4 9 9 4" />
      <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
    </svg>
  );
}

/**
 * Bungkus bubble. Ikon balas muncul di sisi kiri dan menguat mengikuti
 * geseran; melewati ambang, ikonnya terisi dan ponsel bergetar singkat.
 * `onBalas` dipanggil saat jari dilepas melewati ambang.
 */
export function BubbleGeserBalas({
  onBalas,
  aktif = true,
  className,
  children,
}: {
  onBalas: () => void;
  aktif?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const { handlers, style, kemajuan, siapDilepas } = useGeserBalas(
    onBalas,
    aktif
  );

  return (
    <div className={`relative ${className ?? ""}`}>
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute left-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full transition-colors ${
          siapDilepas
            ? "bg-slate-700 text-white"
            : "bg-slate-200 text-slate-600"
        }`}
        style={{
          opacity: kemajuan,
          transform: `translateY(-50%) scale(${0.6 + 0.4 * kemajuan})`,
        }}
      >
        <IkonBalas />
      </span>
      <div {...handlers} style={style}>
        {children}
      </div>
    </div>
  );
}

/** Kutipan di atas kotak ketik. Render `null` kalau tidak ada yang dibalas. */
export function PratinjauBalasan({
  pesan,
  onBatal,
}: {
  pesan: PesanKutipan | null;
  onBatal: () => void;
}) {
  if (!pesan) return null;
  return (
    <div
      role="status"
      className="mb-2 flex items-start gap-2 rounded-lg border-l-4 border-slate-500 bg-slate-100 py-2 pl-3 pr-2"
    >
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-slate-700">
          Membalas {pesan.pengirim}
        </p>
        <p className="truncate text-sm text-slate-600">
          {ringkasIsiKutipan(pesan)}
        </p>
      </div>
      <button
        type="button"
        onClick={onBatal}
        aria-label="Batalkan balasan"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-600"
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}

/**
 * Kutipan kecil di dalam bubble balasan. `pesan = null` berarti pesan asli
 * tidak ada di daftar yang termuat (mis. kolomnya di-set NULL karena pesan
 * asli terhapus, lihat `on delete set null` di 0021).
 */
export function KutipanDiBubble({
  pesan,
  onKlik,
}: {
  pesan: PesanKutipan | null;
  /** Opsional: lompat ke pesan asli di daftar. */
  onKlik?: (id: string) => void;
}) {
  if (!pesan) {
    return (
      <div className="mb-1 rounded-md border-l-4 border-slate-300 bg-black/5 px-2 py-1 text-xs italic text-slate-500">
        Pesan asli tidak tersedia
      </div>
    );
  }
  const isi = (
    <>
      <span className="block text-xs font-semibold text-slate-700">
        {pesan.pengirim}
      </span>
      <span className="line-clamp-2 block text-xs text-slate-600">
        {ringkasIsiKutipan(pesan)}
      </span>
    </>
  );
  const kelas =
    "mb-1 block w-full rounded-md border-l-4 border-slate-500 bg-black/5 px-2 py-1 text-left";

  return onKlik ? (
    <button
      type="button"
      // `stopPropagation`: kutipan ini bisa muncul di DALAM elemen yang
      // sendiri punya klik sendiri (mis. bubble guru = toggle bonus di
      // PanelForumKelas.tsx) — melompat ke pesan asli tidak boleh ikut
      // memicu aksi milik pembungkusnya.
      onClick={(e) => {
        e.stopPropagation();
        onKlik(pesan.id);
      }}
      className={kelas}
    >
      {isi}
    </button>
  ) : (
    <div className={kelas}>{isi}</div>
  );
}
