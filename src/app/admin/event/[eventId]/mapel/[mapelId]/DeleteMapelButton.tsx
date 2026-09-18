"use client";

import { useState, useTransition } from "react";
import { deleteMapel } from "../../../actions";

export default function DeleteMapelButton({
  eventId,
  mapelId,
  mapelNama,
  dampak,
}: {
  eventId: string;
  mapelId: string;
  mapelNama: string;
  dampak: { jumlahSoal: number; jumlahJawabanSiswa: number; jumlahNilai: number };
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const adaDampak = dampak.jumlahJawabanSiswa > 0 || dampak.jumlahNilai > 0;

  function handleHapus() {
    setError(null);
    startTransition(async () => {
      const result = await deleteMapel(eventId, mapelId);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-danger/30 px-4 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/10"
      >
        Hapus Mapel
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-paper p-6 shadow-xl">
            <h2 className="mb-2 font-serif text-lg text-ink">
              Hapus mapel &quot;{mapelNama}&quot;?
            </h2>

            <p
              className={`mb-4 rounded-md px-3 py-2.5 text-sm ${
                adaDampak
                  ? "border border-danger/20 bg-danger/5 text-danger"
                  : "text-ink/60"
              }`}
            >
              Mapel ini punya <strong>{dampak.jumlahSoal} soal</strong>.
              {adaDampak ? (
                <>
                  {" "}
                  Menghapusnya akan ikut menghapus PERMANEN{" "}
                  <strong>{dampak.jumlahJawabanSiswa} jawaban siswa</strong>{" "}
                  dan <strong>{dampak.jumlahNilai} nilai</strong> yang sudah
                  tercatat. Tindakan ini tidak bisa dibatalkan.
                </>
              ) : (
                " Belum ada siswa yang mengerjakan, jadi tidak ada data ujian yang ikut terhapus."
              )}
            </p>

            {error && (
              <p className="mb-4 rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setError(null);
                }}
                className="rounded-md border border-ink/15 px-4 py-2 text-sm text-ink hover:bg-ink/5"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={handleHapus}
                className="rounded-md bg-danger px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-danger/90 disabled:opacity-40"
              >
                {pending ? "Menghapus…" : "Hapus Permanen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
