"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { TipeSoal } from "@/types";
import { TIPE_DESKRIPSI, TIPE_LABEL, TIPE_SOAL_LIST } from "@/lib/soal";
import type { Jenjang } from "@/lib/jenjang";
import {
  KESULITAN_LABEL,
  MAKS_SOAL_SEKALI,
  MAKS_TOPIK,
  PERSEN_GAMBAR_OTOMATIS,
  TIPE_BISA_GAMBAR,
  alokasiGambar,
  bagiSkor,
  cuplikanDraft,
  formatAngka,
  jumlahKosong,
  kontenSiapSimpan,
  pecahBatch,
  ringkasSkor,
  totalSoal,
  type DraftSoal,
  type JumlahPerTipe,
  type Kesulitan,
  type RencanaGenerate,
} from "@/lib/ai/rencana-soal";
import {
  GalatBatasGambar,
  buatDiagram,
  buatIlustrasi,
  postJson,
  unggahBerkasGuru,
} from "@/lib/ai/gambar-klien";
import {
  createSoal,
  createSoalAdmin,
  type ActionState,
} from "@/app/admin/event/[eventId]/mapel/[mapelId]/soal/actions";
import KartuDraf, { type DrafTinjau } from "./KartuDraf";

/**
 * Tombol + jendela "Generate Soal dengan AI".
 *
 * Alurnya empat langkah, dan langkah ke-3 tidak bisa dilewati:
 *
 *   1. Petunjuk   — topik, jumlah per bentuk soal, skor otomatis, gambar.
 *   2. Proses     — beberapa panggilan kecil ke /api/ai/soal (per batch).
 *   3. Tinjau     — guru membaca, membetulkan, memilih sumber gambar.
 *   4. Simpan     — tiap draf disimpan lewat `createSoal` yang SAMA dengan
 *                   form manual (validasi server, Bank Soal, log ikut).
 *
 * Draf disimpan sementara di localStorage per mapel. Menutup jendela atau
 * memuat ulang halaman tidak membuang hasil generate yang sudah memakan
 * kuota — saat dibuka lagi, guru langsung kembali ke layar tinjauan.
 */

const IKON: Record<TipeSoal, string> = {
  pilgan_biasa: "fa-circle-dot",
  pilgan_kompleks: "fa-square-check",
  uraian_singkat: "fa-pen-to-square",
  benar_salah: "fa-toggle-on",
  multi_benar_salah: "fa-list-check",
  menjodohkan: "fa-link",
};

type Fase = "petunjuk" | "proses" | "tinjau";

interface StatusBatch {
  label: string;
  status: "antre" | "jalan" | "ok" | "gagal";
  pesan?: string;
}

function kunciSimpan(mapelId: string) {
  return `lms-ai-draf:${mapelId}`;
}

