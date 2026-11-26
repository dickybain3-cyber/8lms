"use client";

import { useEffect, useState } from "react";
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
  hpSrc,
  tertanam = false,
}: {
  soalList: SoalSiswa[];
  mapelNama: string;
  /** Tidak dipakai saat `tertanam` (isi iframe HP). */
  kembaliHref?: string;
  totalSkor: number;
  /** Alamat halaman /pratinjau/... untuk iframe "tampilan HP". */
  hpSrc?: string;
  /** true = sedang dirender DI DALAM iframe HP: tanpa tombol kembali
   *  dan tanpa pilihan perangkat (supaya tidak ada HP di dalam HP). */
  tertanam?: boolean;
}) {
  const [indeks, setIndeks] = useState(0);
  const [jawaban, setJawaban] = useState<Record<string, unknown>>({});
  const [modeGulir, setModeGulir] = useState(false);
  const [perangkat, setPerangkatState] = useState<Perangkat>("laptop");

  // Pilihan terakhir guru diingat per browser (kenyamanan saja).
  useEffect(() => {
    try {
      const v = localStorage.getItem(KUNCI_PERANGKAT);
      if (v === "hp" || v === "laptop") setPerangkatState(v);
    } catch {
      /* penyimpanan diblokir — pakai bawaan */
    }
  }, []);

  function setPerangkat(p: Perangkat) {
    setPerangkatState(p);
    try {
      localStorage.setItem(KUNCI_PERANGKAT, p);
    } catch {
      /* abaikan */
    }
  }

  const soal = soalList[indeks];
  const jumlah = soalList.length;
  const modeHp = !tertanam && perangkat === "hp" && !!hpSrc;

  function setJawabanSoal(soalId: string, val: unknown) {
    setJawaban((j) => ({ ...j, [soalId]: val }));
  }

  const pitaPratinjau = (
    /*
      Pita ini memakai garis putus-putus supaya tidak mungkin tertukar
      dengan halaman ujian sungguhan. Guru yang membuka pratinjau lalu
      beralih tab dan kembali beberapa menit kemudian harus bisa tahu
      dalam sekejap bahwa ini bukan ujian yang sedang berjalan.
    */
    <div
      className={`flex flex-wrap items-center justify-between gap-2 rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50 ${
        tertanam ? "mb-3 px-3 py-2" : "mb-5 px-4 py-3"
      }`}
    >
      <p className="flex items-center gap-2 text-sm font-bold text-amber-900">
        <i className="fas fa-eye" aria-hidden />
        MODE PRATINJAU — {mapelNama}
      </p>
      <p className="text-[0.72rem] font-medium text-amber-700">
        {jumlah} soal · total skor {totalSkor} · jawaban di sini tidak
        disimpan
      </p>
    </div>
  );

  return (
    <div className={modeHp ? "mx-auto max-w-4xl" : tertanam ? "" : "mx-auto max-w-2xl"}>
      <div
        className={`flex flex-wrap items-center justify-between gap-3 ${
          tertanam ? "mb-3" : "mb-4"
        }`}
      >
        {!tertanam && kembaliHref && (
          <Link href={kembaliHref} className={TOMBOL_BIASA}>
            <i className="fas fa-arrow-left" aria-hidden />
            Kembali ke daftar soal
          </Link>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {!tertanam && hpSrc && (
            <div
              role="group"
              aria-label="Tampilan perangkat"
              className="inline-flex rounded-xl border border-slate-200 bg-white p-1"
            >
              {(
                [
                  ["laptop", "fa-laptop", "Laptop"],
                  ["hp", "fa-mobile-screen-button", "HP"],
                ] as const
              ).map(([nilai, ikon, label]) => (
                <button
                  key={nilai}
                  type="button"
                  onClick={() => setPerangkat(nilai)}
                  aria-pressed={perangkat === nilai}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                    perangkat === nilai
                      ? "bg-ink text-white shadow-sm"
                      : "text-slate-500 hover:bg-slate-100"
                  }`}
                >
                  <i className={`fas ${ikon}`} aria-hidden />
                  {label}
                </button>
              ))}
            </div>
          )}
          {!modeHp && (
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
          )}
        </div>
      </div>

      {modeHp ? (
        <BingkaiHp src={hpSrc!} />
      ) : (
        <>
          {pitaPratinjau}
          {isiPratinjau()}
        </>
      )}
    </div>
  );

  function isiPratinjau() {
    return (
      <>
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
                    ? "bg-gradient-to-br from-navy-600 to-navy-800 text-white shadow-md"
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
      </>
    );
  }
}

type Perangkat = "laptop" | "hp";
const KUNCI_PERANGKAT = "lms_pratinjau_perangkat";

/**
 * Ukuran layar HP Android kelas menengah (CSS px) — kebanyakan siswa
 * memakai HP sekelas ini. Iframe-lah "layarnya", jadi breakpoint `sm:`,
 * `svh`, dan `100vw` di SoalViewer berperilaku persis seperti di HP.
 */
const UKURAN_HP = [
  { label: "HP kecil", lebar: 360, tinggi: 740 },
  { label: "HP besar", lebar: 412, tinggi: 860 },
] as const;

function BingkaiHp({ src }: { src: string }) {
  const [pilihan, setPilihan] = useState(0);
  const ukuran = UKURAN_HP[pilihan];

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-slate-500">
        {UKURAN_HP.map((u, i) => (
          <button
            key={u.label}
            type="button"
            onClick={() => setPilihan(i)}
            aria-pressed={pilihan === i}
            className={`rounded-full px-3 py-1 font-semibold transition-colors ${
              pilihan === i
                ? "bg-teal/15 text-teal"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
          >
            {u.label} · {u.lebar}×{u.tinggi}
          </button>
        ))}
      </div>

      {/* Bingkai HP. max-w-full + overflow supaya tetap muat bila guru
          sendiri membukanya dari layar sempit. */}
      <div className="max-w-full overflow-x-auto">
        <div className="rounded-[2.6rem] bg-slate-900 p-3 shadow-[0_20px_50px_-12px_rgba(15,23,42,0.45)]">
          <div className="mx-auto mb-2 h-1.5 w-16 rounded-full bg-slate-700" aria-hidden />
          <iframe
            key={ukuran.lebar}
            src={src}
            title="Pratinjau tampilan HP siswa"
            width={ukuran.lebar}
            height={ukuran.tinggi}
            style={{ width: ukuran.lebar, height: ukuran.tinggi }}
            className="block rounded-[1.6rem] border-0 bg-white"
          />
          <div className="mx-auto mt-2 h-1 w-24 rounded-full bg-slate-700" aria-hidden />
        </div>
      </div>

      <p className="max-w-sm text-center text-[0.72rem] text-slate-400">
        Gulir di dalam layar HP. Jawaban yang diklik di sini tidak disimpan.
      </p>
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
