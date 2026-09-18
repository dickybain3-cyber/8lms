"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  benihAcak,
  buatDenah,
  type HasilDenah,
  type KonfigRuang,
  type SiswaDenah,
} from "@/lib/denah";
import {
  LembarDenah,
  LembarKartu,
  LembarPresensi,
} from "@/components/admin/cetak/LembarCetak";
import {
  KotakAngka,
  PratinjauDenah,
  PratinjauKartu,
  PratinjauPresensi,
} from "@/components/admin/denah/PreviewHasil";
import type { Jenjang } from "@/lib/jenjang";

/**
 * Antarmuka pengacakan tempat duduk. Seluruh perhitungan berjalan di
 * browser (lihat src/lib/denah.ts) — halaman ini murni mengumpulkan
 * pengaturan, menampilkan hasil, dan menyiapkan cetakan.
 *
 * ── KENAPA HASILNYA BELUM DISIMPAN KE DATABASE ──
 *
 * Ini keputusan sadar untuk versi pertama, bukan hal yang terlupa.
 * Menyimpan denah ke database berarti membuat tabel baru DI KETIGA
 * project Supabase (satu siswa hanya ada di project jenjangnya sendiri,
 * jadi satu meja lintas jenjang akan terbelah menjadi dua baris di dua
 * database yang berbeda). Itu pekerjaan migrasi tiga kali lipat yang
 * tidak bisa diuji tuntas sebelum uji coba hari Sabtu, untuk sesuatu yang
 * tidak dibutuhkan saat ujian berlangsung: ujiannya sendiri tidak membaca
 * tempat duduk sama sekali.
 *
 * Sebagai gantinya, hasil diamankan dengan dua cara yang sudah cukup:
 *
 *   1. Pengaturan (daftar ruang + benih acak) disimpan di localStorage
 *      peramban ini. Membuka halaman ini lagi akan memulihkan susunan
 *      yang SAMA PERSIS — bukan susunan baru — karena pengacakannya
 *      berbenih (lihat catatan panjang di src/lib/denah.ts).
 *   2. Tombol "Unduh berkas denah" menyimpan pengaturan itu sebagai
 *      berkas .json yang bisa dibuka lagi di komputer lain. Ini yang
 *      dipakai kalau kartu dicetak di komputer TU tapi presensi dicetak
 *      di komputer lain.
 *
 * Yang HARUS diketahui: susunan hanya berubah kalau kamu menekan "Acak
 * ulang" atau mengubah daftar ruang. Jangan menekan "Acak ulang" setelah
 * kartu peserta dicetak — kartu yang sudah dibagikan tidak akan cocok
 * lagi dengan presensinya.
 */

const KUNCI_SIMPAN = "lms_denah_v1";

interface Tersimpan {
  konfig: KonfigRuang[];
  benih: number;
  namaKegiatan: string;
}

type Tab = "denah" | "kartu" | "presensi";
type ModeCetak = "kartu" | "presensi" | "denah" | null;

