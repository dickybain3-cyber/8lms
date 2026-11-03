"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PermintaanKuota } from "@/lib/ai/kuota";
import { putuskanPermintaanAi } from "@/app/admin/soal-ai/actions";

/**
 * Notifikasi permintaan tambahan kuota "Buat Soal AI" di dashboard admin.
 * Setujui = guru itu dapat +1 kali generate untuk hari ini.
 */
export default function PermintaanKuotaAi({
  menunggu,
  riwayat,
  galat,
}: {
  menunggu: PermintaanKuota[];
  riwayat: PermintaanKuota[];
  galat: string[];
}) {
  const router = useRouter();
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);
  const [, mulaiTransisi] = useTransition();

  async function putuskan(p: PermintaanKuota, setuju: boolean) {
    setSibuk(p.id);
    setPesan(null);
    const { error } = await putuskanPermintaanAi(p.jenjang, p.id, setuju);
    setSibuk(null);
    setPesan(error ?? `${p.guruNama}: permintaan ${setuju ? "disetujui (+1 kuota hari ini)" : "ditolak"}.`);
    mulaiTransisi(() => router.refresh());
  }

  if (menunggu.length === 0 && riwayat.length === 0 && galat.length === 0) return null;

  const waktu = (iso: string) =>
    new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <section className="mb-5 rounded-2xl border border-amber-200 bg-white shadow-sm">
      <div className="flex items-center gap-2.5 border-b border-amber-100 px-4 py-3">
        <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
          <i className="fas fa-bell" aria-hidden />
          {menunggu.length > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[0.65rem] font-bold text-white">
              {menunggu.length}
            </span>
          )}
        </span>
        <div>
          <h2 className="font-serif font-bold text-navy-900">Permintaan kuota Buat Soal AI</h2>
          <p className="text-xs text-slate-500">Setujui = guru mendapat 1 kali generate lagi untuk hari ini.</p>
        </div>
      </div>

      {galat.length > 0 && (
        <p className="border-b border-slate-100 px-4 py-2 text-xs text-amber-800">
          <i className="fas fa-triangle-exclamation mr-1.5" aria-hidden />
          {galat.join(" ")}
        </p>
      )}

      {menunggu.length === 0 ? (
        <p className="px-4 py-3 text-sm text-slate-500">Tidak ada permintaan yang menunggu.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {menunggu.map((p) => (
            <li key={p.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">
                  {p.guruNama}{" "}
                  <span className="ml-1 rounded-full bg-navy-50 px-2 py-0.5 text-[0.7rem] font-semibold text-navy-700">
                    Kelas {p.jenjang}
                  </span>
                </p>
                <p className="text-xs text-slate-500">
                  {waktu(p.dibuatAt)}
                  {p.alasan ? ` · “${p.alasan}”` : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => putuskan(p, false)}
                  disabled={sibuk !== null}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                >
                  <i className="fas fa-xmark mr-1" aria-hidden />
                  Tolak
                </button>
                <button
                  type="button"
                  onClick={() => putuskan(p, true)}
                  disabled={sibuk !== null}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
                >
                  <i className={`fas ${sibuk === p.id ? "fa-circle-notch fa-spin" : "fa-check"} mr-1`} aria-hidden />
                  Setujui
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {pesan && <p className="border-t border-slate-100 px-4 py-2 text-xs font-medium text-navy-700">{pesan}</p>}

      {riwayat.length > 0 && (
        <details className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
          <summary className="cursor-pointer font-semibold">Keputusan terakhir</summary>
          <ul className="mt-1.5 space-y-1">
            {riwayat.map((p) => (
              <li key={p.id}>
                {p.guruNama} (kelas {p.jenjang}) —{" "}
                <b className={p.status === "disetujui" ? "text-emerald-700" : "text-rose-600"}>{p.status}</b>
                {p.diputusOleh ? ` oleh ${p.diputusOleh}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
