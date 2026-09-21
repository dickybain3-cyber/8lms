"use client";

import { useState, useTransition } from "react";
import { deleteTugas } from "../actions";

/**
 * Hapus tugas, dengan dampaknya dinyatakan di depan.
 *
 * Angka-angkanya dihitung di Server Component (`hitungDampakHapusTugas`)
 * dan dioper masuk, bukan diambil saat modal dibuka — supaya yang dibaca
 * guru adalah keadaan halaman yang sedang dilihatnya, bukan angka yang
 * datang belakangan dari permintaan kedua.
 *
 * Konfirmasinya meminta MENGETIK kata, bukan sekadar menekan "Ya". Yang
 * hilang di sini bukan cuma barisnya: seluruh pengumpulan siswa, nilai
 * yang sudah diberikan, dan berkas yang sudah diunggah ikut terhapus
 * permanen. Tombol "Ya" kedua terlalu mudah ditekan oleh tangan yang
 * sedang bergegas.
 */
export default function TombolHapusTugas({
  eventId,
  tugasId,
  judul,
  dampak,
}: {
  eventId: string;
  tugasId: string;
  judul: string;
  dampak: {
    jumlahPengumpulan: number;
    jumlahDinilai: number;
    jumlahBerkas: number;
  };
}) {
  const [terbuka, setTerbuka] = useState(false);
  const [ketikan, setKetikan] = useState("");
  const [galat, setGalat] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const adaIsi = dampak.jumlahPengumpulan > 0;
  const cocok = ketikan.trim().toUpperCase() === "HAPUS";

  return (
    <>
      <button
        type="button"
        onClick={() => setTerbuka(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:border-red-400 hover:bg-red-50"
      >
        <i className="fas fa-trash" aria-hidden />
        Hapus Tugas
      </button>

      {terbuka && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-2 font-serif text-lg font-bold text-ink">
              Hapus &ldquo;{judul}&rdquo;?
            </h2>

            {adaIsi ? (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3.5 text-sm text-red-800">
                <p className="mb-1.5 font-semibold">
                  Yang ikut terhapus permanen:
                </p>
                <ul className="list-inside list-disc space-y-0.5">
                  <li>{dampak.jumlahPengumpulan} pengumpulan siswa</li>
                  <li>{dampak.jumlahDinilai} nilai yang sudah diberikan</li>
                  <li>{dampak.jumlahBerkas} berkas unggahan</li>
                </ul>
                <p className="mt-2">
                  Tidak ada tombol batal setelah ini — tidak ada tempat sampah.
                </p>
              </div>
            ) : (
              <p className="mb-4 text-sm text-ink/70">
                Belum ada siswa yang mengumpulkan, jadi tidak ada pekerjaan
                siapa pun yang hilang. Tugasnya sendiri tidak bisa
                dikembalikan.
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
                    // `deleteTugas` berakhir dengan redirect() kalau
                    // berhasil, jadi baris di bawahnya hanya tercapai saat
                    // gagal. Hasilnya tetap diperiksa — kalau tidak, satu
                    // kegagalan akan tampil sebagai modal yang diam.
                    const hasil = await deleteTugas(eventId, tugasId);
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
