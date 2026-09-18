"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { benihAcak, buatDenah, type HasilDenah, type SiswaDenah } from "@/lib/denah";
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
import {
  DAFTAR_MODE,
  keKonfigDenah,
  konfigRuangDariKelas,
  rekapPerKelas,
  sebarRata,
  siswaUntukMode,
  urutkanKelas,
  type KonfigRuangKelas,
  type ModePasangan,
} from "@/lib/ruang-ujian";
import type { Jenjang } from "@/lib/jenjang";

/**
 * "PEMBAGIAN RUANG UJIAN" — dibuka dari dalam satu kegiatan.
 *
 * Beda dengan /admin/denah (bebas, tidak terikat siapa pun), di sini
 * kelas ATAU RUANG selalu dimulai dari daftar 18 kelas sungguhan dan
 * jumlah siswanya masing-masing — bukan kotak kosong yang diisi manual.
 * Panitia tinggal:
 *
 *   1. Pilih pasangan jenjang (7-8 / 8-9 / 7-9 / ketiganya).
 *   2. Lihat tabel 18 kelas dengan jumlah siswa masing-masing, sudah
 *      dijadikan usulan kapasitas ruang — tinggal disesuaikan kalau ada
 *      ruang yang memang tidak dipakai atau kapasitasnya beda dari
 *      jumlah siswa kelasnya (mis. dipakai untuk gabungan lebih sedikit
 *      peserta).
 *   3. Tekan "Buat Pembagian" — denah, kartu peserta, dan daftar hadir
 *      langsung tersedia sekaligus, tidak ada langkah generate terpisah
 *      untuk masing-masing.
 *
 * Sama seperti /admin/denah, pengacakannya BERBENIH: kombinasi mode +
 * pengaturan ruang yang sama akan selalu menghasilkan susunan yang sama
 * persis, sampai panitia menekan "Acak ulang" dengan sengaja. Pengaturan
 * disimpan di localStorage per-KEGIATAN (kuncinya menyertakan eventId),
 * supaya kegiatan lain tidak saling menimpa pengaturan ruangnya.
 */

type Tab = "denah" | "kartu" | "presensi";
type ModeCetak = Tab | null;

interface Tersimpan {
  mode: ModePasangan;
  kapasitasOverride: Record<string, number>;
  benih: number;
}

