"use client";

import { useState, useTransition } from "react";
import { deleteForumTopik } from "./actions";

/**
 * Hapus forum, dengan dampaknya dinyatakan di depan.
 *
 * Pola sama persis dengan `TombolHapusTugas` (Tahap 4): angka dampak
 * dihitung di Server Component dan dioper masuk, konfirmasi meminta
 * MENGETIK kata, bukan sekadar menekan "Ya" — seluruh riwayat obrolan dan
 * poin keaktifan yang sudah terkumpul ikut terhapus permanen lewat
 * `on delete cascade` (0020).
 */
export default function TombolHapusForum({
  eventId,
  forumTopikId,
  dampak,
}: {
  eventId: string;
  forumTopikId: string;
  dampak: { jumlahKelas: number; jumlahPesan: number };
}) {
  const [terbuka, setTerbuka] = useState(false);
  const [ketikan, setKetikan] = useState("");
  const [galat, setGalat] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const adaIsi = dampak.jumlahPesan > 0;
  const cocok = ketikan.trim().toUpperCase() === "HAPUS";

  return (
    <>
      <button
        type="button"
        onClick={() => setTerbuka(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:border-red-400 hover:bg-red-50"
      >
        <i className="fas fa-trash" aria-hidden />
        Hapus Forum
      </button>

      {terbuka && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-2 font-serif text-lg font-bold text-ink">
              Hapus forum ini?
            </h2>

            {adaIsi ? (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3.5 text-sm text-red-800">
                <p className="mb-1.5 font-semibold">
                  Yang ikut terhapus permanen:
                </p>
                <ul className="list-inside list-disc space-y-0.5">
                  <li>{dampak.jumlahKelas} ruang kelas</li>
                  <li>{dampak.jumlahPesan} pesan (seluruh riwayat obrolan)</li>
                  <li>Semua poin keaktifan yang sudah terkumpul</li>
                </ul>
                <p className="mt-2">
                  Tidak ada tombol batal setelah ini — tidak ada tempat sampah.
                </p>
              </div>
            ) : (
              <p className="mb-4 text-sm text-ink/70">
                Belum ada pesan yang masuk, jadi tidak ada obrolan siapa pun
                yang hilang. Forumnya sendiri tidak bisa dikembalikan.
              </p>
            )}

            <label className="mb-1.5 block text-sm text-ink/70">
              Ketik <strong>HAPUS</strong> untuk mengonfirmasi
            </label>
            <input
              type="text"
              value={ketikan}
              onChange={(e) => setKetikan(e.target.value)}
              autoFocus
              className="mb-4 w-full rounded-md border border-ink/15 bg-white px-3.5 py-2.5 text-ink outline-none focus:border-red-400"
            />

            {galat && (
              <p className="mb-3 rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
                {galat}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setTerbuka(false);
                  setKetikan("");
                  setGalat(null);
                }}
                className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={!cocok || pending}
                onClick={() =>
                  startTransition(async () => {
                    setGalat(null);
                    const hasil = await deleteForumTopik(eventId, forumTopikId);
                    if (hasil?.error) setGalat(hasil.error);
                  })
                }
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-40"
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