function bacaDrafLokal(mapelId: string): DrafTinjau[] {
  try {
    const raw = localStorage.getItem(kunciSimpan(mapelId));
    const arr = raw ? (JSON.parse(raw) as DrafTinjau[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function tulisDrafLokal(mapelId: string, draf: DrafTinjau[]) {
  try {
    if (draf.length === 0) localStorage.removeItem(kunciSimpan(mapelId));
    else localStorage.setItem(kunciSimpan(mapelId), JSON.stringify(draf));
  } catch {
    // penyimpanan penuh/diblokir — draf tetap ada di memori tab ini
  }
}

function keTinjau(d: DraftSoal): DrafTinjau {
  return {
    ...d,
    dipakai: true,
    gambarStatus: { url: null, proses: null, galat: null },
    galatSimpan: null,
  };
}

export default function GeneratorSoalAi({
  eventId,
  mapelId,
  mapelNama,
  jenjang,
  jenjangData,
  aiSiap,
  varian = "tombol",
  renderPemicu,
}: {
  eventId: string;
  mapelId: string;
  mapelNama: string;
  /** Hanya diisi di mode admin lintas jenjang (`?jenjang=`). */
  jenjang?: Jenjang;
  /** Jenjang tempat soal disimpan — untuk label. */
  jenjangData: Jenjang | null;
  /** Kunci Gemini untuk jenjang ini sudah dipasang di server? */
  aiSiap: boolean;
  varian?: "tombol" | "kartu";
  /** Pemicu buatan sendiri (mis. ubin "3 cara input soal"). */
  renderPemicu?: (buka: () => void) => React.ReactNode;
}) {
  const router = useRouter();
  const [buka, setBuka] = useState(false);
  const [fase, setFase] = useState<Fase>("petunjuk");

  // ── Petunjuk ──
  const [topik, setTopik] = useState<string[]>([]);
  const [topikBaru, setTopikBaru] = useState("");
  const [jumlah, setJumlah] = useState<JumlahPerTipe>(() => ({
    ...jumlahKosong(),
    pilgan_biasa: 10,
  }));
  const [bergambar, setBergambar] = useState("");
  const [kesulitan, setKesulitan] = useState<Kesulitan>("campuran");
  const [jumlahOpsi, setJumlahOpsi] = useState<4 | 5>(4);
  const [totalSkor, setTotalSkor] = useState("100");
  const [catatan, setCatatan] = useState("");
  /** "tinjau" = guru membaca & mengedit dulu; "langsung" = gambar dibuat
   *  otomatis lalu semua soal langsung disimpan ke mapel (+ Bank Soal).
   *  Soal yang gagal (mis. gambarnya gagal dibuat) tetap tinggal sebagai
   *  draf untuk ditinjau — tidak ada yang hilang diam-diam. */
  const [setelahSelesai, setSetelahSelesai] = useState<"tinjau" | "langsung">("tinjau");
  const [galatPetunjuk, setGalatPetunjuk] = useState<string | null>(null);

  // ── Proses & tinjau ──
  const [batchStatus, setBatchStatus] = useState<StatusBatch[]>([]);
  const [draf, setDraf] = useState<DrafTinjau[]>([]);
  const [menyimpan, setMenyimpan] = useState(false);
  const [gambarMassal, setGambarMassal] = useState(false);
  const [infoMassal, setInfoMassal] = useState<string | null>(null);
  const [ringkasanSimpan, setRingkasanSimpan] = useState<string | null>(null);
  const rencanaTerakhir = useRef<RencanaGenerate | null>(null);
  const batal = useRef(false);
  const drafRef = useRef<DrafTinjau[]>([]);
  drafRef.current = draf;

  const total = totalSoal(jumlah);
  const targetSkor = Number(totalSkor) > 0 ? Number(totalSkor) : 100;
  const skorOtomatis = useMemo(() => bagiSkor(jumlah, targetSkor), [jumlah, targetSkor]);
  const gambarOtomatis = useMemo(() => alokasiGambar(jumlah, null).total, [jumlah]);
  const layakGambar = TIPE_BISA_GAMBAR.reduce((n, t) => n + (jumlah[t] || 0), 0);

  // Pulihkan draf yang belum disimpan.
  useEffect(() => {
    if (!buka) return;
    const lama = bacaDrafLokal(mapelId);
    if (lama.length > 0 && draf.length === 0) {
      setDraf(lama.map((d) => ({ ...d, gambarStatus: { ...d.gambarStatus, proses: null } })));
      setFase("tinjau");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buka]);

  useEffect(() => {
    if (fase === "tinjau") tulisDrafLokal(mapelId, draf);
  }, [draf, fase, mapelId]);

  // Kunci gulir halaman di belakang jendela.
  useEffect(() => {
    if (!buka) return;
    const lama = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = lama;
    };
  }, [buka]);

  function tambahTopik() {
    const baru = topikBaru
      .split(/\n|,(?![^(]*\))/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (baru.length === 0) return;
    setTopik((lama) => Array.from(new Set([...lama, ...baru])).slice(0, MAKS_TOPIK));
    setTopikBaru("");
  }

  function susunRencana(): RencanaGenerate | string {
    const semuaTopik = topikBaru.trim() ? [...topik, topikBaru.trim()] : topik;
    if (semuaTopik.length === 0) return "Isi minimal satu topik/materi.";
    if (total === 0) return "Isi jumlah soal minimal pada satu bentuk soal.";
    if (total > MAKS_SOAL_SEKALI) return `Maksimal ${MAKS_SOAL_SEKALI} soal sekali generate.`;
    return {
      topik: semuaTopik.slice(0, MAKS_TOPIK),
      jumlah,
      jumlahBergambar: bergambar.trim() === "" ? null : Math.max(0, Number(bergambar) || 0),
      kesulitan,
      jumlahOpsi,
      catatan,
      totalSkor: targetSkor,
    };
  }

  async function jalankanGenerate(rencana: RencanaGenerate, tambahKe: DrafTinjau[]) {
    const daftar = pecahBatch(rencana);
    rencanaTerakhir.current = rencana;
    batal.current = false;
    setBatchStatus(
      daftar.map((b) => ({
        label: `${TIPE_LABEL[b.tipe]} · ${b.jumlah} soal${b.jumlahBergambar ? ` · ${b.jumlahBergambar} bergambar` : ""}`,
        status: "antre",
      }))
    );
    setFase("proses");

    let hasil = [...tambahKe];
    for (let i = 0; i < daftar.length; i++) {
      if (batal.current) break;
      setBatchStatus((s) => s.map((x, j) => (j === i ? { ...x, status: "jalan" } : x)));
      try {
        const res = await postJson<{ soal: DraftSoal[]; dibuang: number }>("/api/ai/soal", {
          jenjang,
          mapelId,
          rencana,
          indeksBatch: i,
          hindari: hasil.map(cuplikanDraft),
        });
        hasil = [...hasil, ...res.soal.map(keTinjau)];
        setDraf(hasil);
        setBatchStatus((s) =>
          s.map((x, j) =>
            j === i
              ? {
                  ...x,
                  status: "ok",
                  pesan: res.dibuang ? `${res.dibuang} soal dibuang karena bentuknya rusak` : undefined,
                }
              : x
          )
        );
      } catch (e) {
        setBatchStatus((s) =>
          s.map((x, j) =>
            j === i ? { ...x, status: "gagal", pesan: (e as Error).message } : x
          )
        );
      }
    }
    setDraf(hasil);
    drafRef.current = hasil;
    tulisDrafLokal(mapelId, hasil);
    if (hasil.length > 0) setFase("tinjau");
    return hasil.length;
  }

  async function mulai() {
    const r = susunRencana();
    if (typeof r === "string") {
      setGalatPetunjuk(r);
      return;
    }
    setGalatPetunjuk(null);
    setRingkasanSimpan(null);
    if (topikBaru.trim()) {
      setTopik(r.topik);
      setTopikBaru("");
    }
    const jumlahDraf = await jalankanGenerate(r, draf);
    if (setelahSelesai === "langsung" && jumlahDraf > 0 && !batal.current) {
      await langsungGunakan();
    }
  }

  /** Buat semua gambar yang dibutuhkan, lalu simpan semua draf. */
  async function langsungGunakan() {
    if (drafRef.current.some((d) => d.dipakai && d.gambar && !d.gambarStatus.url)) {
      await buatSemuaGambar();
      // Beri React satu putaran untuk memperbarui `drafRef` dengan URL gambar.
      await new Promise((r) => setTimeout(r, 50));
    }
    await simpanSemua();
  }

  function ubahDraf(id: string, fn: (d: DrafTinjau) => DrafTinjau) {
    setDraf((lama) => lama.map((d) => (d.idLokal === id ? fn(d) : d)));
  }

  async function prosesGambar(
    id: string,
    jenis: "diagram" | "ilustrasi" | "unggah",
    kerja: (d: DrafTinjau) => Promise<{ url: string; jedaDetik?: number }>
  ): Promise<{ ok: boolean; jedaDetik?: number; galat?: unknown }> {
    const d = drafRef.current.find((x) => x.idLokal === id);
    if (!d) return { ok: false };
    ubahDraf(id, (x) => ({ ...x, gambarStatus: { ...x.gambarStatus, proses: jenis, galat: null } }));
    try {
      const { url, jedaDetik } = await kerja(d);
      ubahDraf(id, (x) => ({ ...x, gambarStatus: { url, proses: null, galat: null } }));
      return { ok: true, jedaDetik };
    } catch (e) {
      ubahDraf(id, (x) => ({
        ...x,
        gambarStatus: { ...x.gambarStatus, proses: null, galat: (e as Error).message },
      }));
      return { ok: false, galat: e };
    }
  }

  async function tungguDetik(detik: number) {
    for (let s = detik; s > 0; s--) {
      if (batal.current) break;
      setInfoMassal(`Jeda batas generator gratis… ${s} detik`);
      await new Promise((r) => setTimeout(r, 1000));
    }
    setInfoMassal(null);
  }

  function buatGambar(id: string, jenis: "diagram" | "ilustrasi") {
    return prosesGambar(id, jenis, (d) =>
      jenis === "diagram"
        ? buatDiagram({
            jenjang,
            deskripsi: d.gambar!.deskripsi,
            pertanyaan: String(d.konten.pertanyaan ?? d.konten.instruksi ?? ""),
          })
        : buatIlustrasi({ jenjang, prompt: d.gambar!.promptEn || d.gambar!.deskripsi })
    );
  }

  /**
   * Buat semua gambar yang belum ada, SATU PER SATU. Diagram (Gemini)
   * dikerjakan dulu karena cepat; ilustrasi gratis sesudahnya dengan jeda
   * sesuai batas Pollinations (±1 gambar / 45 detik / IP tanpa kunci).
   */
  async function buatSemuaGambar() {
    setGambarMassal(true);
    batal.current = false;
    const antre = drafRef.current
      .filter((d) => d.dipakai && d.gambar && !d.gambarStatus.url)
      .sort((a, b) => (a.gambar!.jenis === "diagram" ? 0 : 1) - (b.gambar!.jenis === "diagram" ? 0 : 1));

    for (let i = 0; i < antre.length; i++) {
      if (batal.current) break;
      const d = antre[i];
      let hasil = await buatGambar(d.idLokal, d.gambar!.jenis);
      if (!hasil.ok && hasil.galat instanceof GalatBatasGambar) {
        await tungguDetik(hasil.galat.tungguDetik);
        if (batal.current) break;
        hasil = await buatGambar(d.idLokal, d.gambar!.jenis);
      }
      const masihAdaIlustrasi = antre.slice(i + 1).some((x) => x.gambar!.jenis === "ilustrasi");
      if (d.gambar!.jenis === "ilustrasi" && masihAdaIlustrasi && hasil.jedaDetik) {
        await tungguDetik(hasil.jedaDetik);
      }
    }
    setInfoMassal(null);
    setGambarMassal(false);
  }

  async function gantiSoal(id: string) {
    const d = drafRef.current.find((x) => x.idLokal === id);
    const r = rencanaTerakhir.current ?? susunRencana();
    if (!d || typeof r === "string") return;
    const satu: RencanaGenerate = {
      ...r,
      jumlah: { ...jumlahKosong(), [d.tipe]: 1 },
      jumlahBergambar: d.gambar ? 1 : 0,
      totalSkor: d.skor > 0 ? d.skor : 1,
      topik: d.topik ? [d.topik] : r.topik,
    };
    ubahDraf(id, (x) => ({ ...x, galatSimpan: "Sedang membuat soal pengganti…" }));
    try {
      const res = await postJson<{ soal: DraftSoal[] }>("/api/ai/soal", {
        jenjang,
        mapelId,
        rencana: satu,
        indeksBatch: 0,
        hindari: draf.map(cuplikanDraft),
      });
      const baru = res.soal[0];
      if (!baru) throw new Error("AI tidak mengembalikan soal pengganti.");
      setDraf((lama) => lama.map((x) => (x.idLokal === id ? keTinjau(baru) : x)));
    } catch (e) {
      ubahDraf(id, (x) => ({ ...x, galatSimpan: (e as Error).message }));
    }
  }

  const dipilih = draf.filter((d) => d.dipakai);
  const skorDipilih = dipilih.reduce((n, d) => n + (Number(d.skor) || 0), 0);
  const belumBergambar = dipilih.filter((d) => d.gambar && !d.gambarStatus.url).length;

  async function simpanSemua() {
    setMenyimpan(true);
    setRingkasanSimpan(null);
    let berhasil = 0;
    const tersisa: DrafTinjau[] = [];

    // Dibaca dari ref, bukan dari `draf` di closure: saat dipanggil lewat
    // "Langsung simpan", gambar baru saja selesai dibuat dan closure ini
    // masih memegang daftar draf versi sebelum gambarnya ada.
    for (const d of drafRef.current) {
      if (!d.dipakai) {
        tersisa.push(d);
        continue;
      }
      if (d.gambar && !d.gambarStatus.url) {
        tersisa.push({
          ...d,
          galatSimpan: "Soal ini butuh gambar. Buat/unggah gambarnya, atau pilih \"Tanpa gambar\".",
        });
        continue;
      }
      const fd = new FormData();
      fd.set("tipe", d.tipe);
      fd.set("skor", String(d.skor));
      fd.set("gambar_url", "");
      fd.set("konten_jsonb", JSON.stringify(kontenSiapSimpan(d, d.gambarStatus.url)));
      const awal: ActionState = { error: null };
      try {
        const hasil = jenjang
          ? await createSoalAdmin(jenjang, eventId, mapelId, awal, fd)
          : await createSoal(eventId, mapelId, awal, fd);
        if (hasil.error) tersisa.push({ ...d, galatSimpan: hasil.error });
        else berhasil++;
      } catch {
        tersisa.push({ ...d, galatSimpan: "Gagal menyimpan (koneksi?). Coba lagi." });
      }
    }

    setDraf(tersisa);
    drafRef.current = tersisa;
    tulisDrafLokal(mapelId, tersisa);
    setMenyimpan(false);
    setRingkasanSimpan(
      `${berhasil} soal tersimpan ke ${mapelNama} dan Bank Soal${
        tersisa.filter((d) => d.dipakai).length
          ? ` · ${tersisa.filter((d) => d.dipakai).length} perlu dibetulkan (lihat tanda merah)`
          : ""
      }.`
    );
    router.refresh();
  }

  function buangSemua() {
    if (!confirm("Buang semua draf yang belum disimpan?")) return;
    setDraf([]);
    tulisDrafLokal(mapelId, []);
    setFase("petunjuk");
    setRingkasanSimpan(null);
  }

  // ───────────────────────────── Render ─────────────────────────────

  const pemicu = renderPemicu ? (
    renderPemicu(() => setBuka(true))
  ) : varian === "kartu" ? (
      <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-navy-100 bg-gradient-to-br from-navy-50 to-white p-5 sm:flex-row sm:items-center">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-navy-800 text-white">
          <i className="fas fa-wand-magic-sparkles" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-serif font-bold text-navy-900">Generate soal dengan AI</p>
          <p className="text-sm text-slate-600">
            Tulis topik, tentukan jumlah tiap bentuk soal — AI membuat draf,
            kamu meninjau dan memilih gambarnya sebelum disimpan.
          </p>
        </div>
        <button type="button" onClick={() => setBuka(true)} className="btn-navy shrink-0">
          <i className="fas fa-wand-magic-sparkles" aria-hidden />
          Buka Generator
        </button>
      </div>
    ) : (
      <button type="button" onClick={() => setBuka(true)} className="btn-navy-outline">
        <i className="fas fa-wand-magic-sparkles" aria-hidden />
        Generate AI
      </button>
    );

  return (
    <>
      {pemicu}
      {buka && (
        <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-navy-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Generate soal dengan AI"
            className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden bg-paper shadow-2xl sm:max-h-[92vh] sm:rounded-3xl"
          >
            {/* Kepala jendela */}
            <div className="flex items-center gap-3 bg-navy-800 px-5 py-4 text-white">
              <i className="fas fa-wand-magic-sparkles" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-serif text-base font-bold leading-tight">Generate Soal AI</p>
                <p className="truncate text-xs text-white/70">
                  {mapelNama}
                  {jenjangData ? ` · Kelas ${jenjangData}` : ""}
                </p>
              </div>
              <ol className="hidden items-center gap-1 text-[0.7rem] font-semibold sm:flex">
                {(["petunjuk", "proses", "tinjau"] as Fase[]).map((f, i) => (
                  <li
                    key={f}
                    className={`rounded-full px-2.5 py-1 ${
                      fase === f ? "bg-white text-navy-800" : "bg-white/10 text-white/70"
                    }`}
                  >
                    {i + 1}. {f === "petunjuk" ? "Petunjuk" : f === "proses" ? "Proses" : "Tinjau"}
                  </li>
                ))}
              </ol>
              <button
                type="button"
                onClick={() => {
                  batal.current = true;
                  setBuka(false);
                }}
                aria-label="Tutup"
                className="rounded-lg p-2 text-white/80 hover:bg-white/10 hover:text-white"
              >
                <i className="fas fa-xmark" aria-hidden />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
              {!aiSiap && (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <i className="fas fa-key mr-2" aria-hidden />
                  Kunci Gemini untuk kelas {jenjangData ?? "ini"} belum dipasang.
                  Admin perlu mengisi tabel <code>ai_kunci</code> di Supabase kelas{" "}
                  {jenjangData ?? "ini"}. Petunjuk tetap bisa diisi.
                </div>
              )}

              {fase === "petunjuk" && (
                <div className="space-y-5">
                  {/* 1. Topik */}
                  <Bagian nomor={1} judul="Topik atau materi" ket="Bisa lebih dari satu. Tekan Enter atau koma untuk menambah.">
                    <div className="flex flex-wrap gap-2">
                      {topik.map((t) => (
                        <span
                          key={t}
                          className="inline-flex items-center gap-1.5 rounded-full bg-navy-700 py-1 pl-3 pr-1.5 text-xs font-semibold text-white"
                        >
                          {t}
                          <button
                            type="button"
                            onClick={() => setTopik((x) => x.filter((y) => y !== t))}
                            aria-label={`Hapus topik ${t}`}
                            className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-white/20"
                          >
                            <i className="fas fa-xmark text-[0.65rem]" aria-hidden />
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <input
                        value={topikBaru}
                        onChange={(e) => setTopikBaru(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === ",") {
                            e.preventDefault();
                            tambahTopik();
                          }
                        }}
                        placeholder="mis. Sistem pencernaan manusia"
                        className="field"
                        disabled={topik.length >= MAKS_TOPIK}
                      />
                      <button type="button" onClick={tambahTopik} className="btn-navy-outline shrink-0">
                        <i className="fas fa-plus" aria-hidden />
                        Tambah
                      </button>
                    </div>
                  </Bagian>

                  {/* 2 & 3. Bentuk soal + skor */}
                  <Bagian
                    nomor={2}
                    judul="Jumlah soal per bentuk"
                    ket="Ketik angkanya; kosongkan bentuk yang tidak dipakai. Skor dihitung otomatis supaya totalnya pas."
                  >
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                      <div className="hidden grid-cols-[1fr_6rem_8rem] bg-navy-800 px-4 py-2 text-[0.7rem] font-bold uppercase tracking-wide text-white sm:grid">
                        <span>Bentuk soal</span>
                        <span className="text-center">Jumlah</span>
                        <span className="text-right">Skor / soal</span>
                      </div>
                      {TIPE_SOAL_LIST.map((t) => (
                        <div
                          key={t}
                          className="grid grid-cols-[1fr_5rem] items-center gap-x-3 gap-y-1 border-b border-slate-100 px-4 py-2.5 last:border-0 sm:grid-cols-[1fr_6rem_8rem]"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-navy-50 text-sm text-navy-700">
                              <i className={`fas ${IKON[t]}`} aria-hidden />
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-ink">{TIPE_LABEL[t]}</p>
                              <p className="truncate text-[0.72rem] text-slate-500">{TIPE_DESKRIPSI[t]}</p>
                            </div>
                          </div>
                          <input
                            type="number"
                            min={0}
                            max={MAKS_SOAL_SEKALI}
                            inputMode="numeric"
                            value={jumlah[t] || ""}
                            placeholder="0"
                            onChange={(e) =>
                              setJumlah((j) => ({
                                ...j,
                                [t]: Math.max(0, Math.min(MAKS_SOAL_SEKALI, Math.floor(Number(e.target.value) || 0))),
                              }))
                            }
                            aria-label={`Jumlah soal ${TIPE_LABEL[t]}`}
                            className="w-full rounded-lg border border-slate-200 px-2 py-2 text-center text-base font-bold tabular-nums text-ink outline-none focus:border-navy-600 focus:ring-2 focus:ring-navy-600/10"
                          />
                          <p className="col-span-2 text-right text-xs font-semibold tabular-nums text-navy-700 sm:col-span-1">
                            <span className="sm:hidden text-slate-400">Skor/soal: </span>
                            {ringkasSkor(skorOtomatis[t])}
                          </p>
                        </div>
                      ))}
                      <div className="flex flex-wrap items-center justify-between gap-2 bg-navy-50 px-4 py-2.5 text-sm">
                        <span className="font-semibold text-navy-900">
                          Total: {total} soal
                          {total > MAKS_SOAL_SEKALI && (
                            <span className="ml-2 text-rose-600">(maks {MAKS_SOAL_SEKALI})</span>
                          )}
                        </span>
                        <label className="flex items-center gap-2 text-slate-600">
                          Total skor
                          <input
                            type="number"
                            min={1}
                            value={totalSkor}
                            onChange={(e) => setTotalSkor(e.target.value)}
                            className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-center font-bold tabular-nums text-ink outline-none focus:border-navy-600"
                          />
                        </label>
                      </div>
                    </div>
                  </Bagian>

                  {/* 4. Detail */}
                  <Bagian nomor={3} judul="Detail tambahan" ket="Boleh dikosongkan — sistem memilihkan nilai yang wajar.">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="label-field" htmlFor="ai-bergambar">
                          Jumlah soal bergambar
                        </label>
                        <input
                          id="ai-bergambar"
                          type="number"
                          min={0}
                          max={layakGambar}
                          value={bergambar}
                          onChange={(e) => setBergambar(e.target.value)}
                          placeholder={`Otomatis (±${gambarOtomatis} soal)`}
                          className="field"
                        />
                        <p className="mt-1 text-[0.72rem] text-slate-500">
                          Kosong = otomatis maks. {Math.round(PERSEN_GAMBAR_OTOMATIS * 100)}%, hanya
                          bila gambar membantu. Menjodohkan tidak diberi gambar.
                        </p>
                      </div>
                      <div>
                        <label className="label-field" htmlFor="ai-kesulitan">
                          Tingkat kesulitan
                        </label>
                        <select
                          id="ai-kesulitan"
                          value={kesulitan}
                          onChange={(e) => setKesulitan(e.target.value as Kesulitan)}
                          className="field"
                        >
                          {(Object.keys(KESULITAN_LABEL) as Kesulitan[]).map((k) => (
                            <option key={k} value={k}>
                              {KESULITAN_LABEL[k]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <span className="label-field">Opsi pilihan ganda</span>
                        <div className="flex gap-2">
                          {([4, 5] as const).map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setJumlahOpsi(n)}
                              className={`flex-1 rounded-xl border-2 px-3 py-2.5 text-sm font-semibold ${
                                jumlahOpsi === n
                                  ? "border-navy-700 bg-navy-50 text-navy-800"
                                  : "border-slate-200 bg-white text-slate-500"
                              }`}
                            >
                              {n} opsi ({n === 4 ? "A–D" : "A–E"})
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="label-field" htmlFor="ai-catatan">
                          Catatan untuk AI
                        </label>
                        <textarea
                          id="ai-catatan"
                          rows={2}
                          value={catatan}
                          maxLength={600}
                          onChange={(e) => setCatatan(e.target.value)}
                          placeholder="mis. pakai konteks Probolinggo, hindari soal hafalan tahun"
                          className="field"
                        />
                      </div>
                    </div>
                  </Bagian>

                  <Bagian nomor={4} judul="Setelah AI selesai">
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      {(
                        [
                          {
                            v: "tinjau",
                            ikon: "fa-pen-to-square",
                            judul: "Tinjau & edit dulu",
                            ket: "Baca setiap soal, betulkan, pilih gambarnya, lalu simpan. Disarankan.",
                          },
                          {
                            v: "langsung",
                            ikon: "fa-bolt",
                            judul: "Langsung gunakan",
                            ket: "Gambar dibuat otomatis, semua soal langsung masuk mapel ini + Bank Soal.",
                          },
                        ] as const
                      ).map((o) => (
                        <button
                          key={o.v}
                          type="button"
                          onClick={() => setSetelahSelesai(o.v)}
                          className={`flex items-start gap-3 rounded-xl border-2 p-3 text-left transition-colors ${
                            setelahSelesai === o.v
                              ? "border-navy-700 bg-navy-50"
                              : "border-slate-200 bg-white hover:border-slate-300"
                          }`}
                        >
                          <span
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm ${
                              setelahSelesai === o.v ? "bg-navy-800 text-white" : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            <i className={`fas ${o.ikon}`} aria-hidden />
                          </span>
                          <span>
                            <span className="block text-sm font-semibold text-ink">{o.judul}</span>
                            <span className="block text-[0.72rem] leading-snug text-slate-500">{o.ket}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                    {setelahSelesai === "langsung" && (
                      <p className="mt-2 text-[0.72rem] text-amber-700">
                        <i className="fas fa-triangle-exclamation mr-1" aria-hidden />
                        Hasil AI bisa keliru. Cek lagi lewat Pratinjau Ujian sebelum
                        ujian dimulai. Soal yang gagal disimpan tetap muncul sebagai draf.
                      </p>
                    )}
                  </Bagian>

                  {galatPetunjuk && (
                    <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                      <i className="fas fa-circle-exclamation mr-2" aria-hidden />
                      {galatPetunjuk}
                    </p>
                  )}
                </div>
              )}

              {fase === "proses" && (
                <div className="mx-auto max-w-lg py-6">
                  <p className="mb-4 text-center font-serif text-lg font-bold text-navy-900">
                    <i className="fas fa-circle-notch fa-spin mr-2" aria-hidden />
                    AI sedang menyusun soal…
                  </p>
                  <ul className="space-y-2">
                    {batchStatus.map((b, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm"
                      >
                        <i
                          className={`fas mt-0.5 ${
                            b.status === "ok"
                              ? "fa-circle-check text-emerald-500"
                              : b.status === "gagal"
                                ? "fa-circle-xmark text-rose-500"
                                : b.status === "jalan"
                                  ? "fa-circle-notch fa-spin text-navy-600"
                                  : "fa-clock text-slate-300"
                          }`}
                          aria-hidden
                        />
                        <div className="min-w-0">
                          <p className="font-semibold text-ink">{b.label}</p>
                          {b.pesan && <p className="text-xs text-slate-500">{b.pesan}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                  {batchStatus.length > 0 &&
                    batchStatus.every((b) => b.status === "ok" || b.status === "gagal") &&
                    draf.length === 0 && (
                      <button
                        type="button"
                        onClick={() => setFase("petunjuk")}
                        className="btn-navy-outline mx-auto mt-5 flex"
                      >
                        Kembali ke petunjuk
                      </button>
                    )}
                </div>
              )}

              {fase === "tinjau" && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-navy-100 bg-navy-50 px-4 py-3 text-sm text-navy-900">
                    <i className="fas fa-user-check mr-2" aria-hidden />
                    Baca dulu setiap soal. Betulkan yang keliru, hapus centang yang
                    tidak dipakai, lalu siapkan gambarnya. Hasil AI bisa salah —
                    tanggung jawab akhir tetap di guru.
                  </div>
                  {ringkasanSimpan && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                      <i className="fas fa-circle-check mr-2" aria-hidden />
                      {ringkasanSimpan}
                    </div>
                  )}
                  {batchStatus.some((b) => b.status === "gagal") && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      <i className="fas fa-triangle-exclamation mr-2" aria-hidden />
                      Sebagian batch gagal:{" "}
                      {batchStatus
                        .filter((b) => b.status === "gagal")
                        .map((b) => `${b.label} (${b.pesan})`)
                        .join("; ")}
                    </div>
                  )}
                  {draf.length === 0 ? (
                    <p className="py-10 text-center text-sm text-slate-500">
                      Tidak ada draf tersisa.
                    </p>
                  ) : (
                    draf.map((d, i) => (
                      <KartuDraf
                        key={d.idLokal}
                        nomor={i + 1}
                        draf={d}
                        sedangSibuk={menyimpan || gambarMassal}
                        onUbah={(baru) => ubahDraf(d.idLokal, () => baru)}
                        onBuatGambar={(jenis) => buatGambar(d.idLokal, jenis)}
                        onUnggahGambar={(f) => prosesGambar(d.idLokal, "unggah", () => unggahBerkasGuru(f))}
                        onGantiSoal={() => gantiSoal(d.idLokal)}
                      />
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Kaki jendela */}
            <div className="flex flex-col gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:px-6">
              {fase === "petunjuk" && (
                <>
                  <p className="text-xs text-slate-500 sm:mr-auto">
                    {total} soal · ±{pecahBatch({
                      topik: ["x"],
                      jumlah,
                      jumlahBergambar: null,
                      kesulitan,
                      jumlahOpsi,
                      catatan: "",
                      totalSkor: targetSkor,
                    }).length}{" "}
                    panggilan AI
                    {draf.length > 0 && ` · ${draf.length} draf menunggu ditinjau`}
                  </p>
                  {draf.length > 0 && (
                    <button type="button" onClick={() => setFase("tinjau")} className="btn-ghost">
                      Lihat draf
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={mulai}
                    disabled={total === 0 || total > MAKS_SOAL_SEKALI}
                    className="btn-navy"
                  >
                    <i className="fas fa-wand-magic-sparkles" aria-hidden />
                    Generate {total} Soal
                  </button>
                </>
              )}
              {fase === "proses" && (
                <button
                  type="button"
                  onClick={() => {
                    batal.current = true;
                  }}
                  className="btn-ghost sm:ml-auto"
                >
                  Hentikan setelah batch ini
                </button>
              )}
              {fase === "tinjau" && (
                <>
                  <p className="text-xs text-slate-500 sm:mr-auto">
                    <b className="text-ink">{dipilih.length}</b> dipilih · skor{" "}
                    <b className={skorDipilih === targetSkor ? "text-emerald-600" : "text-amber-600"}>
                      {formatAngka(skorDipilih)}
                    </b>
                    {belumBergambar > 0 && (
                      <>
                        {" "}· <b className="text-rose-600">{belumBergambar}</b> belum bergambar
                      </>
                    )}
                    {infoMassal && (
                      <span className="mt-0.5 block font-semibold text-navy-700">
                        <i className="fas fa-hourglass-half mr-1" aria-hidden />
                        {infoMassal}
                      </span>
                    )}
                  </p>
                  {gambarMassal && (
                    <button
                      type="button"
                      onClick={() => {
                        batal.current = true;
                      }}
                      className="btn-ghost"
                    >
                      Hentikan gambar
                    </button>
                  )}
                  <button type="button" onClick={buangSemua} className="btn-ghost" disabled={menyimpan}>
                    <i className="fas fa-trash" aria-hidden />
                    Buang draf
                  </button>
                  <button
                    type="button"
                    onClick={() => setFase("petunjuk")}
                    className="btn-ghost"
                    disabled={menyimpan}
                  >
                    <i className="fas fa-plus" aria-hidden />
                    Generate lagi
                  </button>
                  {belumBergambar > 0 && (
                    <button
                      type="button"
                      onClick={buatSemuaGambar}
                      disabled={gambarMassal || menyimpan}
                      className="btn-navy-outline"
                    >
                      <i className={`fas ${gambarMassal ? "fa-circle-notch fa-spin" : "fa-images"}`} aria-hidden />
                      Buat {belumBergambar} gambar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={simpanSemua}
                    disabled={menyimpan || gambarMassal || dipilih.length === 0}
                    className="btn-navy"
                  >
                    <i className={`fas ${menyimpan ? "fa-circle-notch fa-spin" : "fa-floppy-disk"}`} aria-hidden />
                    {menyimpan ? "Menyimpan…" : `Simpan ${dipilih.length} Soal`}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Bagian({
  nomor,
  judul,
  ket,
  children,
}: {
  nomor: number;
  judul: string;
  ket?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="mb-3 flex items-start gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-navy-800 text-xs font-bold text-white">
          {nomor}
        </span>
        <div>
          <h3 className="font-serif font-bold text-navy-900">{judul}</h3>
          {ket && <p className="text-xs text-slate-500">{ket}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}
