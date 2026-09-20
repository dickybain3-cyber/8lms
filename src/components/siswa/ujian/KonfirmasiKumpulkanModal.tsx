"use client";

import { useEffect, useRef } from "react";

type Props = {
  open: boolean;
  /** Dipanggil saat siswa memilih "Kembali Kerjakan" (juga Esc / klik latar). */
  onBatal: () => void;
  /** Dipanggil saat siswa memilih "Tetap Kumpulkan". */
  onKonfirmasi: () => void;
  /** True selama proses kirim berlangsung: kedua tombol dikunci. */
  sedangMengirim?: boolean;
  /** Opsional: tampilkan ringkasan "12 dari 20 soal terjawab". */
  jumlahTerjawab?: number;
  jumlahSoal?: number;
};

export default function KonfirmasiKumpulkanModal({
  open,
  onBatal,
  onKonfirmasi,
  sedangMengirim = false,
  jumlahTerjawab,
  jumlahSoal,
}: Props) {
  const tombolKembaliRef = useRef<HTMLButtonElement>(null);

  // Fokus awal ke tombol AMAN ("Kembali Kerjakan"), supaya tekan Enter
  // tanpa sengaja tidak langsung mengumpulkan ujian.
  useEffect(() => {
    if (open) tombolKembaliRef.current?.focus();
  }, [open]);

  // Esc = batal (pilihan yang aman). Diabaikan saat sedang mengirim.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !sedangMengirim) onBatal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, sedangMengirim, onBatal]);

  // Kunci scroll halaman di belakang modal.
  useEffect(() => {
    if (!open) return;
    const sebelumnya = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = sebelumnya;
    };
  }, [open]);

  if (!open) return null;

  const adaRingkasan =
    typeof jumlahTerjawab === "number" && typeof jumlahSoal === "number";
  const belumTerjawab = adaRingkasan ? jumlahSoal! - jumlahTerjawab! : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm"
      onClick={() => {
        if (!sedangMengirim) onBatal();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="judul-kumpulkan"
        aria-describedby="isi-kumpulkan"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl"
      >
        {/* Pita peringatan */}
        <div className="flex items-center gap-3 border-b border-red-200 bg-red-50 px-6 py-4">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-600 text-xl font-bold text-white"
          >
            !
          </span>
          <h2
            id="judul-kumpulkan"
            className="text-lg font-semibold text-red-900"
          >
            Kumpulkan jawaban sekarang?
          </h2>
        </div>

        <div id="isi-kumpulkan" className="space-y-4 px-6 py-5">
          <p className="text-sm leading-relaxed text-ink/80">
            Setelah dikumpulkan, jawabanmu langsung terkirim dan{" "}
            <strong className="text-red-700">
              kamu tidak bisa kembali untuk mengubahnya
            </strong>
            . Tindakan ini tidak bisa dibatalkan.
          </p>

          {adaRingkasan && (
            <div
              className={`rounded-lg border px-4 py-3 text-sm ${
                belumTerjawab > 0
                  ? "border-amber-300 bg-amber-50 text-amber-900"
                  : "border-teal/30 bg-teal/5 text-ink/80"
              }`}
            >
              {belumTerjawab > 0 ? (
                <>
                  Masih ada <strong>{belumTerjawab} soal</strong> yang belum
                  kamu jawab ({jumlahTerjawab} dari {jumlahSoal} terjawab).
                </>
              ) : (
                <>Semua {jumlahSoal} soal sudah terjawab.</>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-ink/10 bg-paper px-6 py-4 sm:flex-row sm:justify-end">
          <button
            ref={tombolKembaliRef}
            type="button"
            onClick={onBatal}
            disabled={sedangMengirim}
            className="rounded-lg border border-ink/20 bg-white px-4 py-2.5 text-sm font-medium text-ink hover:bg-ink/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:opacity-50"
          >
            Kembali Kerjakan
          </button>
          <button
            type="button"
            onClick={onKonfirmasi}
            disabled={sedangMengirim}
            className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 disabled:opacity-60"
          >
            {sedangMengirim ? "Mengirim…" : "Tetap Kumpulkan"}
          </button>
        </div>
      </div>
    </div>
  );
}