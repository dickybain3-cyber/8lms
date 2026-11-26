"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { keluarSesi } from "../actions";
import { formatSisaWaktu } from "@/lib/ujian";

export interface SubtesPortal {
  mapelId: string;
  nama: string;
  durasiMenit: number;
  jumlahSoal: number;
  status: "belum" | "mengerjakan" | "selesai";
  deadline: string | null;
  nilai: number | null;
}

/**
 * Daftar subtes satu paket. Urutan bebas; tiap subtes sekali. Siswa boleh
 * keluar setelah satu subtes dan kembali lagi (token lagi) selama paket
 * belum ditutup.
 */
export default function PortalPaket({
  eventId,
  eventNama,
  paketNama,
  paketTutup,
  paketSudahTutup,
  siswaNama,
  kelas,
  subtes,
  serverNow,
  pesan,
}: {
  eventId: string;
  eventNama: string;
  paketNama: string;
  paketTutup: string;
  paketSudahTutup: boolean;
  siswaNama: string;
  kelas: string;
  subtes: SubtesPortal[];
  serverNow: string;
  pesan: string | null;
}) {
  const router = useRouter();
  const [konfirmasi, setKonfirmasi] = useState<SubtesPortal | null>(null);
  const [sibuk, mulai] = useTransition();
  const [offset] = useState(() => new Date(serverNow).getTime() - Date.now());
  const [sekarang, setSekarang] = useState(() => Date.now() + offset);

  useEffect(() => {
    const t = setInterval(() => setSekarang(Date.now() + offset), 1000);
    return () => clearInterval(t);
  }, [offset]);

  const selesai = subtes.filter((s) => s.status === "selesai").length;
  const semuaSelesai = subtes.length > 0 && selesai === subtes.length;

  function bukanSaya() {
    mulai(async () => {
      await keluarSesi();
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{eventNama}</p>
        <h1 className="font-serif text-xl font-extrabold text-navy-900">{paketNama}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
          <span>
            <i className="fas fa-user-graduate mr-1.5 text-slate-400" aria-hidden />
            <b className="text-ink">{siswaNama}</b> · Kelas {kelas}
          </span>
          <span>
            <i className="fas fa-lock mr-1.5 text-slate-400" aria-hidden />
            Ditutup {paketTutup}
          </span>
        </div>
        <button
          type="button"
          onClick={bukanSaya}
          disabled={sibuk}
          className="mt-3 text-xs font-semibold text-slate-500 underline"
        >
          Bukan saya / ganti paket
        </button>
      </div>

      {pesan === "selesai" && (
        <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <i className="fas fa-circle-check mr-1.5" aria-hidden />
          Jawaban terkumpul. {semuaSelesai ? "Semua subtes selesai — terima kasih!" : "Lanjutkan subtes lain kapan saja sebelum paket ditutup."}
        </p>
      )}
      {pesan === "sesi" && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Subtes itu tidak bisa dibuka. Pilih subtes dari daftar di bawah.
        </p>
      )}

      <p className="mb-2 text-sm font-semibold text-ink">
        Subtes ({selesai}/{subtes.length} selesai) — boleh dikerjakan dengan urutan bebas
      </p>

      <ul className="space-y-3">
        {subtes.map((s) => {
          const sisa = s.deadline ? new Date(s.deadline).getTime() - sekarang : null;
          return (
            <li key={s.mapelId} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{s.nama}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {s.jumlahSoal} soal · {s.durasiMenit} menit
                  </p>
                </div>
                {s.status === "selesai" ? (
                  <div className="text-right">
                    <p className="text-[0.65rem] font-semibold uppercase text-slate-500">Nilai</p>
                    <p className="font-serif text-2xl font-extrabold tabular-nums text-navy-900">
                      {s.nilai === null ? "—" : s.nilai.toLocaleString("id-ID", { maximumFractionDigits: 1 })}
                    </p>
                  </div>
                ) : s.status === "mengerjakan" ? (
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                    Sisa {sisa !== null ? formatSisaWaktu(sisa) : "—"}
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">Belum</span>
                )}
              </div>

              {s.status === "mengerjakan" && (
                <Link
                  prefetch={false}
                  href={`/tryout/${eventId}/kerjakan/${s.mapelId}`}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-white"
                >
                  <i className="fas fa-play" aria-hidden />
                  Lanjutkan
                </Link>
              )}
              {s.status === "belum" &&
                (paketSudahTutup ? (
                  <p className="mt-3 text-xs text-slate-500">Paket sudah ditutup.</p>
                ) : s.jumlahSoal === 0 ? (
                  <p className="mt-3 text-xs text-slate-500">Soal belum tersedia.</p>
                ) : (
                  <button
                    type="button"
                    onClick={() => setKonfirmasi(s)}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-navy-600 to-navy-800 py-2.5 text-sm font-bold text-white shadow-md shadow-navy-800/20"
                  >
                    <i className="fas fa-pen-to-square" aria-hidden />
                    Mulai Kerjakan
                  </button>
                ))}
            </li>
          );
        })}
      </ul>

      {konfirmasi && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 sm:items-center" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="font-serif text-lg font-extrabold text-navy-900">Mulai {konfirmasi.nama}?</h2>
            <ul className="mt-3 space-y-1.5 text-sm text-slate-600">
              <li>• Waktu {konfirmasi.durasiMenit} menit langsung berjalan.</li>
              <li>• Keluar di tengah jalan tidak menghentikan waktu.</li>
              <li>• Waktu habis = jawaban otomatis terkumpul.</li>
              <li>• Subtes ini hanya bisa dikerjakan sekali.</li>
            </ul>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setKonfirmasi(null)}
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600"
              >
                Batal
              </button>
              <Link
                prefetch={false}
                href={`/tryout/${eventId}/kerjakan/${konfirmasi.mapelId}`}
                className="flex flex-1 items-center justify-center rounded-xl bg-gradient-to-br from-navy-600 to-navy-800 py-2.5 text-sm font-bold text-white"
              >
                Mulai
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
