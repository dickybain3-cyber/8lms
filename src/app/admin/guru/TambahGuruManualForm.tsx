"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { tambahGuruManual } from "./actions";

/**
 * Form tambah SATU guru — bertetangga dengan `ImportGuruForm` (Excel)
 * tapi untuk kasus yang jauh lebih sering di lapangan: satu guru baru
 * masuk di tengah semester, tidak sepadan membuat file Excel untuk itu.
 *
 * Hanya dua bidang yang diminta (Nama, NIP) — username dan password
 * SENGAJA tidak ditanya sama sekali, supaya tidak ada admin yang secara
 * tidak sengaja mengetik username berbeda dari NIP. Aturan itu (username
 * = NIP, password = guru123456) hidup satu tempat di `src/lib/akun.ts`
 * dan `actions.ts`, bukan di form ini.
 */
export default function TambahGuruManualForm() {
  const router = useRouter();
  const [nama, setNama] = useState("");
  const [nip, setNip] = useState("");
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

    const res = await tambahGuruManual(nama, nip);
    setLoading(false);

    if (!res.success) {
      setError(res.error);
      return;
    }

    setHasil({ username: res.username, password: res.password });
    setNama("");
    setNip("");
    router.refresh();
  }

  return (
    <div className="card-mewah p-5">
      <h2 className="mb-1 flex items-center gap-2 font-serif text-base font-bold text-ink">
        <i className="fas fa-user-plus text-[--primary]" aria-hidden />
        Tambah Guru Manual
      </h2>
      <p className="mb-4 text-xs text-ink/50">
        Untuk satu guru baru. Username otomatis = NIP, password awal
        otomatis = <code className="rounded bg-ink/5 px-1">guru123456</code>.
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
            placeholder="mis. Budi Santoso, S.Pd."
            className="w-full rounded-md border border-ink/15 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/30"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-ink/60">
            NIP
          </label>
          <input
            type="text"
            required
            inputMode="numeric"
            value={nip}
            onChange={(e) => setNip(e.target.value)}
            placeholder="mis. 196504121990031005"
            className="w-full rounded-md border border-ink/15 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/30"
          />
          <p className="mt-1 text-[0.7rem] text-ink/40">
            8-25 digit angka. Guru honorer tanpa NIP resmi boleh memakai NIY
            atau nomor pegawai internal sekolah.
          </p>
        </div>

        {error && (
          <p className="rounded-md border border-danger/25 bg-danger/5 px-3 py-2 text-xs text-danger">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-ink px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-ink-light disabled:opacity-60"
        >
          {loading ? (
            <>
              <i className="fas fa-circle-notch fa-spin mr-2" aria-hidden />
              Menyimpan…
            </>
          ) : (
            "Tambah Guru"
          )}
        </button>
      </form>

      {hasil && (
        <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
          <p className="font-semibold">
            <i className="fas fa-circle-check mr-1.5" aria-hidden />
            Akun guru berhasil dibuat.
          </p>
          <p className="mt-1">
            Username: <code className="rounded bg-white px-1">{hasil.username}</code>
            {" · "}
            Password: <code className="rounded bg-white px-1">{hasil.password}</code>
          </p>
          <p className="mt-1 text-emerald-700/70">
            Sampaikan ke guru yang bersangkutan — kombinasi ini tidak
            ditampilkan lagi setelah halaman ini ditutup.
          </p>
        </div>
      )}
    </div>
  );
}
