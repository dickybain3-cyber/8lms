"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { JENJANG_LABEL, type Jenjang } from "@/lib/jenjang";
import { MENIT_KODE_PENGAMAN } from "@/lib/pengawasan-ujian";
import { ambilKodePengaman, type KodePengamanJenjang } from "./actions";

/** Sama dengan warna banner jenjang di AdminShell, supaya admin tidak
 *  salah membacakan kode kelas 7 ke siswa kelas 9. */
const WARNA: Record<Jenjang, string> = {
  7: "from-emerald-600 to-emerald-500",
  8: "from-blue-600 to-blue-500",
  9: "from-amber-600 to-amber-500",
};

const SLOT_MS = MENIT_KODE_PENGAMAN * 60_000;

function formatSisa(ms: number): string {
  const detik = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(detik / 60);
  const s = detik % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function KodePengamanClient({
  awal,
}: {
  awal: KodePengamanJenjang[];
}) {
  const [data, setData] = useState(awal);
  const [galat, setGalat] = useState<string | null>(null);
  const [sekarang, setSekarang] = useState(() => Date.now());
  /** serverNow - Date.now() saat kode terakhir diambil. Jam laptop admin
   *  bisa meleset; hitung mundur memakai jam server. */
  const offsetRef = useRef(0);
  const memuatRef = useRef(false);

  const pasangOffset = useCallback((d: KodePengamanJenjang[]) => {
    const srv = d.find((x) => x.serverNow)?.serverNow;
    if (srv) offsetRef.current = new Date(srv).getTime() - Date.now();
  }, []);

  useEffect(() => {
    pasangOffset(awal);
  }, [awal, pasangOffset]);

  const muat = useCallback(async () => {
    if (memuatRef.current) return;
    memuatRef.current = true;
    try {
      const baru = await ambilKodePengaman();
      pasangOffset(baru);
      setData(baru);
      setGalat(null);
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal memuat kode.");
    } finally {
      memuatRef.current = false;
    }
  }, [pasangOffset]);

  // Detak 1 detik untuk hitung mundur; begitu ada kode yang lewat masa
  // berlakunya, ambil yang baru (jeda 1 detik supaya slot server sudah
  // pasti berganti).
  useEffect(() => {
    const id = setInterval(() => {
      const kini = Date.now();
      setSekarang(kini);
      const lewat = data.some(
        (d) =>
          d.berlakuSampai &&
          new Date(d.berlakuSampai).getTime() + 1000 <= kini + offsetRef.current
      );
      if (lewat) void muat();
    }, 1000);
    return () => clearInterval(id);
  }, [data, muat]);

  // Kembali ke tab setelah lama ditinggal: langsung segarkan.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void muat();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [muat]);

  const kiniServer = sekarang + offsetRef.current;

  return (
    <div>
      {galat && (
        <p className="mb-4 rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
          {galat}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {data.map((d) => {
          const sisa = d.berlakuSampai
            ? new Date(d.berlakuSampai).getTime() - kiniServer
            : 0;
          const persen = Math.min(100, Math.max(0, (sisa / SLOT_MS) * 100));
          return (
            <div
              key={d.jenjang}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            >
              <div
                className={`bg-gradient-to-r ${WARNA[d.jenjang]} px-4 py-2.5 text-sm font-bold text-white`}
              >
                {JENJANG_LABEL[d.jenjang]}
              </div>
              <div className="p-4 text-center">
                {d.kode ? (
                  <>
                    <p
                      className="font-mono text-4xl font-extrabold tracking-[0.25em] text-navy-900 tabular-nums"
                      aria-label={`Kode ${JENJANG_LABEL[d.jenjang]}: ${d.kode.split("").join(" ")}`}
                    >
                      {d.kode.slice(0, 3)}
                      <span className="text-slate-300"> </span>
                      {d.kode.slice(3)}
                    </p>
                    <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${WARNA[d.jenjang]} transition-[width] duration-1000 ease-linear`}
                        style={{ width: `${persen}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      Berganti dalam{" "}
                      <span className="font-semibold tabular-nums text-slate-700">
                        {formatSisa(sisa)}
                      </span>
                    </p>
                  </>
                ) : (
                  <p className="py-4 text-sm text-danger">
                    {d.error ?? "Kode tidak tersedia."}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <ul className="mt-5 space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <li>• Kode hanya berlaku untuk siswa di jenjang yang sama.</li>
        <li>
          • Salah kode 5 kali dalam 1 menit: siswa harus menunggu 1 menit
          sebelum mencoba lagi.
        </li>
        <li>
          • Setelah kunci dibuka, pelanggaran berikutnya langsung mengunci
          lagi. Jumlah pelanggaran tiap siswa terlihat di Pantau Ujian.
        </li>
      </ul>
    </div>
  );
}
