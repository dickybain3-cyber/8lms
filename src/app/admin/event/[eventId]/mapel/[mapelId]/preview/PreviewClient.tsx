"use client";

import { useState } from "react";
import Link from "next/link";
import SoalViewer from "@/components/siswa/SoalViewer/SoalViewer";
import type { SoalSiswa } from "@/types";
import { TIPE_LABEL } from "@/lib/soal";
import { TOMBOL_BIASA, TOMBOL_UTAMA } from "@/components/ui/Panel";

/**
 * Pratinjau ujian — persis seperti yang dilihat siswa.
 *
 * ── KENAPA MEMAKAI <SoalViewer> YANG SAMA, BUKAN TAMPILAN TIRUAN ──
 *
 * Satu-satunya gunanya pratinjau adalah menjawab pertanyaan "apakah
 * soal ini benar-benar bisa dibaca dan dijawab siswa?". Pratinjau yang
 * ditulis ulang dengan markup sendiri tidak bisa menjawab itu: begitu
 * ada perbedaan sekecil apa pun antara tiruan dan aslinya — gambar yang
 * ukurannya beda, opsi yang di aslinya terpotong — pratinjaunya justru
 * berbohong, dan lebih berbahaya daripada tidak ada pratinjau sama
 * sekali. Jadi komponen ini memanggil `SoalViewer` yang sama persis
 * dengan yang dipakai halaman ujian sungguhan.
 *
 * ── KENAPA KUNCI JAWABAN DIBUANG DI SERVER, BUKAN DI SINI ──
 *
 * Halaman servernya (page.tsx) yang membersihkan `konten_jsonb` dari
 * field kunci sebelum dikirim ke komponen ini, meniru apa yang
 * dilakukan RPC `get_soal_untuk_siswa`. Bukan karena guru tidak boleh
 * tahu kuncinya — dia yang membuatnya — tapi karena pratinjau harus
 * memperlihatkan data yang BENTUKNYA sama dengan yang diterima siswa.
 * Kalau di sini kuncinya masih ada, soal yang diam-diam bergantung pada
 * field kunci untuk bisa dirender akan terlihat normal di pratinjau dan
 * baru rusak saat ujian berlangsung.
 *
 * Jawaban yang diketik di pratinjau disimpan di state lokal dan tidak
 * pernah dikirim ke mana pun — gunanya cuma supaya guru bisa mencoba
 * mengklik opsinya, seperti siswa nanti.
 */
export default function PreviewClient({
  soalList,
  mapelNama,
  kembaliHref,
  totalSkor,
}: {
  soalList: SoalSiswa[];
  mapelNama: string;
  kembaliHref: string;
  totalSkor: number;
}) {
  const [indeks, setIndeks] = useState(0);
  const [jawaban, setJawaban] = useState<Record<string, unknown>>({});
  const [modeGulir, setModeGulir] = useState(false);

  const soal = soalList[indeks];
  const jumlah = soalList.length;

  function setJawabanSoal(soalId: string, val: unknown) {
    setJawaban((j) => ({ ...j, [soalId]: val }));
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href={kembaliHref} className={TOMBOL_BIASA}>
          <i className="fas fa-arrow-left" aria-hidden />
          Kembali ke daftar soal
        </Link>
        <button
          type="button"
          onClick={() => setModeGulir((m) => !m)}
          className={TOMBOL_BIASA}
        >
          <i
            className={`fas ${modeGulir ? "fa-window-maximize" : "fa-scroll"}`}
            aria-hidden
          />
          {modeGulir ? "Mode satu per satu" : "Lihat semua sekaligus"}
        </button>
      </div>

      {/*
        Pita ini memakai garis diagonal supaya tidak mungkin tertukar
        dengan halaman ujian sungguhan. Guru yang membuka pratinjau lalu
        beralih tab dan kembali beberapa menit kemudian harus bisa tahu
        dalam sekejap bahwa ini bukan ujian yang sedang berjalan.
      */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50 px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-bold text-amber-900">
          <i className="fas fa-eye" aria-hidden />
          MODE PRATINJAU — {mapelNama}
        </p>
        <p className="text-[0.72rem] font-medium text-amber-700">
          {jumlah} soal · total skor {totalSkor} · jawaban di sini tidak
          disimpan
        </p>
      </div>

      {modeGulir ? (
        <div className="space-y-4">
          {soalList.map((s, i) => (
            <article
              key={s.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)]"
            >
              <KepalaSoal nomor={i + 1} soal={s} />
              <SoalViewer
                soal={s}
                value={jawaban[s.id]}
                onChange={(v) => setJawabanSoal(s.id, v)}
              />
            </article>
          ))}
        </div>
      ) : (
        <>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
            <KepalaSoal nomor={indeks + 1} soal={soal} />
            <SoalViewer
              soal={soal}
              value={jawaban[soal.id]}
              onChange={(v) => setJawabanSoal(soal.id, v)}
            />
          </article>

          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              disabled={indeks === 0}
              onClick={() => setIndeks((i) => Math.max(0, i - 1))}
              className={`${TOMBOL_BIASA} disabled:opacity-40`}
            >
              <i className="fas fa-chevron-left" aria-hidden />
              Sebelumnya
            </button>
            <span className="text-sm font-semibold tabular-nums text-slate-500">
              {indeks + 1} / {jumlah}
            </span>
            <button
              type="button"
              disabled={indeks >= jumlah - 1}
              onClick={() => setIndeks((i) => Math.min(jumlah - 1, i + 1))}
              className={`${TOMBOL_UTAMA} disabled:opacity-40`}
            >
              Berikutnya
              <i className="fas fa-chevron-right" aria-hidden />
            </button>
          </div>

          {/* Peta nomor soal, sama seperti yang dipunyai siswa. */}
          <div className="mt-5 flex flex-wrap gap-1.5">
            {soalList.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setIndeks(i)}
                aria-label={`Ke soal ${i + 1}`}
                className={`h-9 w-9 rounded-lg text-xs font-bold tabular-nums transition-colors ${
                  i === indeks
                    ? "bg-gradient-to-br from-[#3b82f6] to-[#2563eb] text-white shadow-md"
                    : jawaban[s.id] !== undefined
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function KepalaSoal({ nomor, soal }: { nomor: number; soal: SoalSiswa }) {
  return (
    <div className="mb-4 flex items-center gap-2.5 border-b border-slate-100 pb-3">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-xs font-bold text-white">
        {nomor}
      </span>
      <span className="rounded-full bg-teal/10 px-2.5 py-1 text-[0.7rem] font-semibold text-teal">
        {TIPE_LABEL[soal.tipe]}
      </span>
      <span className="ml-auto text-[0.72rem] font-semibold text-slate-400">
        Skor {Number(soal.skor)}
      </span>
    </div>
  );
}
