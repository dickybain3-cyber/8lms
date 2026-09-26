"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { REAKSI_TERSEDIA } from "@/lib/forum";

/**
 * Reaksi emoji guru pada bubble (Part 6).
 *
 *  - <PemilihReaksi>  : SISI GURU. Tombol kecil di bubble -> popover 6 emoji.
 *  - <LencanaReaksi>  : GURU DAN SISWA (baca saja). Deretan emoji + jumlah.
 *
 * Pemilih bersifat optimistik: tampilan langsung berubah, lalu disamakan
 * dengan keadaan akhir database yang dikembalikan `toggleReaksiPesan`
 * (termasuk rollback kalau gagal).
 */

// ---------------------------------------------------------------------------
// Lencana (baca saja)
// ---------------------------------------------------------------------------

export interface BarisReaksi {
  pesan_id: string;
  guru_id: string;
  emoji: string;
}

export interface KelompokReaksi {
  emoji: string;
  jumlah: number;
  /** true kalau guru yang sedang login ikut memberi emoji ini. */
  olehSaya: boolean;
}

/** Kelompokkan baris `forum_reaksi` satu pesan menjadi emoji + jumlah,
 *  urut sesuai `REAKSI_TERSEDIA`. `guruIdSaya` = null di sisi siswa. */
export function kelompokkanReaksi(
  baris: BarisReaksi[],
  guruIdSaya: string | null = null
): KelompokReaksi[] {
  const peta = new Map<string, KelompokReaksi>();
  for (const b of baris) {
    const k = peta.get(b.emoji) ?? { emoji: b.emoji, jumlah: 0, olehSaya: false };
    k.jumlah += 1;
    if (guruIdSaya && b.guru_id === guruIdSaya) k.olehSaya = true;
    peta.set(b.emoji, k);
  }
  const urutan = REAKSI_TERSEDIA as readonly string[];
  return [...peta.values()].sort(
    (a, b) => urutan.indexOf(a.emoji) - urutan.indexOf(b.emoji)
  );
}

export function LencanaReaksi({ kelompok }: { kelompok: KelompokReaksi[] }) {
  if (kelompok.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {kelompok.map((k) => (
        <span
          key={k.emoji}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
            k.olehSaya
              ? "border-slate-500 bg-slate-100 text-slate-800"
              : "border-slate-200 bg-white text-slate-600"
          }`}
          aria-label={`${k.jumlah} reaksi ${k.emoji}`}
        >
          <span aria-hidden="true">{k.emoji}</span>
          {k.jumlah > 1 && <span>{k.jumlah}</span>}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pemilih (guru)
// ---------------------------------------------------------------------------

export function PemilihReaksi({
  emojiSaatIni,
  onToggle,
  onGalat,
}: {
  /** Emoji milik guru ini di pesan ini, atau null. */
  emojiSaatIni: string | null;
  /** Biasanya: (e) => toggleReaksiPesan(eventId, kelasId, pesanId, e) */
  onToggle: (
    emoji: string
  ) => Promise<{ error: string | null; emoji: string | null }>;
  /** Dipanggil dengan kalimat galat dari server (mis. untuk toast). */
  onGalat?: (pesan: string) => void;
}) {
  const [terbuka, setTerbuka] = useState(false);
  const [pilihan, setPilihan] = useState<string | null>(emojiSaatIni);
  const [, mulai] = useTransition();
  const wadah = useRef<HTMLDivElement>(null);

  // Ikuti data server kalau berubah dari luar (mis. router.refresh()).
  useEffect(() => setPilihan(emojiSaatIni), [emojiSaatIni]);

  useEffect(() => {
    if (!terbuka) return;
    const luar = (e: PointerEvent) => {
      if (!wadah.current?.contains(e.target as Node)) setTerbuka(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setTerbuka(false);
    document.addEventListener("pointerdown", luar);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", luar);
      document.removeEventListener("keydown", esc);
    };
  }, [terbuka]);

  function pilih(emoji: string) {
    const sebelum = pilihan;
    setPilihan(sebelum === emoji ? null : emoji); // optimistik
    setTerbuka(false);
    mulai(async () => {
      const hasil = await onToggle(emoji);
      setPilihan(hasil.emoji); // keadaan akhir dari database
      if (hasil.error) onGalat?.(hasil.error);
    });
  }

  return (
    // stopPropagation: klik di sini tidak boleh ikut memicu klik bubble
    // (toggle bonus +5) maupun gestur geser-balas.
    <div
      ref={wadah}
      className="relative inline-block"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setTerbuka((v) => !v)}
        aria-haspopup="true"
        aria-expanded={terbuka}
        aria-label={pilihan ? `Reaksi kamu ${pilihan}, ubah` : "Beri reaksi"}
        className="flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-sm text-slate-500 hover:bg-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-600"
      >
        {pilihan ?? (
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9.5h.01M15 9.5h.01" />
          </svg>
        )}
      </button>

      {terbuka && (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-20 mb-1 flex gap-0.5 rounded-full border border-slate-200 bg-white p-1 shadow-md"
        >
          {REAKSI_TERSEDIA.map((e) => (
            <button
              key={e}
              type="button"
              role="menuitemradio"
              aria-checked={pilihan === e}
              aria-label={e}
              onClick={() => pilih(e)}
              className={`flex h-9 w-9 items-center justify-center rounded-full text-xl transition-transform hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-600 ${
                pilihan === e ? "bg-slate-200" : ""
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
