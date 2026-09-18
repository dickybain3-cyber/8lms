"use client";

import { useState, useTransition } from "react";
import { deleteSoal, deleteSoalAdmin } from "./soal/actions";
import type { Jenjang } from "@/lib/jenjang";

export default function DeleteSoalButton({
  eventId,
  mapelId,
  soalId,
  ringkasan,
  jenjang,
}: {
  eventId: string;
  mapelId: string;
  soalId: string;
  ringkasan: string;
  /** Diisi HANYA saat dirender dari jalur admin (lihat mapel/[mapelId]/page.tsx)
   *  — kalau ada, hapus lewat `deleteSoalAdmin()` (service_role, lintas
   *  jenjang, dijaga `pastikanBolehKeJenjang()` di server). Kalau kosong
   *  (guru biasa, atau admin yang sedang melihat jenjang sesi login-nya
   *  sendiri lewat jalur lama), tetap lewat `deleteSoal()` cookie-bound
   *  seperti sebelumnya — jangan diubah keduanya sekaligus. */
  jenjang?: Jenjang;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleHapus() {
    setError(null);
    startTransition(async () => {
      const result = jenjang
        ? await deleteSoalAdmin(jenjang, eventId, mapelId, soalId)
        : await deleteSoal(eventId, mapelId, soalId);
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
        aria-label={`Hapus soal: ${ringkasan}`}
        className="text-xs font-medium text-ink/40 hover:text-danger"
      >
        Hapus
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-sm rounded-lg bg-paper p-6 shadow-xl">
            <h2 className="mb-2 font-serif text-lg text-ink">Hapus soal ini?</h2>
            <p className="mb-4 truncate text-sm text-ink/60">
              &quot;{ringkasan}&quot;
            </p>
            <p className="mb-4 text-xs text-ink/50">
              Kalau ada siswa yang sudah submit & dinilai di mapel ini,
              jalankan &quot;Hitung Ulang Nilai&quot; setelah ini supaya
              total skor tetap konsisten.
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
                {pending ? "Menghapus…" : "Hapus"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}