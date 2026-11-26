"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import SoalViewer from "@/components/siswa/SoalViewer/SoalViewer";
import { TIPE_LABEL } from "@/lib/soal";
import { formatSisaWaktu, soalSudahTerjawab } from "@/lib/ujian";
import { bacaJawabanLokal, hapusJawabanLokal, simpanJawabanLokal } from "@/lib/autosave-lokal";
import type { SoalSiswa } from "@/types";
import { kumpulkan, simpanJawaban } from "../../../actions";

type StatusSimpan = "tersimpan" | "menyimpan" | "belum" | "gagal";

/** Jeda autosave ke server setelah jawaban berubah. */
const JEDA_SIMPAN_MS = 4000;
/** Simpan berkala walau tidak ada perubahan (detak progres). */
const DETAK_MS = 60_000;

/**
 * Halaman mengerjakan satu subtes tryout. Lebih sederhana dari ExamClient:
 * tanpa layar penuh / kode pengaman (dikerjakan dari rumah), tanpa
 * checkout. Jawaban disimpan ke HP setiap berubah, ke server tiap beberapa
 * detik lewat Server Action, dan dikumpulkan otomatis saat waktu habis.
 */
export default function TryoutExamClient({
  eventId,
  mapelId,
  mapelNama,
  siswaId,
  siswaNama,
  soalList,
  jawabanAwal,
  deadline,
  serverNow,
}: {
  eventId: string;
  mapelId: string;
  mapelNama: string;
  siswaId: string;
  siswaNama: string;
  soalList: SoalSiswa[];
  jawabanAwal: Record<string, unknown>;
  deadline: string;
  serverNow: string;
}) {
  const router = useRouter();
  const portal = `/tryout/${eventId}`;
  const kunciRagu = `lms_tryout_ragu:${siswaId}:${mapelId}`;

  const [jawaban, setJawaban] = useState<Record<string, unknown>>(jawabanAwal);
  const [ragu, setRagu] = useState<Record<string, boolean>>({});
  const [idx, setIdx] = useState(0);
  const [status, setStatus] = useState<StatusSimpan>("tersimpan");
  const [pesan, setPesan] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"kumpul" | "keluar" | null>(null);
  const [mengumpulkan, setMengumpulkan] = useState(false);
  const [panelNav, setPanelNav] = useState(false);

  // Selisih jam server vs HP, supaya HP yang jamnya salah tetap benar.
  const offset = useMemo(() => new Date(serverNow).getTime() - Date.now(), [serverNow]);
  const batas = useMemo(() => new Date(deadline).getTime(), [deadline]);
  const [sekarang, setSekarang] = useState(() => Date.now() + offset);
  const sisa = batas - sekarang;
  const habis = sisa <= 0;

  const jawabanRef = useRef(jawaban);
  const kotor = useRef(false);
  const sudahKumpul = useRef(false);
  const idxRef = useRef(idx);
  useEffect(() => {
    idxRef.current = idx;
  }, [idx]);

  // Pulihkan cadangan HP bila lebih lengkap dari yang ada di server
  // (mis. sinyal putus sebelum autosave terakhir terkirim).
  useEffect(() => {
    const lokal = bacaJawabanLokal(siswaId, mapelId);
    if (lokal && Object.keys(lokal).length > Object.keys(jawabanAwal).length) {
      setJawaban(lokal);
      jawabanRef.current = lokal;
      kotor.current = true;
      setStatus("belum");
    }
    try {
      const r = localStorage.getItem(kunciRagu);
      if (r) setRagu(JSON.parse(r));
    } catch {
      /* abaikan */
    }
    // sekali saat dibuka
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const terjawab = soalList.filter((s) => soalSudahTerjawab(s, jawaban[s.id])).length;
  const progres = soalList.length ? Math.round((terjawab / soalList.length) * 100) : 0;

  const simpanKeServer = useCallback(async () => {
    if (sudahKumpul.current) return;
    const data = jawabanRef.current;
    kotor.current = false;
    setStatus("menyimpan");
    const h = await simpanJawaban(
      mapelId,
      data,
      soalList.length
        ? Math.round((soalList.filter((s) => soalSudahTerjawab(s, data[s.id])).length / soalList.length) * 100)
        : 0,
      idxRef.current + 1
    );
    if (!h.ok) {
      kotor.current = true;
      setStatus("gagal");
      setPesan(h.error);
      if (h.sesiHabis) router.replace(portal);
      return;
    }
    if (!h.tersimpan) {
      // Server menolak: waktu habis / sudah terkumpul.
      setStatus("tersimpan");
      router.replace(`${portal}?pesan=selesai`);
      return;
    }
    setPesan(null);
    setStatus(kotor.current ? "belum" : "tersimpan");
  }, [mapelId, soalList, router, portal]);

  // Jam & autosave berkala
  useEffect(() => {
    const t = setInterval(() => setSekarang(Date.now() + offset), 1000);
    return () => clearInterval(t);
  }, [offset]);

  useEffect(() => {
    if (status !== "belum" && status !== "gagal") return;
    const t = setTimeout(() => void simpanKeServer(), status === "gagal" ? 10_000 : JEDA_SIMPAN_MS);
    return () => clearTimeout(t);
  }, [status, jawaban, simpanKeServer]);

  useEffect(() => {
    const t = setInterval(() => void simpanKeServer(), DETAK_MS);
    const saatSembunyi = () => {
      if (document.visibilityState === "hidden" && kotor.current) void simpanKeServer();
    };
    document.addEventListener("visibilitychange", saatSembunyi);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", saatSembunyi);
    };
  }, [simpanKeServer]);

  const kirimKumpul = useCallback(async () => {
    if (sudahKumpul.current) return;
    sudahKumpul.current = true;
    setMengumpulkan(true);
    const h = await kumpulkan(mapelId, jawabanRef.current);
    if (!h.ok) {
      sudahKumpul.current = false;
      setMengumpulkan(false);
      setPesan(h.error);
      if (h.sesiHabis) router.replace(portal);
      return;
    }
    hapusJawabanLokal(siswaId, mapelId);
    try {
      localStorage.removeItem(kunciRagu);
    } catch {
      /* abaikan */
    }
    router.replace(`${portal}?pesan=selesai`);
  }, [mapelId, router, portal, siswaId, kunciRagu]);

  // Waktu habis -> kumpulkan otomatis.
  useEffect(() => {
    if (habis && !sudahKumpul.current) void kirimKumpul();
  }, [habis, kirimKumpul]);

  function ubah(soalId: string, nilai: unknown) {
    if (habis || mengumpulkan) return;
    const baru = { ...jawabanRef.current, [soalId]: nilai };
    jawabanRef.current = baru;
    setJawaban(baru);
    simpanJawabanLokal(siswaId, mapelId, baru);
    kotor.current = true;
    setStatus("belum");
  }

  function tandaiRagu(id: string) {
    setRagu((r) => {
      const baru = { ...r, [id]: !r[id] };
      try {
        localStorage.setItem(kunciRagu, JSON.stringify(baru));
      } catch {
        /* abaikan */
      }
      return baru;
    });
  }

  async function keluarDulu() {
    if (kotor.current) await simpanKeServer();
    router.replace(portal);
  }

  const soal = soalList[idx];
  const belumDijawab = soalList.length - terjawab;
  const jumlahRagu = soalList.filter((s) => ragu[s.id]).length;
  const hampirHabis = sisa < 5 * 60_000;

  if (soalList.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
        <p className="text-sm text-slate-600">Soal subtes ini belum tersedia.</p>
        <button type="button" onClick={() => router.replace(portal)} className="mt-4 text-sm font-semibold underline">
          Kembali
        </button>
      </div>
    );
  }

  return (
    <div className="pb-24">
      {/* Bilah atas: subtes, waktu, status simpan */}
      <div className="sticky top-0 z-30 -mx-4 mb-4 border-b border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-ink">{mapelNama}</p>
            <p className="truncate text-[0.7rem] text-slate-500">
              {siswaNama} · {terjawab}/{soalList.length} terjawab
            </p>
          </div>
          <span
            className={`rounded-lg px-2.5 py-1 font-mono text-base font-bold tabular-nums ${
              hampirHabis ? "bg-red-100 text-red-700" : "bg-navy-50 text-navy-900"
            }`}
            aria-live="polite"
          >
            <i className="fas fa-clock mr-1.5 text-xs" aria-hidden />
            {formatSisaWaktu(sisa)}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-[0.7rem]">
          <IndikatorSimpan status={status} />
          <button type="button" onClick={() => setDialog("keluar")} className="font-semibold text-slate-500 underline">
            Keluar dulu
          </button>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progres}%` }} />
        </div>
      </div>

      {pesan && (
        <p role="alert" className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {pesan}
        </p>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="rounded-lg bg-navy-800 px-2.5 py-1 text-sm font-bold text-white">Soal {idx + 1}</span>
          <span className="text-xs text-slate-500">{TIPE_LABEL[soal.tipe]}</span>
        </div>
        <SoalViewer
          soal={soal}
          value={jawaban[soal.id]}
          onChange={(v) => ubah(soal.id, v)}
          disabled={habis || mengumpulkan}
        />
        <label className="mt-4 inline-flex cursor-pointer items-center gap-2 text-sm text-amber-800">
          <input type="checkbox" checked={!!ragu[soal.id]} onChange={() => tandaiRagu(soal.id)} className="accent-amber-500" />
          Ragu-ragu
        </label>
      </div>

      {/* Navigasi bawah */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white px-4 py-2.5 shadow-[0_-4px_12px_rgba(15,23,42,0.06)]">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <button
            type="button"
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
            disabled={idx === 0}
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-600 disabled:opacity-40"
            aria-label="Soal sebelumnya"
          >
            <i className="fas fa-chevron-left" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setPanelNav(true)}
            className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-ink"
          >
            <i className="fas fa-table-cells mr-1.5" aria-hidden />
            {idx + 1} / {soalList.length}
          </button>
          {idx < soalList.length - 1 ? (
            <button
              type="button"
              onClick={() => setIdx((i) => Math.min(soalList.length - 1, i + 1))}
              className="rounded-xl bg-navy-800 px-4 py-2.5 text-sm font-bold text-white"
            >
              Berikutnya <i className="fas fa-chevron-right ml-1" aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setDialog("kumpul")}
              disabled={mengumpulkan}
              className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              Kumpulkan
            </button>
          )}
        </div>
      </div>

      {panelNav && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/50 sm:items-center" onClick={() => setPanelNav(false)}>
          <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <p className="font-semibold text-ink">Daftar soal</p>
              <button type="button" onClick={() => setPanelNav(false)} aria-label="Tutup" className="text-slate-500">
                <i className="fas fa-xmark" aria-hidden />
              </button>
            </div>
            <div className="grid grid-cols-6 gap-2">
              {soalList.map((s, i) => {
                const sudah = soalSudahTerjawab(s, jawaban[s.id]);
                const kelas = ragu[s.id]
                  ? "bg-amber-400 text-white"
                  : sudah
                    ? "bg-emerald-500 text-white"
                    : "bg-slate-100 text-slate-600";
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setIdx(i);
                      setPanelNav(false);
                    }}
                    className={`aspect-square rounded-lg text-sm font-bold ${kelas} ${i === idx ? "ring-2 ring-navy-700 ring-offset-1" : ""}`}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-[0.7rem] text-slate-500">
              <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded bg-emerald-500" />Terjawab</span>
              <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded bg-amber-400" />Ragu-ragu</span>
              <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded bg-slate-200" />Belum</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setPanelNav(false);
                setDialog("kumpul");
              }}
              className="mt-4 w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white"
            >
              Kumpulkan
            </button>
          </div>
        </div>
      )}

      {dialog && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 sm:items-center" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            {dialog === "kumpul" ? (
              <>
                <h2 className="font-serif text-lg font-extrabold text-navy-900">Kumpulkan {mapelNama}?</h2>
                <p className="mt-2 text-sm text-slate-600">
                  {belumDijawab > 0 ? (
                    <>Masih ada <b>{belumDijawab}</b> soal belum dijawab. </>
                  ) : (
                    <>Semua soal sudah dijawab. </>
                  )}
                  {jumlahRagu > 0 && <>Ada <b>{jumlahRagu}</b> soal ragu-ragu. </>}
                  Setelah dikumpulkan, jawaban tidak bisa diubah.
                </p>
                <div className="mt-5 flex gap-2">
                  <button type="button" onClick={() => setDialog(null)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600">
                    Periksa lagi
                  </button>
                  <button
                    type="button"
                    disabled={mengumpulkan}
                    onClick={() => void kirimKumpul()}
                    className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {mengumpulkan ? "Mengirim…" : "Kumpulkan"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="font-serif text-lg font-extrabold text-navy-900">Keluar dulu?</h2>
                <p className="mt-2 text-sm text-slate-600">
                  Jawaban disimpan, tetapi <b>waktu tetap berjalan</b> (sisa {formatSisaWaktu(sisa)}). Masuk lagi dengan
                  token untuk melanjutkan. Jika waktu habis, jawaban yang tersimpan otomatis dikumpulkan.
                </p>
                <div className="mt-5 flex gap-2">
                  <button type="button" onClick={() => setDialog(null)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600">
                    Lanjut mengerjakan
                  </button>
                  <button type="button" onClick={() => void keluarDulu()} className="flex-1 rounded-xl bg-slate-700 py-2.5 text-sm font-bold text-white">
                    Keluar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {(habis || mengumpulkan) && !dialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="rounded-2xl bg-white px-6 py-5 text-center shadow-xl">
            <i className="fas fa-spinner fa-spin text-2xl text-navy-700" aria-hidden />
            <p className="mt-2 text-sm font-semibold text-ink">{habis ? "Waktu habis. Mengumpulkan jawaban…" : "Mengumpulkan…"}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function IndikatorSimpan({ status }: { status: StatusSimpan }) {
  const peta: Record<StatusSimpan, { teks: string; kelas: string; ikon: string }> = {
    tersimpan: { teks: "Tersimpan", kelas: "text-emerald-700", ikon: "fa-cloud" },
    menyimpan: { teks: "Menyimpan…", kelas: "text-slate-500", ikon: "fa-arrows-rotate fa-spin" },
    belum: { teks: "Belum terkirim (aman di HP)", kelas: "text-amber-700", ikon: "fa-mobile-screen" },
    gagal: { teks: "Gagal kirim — dicoba lagi", kelas: "text-red-700", ikon: "fa-triangle-exclamation" },
  };
  const p = peta[status];
  return (
    <span className={`font-semibold ${p.kelas}`}>
      <i className={`fas ${p.ikon} mr-1`} aria-hidden />
      {p.teks}
    </span>
  );
}
