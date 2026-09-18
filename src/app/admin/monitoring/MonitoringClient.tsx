"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { JENJANG_LABEL, type Jenjang } from "@/lib/jenjang";
import { formatSisaWaktu } from "@/lib/ujian";
import { unduhExcel, waktuExcel } from "@/lib/excel";
import type { BarisMonitoring, MapelMonitoring } from "@/lib/supabase/admin-multi";
import {
  ambilMonitoring,
  aksiResetSiswa,
  aksiPaksaKumpulkan,
  aksiResetMapel,
} from "./actions";

/** Jeda polling. 15 detik cukup terasa "hidup" tanpa membanjiri database:
 *  satu admin × 1 query per 15 detik jauh lebih ringan daripada 600 siswa
 *  yang sedang ping tiap menit, jadi bukan ini yang jadi beban utama. */
const JEDA_POLL_MS = 15_000;

interface DataJenjang {
  jenjang: Jenjang;
  error: string | null;
  mapel: MapelMonitoring[];
}

type FilterStatus = "semua" | "belum_mulai" | "mengerjakan" | "selesai";

export default function MonitoringClient({
  hasilPerJenjang,
}: {
  hasilPerJenjang: DataJenjang[];
}) {
  // Jenjang awal: yang punya ujian sedang berlangsung. Admin membuka halaman
  // ini justru saat ujian jalan, jadi menebak ke sana menghemat satu klik.
  const [jenjang, setJenjang] = useState<Jenjang>(() => {
    const aktif = hasilPerJenjang.find((h) =>
      h.mapel.some((m) => m.sedang_aktif)
    );
    return aktif?.jenjang ?? hasilPerJenjang[0]?.jenjang ?? 7;
  });

  const dataJenjang = hasilPerJenjang.find((h) => h.jenjang === jenjang);
  const daftarMapel = dataJenjang?.mapel ?? [];

  const [mapelId, setMapelId] = useState<string>("");
  const [baris, setBaris] = useState<BarisMonitoring[]>([]);
  const [memuat, setMemuat] = useState(false);
  const [errorMuat, setErrorMuat] = useState<string | null>(null);
  const [pesan, setPesan] = useState<{ ok: boolean; teks: string } | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [cari, setCari] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("semua");
  const [konfirmasiResetMapel, setKonfirmasiResetMapel] = useState(false);
  const [ketikanKonfirmasi, setKetikanKonfirmasi] = useState("");

  const mapelAktif = daftarMapel.find((m) => m.mapel_id === mapelId) ?? null;

  // Ganti jenjang -> pilih otomatis ujian yang sedang berlangsung di jenjang
  // itu (kalau ada), supaya perpindahan antar kelas terasa instan, bukan
  // "pilih jenjang, lalu pilih ujian lagi dari nol".
  useEffect(() => {
    const kandidat =
      daftarMapel.find((m) => m.sedang_aktif) ?? daftarMapel[0] ?? null;
    setMapelId(kandidat?.mapel_id ?? "");
    setBaris([]);
    setPesan(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jenjang]);

  const muat = useCallback(
    async (tampilkanSpinner: boolean) => {
      if (!mapelId) {
        setBaris([]);
        return;
      }
      if (tampilkanSpinner) setMemuat(true);
      const hasil = await ambilMonitoring(jenjang, mapelId);
      setBaris(hasil.baris);
      setErrorMuat(hasil.error);
      if (tampilkanSpinner) setMemuat(false);
    },
    [jenjang, mapelId]
  );

  // Muat pertama saat ujian dipilih.
  useEffect(() => {
    void muat(true);
  }, [muat]);

  // Polling. Sengaja memakai setTimeout berantai, bukan setInterval: kalau
  // satu permintaan lambat (jaringan sekolah), permintaan berikutnya baru
  // dijadwalkan SETELAH yang ini selesai, sehingga tidak menumpuk antrean
  // permintaan yang saling menyusul.
  const berhentiRef = useRef(false);
  useEffect(() => {
    berhentiRef.current = false;
    if (!autoRefresh || !mapelId) return;

    let timer: ReturnType<typeof setTimeout>;

    async function siklus() {
      if (berhentiRef.current) return;
      // Tab tersembunyi: lewati sekali putaran. Tidak ada yang melihat
      // layarnya, jadi tidak perlu membebani database.
      if (document.visibilityState === "visible") {
        await muat(false);
      }
      if (!berhentiRef.current) timer = setTimeout(siklus, JEDA_POLL_MS);
    }

    timer = setTimeout(siklus, JEDA_POLL_MS);
    return () => {
      berhentiRef.current = true;
      clearTimeout(timer);
    };
  }, [autoRefresh, mapelId, muat]);

  const ringkas = useMemo(() => {
    return {
      total: baris.length,
      belum: baris.filter((b) => b.status === "belum_mulai").length,
      kerja: baris.filter(
        (b) => b.status === "mengerjakan" || b.status === "waktu_habis"
      ).length,
      selesai: baris.filter((b) => b.status === "selesai").length,
      online: baris.filter((b) => b.is_online && b.status !== "selesai").length,
    };
  }, [baris]);

  const barisTampil = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return baris.filter((b) => {
      const cocokCari =
        q === "" ||
        b.siswa_nama.toLowerCase().includes(q) ||
        b.kelas_nama.toLowerCase().includes(q) ||
        b.siswa_username.toLowerCase().includes(q);
      const cocokStatus =
        filterStatus === "semua" ||
        (filterStatus === "mengerjakan"
          ? b.status === "mengerjakan" || b.status === "waktu_habis"
          : b.status === filterStatus);
      return cocokCari && cocokStatus;
    });
  }, [baris, cari, filterStatus]);

  async function jalankanAksi(
    fn: () => Promise<{ ok: boolean; pesan: string }>
  ) {
    setPesan(null);
    const hasil = await fn();
    setPesan({ ok: hasil.ok, teks: hasil.pesan });
    await muat(false);
  }

  function unduhSnapshot() {
    if (!mapelAktif) return;
    void unduhExcel(
      `Monitoring_${mapelAktif.mapel_nama}_${JENJANG_LABEL[jenjang]}`.replace(
        /\s+/g,
        "_"
      ),
      [
        {
          nama: mapelAktif.mapel_nama,
          judul: `MONITORING UJIAN — ${mapelAktif.mapel_nama.toUpperCase()}`,
          subjudul: `${JENJANG_LABEL[jenjang]} · ${mapelAktif.event_nama} · diambil ${waktuExcel(
            new Date().toISOString()
          )}`,
          kolom: [
            { header: "Nama Siswa", key: "nama", lebar: 30 },
            { header: "Username", key: "username", lebar: 18 },
            { header: "Kelas", key: "kelas", lebar: 10, tengah: true },
            { header: "Status", key: "status", lebar: 18, tengah: true },
            { header: "Progress (%)", key: "progress", lebar: 13, tengah: true },
            { header: "Soal Aktif", key: "soal", lebar: 11, tengah: true },
            { header: "Mulai", key: "mulai", lebar: 18, tengah: true },
            { header: "Dikumpulkan", key: "submit", lebar: 18, tengah: true },
            { header: "Skor", key: "skor", lebar: 10, tengah: true },
          ],
          baris: baris.map((b) => ({
            nama: b.siswa_nama,
            username: b.siswa_username,
            kelas: b.kelas_nama,
            status: LABEL_STATUS[b.status],
            progress: b.progress_persen,
            soal: b.soal_aktif ?? "",
            mulai: waktuExcel(b.mulai_at),
            submit: waktuExcel(b.submitted_at),
            skor: b.total_skor ?? "",
          })),
          sorotBaris: (r) => r.status === LABEL_STATUS.belum_mulai,
        },
      ]
    );
  }

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------------------------
          Spanduk jenjang. Dibuat sangat mencolok dan permanen di atas layar
          karena inilah satu-satunya penanda "aku sedang melihat kelas
          berapa" — admin yang berpindah-pindah antar jenjang puluhan kali
          sehari adalah kandidat paling besar untuk salah reset siswa di
          kelas yang keliru, dan kesalahan itu tidak bisa dibatalkan.
         ------------------------------------------------------------------ */}
      <div
        className={`rounded-2xl p-5 text-white shadow-lg ${WARNA_JENJANG[jenjang]}`}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-80">
          Sedang mengawasi
        </p>
        <p className="font-serif text-3xl font-black leading-tight sm:text-4xl">
          {JENJANG_LABEL[jenjang].toUpperCase()}
        </p>
        <p className="mt-1 text-sm opacity-90">
          {mapelAktif
            ? `${mapelAktif.mapel_nama} · ${mapelAktif.event_nama}`
            : "Belum ada ujian dipilih"}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {hasilPerJenjang.map((h) => (
            <button
              key={h.jenjang}
              type="button"
              onClick={() => setJenjang(h.jenjang)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                h.jenjang === jenjang
                  ? "bg-white text-ink shadow"
                  : "bg-white/15 text-white hover:bg-white/25"
              }`}
            >
              {JENJANG_LABEL[h.jenjang]}
              {h.error ? (
                <span className="ml-2 text-xs opacity-80">⚠ gagal</span>
              ) : (
                <span className="ml-2 text-xs opacity-80">
                  {h.mapel.filter((m) => m.sedang_aktif).length} aktif
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {dataJenjang?.error && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 p-3.5 text-sm text-danger">
          Data {JENJANG_LABEL[jenjang]} gagal dimuat: {dataJenjang.error}
        </div>
      )}

      {/* Pemilih ujian */}
      <div className="rounded-xl border border-ink/10 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1">
            <label
              htmlFor="pilih-mapel"
              className="mb-1.5 block text-sm text-ink/70"
            >
              Ujian yang diawasi
            </label>
            <select
              id="pilih-mapel"
              value={mapelId}
              onChange={(e) => {
                setMapelId(e.target.value);
                setPesan(null);
              }}
              className="w-full rounded-md border border-ink/15 bg-white px-3.5 py-2.5 text-ink outline-none focus:border-gold"
            >
              <option value="">— Pilih ujian —</option>
              {daftarMapel.map((m) => (
                <option key={m.mapel_id} value={m.mapel_id}>
                  {m.sedang_aktif ? "🔴 " : ""}
                  {m.event_nama} — {m.mapel_nama} ({m.jumlah_submit}/
                  {m.jumlah_target} selesai)
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 pb-2.5 text-sm text-ink/70">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="h-4 w-4 accent-teal"
            />
            Perbarui otomatis (15 dtk)
          </label>

          <button
            type="button"
            onClick={() => void muat(true)}
            disabled={!mapelId || memuat}
            className="rounded-md border border-ink/15 bg-white px-3.5 py-2.5 text-sm font-medium text-ink transition-colors hover:border-ink/30 disabled:opacity-40"
          >
            {memuat ? "Memuat…" : "Muat ulang"}
          </button>

          <button
            type="button"
            onClick={unduhSnapshot}
            disabled={baris.length === 0}
            className="rounded-md bg-ok px-3.5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Unduh Excel
          </button>
        </div>

        {mapelAktif && (
          <p className="mt-3 text-xs text-ink/50">
            Jendela ujian {waktuExcel(mapelAktif.waktu_mulai)} –{" "}
            {waktuExcel(mapelAktif.waktu_selesai)}
            {mapelAktif.durasi_menit
              ? ` · durasi ${mapelAktif.durasi_menit} menit per siswa`
              : " · tanpa batas durasi (sampai jendela ditutup)"}
          </p>
        )}
      </div>

      {pesan && (
        <div
          className={`rounded-lg border p-3.5 text-sm ${
            pesan.ok
              ? "border-ok/30 bg-ok/5 text-ink/80"
              : "border-danger/30 bg-danger/5 text-danger"
          }`}
        >
          {pesan.teks}
        </div>
      )}

      {errorMuat && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 p-3.5 text-sm text-danger">
          {errorMuat}
        </div>
      )}

      {/* Kartu ringkasan */}
      {mapelId && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Kartu label="Peserta" nilai={ringkas.total} warna="text-ink" />
          <Kartu label="Belum mulai" nilai={ringkas.belum} warna="text-ink/50" />
          <Kartu label="Mengerjakan" nilai={ringkas.kerja} warna="text-gold-dark" />
          <Kartu label="Selesai" nilai={ringkas.selesai} warna="text-ok" />
          <Kartu label="Online" nilai={ringkas.online} warna="text-teal" />
        </div>
      )}

      {/* Filter */}
      {mapelId && (
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            placeholder="Cari nama / kelas / username…"
            className="min-w-[220px] flex-1 rounded-md border border-ink/15 bg-white px-3.5 py-2 text-sm text-ink outline-none focus:border-gold"
          />
          <div className="flex gap-1.5">
            {(
              [
                ["semua", "Semua"],
                ["belum_mulai", "Belum mulai"],
                ["mengerjakan", "Mengerjakan"],
                ["selesai", "Selesai"],
              ] as [FilterStatus, string][]
            ).map(([nilai, label]) => (
              <button
                key={nilai}
                type="button"
                onClick={() => setFilterStatus(nilai)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  filterStatus === nilai
                    ? "bg-ink text-paper"
                    : "border border-ink/15 bg-white text-ink/60 hover:border-ink/30"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tabel */}
      {mapelId && (
        <div className="overflow-x-auto rounded-xl border border-ink/10 bg-white">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b border-ink/10 bg-paper-dark text-xs uppercase tracking-wide text-ink/50">
              <tr>
                <th className="px-4 py-3 text-left">Siswa</th>
                <th className="px-4 py-3 text-left">Kelas</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Progress</th>
                <th className="px-4 py-3 text-center">Soal</th>
                <th className="px-4 py-3 text-center">Sisa waktu</th>
                <th className="px-4 py-3 text-center">Skor</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {barisTampil.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-10 text-center text-sm text-ink/40"
                  >
                    {memuat ? "Memuat data…" : "Tidak ada peserta yang cocok."}
                  </td>
                </tr>
              ) : (
                barisTampil.map((b) => (
                  <BarisSiswa
                    key={b.siswa_id}
                    b={b}
                    jenjang={jenjang}
                    mapelId={mapelId}
                    onAksi={jalankanAksi}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Zona berbahaya */}
      {mapelAktif && (
        <div className="rounded-xl border border-danger/25 bg-danger/5 p-4">
          <p className="mb-1 text-sm font-semibold text-danger">
            Reset seluruh peserta ujian ini
          </p>
          <p className="mb-3 text-xs text-ink/60">
            Menghapus semua jawaban dan nilai untuk{" "}
            <b>{mapelAktif.mapel_nama}</b> di {JENJANG_LABEL[jenjang]}. Soal
            tidak ikut terhapus. Tindakan ini tidak bisa dibatalkan.
          </p>

          {!konfirmasiResetMapel ? (
            <button
              type="button"
              onClick={() => setKonfirmasiResetMapel(true)}
              className="rounded-md border border-danger/40 bg-white px-3.5 py-2 text-xs font-medium text-danger transition-colors hover:bg-danger hover:text-white"
            >
              Saya perlu mereset seluruh peserta
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={ketikanKonfirmasi}
                onChange={(e) => setKetikanKonfirmasi(e.target.value)}
                placeholder={`Ketik: ${mapelAktif.mapel_nama}`}
                className="min-w-[220px] rounded-md border border-danger/30 bg-white px-3 py-2 text-sm outline-none focus:border-danger"
              />
              <button
                type="button"
                disabled={ketikanKonfirmasi.trim() !== mapelAktif.mapel_nama}
                onClick={() => {
                  setKonfirmasiResetMapel(false);
                  setKetikanKonfirmasi("");
                  void jalankanAksi(() => aksiResetMapel(jenjang, mapelId));
                }}
                className="rounded-md bg-danger px-3.5 py-2 text-xs font-medium text-white disabled:opacity-40"
              >
                Reset sekarang
              </button>
              <button
                type="button"
                onClick={() => {
                  setKonfirmasiResetMapel(false);
                  setKetikanKonfirmasi("");
                }}
                className="px-2 text-xs text-ink/50 hover:text-ink"
              >
                Batal
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const LABEL_STATUS: Record<BarisMonitoring["status"], string> = {
  belum_mulai: "Belum mulai",
  mengerjakan: "Mengerjakan",
  waktu_habis: "Waktu habis",
  selesai: "Selesai",
};

const WARNA_JENJANG: Record<Jenjang, string> = {
  7: "bg-gradient-to-br from-[#0f2460] via-[#1d4ed8] to-[#60a5fa]",
  8: "bg-gradient-to-br from-[#064e3b] via-[#059669] to-[#34d399]",
  9: "bg-gradient-to-br from-[#4c1d95] via-[#7c3aed] to-[#c4b5fd]",
};

function Kartu({
  label,
  nilai,
  warna,
}: {
  label: string;
  nilai: number;
  warna: string;
}) {
  return (
    <div className="rounded-xl border border-ink/10 bg-white p-4">
      <p className="text-xs text-ink/50">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${warna}`}>{nilai}</p>
    </div>
  );
}

