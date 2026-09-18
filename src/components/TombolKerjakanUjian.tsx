"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Tombol "Kerjakan" dengan loading state.
 *
 * Kenapa nggak pakai <Link> polos: begitu diklik, Link langsung mulai
 * navigasi tanpa tanda apa pun sampai halaman ujian selesai dirender di
 * server. Kalau koneksi siswa lambat, jeda itu terasa seperti macet —
 * siswa jadi klik berkali-kali. Di sini tombol langsung berubah jadi
 * spinner + disabled begitu diklik, jadi jelas "sedang memuat", bukan
 * diam saja.
 */
export default function TombolKerjakanUjian({
  mapelId,
}: {
  mapelId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [diklik, setDiklik] = useState(false);

  const loading = diklik || isPending;

  function handleClick() {
    setDiklik(true);
    startTransition(() => {
      router.push(`/siswa/ujian/${mapelId}`);
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      aria-busy={loading}
      className="btn-primary disabled:cursor-not-allowed disabled:opacity-70"
    >
      {loading ? (
        <>
          <i className="fas fa-circle-notch fa-spin" aria-hidden />
          Memuat...
        </>
      ) : (
        <>
          <i className="fas fa-pen-to-square" aria-hidden />
          Kerjakan
        </>
      )}
    </button>
  );
}