"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DAFTAR_MAPEL } from "@/lib/akun-impor";
import { PASSWORD_AWAL_GURU } from "@/lib/akun";
import { tambahGuruManual } from "./actions";

/**
 * Form tambah SATU guru. Nama, NIP, Mapel (dropdown dari DAFTAR_MAPEL
 * supaya ejaannya seragam). Username & password boleh diisi; kosong =
 * username NIP, password awal guru123456.
 */
export default function TambahGuruManualForm() {
  const router = useRouter();
  const [nama, setNama] = useState("");
  const [nip, setNip] = useState("");
  const [mapel, setMapel] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasil, setHasil] = useState<{ username: string; password: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setHasil(null);

    const res = await tambahGuruManual(nama, nip, mapel, username, password);
    setLoading(false);

    if (!res.success) {
      setError(res.error);
      return;
    }

    setHasil({ username: res.username, password: res.password });
    setNama("");
    setNip("");
    setUsername("");
    setPassword("");
    router.refresh();
  }

  const input =
    "w-full rounded-md border border-ink/15 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/30";
  const label = "mb-1 block text-xs font-medium text-ink/60";

  return (
    <div className="card-mewah p-5">
      <h2 className="mb-1 flex items-center gap-2 font-serif text-base font-bold text-ink">
        <i className="fas fa-user-plus text-[--primary]" aria-hidden />
        Tambah Guru Manual
      </h2>
      <p className="mb-4 text-xs text-ink/50">
        Username & password boleh diisi sendiri. Dikosongkan = username NIP, password{" "}
        <code className="rounded bg-ink/5 px-1">{PASSWORD_AWAL_GURU}</code>.
      </p>

      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className={label}>Nama Lengkap</label>
          <input
            type="text"
            required
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            placeholder="mis. Budi Santoso, S.Pd."
            className={input}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={label}>NIP</label>
            <input
              type="text"
              required
              inputMode="numeric"
              value={nip}
              onChange={(e) => setNip(e.target.value)}
              placeholder="18 digit"
              className={input}
            />
          </div>
          <div>
            <label className={label}>Mapel</label>
            <select value={mapel} onChange={(e) => setMapel(e.target.value)} className={input}>
              <option value="">— pilih mapel —</option>
              {DAFTAR_MAPEL.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={label}>
              Username <span className="font-normal text-ink/40">(opsional)</span>
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="kosong = NIP"
              autoComplete="off"
              className={input}
            />
          </div>
          <div>
            <label className={label}>
              Password <span className="font-normal text-ink/40">(opsional)</span>
            </label>
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={PASSWORD_AWAL_GURU}
              autoComplete="off"
              className={`${input} font-mono`}
            />
          </div>
        </div>

        {error && (
          <p className="rounded-md border border-danger/25 bg-danger/5 px-3 py-2 text-xs text-danger">{error}</p>
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
        </div>
      )}
    </div>
  );
}
