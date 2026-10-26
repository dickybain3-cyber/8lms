"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { tambahSiswaManual } from "./actions";

/**
 * Form tambah SATU siswa — bertetangga dengan `ImportSiswaForm` (Excel)
 * untuk kasus siswa pindahan atau susulan pendaftaran yang datang satu-
 * dua orang di tengah semester.
 *
 * Password TIDAK diminta dari admin — dibuat acak 3 huruf + 3 angka dan
 * ditampilkan sekali di sini untuk ditulis di kartu login siswa. Username
 * boleh dikosongkan: dibuat otomatis dari nama (lihat `src/lib/akun.ts`).
 */
export default function TambahSiswaManualForm({
  kelasList,
}: {
  kelasList: { id: string; nama: string }[];
}) {
  const router = useRouter();
  const [nama, setNama] = useState("");
  const [username, setUsername] = useState("");
  const [kelasId, setKelasId] = useState(kelasList[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasil, setHasil] = useState<{ username: string; password: string } | null>(
    null
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setHasil(null);

    const res = await tambahSiswaManual(nama, username, kelasId);
    setLoading(false);

    if (!res.success) {
      setError(res.error);
      return;
    }

    setHasil({ username: res.username, password: res.password });
    setNama("");
    setUsername("");
    router.refresh();
  }

  return (
    <div className="card-mewah p-5">
      <h2 className="mb-1 flex items-center gap-2 font-serif text-base font-bold text-ink">
        <i className="fas fa-user-graduate text-[--primary]" aria-hidden />
        Tambah Siswa Manual
      </h2>
      <p className="mb-4 text-xs text-ink/50">
        Username dari nama (boleh diisi sendiri), password acak 3 huruf +
        3 angka — siswa login dengan keduanya.
      </p>

      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink/60">
            Nama Lengkap
          </label>
          <input
            type="text"
            required
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            placeholder="mis. Ahmad Fauzi"
            className="w-full rounded-md border border-ink/15 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/30"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink/60">
              Username <span className="font-normal text-ink/40">(opsional)</span>
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="otomatis dari nama"
              className="w-full rounded-md border border-ink/15 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink/60">
              Kelas
            </label>
            <select
              required
              value={kelasId}
              onChange={(e) => setKelasId(e.target.value)}
              className="w-full rounded-md border border-ink/15 bg-white px-3 py-2 text-sm text-ink"
            >
              {kelasList.length === 0 && <option value="">Belum ada kelas</option>}
              {kelasList.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.nama}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <p className="rounded-md border border-danger/25 bg-danger/5 px-3 py-2 text-xs text-danger">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || kelasList.length === 0}
          className="w-full rounded-md bg-ink px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-ink-light disabled:opacity-60"
        >
          {loading ? (
            <>
              <i className="fas fa-circle-notch fa-spin mr-2" aria-hidden />
              Menyimpan…
            </>
          ) : (
            "Tambah Siswa"
          )}
        </button>
      </form>

      {hasil && (
        <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
          <p className="font-semibold">
            <i className="fas fa-circle-check mr-1.5" aria-hidden />
            Akun siswa berhasil dibuat.
          </p>
          <p className="mt-1">
            Username: <code className="rounded bg-white px-1">{hasil.username}</code>
            {" · "}
            Password: <code className="rounded bg-white px-1">{hasil.password}</code>
          </p>
          <p className="mt-1 text-emerald-700/70">
            Password hanya tampil sekali — catat sekarang untuk kartu login
            siswa. Kalau terlewat, pakai tombol Reset password di tabel.
          </p>
        </div>
      )}
    </div>
  );
}