function BarisSiswa({
  b,
  jenjang,
  mapelId,
  onAksi,
}: {
  b: BarisMonitoring;
  jenjang: Jenjang;
  mapelId: string;
  onAksi: (fn: () => Promise<{ ok: boolean; pesan: string }>) => Promise<void>;
}) {
  const [sibuk, setSibuk] = useState(false);

  // Sisa waktu dihitung dari `server_now` yang ikut dikirim RPC, BUKAN dari
  // jam komputer admin. Kalau jam laptop admin meleset 10 menit, seluruh
  // kolom ini akan menyesatkan — dan justru kolom inilah yang dipakai untuk
  // memutuskan apakah seorang siswa masih punya waktu atau perlu ditolong.
  const sisaMs = useMemo(() => {
    if (!b.deadline || b.status === "selesai" || b.status === "belum_mulai") {
      return null;
    }
    return new Date(b.deadline).getTime() - new Date(b.server_now).getTime();
  }, [b.deadline, b.server_now, b.status]);

  async function bungkus(fn: () => Promise<{ ok: boolean; pesan: string }>) {
    setSibuk(true);
    await onAksi(fn);
    setSibuk(false);
  }

  return (
    <tr className="border-b border-ink/5 last:border-0">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            title={
              b.status === "selesai"
                ? "Sudah selesai"
                : b.is_online
                  ? "Terhubung"
                  : "Tidak ada detak dalam 6 menit terakhir"
            }
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${
              b.status === "selesai"
                ? "bg-ink/20"
                : b.is_online
                  ? "bg-ok shadow-[0_0_8px_rgba(16,185,129,0.6)]"
                  : "bg-danger"
            }`}
          />
          <div className="min-w-0">
            <p className="truncate font-medium text-ink">{b.siswa_nama}</p>
            <p className="truncate text-[0.7rem] text-ink/40">
              {b.siswa_username}
            </p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-ink/70">{b.kelas_nama}</td>
      <td className="px-4 py-3">
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${GAYA_STATUS[b.status]}`}>
          {LABEL_STATUS[b.status]}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-2 w-24 overflow-hidden rounded-full bg-ink/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-teal to-gold-light transition-all"
              style={{ width: `${b.progress_persen}%` }}
            />
          </div>
          <span className="w-9 text-xs tabular-nums text-ink/50">
            {b.progress_persen}%
          </span>
        </div>
      </td>
      <td className="px-4 py-3 text-center tabular-nums text-ink/70">
        {b.soal_aktif ?? "—"}
      </td>
      <td className="px-4 py-3 text-center">
        {sisaMs === null ? (
          <span className="text-ink/30">—</span>
        ) : (
          <span
            className={`tabular-nums ${
              sisaMs <= 5 * 60 * 1000 ? "font-semibold text-danger" : "text-ink/70"
            }`}
          >
            {sisaMs <= 0 ? "habis" : formatSisaWaktu(sisaMs)}
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-center tabular-nums text-ink">
        {b.total_skor === null
          ? "—"
          : `${Number(b.total_skor)} / ${Number(b.skor_maksimal)}`}
      </td>
      <td className="px-4 py-3">
        <div className="flex justify-end gap-1.5">
          {b.status !== "selesai" && b.status !== "belum_mulai" && (
            <button
              type="button"
              disabled={sibuk}
              onClick={() =>
                void bungkus(() =>
                  aksiPaksaKumpulkan(jenjang, b.siswa_id, mapelId)
                )
              }
              title="Kumpulkan jawaban terakhir siswa ini dan hitung nilainya"
              className="rounded-md border border-ok/30 bg-ok/5 px-2.5 py-1.5 text-xs font-medium text-ok transition-colors hover:bg-ok hover:text-white disabled:opacity-40"
            >
              Kumpulkan
            </button>
          )}
          {b.status !== "belum_mulai" && (
            <button
              type="button"
              disabled={sibuk}
              onClick={() => {
                if (
                  !confirm(
                    `Reset ujian ${b.siswa_nama}?\n\nJawaban dan nilainya dihapus, dan dia bisa mulai lagi dari awal dengan durasi penuh. Tidak bisa dibatalkan.`
                  )
                ) {
                  return;
                }
                void bungkus(() => aksiResetSiswa(jenjang, b.siswa_id, mapelId));
              }}
              className="rounded-md border border-danger/30 bg-danger/5 px-2.5 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger hover:text-white disabled:opacity-40"
            >
              Reset
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

const GAYA_STATUS: Record<BarisMonitoring["status"], string> = {
  belum_mulai: "bg-ink/5 text-ink/50",
  mengerjakan: "bg-gold/15 text-gold-dark",
  waktu_habis: "bg-danger/10 text-danger",
  selesai: "bg-ok/15 text-ok",
};