export default function DenahClient({
  siswa,
  gagal,
}: {
  siswa: SiswaDenah[];
  gagal: { jenjang: Jenjang; pesan: string }[];
}) {
  const [namaKegiatan, setNamaKegiatan] = useState("Uji Coba CBT");
  const [konfig, setKonfig] = useState<KonfigRuang[]>([]);
  const [benih, setBenih] = useState<number>(() => benihAcak());
  const [hasil, setHasil] = useState<HasilDenah | null>(null);
  const [tab, setTab] = useState<Tab>("denah");
  const [modeCetak, setModeCetak] = useState<ModeCetak>(null);
  const [dimuatDariSimpanan, setDimuatDariSimpanan] = useState(false);

  const jumlahPerTingkat = useMemo(
    () => ({
      7: siswa.filter((s) => s.tingkat === 7).length,
      8: siswa.filter((s) => s.tingkat === 8).length,
      9: siswa.filter((s) => s.tingkat === 9).length,
    }),
    [siswa]
  );

  // Pulihkan pengaturan terakhir. Sengaja TIDAK langsung menghasilkan
  // denah — admin perlu melihat dulu ruang apa saja yang termuat sebelum
  // menganggapnya benar.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KUNCI_SIMPAN);
      if (!raw) {
        setKonfig(konfigDefault(siswa.length));
        return;
      }
      const t = JSON.parse(raw) as Tersimpan;
      if (Array.isArray(t.konfig) && t.konfig.length > 0) {
        setKonfig(t.konfig);
        setBenih(t.benih);
        setNamaKegiatan(t.namaKegiatan ?? "Uji Coba CBT");
        setDimuatDariSimpanan(true);
      } else {
        setKonfig(konfigDefault(siswa.length));
      }
    } catch {
      setKonfig(konfigDefault(siswa.length));
    }
    // sengaja hanya sekali saat mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function simpan(konfigBaru: KonfigRuang[], benihBaru: number, nama: string) {
    try {
      const data: Tersimpan = {
        konfig: konfigBaru,
        benih: benihBaru,
        namaKegiatan: nama,
      };
      localStorage.setItem(KUNCI_SIMPAN, JSON.stringify(data));
    } catch {
      // localStorage penuh/diblokir — bukan fatal, hasil di layar tetap ada.
    }
  }

  const totalKapasitas = konfig.reduce((n, r) => n + (r.kapasitas || 0), 0);

  function generate(benihDipakai: number) {
    const bersih = konfig
      .map((r) => ({ nama: r.nama.trim() || "Ruang", kapasitas: r.kapasitas }))
      .filter((r) => r.kapasitas > 0);
    if (bersih.length === 0) return;
    setHasil(buatDenah(siswa, bersih, benihDipakai));
    setBenih(benihDipakai);
    simpan(bersih, benihDipakai, namaKegiatan);
    setTab("denah");
  }

  // Cetak: mode diset dulu supaya bagian cetak ter-render, baru dialog
  // cetak dibuka pada frame berikutnya. Tanpa jeda satu frame, browser
  // memotret halaman sebelum React sempat menampilkan isinya.
  const kembalikanRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!modeCetak) return;

    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => window.print());
    });

    const selesai = () => setModeCetak(null);
    window.addEventListener("afterprint", selesai);
    kembalikanRef.current = selesai;

    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("afterprint", selesai);
    };
  }, [modeCetak]);

  function unduhBerkas() {
    const data: Tersimpan = { konfig, benih, namaKegiatan };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `denah-${namaKegiatan.replace(/\s+/g, "-").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function bukaBerkas(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const t = JSON.parse(String(reader.result)) as Tersimpan;
        if (!Array.isArray(t.konfig)) throw new Error("bentuk salah");
        setKonfig(t.konfig);
        setBenih(t.benih);
        setNamaKegiatan(t.namaKegiatan ?? namaKegiatan);
        setHasil(buatDenah(siswa, t.konfig, t.benih));
        simpan(t.konfig, t.benih, t.namaKegiatan ?? namaKegiatan);
      } catch {
        alert("Berkas denah tidak bisa dibaca. Pastikan itu berkas .json hasil unduhan dari halaman ini.");
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------- */}
      {/* Semua yang di layar disembunyikan saat mencetak (lihat        */}
      {/* globals.css bagian @media print).                              */}
      {/* ------------------------------------------------------------- */}
      <div className={modeCetak ? "hidden" : ""}>
        <header>
          <h1 className="font-serif text-2xl text-ink">Acak Tempat Duduk</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink/60">
            Menyusun tempat duduk dari ketiga jenjang sekaligus. Satu meja
            diisi dua siswa dari tingkat berbeda, lalu kartu peserta dan
            presensi bisa langsung dicetak.
          </p>
        </header>

        {gagal.length > 0 && (
          <div className="mt-4 rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
            <p className="font-semibold">
              Data sebagian jenjang gagal dimuat — denah akan tidak lengkap.
            </p>
            <ul className="mt-1.5 list-inside list-disc">
              {gagal.map((g) => (
                <li key={g.jenjang}>
                  Kelas {g.jenjang}: {g.pesan}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          <KotakAngka label="Kelas 7" nilai={jumlahPerTingkat[7]} />
          <KotakAngka label="Kelas 8" nilai={jumlahPerTingkat[8]} />
          <KotakAngka label="Kelas 9" nilai={jumlahPerTingkat[9]} />
          <KotakAngka label="Total siswa" nilai={siswa.length} tebal />
        </div>

        {/* --- Pengaturan ruang --- */}
        <section className="mt-6 rounded-2xl border border-ink/10 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-serif text-lg text-ink">Pengaturan ruang</h2>
            {dimuatDariSimpanan && !hasil && (
              <p className="text-xs text-teal">
                Pengaturan terakhir dipulihkan dari peramban ini.
              </p>
            )}
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="label-field">Nama kegiatan</span>
              <input
                value={namaKegiatan}
                onChange={(e) => setNamaKegiatan(e.target.value)}
                className="field"
                placeholder="Uji Coba CBT"
              />
            </label>
            <label className="block">
              <span className="label-field">Jumlah ruang</span>
              <input
                type="number"
                min={1}
                max={40}
                value={konfig.length}
                onChange={(e) =>
                  setKonfig(ubahJumlahRuang(konfig, Number(e.target.value)))
                }
                className="field"
              />
            </label>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-ink/40">
                  <th className="pb-2 pr-3">Ruang</th>
                  <th className="pb-2 pr-3">Nama</th>
                  <th className="pb-2">Jumlah siswa</th>
                </tr>
              </thead>
              <tbody>
                {konfig.map((r, i) => (
                  <tr key={i} className="border-t border-ink/5">
                    <td className="py-2 pr-3 font-mono text-xs text-ink/50">
                      R{i + 1}
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        value={r.nama}
                        onChange={(e) =>
                          setKonfig(ubahRuang(konfig, i, { nama: e.target.value }))
                        }
                        className="w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-gold"
                      />
                    </td>
                    <td className="py-2">
                      <input
                        type="number"
                        min={0}
                        max={200}
                        value={r.kapasitas}
                        onChange={(e) =>
                          setKonfig(
                            ubahRuang(konfig, i, {
                              kapasitas: Number(e.target.value),
                            })
                          )
                        }
                        className="w-28 rounded-lg border border-ink/15 px-3 py-2 text-sm tabular-nums outline-none focus:border-gold"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setKonfig(bagiRata(konfig, siswa.length))}
              className="btn-ghost"
            >
              Bagi rata {siswa.length} siswa
            </button>
            <p
              className={`text-sm ${
                totalKapasitas < siswa.length ? "text-danger" : "text-ink/50"
              }`}
            >
              Total kapasitas {totalKapasitas} kursi untuk {siswa.length} siswa
              {totalKapasitas < siswa.length &&
                ` — kurang ${siswa.length - totalKapasitas} kursi`}
            </p>
          </div>

          <div className="mt-5 flex flex-wrap gap-2 border-t border-ink/10 pt-5">
            <button
              type="button"
              onClick={() => generate(hasil ? benih : benihAcak())}
              disabled={totalKapasitas === 0}
              className="btn-primary"
            >
              <i className="fas fa-shuffle" aria-hidden />
              {hasil ? "Terapkan pengaturan" : "Susun tempat duduk"}
            </button>
            {hasil && (
              <button
                type="button"
                onClick={() => {
                  if (
                    confirm(
                      "Acak ulang akan mengubah SELURUH tempat duduk. Kartu peserta yang sudah dicetak jadi tidak berlaku. Lanjutkan?"
                    )
                  ) {
                    generate(benihAcak());
                  }
                }}
                className="btn-ghost"
              >
                <i className="fas fa-rotate" aria-hidden />
                Acak ulang
              </button>
            )}
            <button type="button" onClick={unduhBerkas} className="btn-ghost">
              <i className="fas fa-download" aria-hidden />
              Unduh berkas denah
            </button>
            <label className="btn-ghost cursor-pointer">
              <i className="fas fa-upload" aria-hidden />
              Buka berkas denah
              <input
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => bukaBerkas(e.target.files?.[0])}
              />
            </label>
          </div>
        </section>

        {/* --- Hasil --- */}
        {hasil && (
          <section className="mt-6">
            <div className="grid gap-3 sm:grid-cols-4">
              <KotakAngka
                label="Meja beda tingkat"
                nilai={hasil.ringkasan.mejaBedaTingkat}
              />
              <KotakAngka
                label="Meja se-tingkat"
                nilai={hasil.ringkasan.mejaSetingkat}
                peringatan={hasil.ringkasan.mejaSetingkat > 0}
              />
              <KotakAngka
                label="Meja sendirian"
                nilai={hasil.ringkasan.mejaSendirian}
              />
              <KotakAngka
                label="Belum dapat kursi"
                nilai={hasil.tidakTertampung.length}
                peringatan={hasil.tidakTertampung.length > 0}
              />
            </div>

            {hasil.ringkasan.mejaSetingkat > 0 && (
              <p className="mt-3 rounded-xl border border-gold/30 bg-gold/5 p-3.5 text-sm text-ink/70">
                {hasil.ringkasan.mejaSetingkat} meja terpaksa diisi dua siswa
                se-tingkat karena jumlah tiap tingkat tidak berimbang. Meja itu
                ditandai kuning di denah, dan penghuninya dijamin beda kelas.
              </p>
            )}

            {hasil.tidakTertampung.length > 0 && (
              <p className="mt-3 rounded-xl border border-danger/30 bg-danger/5 p-3.5 text-sm text-danger">
                {hasil.tidakTertampung.length} siswa belum kebagian kursi:{" "}
                {hasil.tidakTertampung
                  .slice(0, 6)
                  .map((s) => s.nama)
                  .join(", ")}
                {hasil.tidakTertampung.length > 6 && ", dan lainnya"}. Tambah
                kapasitas ruang lalu tekan &quot;Terapkan pengaturan&quot;.
              </p>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 pb-3">
              <div className="flex gap-1 rounded-xl border border-ink/10 bg-white p-1">
                {(
                  [
                    ["denah", "Denah ruang"],
                    ["kartu", "Kartu peserta"],
                    ["presensi", "Presensi"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                      tab === id
                        ? "bg-ink text-paper"
                        : "text-ink/60 hover:bg-ink/5"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setModeCetak(tab)}
                className="btn-primary"
              >
                <i className="fas fa-print" aria-hidden />
                Cetak / simpan PDF
              </button>
            </div>

            <div className="mt-5">
              {tab === "denah" && <PratinjauDenah hasil={hasil} />}
              {tab === "kartu" && (
                <PratinjauKartu hasil={hasil} namaKegiatan={namaKegiatan} />
              )}
              {tab === "presensi" && (
                <PratinjauPresensi hasil={hasil} namaKegiatan={namaKegiatan} />
              )}
            </div>
          </section>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* Isi cetakan. Hanya dirender saat tombol cetak ditekan —        */}
      {/* merender 600 kartu terus-menerus akan memberatkan halaman      */}
      {/* tanpa ada yang melihatnya.                                     */}
      {/* ------------------------------------------------------------- */}
      {modeCetak && hasil && (
        <div className="area-cetak">
          {modeCetak === "kartu" && (
            <LembarKartu hasil={hasil} namaKegiatan={namaKegiatan} />
          )}
          {modeCetak === "presensi" && (
            <LembarPresensi hasil={hasil} namaKegiatan={namaKegiatan} />
          )}
          {modeCetak === "denah" && (
            <LembarDenah hasil={hasil} namaKegiatan={namaKegiatan} />
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bantuan pengaturan
// ---------------------------------------------------------------------------

function konfigDefault(jumlahSiswa: number): KonfigRuang[] {
  const perRuang = 32;
  const jumlahRuang = Math.max(1, Math.ceil(jumlahSiswa / perRuang));
  return Array.from({ length: jumlahRuang }, (_, i) => ({
    nama: `Ruang ${i + 1}`,
    kapasitas: perRuang,
  }));
}

function ubahJumlahRuang(konfig: KonfigRuang[], jumlah: number): KonfigRuang[] {
  const n = Math.max(1, Math.min(40, jumlah || 1));
  if (n <= konfig.length) return konfig.slice(0, n);
  const tambahan = Array.from({ length: n - konfig.length }, (_, i) => ({
    nama: `Ruang ${konfig.length + i + 1}`,
    kapasitas: konfig[konfig.length - 1]?.kapasitas ?? 32,
  }));
  return [...konfig, ...tambahan];
}

function ubahRuang(
  konfig: KonfigRuang[],
  idx: number,
  patch: Partial<KonfigRuang>
): KonfigRuang[] {
  return konfig.map((r, i) => (i === idx ? { ...r, ...patch } : r));
}

/** Bagi rata, sisa dibagikan satu-satu ke ruang pertama — bukan ditumpuk
 *  semua di ruang terakhir, supaya selisih antar ruang paling banyak satu
 *  kursi dan pengawas tidak kebagian ruang yang jauh lebih penuh. */
function bagiRata(konfig: KonfigRuang[], jumlahSiswa: number): KonfigRuang[] {
  const n = konfig.length || 1;
  const dasar = Math.floor(jumlahSiswa / n);
  const sisa = jumlahSiswa % n;
  return konfig.map((r, i) => ({ ...r, kapasitas: dasar + (i < sisa ? 1 : 0) }));
}

