"use client";

import { useState } from "react";

/**
 * Muncul saat ada siswa yang ditandai. Reset tidak bisa dibatalkan, jadi
 * tetap dua langkah, dan jumlah siswanya disebut di tombol konfirmasi.
 */
export default function BilahResetMassal({
  jumlah,
  sibuk,
  onReset,
  onBatal,
}: {
  jumlah: number;
  sibuk: boolean;
  onReset: () => void;
  onBatal: () => void;
}) {
  const [konfirmasi, setKonfirmasi] = useState(false);

  if (jumlah === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-danger/30 bg-danger/5 px-3.5 py-2.5 text-sm">
      <span className="font-semibold text-ink">{jumlah} siswa ditandai</span>
      {konfirmasi ? (
        <>
          <span className="text-xs text-danger">
            Jawaban dan nilainya dihapus permanen.
          </span>
          <button
            type="button"
            disabled={sibuk}
            onClick={() => {
              setKonfirmasi(false);
              onReset();
            }}
            className="rounded-md bg-danger px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
          >
            Ya, reset {jumlah} siswa
          </button>
          <button
            type="button"
            onClick={() => setKonfirmasi(false)}
            className="px-2 text-xs text-ink/50 hover:text-ink"
          >
            Tidak jadi
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            disabled={sibuk}
            onClick={() => setKonfirmasi(true)}
            className="rounded-md border border-danger/40 bg-white px-3 py-1.5 text-xs font-bold text-danger transition-colors hover:bg-danger hover:text-white disabled:opacity-50"
          >
            <i className="fas fa-rotate-left mr-1" aria-hidden />
            {sibuk ? "Mereset…" : "Reset yang ditandai"}
          </button>
          <button
            type="button"
            onClick={onBatal}
            className="px-2 text-xs text-ink/50 hover:text-ink"
          >
            Batalkan tanda
          </button>
        </>
      )}
    </div>
  );
}
