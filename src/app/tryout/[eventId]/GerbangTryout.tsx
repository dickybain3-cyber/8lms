"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cekToken, daftarNama, masuk } from "../actions";

/**
 * Gerbang tryout: token -> kelas -> nama. Tanpa password.
 * Tiket dari `cekToken` berlaku 15 menit; habis = ulang dari token.
 */
export default function GerbangTryout({
  eventId,
  eventNama,
  kelas,
  ditutup,
}: {
  eventId: string;
  eventNama: string;
  kelas: string[];
  ditutup: boolean;
}) {
  const router = useRouter();
  const [langkah, setLangkah] = useState<"token" | "nama">("token");
  const [token, setToken] = useState("");
  const [tiket, setTiket] = useState<string | null>(null);
  const [paketNama, setPaketNama] = useState("");
  const [kelasDipilih, setKelasDipilih] = useState("");
  const [daftar, setDaftar] = useState<{ id: string; nama: string }[] | null>(null);
  const [siswaId, setSiswaId] = useState("");
  const [cari, setCari] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sibuk, mulai] = useTransition();

  function kirimToken(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    mulai(async () => {
      const h = await cekToken(eventId, token);
      if (!h.ok) {
        setError(h.error);
        return;
      }
      setTiket(h.tiket);
      setPaketNama(h.paketNama);
      setLangkah("nama");
    });
  }

  function pilihKelas(k: string) {
    setKelasDipilih(k);
    setSiswaId("");
    setDaftar(null);
    setCari("");
    setError(null);
    if (!k || !tiket) return;
    mulai(async () => {
      const h = await daftarNama(tiket, k);
      if (!h.ok) {
        setError(h.error);
        if (h.error.includes("token")) ulang();
        return;
      }
      setDaftar(h.siswa);
    });
  }

  function ulang() {
    setLangkah("token");
    setTiket(null);
    setDaftar(null);
    setKelasDipilih("");
    setSiswaId("");
  }

  function kirimNama(e: React.FormEvent) {
    e.preventDefault();
    if (!tiket || !siswaId) return;
    setError(null);
    mulai(async () => {
      const h = await masuk(tiket, siswaId);
      if (!h.ok) {
        setError(h.error);
        return;
      }
      router.refresh();
    });
  }

  const daftarTersaring =
    daftar?.filter((s) => s.nama.toLowerCase().includes(cari.trim().toLowerCase())) ?? [];
  const namaDipilih = daftar?.find((s) => s.id === siswaId)?.nama;

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-5 text-center">
        <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-navy-600 to-navy-800 text-xl text-white shadow-lg shadow-navy-800/25">
          <i className="fas fa-flag-checkered" aria-hidden />
        </span>
        <h1 className="font-serif text-xl font-extrabold text-navy-900">{eventNama}</h1>
        <p className="mt-1 text-sm text-slate-500">Masuk tanpa password: token, kelas, lalu nama.</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {ditutup ? (
          <p className="text-center text-sm text-slate-600">Tryout ini sudah ditutup.</p>
        ) : langkah === "token" ? (
          <form onSubmit={kirimToken} className="space-y-4">
            <div>
              <label htmlFor="token" className="mb-1.5 block text-sm font-semibold text-ink">
                Token paket
              </label>
              <input
                id="token"
                value={token}
                onChange={(e) => setToken(e.target.value.toUpperCase())}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                inputMode="text"
                maxLength={14}
                required
                placeholder="mis. K7QW3P"
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-center font-mono text-xl font-bold tracking-[0.3em] text-ink outline-none focus:border-navy-500"
              />
              <p className="mt-1.5 text-xs text-slate-500">Token diberikan guru untuk tiap paket tryout.</p>
            </div>
            <PesanGalat pesan={error} />
            <button
              type="submit"
              disabled={sibuk || token.trim().length < 4}
              className="w-full rounded-xl bg-gradient-to-br from-navy-600 to-navy-800 py-3 text-sm font-bold text-white shadow-lg shadow-navy-800/25 disabled:opacity-50"
            >
              {sibuk ? "Memeriksa…" : "Lanjut"}
            </button>
          </form>
        ) : (
          <form onSubmit={kirimNama} className="space-y-4">
            <div className="flex items-center justify-between gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <span className="min-w-0 truncate">
                <i className="fas fa-circle-check mr-1.5" aria-hidden />
                {paketNama}
              </span>
              <button type="button" onClick={ulang} className="shrink-0 text-xs font-semibold underline">
                Ganti token
              </button>
            </div>

            <div>
              <label htmlFor="kelas" className="mb-1.5 block text-sm font-semibold text-ink">
                Kelas
              </label>
              <select
                id="kelas"
                value={kelasDipilih}
                onChange={(e) => pilihKelas(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-ink outline-none focus:border-navy-500"
              >
                <option value="">Pilih kelas…</option>
                {kelas.map((k) => (
                  <option key={k} value={k}>
                    Kelas {k}
                  </option>
                ))}
              </select>
            </div>

            {kelasDipilih && (
              <div>
                <label htmlFor="cari" className="mb-1.5 block text-sm font-semibold text-ink">
                  Nama
                </label>
                {daftar === null ? (
                  <p className="text-sm text-slate-500">Memuat daftar nama…</p>
                ) : daftar.length === 0 ? (
                  <p className="text-sm text-slate-500">Belum ada siswa di kelas ini.</p>
                ) : (
                  <>
                    <input
                      id="cari"
                      value={cari}
                      onChange={(e) => setCari(e.target.value)}
                      placeholder="Ketik untuk mencari…"
                      className="mb-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-navy-500"
                    />
                    <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
                      {daftarTersaring.map((s) => (
                        <li key={s.id}>
                          <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm text-ink has-[:checked]:bg-navy-50 has-[:checked]:font-semibold">
                            <input
                              type="radio"
                              name="siswa"
                              value={s.id}
                              checked={siswaId === s.id}
                              onChange={() => setSiswaId(s.id)}
                              className="accent-navy-700"
                            />
                            {s.nama}
                          </label>
                        </li>
                      ))}
                      {daftarTersaring.length === 0 && (
                        <li className="px-4 py-3 text-sm text-slate-500">Nama tidak ditemukan.</li>
                      )}
                    </ul>
                  </>
                )}
              </div>
            )}

            <PesanGalat pesan={error} />

            {namaDipilih && (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                Pastikan ini benar namamu: <b>{namaDipilih}</b>. Nilai tercatat atas nama ini.
              </p>
            )}

            <button
              type="submit"
              disabled={sibuk || !siswaId}
              className="w-full rounded-xl bg-gradient-to-br from-navy-600 to-navy-800 py-3 text-sm font-bold text-white shadow-lg shadow-navy-800/25 disabled:opacity-50"
            >
              {sibuk ? "Masuk…" : "Masuk"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function PesanGalat({ pesan }: { pesan: string | null }) {
  if (!pesan) return null;
  return (
    <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {pesan}
    </p>
  );
}
