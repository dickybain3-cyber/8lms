"use client";

import { useState } from "react";
import { muatDistribusiNilai } from "@/app/admin/statistik/actions";
import type { Jenjang } from "@/lib/jenjang";
import type { DistribusiNilai as DistribusiNilaiRow } from "@/types";

/**
 * Distribusi nilai satu mapel, dimuat lazy saat guru klik "Lihat
 * distribusi" — supaya halaman /admin/statistik utama tidak perlu
 * menghitung ini untuk semua mapel sekaligus (lihat RPC
 * get_distribusi_nilai di 0008_statistik_rpc.sql).
 *
 * `jenjang` WAJIB dioper dari baris yang menampilkan mapel ini, bukan
 * ditebak dari cookie sesi: di dashboard gabungan, satu halaman memuat
 * mapel dari ketiga project sekaligus, jadi "project mana" adalah
 * properti dari BARIS, bukan properti dari sesi. Pemuatannya sendiri
 * lewat Server Action (bukan RPC langsung dari browser) karena akses
 * lintas jenjang butuh service_role yang tidak boleh ada di browser —
 * lihat src/app/admin/statistik/actions.ts.
 */
export default function DistribusiNilai({
  mapelId,
  jenjang,
}: {
  mapelId: string;
  jenjang: Jenjang;
}) {
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "error"; pesan: string }
    | { status: "loaded"; data: DistribusiNilaiRow[] }
  >({ status: "idle" });

  async function muat() {
    setState({ status: "loading" });
    const hasil = await muatDistribusiNilai(jenjang, mapelId);

    if (!hasil.ok) {
      setState({ status: "error", pesan: hasil.error });
      return;
    }

    setState({ status: "loaded", data: hasil.data });
  }

  if (state.status === "idle") {
    return (
      <button
        type="button"
        onClick={muat}
        className="text-xs font-medium text-teal hover:underline"
      >
        Lihat distribusi nilai
      </button>
    );
  }

  if (state.status === "loading") {
    return <p className="text-xs text-ink/40">Memuat distribusi…</p>;
  }

  if (state.status === "error") {
    return <p className="text-xs text-danger">{state.pesan}</p>;
  }

  const maksJumlah = Math.max(1, ...state.data.map((d) => d.jumlah));

  if (state.data.length === 0 || state.data.every((d) => d.jumlah === 0)) {
    return (
      <p className="text-xs text-ink/40">
        Belum ada nilai untuk dihitung distribusinya.
      </p>
    );
  }

  return (
    <div className="mt-2 space-y-1.5">
      {state.data.map((d) => (
        <div key={d.rentang} className="flex items-center gap-2">
          <span className="w-16 shrink-0 text-xs text-ink/50">
            {d.rentang}
          </span>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-paper-dark">
            <div
              className="h-full rounded-full bg-teal"
              style={{ width: `${(d.jumlah / maksJumlah) * 100}%` }}
            />
          </div>
          <span className="w-6 shrink-0 text-right text-xs text-ink/60">
            {d.jumlah}
          </span>
        </div>
      ))}
    </div>
  );
}
