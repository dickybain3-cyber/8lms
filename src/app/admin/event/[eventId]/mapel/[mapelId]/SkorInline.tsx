"use client";

import { useState } from "react";
import {
  updateSkorSoal,
  updateSkorSoalAdmin,
} from "./soal/actions";
import type { Jenjang } from "@/lib/jenjang";

/**
 * Ubah bobot satu soal langsung dari daftar.
 *
 * ── KENAPA ADA ──
 *
 * Menyetel bobot adalah pekerjaan pada SELURUH mapel sekaligus, bukan
 * per butir: guru melihat "total 87" lalu ingin membuatnya pas 100.
 * Untuk itu dia perlu membandingkan bobot antar soal dan menggeser
 * beberapa di antaranya. Sebelum ini, setiap pergeseran berarti membuka
 * halaman edit soal, menunggu seluruh opsi dan gambarnya dimuat,
 * mengubah satu angka, menyimpan, lalu kembali ke daftar — untuk lima
 * puluh butir, itu pekerjaan setengah jam demi mengubah angka.
 *
 * ── PERILAKU YANG DIPILIH ──
 *
 * Menyimpan terjadi saat kolom KEHILANGAN FOKUS atau saat Enter
 * ditekan, bukan pada setiap ketikan. Menyimpan per ketikan akan
 * mengirim "1", "12", "125" sebagai tiga perubahan terpisah ketika guru
 * mengetik "125" — dan dua di antaranya adalah angka yang tidak pernah
 * dia maksud.
 *
 * Nilai lama disimpan terpisah (`nilaiTersimpan`) supaya kolom bisa
 * dikembalikan apa adanya kalau server menolak. Tanpa itu, angka yang
 * ditolak tetap tertinggal di layar dan guru mengira sudah tersimpan.
 */
export default function SkorInline({
  eventId,
  mapelId,
  soalId,
  skorAwal,
  jenjang,
}: {
  eventId: string;
  mapelId: string;
  soalId: string;
  skorAwal: number;
  /** Ada = jalur admin lintas jenjang (service_role di server). */
  jenjang?: Jenjang;
}) {
  const [nilai, setNilai] = useState(String(skorAwal));
  const [nilaiTersimpan, setNilaiTersimpan] = useState(String(skorAwal));
  const [error, setError] = useState<string | null>(null);
  const [baruSimpan, setBaruSimpan] = useState(false);
  // State biasa, bukan `useTransition`. React 18 memperingatkan (dan
  // tidak menjamin perilakunya) kalau fungsi async dioper ke
  // `startTransition` — padahal aksi server memang selalu async, dan
  // penanda "sedang menyimpan" di sini harus bertahan melewati `await`.
  const [pending, setPending] = useState(false);

  function simpan() {
    const bersih = nilai.trim();
    if (bersih === nilaiTersimpan) {
      setError(null);
      return;
    }

    setPending(true);
    void (async () => {
      try {
        const hasil = jenjang
          ? await updateSkorSoalAdmin(jenjang, eventId, mapelId, soalId, bersih)
          : await updateSkorSoal(eventId, mapelId, soalId, bersih);

        if (hasil.error) {
          setError(hasil.error);
          // Dikembalikan ke nilai yang benar-benar ada di database —
          // kalau angka yang ditolak dibiarkan di layar, guru mengira
          // sudah tersimpan.
          setNilai(nilaiTersimpan);
          return;
        }

        setError(null);
        const baru = String(hasil.nilaiBaru ?? bersih);
        setNilai(baru);
        setNilaiTersimpan(baru);
        setBaruSimpan(true);
        setTimeout(() => setBaruSimpan(false), 1600);
      } catch {
        setError("Gagal menyimpan skor. Periksa koneksi lalu coba lagi.");
        setNilai(nilaiTersimpan);
      } finally {
        setPending(false);
      }
    })();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        <label
          htmlFor={`skor-${soalId}`}
          className="text-[0.68rem] font-semibold uppercase tracking-wide text-slate-400"
        >
          Skor
        </label>
        <div className="relative">
          <input
            id={`skor-${soalId}`}
            type="number"
            min={0.5}
            step="0.5"
            value={nilai}
            disabled={pending}
            onChange={(e) => setNilai(e.target.value)}
            onBlur={simpan}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                // `blur()` memicu `onBlur` di atas, jadi penyimpanannya
                // tidak ditulis dua kali. Fokus yang keluar juga memberi
                // isyarat visual bahwa kolomnya sudah "selesai".
                (e.target as HTMLInputElement).blur();
              }
              if (e.key === "Escape") {
                setNilai(nilaiTersimpan);
                setError(null);
                (e.target as HTMLInputElement).blur();
              }
            }}
            className={`w-[4.5rem] rounded-lg border px-2 py-1.5 text-center text-sm font-bold tabular-nums outline-none transition-colors ${
              error
                ? "border-red-300 bg-red-50 text-red-700"
                : baruSimpan
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 bg-white text-ink focus:border-[--primary]"
            } disabled:opacity-50`}
          />
          {pending && (
            <i
              className="fas fa-circle-notch fa-spin absolute -right-5 top-1/2 -translate-y-1/2 text-xs text-slate-400"
              aria-hidden
            />
          )}
          {baruSimpan && !pending && (
            <i
              className="fas fa-check absolute -right-5 top-1/2 -translate-y-1/2 text-xs text-emerald-500"
              aria-hidden
            />
          )}
        </div>
      </div>
      {error && (
        <p className="max-w-[10rem] text-right text-[0.68rem] leading-tight text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
