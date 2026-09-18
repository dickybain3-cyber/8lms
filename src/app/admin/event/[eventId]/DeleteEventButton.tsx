"use client";

import { useState, useTransition } from "react";
import { deleteEvent } from "../actions";

export default function DeleteEventButton({
  eventId,
  eventNama,
  dampak,
}: {
  eventId: string;
  eventNama: string;
  dampak: { jumlahMapel: number; jumlahJawabanSiswa: number; jumlahNilai: number };
}) {
  const [open, setOpen] = useState(false);
  const [ketikan, setKetikan] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const adaDampak = dampak.jumlahMapel > 0;
  const cocok = ketikan.trim() === eventNama;

  function handleHapus() {
    setError(null);
    startTransition(async () => {
      const result = await deleteEvent(eventId);
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
        Hapus Event
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-paper p-6 shadow-xl">
            <h2 className="mb-2 font-serif text-lg text-ink">
              Hapus event &quot;{eventNama}&quot;?
            </h2>

            {adaDampak ? (
              <p className="mb-4 rounded-md border border-danger/20 bg-danger/5 px-3 py-2.5 text-sm text-danger">
                Event ini punya <strong>{dampak.jumlahMapel} mapel</strong>.
                Menghapusnya akan ikut menghapus PERMANEN{" "}
                <strong>{dampak.jumlahJawabanSiswa} jawaban siswa</strong> dan{" "}
                <strong>{dampak.jumlahNilai} nilai</strong> yang terkait
                mapel-mapel tersebut. Tindakan ini tidak bisa dibatalkan.
              </p>
            ) : (
              <p className="mb-4 text-sm text-ink/60">
                Event ini belum punya mapel, jadi tidak ada data ujian yang
                ikut terhapus. Tindakan ini tetap tidak bisa dibatalkan.
              </p>
            )}

            <label className="mb-1.5 block text-sm text-ink/70">
              Ketik ulang nama event untuk konfirmasi:
            </label>
            <input
              type="text"
              value={ketikan}
              onChange={(e) => setKetikan(e.target.value)}
              placeholder={eventNama}
              className="mb-4 w-full rounded-md border border-ink/15 bg-white px-3.5 py-2.5 text-ink outline-none focus:border-gold"
            />

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
                  setKetikan("");
                  setError(null);
                }}
                className="rounded-md border border-ink/15 px-4 py-2 text-sm text-ink hover:bg-ink/5"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={!cocok || pending}
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
