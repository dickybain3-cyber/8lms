"use client";

import { useMemo, useState, useTransition } from "react";
import {
  hitungUlangNilaiMapel,
  overrideNilai,
  resetUjianSiswa,
  hitungUlangNilaiMapelAdmin,
  overrideNilaiAdmin,
} from "@/app/admin/nilai/actions";
import BadgeJenjang from "@/components/admin/BadgeJenjang";
import type { Jenjang } from "@/lib/jenjang";
import { unduhExcelRekapNilai, type KelasRekapNilai } from "@/lib/excel";

export interface SoalRingkas {
  id: string;
  urutan: number;
  skor: number;
}

export interface BarisNilai {
  siswaId: string;
  nama: string;
  username: string;
  kelasNama: string;
  submitted: boolean;
  totalSkor: number | null;
  isOverride: boolean;
  detailJsonb: Record<string, number>;
}

function fmtSkor(n: number | null) {
  if (n === null) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/**
 * Jumlah benar/salah per siswa, dihitung dari `detailJsonb` (skor yang
 * didapat per soal) dibandingkan skor maksimal soal itu.
 *
 * "Benar" berarti mendapat skor PENUH untuk soal itu (toleransi 0.0001
 * untuk pembulatan angka desimal) — bukan sekadar "dapat skor lebih dari
 * nol". Untuk tipe soal dengan skor sebagian (pilihan ganda kompleks,
 * benar-salah bertingkat), siswa yang benar separuh opsi tetap dihitung
 * "salah" di sini, karena rekap ini merangkum satu angka per soal, dan
 * jawaban yang tidak sepenuhnya benar bukan jawaban yang benar.
 *
 * Soal yang TIDAK ADA sama sekali di `detailJsonb` (tidak dijawab siswa)
 * dihitung sebagai salah, bukan diabaikan — soal yang dilewati tetap
 * soal yang gagal dijawab, dan jumlah benar+salah harus selalu berjumlah
 * sama dengan jumlah soal di mapel ini supaya rekapnya bisa dipercaya.
 */
function hitungBenarSalah(
  detailJsonb: Record<string, number>,
  soalList: SoalRingkas[]
): { benar: number; salah: number } {
  let benar = 0;
  for (const s of soalList) {
    const didapat = detailJsonb[s.id];
    if (didapat !== undefined && didapat >= s.skor - 0.0001) {
      benar++;
    }
  }
  return { benar, salah: soalList.length - benar };
}

function unduhCsv(
  mapelNama: string,
  soalList: SoalRingkas[],
  rows: BarisNilai[]
) {
  const header = [
    "Nama",
    "Username",
    "Kelas",
    "Status",
    ...soalList.map((s) => `Soal ${s.urutan}`),
    "Total Skor",
    "Override Manual",
  ];

  const escape = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const lines = [header.map(escape).join(",")];

  for (const row of rows) {
    const kolomSoal = soalList.map((s) =>
      row.detailJsonb[s.id] !== undefined ? fmtSkor(row.detailJsonb[s.id]) : ""
    );
    lines.push(
      [
        row.nama,
        row.username,
        row.kelasNama,
        row.submitted ? "Sudah submit" : "Belum submit",
        ...kolomSoal,
        fmtSkor(row.totalSkor),
        row.isOverride ? "Ya" : "Tidak",
      ]
        .map(escape)
        .join(",")
    );
  }

  const csv = "\uFEFF" + lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `nilai-${mapelNama.replace(/\s+/g, "_").toLowerCase()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function BarisSiswa({
  row,
  mapelId,
  jenjang,
  isAdmin,
  soalList,
}: {
  row: BarisNilai;
  mapelId: string;
  jenjang: Jenjang;
  /** true kalau admin sedang melihat jenjang mana pun (termasuk jenjang
   *  sesi login-nya sendiri) — menentukan lewat action mana override
   *  ditulis. Lihat komentar di overrideNilaiAdmin()/hitungUlangNilaiMapelAdmin()
   *  di src/app/admin/nilai/actions.ts untuk kenapa dua jalur ini ada. */
  isAdmin: boolean;
  soalList: SoalRingkas[];
}) {
  const [showDetail, setShowDetail] = useState(false);
  const [editing, setEditing] = useState(false);
  const [nilaiInput, setNilaiInput] = useState(String(row.totalSkor ?? 0));
  const [pending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Reset ujian menghapus jawaban & nilai secara permanen, jadi butuh
  // konfirmasi. Dibuat sebagai dua tombol di tempat (bukan window.confirm)
  // supaya konsisten dengan pola AkunAksiButtons.tsx, dan supaya teks
  // konfirmasinya bisa menyebut nama siswa yang benar-benar terdampak.
  const [konfirmReset, setKonfirmReset] = useState(false);
  const [pendingReset, startReset] = useTransition();

  function reset() {
    setErrorMsg(null);
    startReset(async () => {
      const hasil = await resetUjianSiswa({
        jenjang,
        mapelId,
        siswaId: row.siswaId,
      });
      setKonfirmReset(false);
      if (hasil.error) setErrorMsg(hasil.error);
    });
  }

  function simpan() {
    setErrorMsg(null);
    const parsed = Number(nilaiInput.replace(",", "."));
    startTransition(async () => {
      // Guru biasa tetap lewat overrideNilai() lama (cookie-bound, RLS) —
      // itu masih benar untuk jenjang sesi login-nya sendiri. Admin selalu
      // lewat overrideNilaiAdmin() (service_role + log manual), termasuk
      // saat sedang melihat jenjang sesi login-nya sendiri, supaya satu
      // jalur kode konsisten untuknya di jenjang mana pun yang dia lihat.
      const result = isAdmin
        ? await overrideNilaiAdmin({
            jenjang,
            mapelId,
            siswaId: row.siswaId,
            totalSkor: parsed,
          })
        : await overrideNilai({
            mapelId,
            siswaId: row.siswaId,
            totalSkor: parsed,
          });
      if (result.error) {
        setErrorMsg(result.error);
      } else {
        setEditing(false);
      }
    });
  }

  return (
    <>
      <tr className="border-b border-ink/5 last:border-0">
        <td className="py-2.5 pl-3 pr-3">
          <p className="text-sm text-ink">{row.nama}</p>
          <p className="text-xs text-ink/40">
            {row.username} · {row.kelasNama}
          </p>
        </td>
        <td className="py-2.5 pr-3">
          {row.submitted ? (
            <span className="rounded-full bg-ok/10 px-2 py-0.5 text-xs font-medium text-ok">
              Sudah submit
            </span>
          ) : (
            <span className="rounded-full bg-ink/5 px-2 py-0.5 text-xs font-medium text-ink/40">
              Belum submit
            </span>
          )}
        </td>
        <td className="py-2.5 pr-3">
          {editing ? (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                inputMode="decimal"
                value={nilaiInput}
                onChange={(e) => setNilaiInput(e.target.value)}
                className="w-20 rounded border border-ink/15 px-2 py-1 text-sm outline-none focus:border-gold"
              />
              <button
                type="button"
                disabled={pending}
                onClick={simpan}
                className="rounded bg-ink px-2 py-1 text-xs font-medium text-paper hover:bg-ink-light disabled:opacity-50"
              >
                {pending ? "…" : "Simpan"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setErrorMsg(null);
                }}
                className="text-xs text-ink/40 hover:text-ink"
              >
                Batal
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="font-serif text-sm text-ink">
                {fmtSkor(row.totalSkor)}
              </span>
              {row.isOverride && (
                <span className="rounded-full bg-gold/15 px-1.5 py-0.5 text-[10px] font-medium text-gold-dark">
                  override
                </span>
              )}
              {row.submitted && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="text-xs text-teal hover:underline"
                >
                  Ubah
                </button>
              )}
            </div>
          )}
          {errorMsg && <p className="mt-1 text-xs text-danger">{errorMsg}</p>}
        </td>
        <td className="py-2.5 pr-3 text-right">
          {row.submitted && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDetail((v) => !v)}
                className="text-xs text-ink/50 hover:text-ink"
              >
                {showDetail ? "Sembunyikan" : "Detail"}
              </button>

              {konfirmReset ? (
                <span className="flex items-center gap-1.5 rounded-lg bg-red-50 px-2 py-1 ring-1 ring-red-200">
                  <span className="text-[0.7rem] font-semibold text-red-700">
                    Hapus jawaban {row.nama}?
                  </span>
                  <button
                    type="button"
                    disabled={pendingReset}
                    onClick={reset}
                    className="rounded bg-danger px-2 py-0.5 text-[0.7rem] font-bold text-white disabled:opacity-50"
                  >
                    {pendingReset ? "…" : "Ya, reset"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setKonfirmReset(false)}
                    className="text-[0.7rem] font-semibold text-slate-500 hover:text-ink"
                  >
                    Batal
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setKonfirmReset(true)}
                  className="rounded-lg border border-red-200 px-2 py-1 text-[0.7rem] font-bold text-danger transition-colors hover:bg-red-50"
                >
                  <i className="fas fa-rotate-left mr-1" aria-hidden />
                  Reset ujian
                </button>
              )}
            </div>
          )}
        </td>
      </tr>
      {showDetail && (
        <tr className="border-b border-ink/5 bg-paper-dark/30 last:border-0">
          <td colSpan={4} className="px-3 py-3">
            <div className="flex flex-wrap gap-2">
              {soalList.map((s) => (
                <span
                  key={s.id}
                  className="rounded border border-ink/10 bg-white px-2 py-1 text-xs text-ink/70"
                >
                  Soal {s.urutan}:{" "}
                  <span className="font-medium text-ink">
                    {row.detailJsonb[s.id] !== undefined
                      ? fmtSkor(row.detailJsonb[s.id])
                      : "—"}
                  </span>
                  <span className="text-ink/40"> / {fmtSkor(s.skor)}</span>
                </span>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function NilaiTable({
  mapelId,
  mapelNama,
  eventNama,
  tahunAjaran,
  jenjang,
  isAdmin,
  soalList,
  rows,
}: {
  mapelId: string;
  mapelNama: string;
  /** Nama kegiatan (event) tempat mapel ini berada — dipakai di kop rekap
   *  Excel: "PAS Ganjil (7.1)". */
  eventNama: string;
  /** "2026/2027" — dihitung SEKALI di halaman pemanggil dari tanggal
   *  mulai kegiatan (lihat src/lib/tahun-ajaran.ts), bukan di sini, supaya
   *  aturan "tahun ajaran mulai Juli" hanya hidup di satu tempat. */
  tahunAjaran: string;
  /** Database jenjang mana baris-baris ini berasal — dipakai aksi reset. */
  jenjang: Jenjang;
  /** true kalau yang membuka adalah admin (guru.is_admin) — menentukan
   *  apakah override/hitung ulang lewat jalur cookie biasa (guru, RLS)
   *  atau jalur service_role (admin, lintas jenjang). Dioper eksplisit
   *  dari halaman pemanggil (src/app/admin/nilai/page.tsx), BUKAN dibaca
   *  ulang di sini — tabel ini tidak tahu apa-apa soal sesi login. */
  isAdmin: boolean;
  soalList: SoalRingkas[];
  rows: BarisNilai[];
}) {
  const [pendingRecompute, startRecompute] = useTransition();
  const [recomputeMsg, setRecomputeMsg] = useState<string | null>(null);
  const [mengunduh, setMengunduh] = useState(false);

  /**
   * Filter kelas — mapel bisa ditarget ke beberapa kelas sekaligus
   * (mis. semua kelas 7), dan sebelum ini seluruh siswa dari semua kelas
   * itu selalu tercampur jadi satu tabel panjang. Guru yang cuma perlu
   * merekap satu kelas untuk diserahkan ke wali kelasnya harus menyisir
   * sendiri baris mana milik kelas mana.
   *
   * "" berarti "Semua Kelas" — bukan berarti dicampur begitu saja: baik
   * tampilan di layar maupun file yang diunduh tetap MENGELOMPOKKAN per
   * kelas (lihat `kelasUntukUnduhan` di bawah), cuma menampilkan/mengunduh
   * semuanya sekaligus alih-alih satu per satu.
   */
  const [kelasFilter, setKelasFilter] = useState("");

  const daftarKelas = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => r.kelasNama))).sort((a, b) =>
        a.localeCompare(b, "id")
      ),
    [rows]
  );

  const rowsTampil = useMemo(
    () =>
      kelasFilter ? rows.filter((r) => r.kelasNama === kelasFilter) : rows,
    [rows, kelasFilter]
  );

  function hitungUlang() {
    setRecomputeMsg(null);
    startRecompute(async () => {
      const result = isAdmin
        ? await hitungUlangNilaiMapelAdmin({ jenjang, mapelId })
        : await hitungUlangNilaiMapel(mapelId);
      setRecomputeMsg(
        result.error ?? "Nilai berhasil dihitung ulang untuk semua siswa yang sudah submit."
      );
    });
  }

  async function unduhRekap() {
    setMengunduh(true);
    try {
      // Dikelompokkan per kelas TERLEPAS dari kelasFilter tunggal/semua —
      // satu sheet per kelas selalu, sesuai urutan `daftarKelas` yang
      // sudah terurut. Kalau kelasFilter terisi, hasilnya otomatis cuma
      // satu sheet karena `rowsTampil` sudah tersaring duluan.
      const kelasTerlibat = kelasFilter ? [kelasFilter] : daftarKelas;

      const perKelas: KelasRekapNilai[] = kelasTerlibat.map((kNama) => ({
        kelasNama: kNama,
        siswa: rowsTampil
          .filter((r) => r.kelasNama === kNama)
          .map((r) => {
            const { benar, salah } = hitungBenarSalah(
              r.detailJsonb,
              soalList
            );
            return {
              nama: r.nama,
              submitted: r.submitted,
              totalSkor: r.totalSkor,
              isOverride: r.isOverride,
              jumlahBenar: benar,
              jumlahSalah: salah,
            };
          }),
      }));

      await unduhExcelRekapNilai({
        mapelNama,
        eventNama,
        tahunAjaran,
        perKelas,
      });
    } finally {
      setMengunduh(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <BadgeJenjang jenjang={jenjang} />

          {daftarKelas.length > 1 && (
            <select
              value={kelasFilter}
              onChange={(e) => setKelasFilter(e.target.value)}
              aria-label="Saring berdasarkan kelas"
              className="cursor-pointer rounded-md border border-ink/15 bg-white px-2.5 py-1.5 text-xs font-medium text-ink outline-none focus:border-gold"
            >
              <option value="">Semua Kelas</option>
              {daftarKelas.map((k) => (
                <option key={k} value={k}>
                  Kelas {k}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            disabled={pendingRecompute}
            onClick={hitungUlang}
            className="rounded-md border border-ink/15 bg-white px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-gold disabled:opacity-50"
          >
            {pendingRecompute ? "Menghitung ulang…" : "Hitung Ulang Nilai"}
          </button>

          {/*
            Tombol utama: rekap Excel rapi dengan kop sekolah, sesuai yang
            diminta guru. Export CSV detail per-soal tetap ada di
            sebelahnya — bukan dihapus — karena isinya lebih rinci
            (skor tiap butir soal) dan masih berguna untuk audit atau
            impor ke sistem lain; ini bukan file yang cocok dicetak dan
            diserahkan ke wali kelas.
          */}
          <button
            type="button"
            disabled={mengunduh || rowsTampil.length === 0}
            onClick={unduhRekap}
            className="rounded-md bg-ok px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-ok/90 disabled:opacity-50"
          >
            <i
              className={`fas ${mengunduh ? "fa-circle-notch fa-spin" : "fa-file-excel"} mr-1.5`}
              aria-hidden
            />
            {mengunduh
              ? "Menyiapkan…"
              : kelasFilter
                ? `Unduh Rekap Kelas ${kelasFilter}`
                : "Unduh Rekap Nilai (Excel)"}
          </button>

          <button
            type="button"
            onClick={() => unduhCsv(mapelNama, soalList, rowsTampil)}
            className="rounded-md border border-ink/15 bg-white px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-gold"
          >
            Export CSV Detail
          </button>
        </div>
        {recomputeMsg && (
          <p className="text-xs text-ink/60">{recomputeMsg}</p>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-ink/10 bg-white">
        <table className="w-full min-w-[560px] text-left">
          <thead>
            <tr className="border-b border-ink/10 text-xs uppercase tracking-wide text-ink/40">
              <th className="px-3 py-2.5 font-medium">Siswa</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium">Nilai</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {rowsTampil.map((row) => (
              <BarisSiswa
                key={row.siswaId}
                row={row}
                mapelId={mapelId}
                jenjang={jenjang}
                isAdmin={isAdmin}
                soalList={soalList}
              />
            ))}
          </tbody>
        </table>
      </div>

      {rowsTampil.length === 0 && (
        <p className="mt-3 text-center text-xs text-ink/40">
          Tidak ada siswa di kelas ini.
        </p>
      )}
    </div>
  );
}