export default function RuangClient({
  eventId,
  namaEventAwal,
  siswa,
  gagal,
}: {
  eventId: string;
  namaEventAwal: string;
  siswa: SiswaDenah[];
  gagal: { jenjang: Jenjang; pesan: string }[];
}) {
  const kunciSimpan = `lms_ruang_event_${eventId}`;

  const [namaKegiatan, setNamaKegiatan] = useState(namaEventAwal);
  const [mode, setMode] = useState<ModePasangan>("semua");
  // Kapasitas per kelas BOLEH ditimpa manual (mis. ruang itu dipakai
  // sebagian). Kuncinya nama kelas asal, bukan indeks — supaya
  // penimpaan tetap nyambung ke kelas yang benar walau daftar kelas
  // yang tampil berubah karena mode diganti.
  const [kapasitasOverride, setKapasitasOverride] = useState<
    Record<string, number>
  >({});
  const [benih, setBenih] = useState<number>(() => benihAcak());
  const [hasil, setHasil] = useState<HasilDenah | null>(null);
  const [tab, setTab] = useState<Tab>("denah");
  const [modeCetak, setModeCetak] = useState<ModeCetak>(null);
  const [dimuatDariSimpanan, setDimuatDariSimpanan] = useState(false);

  const rekapKelas = useMemo(() => rekapPerKelas(siswa), [siswa]);
  const konfigDasar = useMemo(
    () => konfigRuangDariKelas(rekapKelas),
    [rekapKelas]
  );

  const modeAktif = DAFTAR_MODE.find((m) => m.id === mode)!;
  const kelasTerlibat = useMemo(
    () =>
      konfigDasar
        .filter((r) => modeAktif.tingkat.includes(r.tingkat))
        .sort((a, b) =>
          urutkanKelas(
            { nama: a.kelasAsal, tingkat: a.tingkat, jumlah: a.jumlahSiswaKelas },
            { nama: b.kelasAsal, tingkat: b.tingkat, jumlah: b.jumlahSiswaKelas }
          )
        ),
    [konfigDasar, modeAktif]
  );

  const konfigDenganOverride: KonfigRuangKelas[] = useMemo(
    () =>
      konfigDasar.map((r) => ({
        ...r,
        kapasitas: kapasitasOverride[r.kelasAsal] ?? r.kapasitas,
      })),
    [konfigDasar, kapasitasOverride]
  );

  const pesertaMode = useMemo(() => siswaUntukMode(siswa, mode), [siswa, mode]);

  const totalKapasitasTerlibat = kelasTerlibat.reduce(
    (n, r) => n + (kapasitasOverride[r.kelasAsal] ?? r.kapasitas),
    0
  );

  // Pulihkan pengaturan terakhir KEGIATAN INI. Sengaja tidak langsung
  // menghasilkan denah — panitia perlu melihat dulu ruang mana saja yang
  // termuat sebelum menganggapnya benar.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(kunciSimpan);
      if (!raw) return;
      const t = JSON.parse(raw) as Tersimpan;
      if (t.mode) setMode(t.mode);
      if (t.kapasitasOverride) setKapasitasOverride(t.kapasitasOverride);
      if (t.benih) setBenih(t.benih);
      setDimuatDariSimpanan(true);
    } catch {
      // localStorage kosong/rusak — mulai dari default, bukan fatal.
    }
    // sengaja hanya sekali saat mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function simpan(
    modeBaru: ModePasangan,
    overrideBaru: Record<string, number>,
    benihBaru: number
  ) {
    try {
      const data: Tersimpan = {
        mode: modeBaru,
        kapasitasOverride: overrideBaru,
        benih: benihBaru,
      };
      localStorage.setItem(kunciSimpan, JSON.stringify(data));
    } catch {
      // penuh/diblokir — bukan fatal, hasil di layar tetap ada.
    }
  }

  function ubahKapasitas(kelasAsal: string, nilai: number) {
    setKapasitasOverride((prev) => ({ ...prev, [kelasAsal]: nilai }));
  }

  function bagiRataOtomatis() {
    const ruangDipakai = new Set(kelasTerlibat.map((r) => r.kelasAsal));
    const hasilSebar = sebarRata(
      konfigDenganOverride,
      ruangDipakai,
      pesertaMode.length
    );
    const overrideBaru: Record<string, number> = { ...kapasitasOverride };
    for (const r of hasilSebar) {
      if (ruangDipakai.has(r.kelasAsal)) overrideBaru[r.kelasAsal] = r.kapasitas;
    }
    setKapasitasOverride(overrideBaru);
  }

  function generate(benihDipakai: number) {
    const ruangDipakai = kelasTerlibat.filter(
      (r) => (kapasitasOverride[r.kelasAsal] ?? r.kapasitas) > 0
    );
    if (ruangDipakai.length === 0) return;

    const konfigDipakai = ruangDipakai.map((r) => ({
      ...r,
      kapasitas: kapasitasOverride[r.kelasAsal] ?? r.kapasitas,
    }));

    setHasil(buatDenah(pesertaMode, keKonfigDenah(konfigDipakai), benihDipakai));
    setBenih(benihDipakai);
    simpan(mode, kapasitasOverride, benihDipakai);
    setTab("denah");
  }

  // Cetak: mode diset dulu supaya bagian cetak ter-render, baru dialog
  // cetak dibuka pada frame berikutnya — sama persis polanya dengan
  // /admin/denah, lihat penjelasan di sana.
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

  return (
    <div className="space-y-6">
      <div className={modeCetak ? "hidden" : ""}>
        <header>
          <h1 className="font-serif text-2xl text-ink">
            Pembagian Ruang Ujian
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink/60">
            Susun tempat duduk dari kelas-kelas sungguhan sekolah ini. Pilih
            jenjang mana yang dipasangkan, sesuaikan kapasitas ruang kalau
            perlu, lalu tekan &ldquo;Buat Pembagian&rdquo; — denah, kartu
            peserta, dan daftar hadir langsung tersedia sekaligus.
          </p>
        </header>

        {gagal.length > 0 && (
          <div className="mt-4 rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
            <p className="font-semibold">
              Data sebagian jenjang gagal dimuat — pembagian akan tidak
              lengkap.
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

        {/* --- Nama kegiatan --- */}
        <section className="mt-6 rounded-2xl border border-ink/10 bg-white p-5">
          <label className="block">
            <span className="label-field">Nama kegiatan (dicetak di kartu &amp; presensi)</span>
            <input
              value={namaKegiatan}
              onChange={(e) => setNamaKegiatan(e.target.value)}
              className="field"
            />
          </label>
          {dimuatDariSimpanan && !hasil && (
            <p className="mt-2 text-xs text-teal">
              Pengaturan ruang untuk kegiatan ini dipulihkan dari peramban
              ini.
            </p>
          )}
        </section>

        {/* --- Pilih pasangan jenjang --- */}
        <section className="mt-4 rounded-2xl border border-ink/10 bg-white p-5">
          <h2 className="mb-3 font-serif text-lg text-ink">
            Pasangan jenjang
          </h2>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {DAFTAR_MODE.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setMode(m.id);
                  setHasil(null);
                }}
                className={`rounded-xl border p-3.5 text-left transition-colors ${
                  mode === m.id
                    ? "border-gold bg-gold/10"
                    : "border-ink/15 bg-white hover:bg-ink/[0.03]"
                }`}
              >
                <p className="font-semibold text-ink">{m.label}</p>
                <p className="mt-1 text-xs text-ink/55">{m.keterangan}</p>
              </button>
            ))}
          </div>
          <p className="mt-3 text-sm text-ink/50">
            {pesertaMode.length} siswa ikut diacak pada pilihan ini.
          </p>
        </section>

        {/* --- Tabel 18 kelas & kapasitas ruang --- */}
        <section className="mt-4 rounded-2xl border border-ink/10 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-serif text-lg text-ink">Ruang &amp; kapasitas</h2>
            <button type="button" onClick={bagiRataOtomatis} className="btn-ghost">
              <i className="fas fa-scale-balanced" aria-hidden />
              Bagi rata {pesertaMode.length} siswa
            </button>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-ink/40">
                  <th className="pb-2 pr-3">Kelas</th>
                  <th className="pb-2 pr-3">Jumlah siswa kelas</th>
                  <th className="pb-2 pr-3">Dipakai pada mode ini</th>
                  <th className="pb-2">Kapasitas ruang ujian</th>
                </tr>
              </thead>
              <tbody>
                {konfigDasar
                  .slice()
                  .sort((a, b) =>
                    urutkanKelas(
                      { nama: a.kelasAsal, tingkat: a.tingkat, jumlah: a.jumlahSiswaKelas },
                      { nama: b.kelasAsal, tingkat: b.tingkat, jumlah: b.jumlahSiswaKelas }
                    )
                  )
                  .map((r) => {
                    const dipakai = modeAktif.tingkat.includes(r.tingkat);
                    const nilai = kapasitasOverride[r.kelasAsal] ?? r.kapasitas;
                    return (
                      <tr
                        key={r.kelasAsal}
                        className={`border-t border-ink/5 ${dipakai ? "" : "opacity-40"}`}
                      >
                        <td className="py-2 pr-3 font-medium text-ink">
                          {r.kelasAsal}
                        </td>
                        <td className="py-2 pr-3 tabular-nums text-ink/60">
                          {r.jumlahSiswaKelas}
                        </td>
                        <td className="py-2 pr-3">
                          {dipakai ? (
                            <span className="badge-ok">Ya</span>
                          ) : (
                            <span className="badge-netral">Tidak</span>
                          )}
                        </td>
                        <td className="py-2">
                          <input
                            type="number"
                            min={0}
                            max={200}
                            disabled={!dipakai}
                            value={nilai}
                            onChange={(e) =>
                              ubahKapasitas(r.kelasAsal, Number(e.target.value))
                            }
                            className="w-28 rounded-lg border border-ink/15 px-3 py-2 text-sm tabular-nums outline-none focus:border-gold disabled:bg-paper-dark/40 disabled:text-ink/30"
                          />
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          <p
            className={`mt-3 text-sm ${
              totalKapasitasTerlibat < pesertaMode.length
                ? "text-danger"
                : "text-ink/50"
            }`}
          >
            Total kapasitas ruang terlibat {totalKapasitasTerlibat} kursi
            untuk {pesertaMode.length} siswa
            {totalKapasitasTerlibat < pesertaMode.length &&
              ` — kurang ${pesertaMode.length - totalKapasitasTerlibat} kursi`}
          </p>

          <div className="mt-5 flex flex-wrap gap-2 border-t border-ink/10 pt-5">
            <button
              type="button"
              onClick={() => generate(hasil ? benih : benihAcak())}
              disabled={totalKapasitasTerlibat === 0}
              className="btn-primary"
            >
              <i className="fas fa-shuffle" aria-hidden />
              {hasil ? "Terapkan pengaturan" : "Buat Pembagian"}
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
          </div>
        </section>

        {/* --- Hasil: langsung tersedia sekaligus (denah + kartu + presensi) --- */}
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
                se-tingkat karena jumlah tiap tingkat tidak berimbang pada
                mode ini. Meja itu ditandai kuning di denah, dan penghuninya
                dijamin beda kelas.
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
                    ["presensi", "Daftar hadir"],
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

      {/* --- Isi cetakan, hanya dirender saat tombol cetak ditekan --- */}
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
