"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { TipeSoal } from "@/types";
import { TIPE_DESKRIPSI, TIPE_LABEL, TIPE_SOAL_LIST } from "@/lib/soal";
import type { Jenjang } from "@/lib/jenjang";
import {
  JENIS_ASESMEN,
  KESULITAN_LABEL,
  LEVEL_KOGNITIF,
  MAKS_CONTOH,
  MAKS_SOAL_SEKALI,
  MAKS_TOPIK,
  PERSEN_GAMBAR_OTOMATIS,
  PERSEN_KESULITAN_BAWAAN,
  TIPE_BISA_GAMBAR,
  alokasiGambar,
  bagiSkor,
  cuplikanDraft,
  formatAngka,
  jumlahKosong,
  pecahBatch,
  pemanduKosong,
  pindahJumlah,
  ringkasSkor,
  sesuaikanTotal,
  totalSoal,
  type DraftSoal,
  type JumlahPerTipe,
  type Kesulitan,
  type PemanduSoal,
  type PersenKesulitan,
  type RencanaGenerate,
} from "@/lib/ai/rencana-soal";
import { JENIS_STIMULUS } from "@/lib/ai/stimulus";
import {
  STATUS_KOSONG,
  drafButuhGambar,
  drafButuhStimulus,
  htmlDokumenSoal,
  kontenFinalDraf,
  namaBerkas,
  type DrafTinjau,
  type SoalDokumen,
} from "@/lib/ai/draf";
import {
  GalatBatasGambar,
  buatDiagram,
  buatIlustrasi,
  pakaiFoto,
  postJson,
  renderStimulus,
  unggahBerkasGuru,
  type KandidatFoto,
} from "@/lib/ai/gambar-klien";
import {
  createSoal,
  createSoalAdmin,
  type ActionState,
} from "@/app/admin/event/[eventId]/mapel/[mapelId]/soal/actions";
import { simpanPaketKeBank } from "@/app/admin/bank-soal/actions";
import { mintaTambahKuotaAi, mulaiGenerateAi, statusKuotaAi } from "@/app/admin/soal-ai/actions";
import type { StatusKuota } from "@/lib/ai/kuota";
import KartuDraf from "./KartuDraf";
import PreviewKuis from "./PreviewKuis";
import DokumenDraf, { cetakHtml, unduhHtml } from "./DokumenDraf";

/**
 * "Buat Soal dengan AI" — wizard lengkap.
 *
 *   1. Petunjuk  — topik, jumlah soal + sebaran 6 bentuk (bisa dipindah),
 *                  pertanyaan pemandu, contoh soal (unggah dokumen), detail.
 *   2. Proses    — satu kuota harian → tiket → beberapa panggilan batch.
 *   3. Hasil     — Preview soal (kuis) / Lihat draf (dokumen) → Next.
 *   4. Pilih     — Edit soal (form manual per soal) atau Lanjutkan.
 *   5. Simpan    — Simpan ke Bank Soal (beri nama paket) dan/atau Unduh.
 *   6. Akhir     — (di mapel kegiatan) Masukkan ke ujian atau Tutup.
 *
 * Dua tempat pakai:
 *   - di mapel kegiatan (`mapelId` diisi): ada langkah 6;
 *   - halaman "Buat Soal AI" di sidebar (`mapelId` kosong): guru mengetik
 *     nama mapel sendiri, berhenti di langkah 5.
 *
 * Kuota: 1 generate / guru / hari (admin bebas), lihat src/lib/ai/kuota.ts.
 * Draf + tiket disimpan di localStorage supaya hasil yang sudah memakan
 * kuota tidak hilang karena jendela tertutup atau halaman dimuat ulang.
 */

const IKON: Record<TipeSoal, string> = {
  pilgan_biasa: "fa-circle-dot",
  pilgan_kompleks: "fa-square-check",
  uraian_singkat: "fa-pen-to-square",
  benar_salah: "fa-toggle-on",
  multi_benar_salah: "fa-list-check",
  menjodohkan: "fa-link",
};

type Fase = "petunjuk" | "proses" | "hasil" | "pilih" | "edit" | "simpan" | "akhir";

const LANGKAH: { fase: Fase[]; label: string }[] = [
  { fase: ["petunjuk"], label: "Petunjuk" },
  { fase: ["proses"], label: "Proses" },
  { fase: ["hasil"], label: "Hasil" },
  { fase: ["pilih", "edit"], label: "Edit" },
  { fase: ["simpan"], label: "Simpan" },
  { fase: ["akhir"], label: "Ujian" },
];

interface StatusBatch {
  label: string;
  status: "antre" | "jalan" | "ok" | "gagal";
  pesan?: string;
}

interface SimpananLokal {
  draf: DrafTinjau[];
  tiket: string | null;
  keBank: boolean;
}

function bacaLokal(kunci: string): SimpananLokal | null {
  try {
    const raw = localStorage.getItem(kunci);
    if (!raw) return null;
    const x = JSON.parse(raw) as SimpananLokal | DrafTinjau[];
    // Bentuk lama (sebelum ada tiket): array draf saja.
    if (Array.isArray(x)) return { draf: x, tiket: null, keBank: false };
    return Array.isArray(x.draf) ? x : null;
  } catch {
    return null;
  }
}

function tulisLokal(kunci: string, isi: SimpananLokal) {
  try {
    if (isi.draf.length === 0) localStorage.removeItem(kunci);
    else localStorage.setItem(kunci, JSON.stringify(isi));
  } catch {
    // penyimpanan penuh/diblokir — draf tetap ada di memori tab ini
  }
}

function keTinjau(d: DraftSoal): DrafTinjau {
  return {
    ...d,
    dipakai: true,
    gambarStatus: { ...STATUS_KOSONG },
    stimulusStatus: { ...STATUS_KOSONG },
    galatSimpan: null,
  };
}

async function ekstrakBerkas(file: File, jenjang?: Jenjang): Promise<{ teks: string; terpotong: boolean }> {
  const fd = new FormData();
  fd.set("berkas", file);
  if (jenjang) fd.set("jenjang", String(jenjang));
  const res = await fetch("/api/ai/ekstrak", { method: "POST", body: fd });
  const body = (await res.json().catch(() => null)) as { teks?: string; terpotong?: boolean; error?: string } | null;
  if (!res.ok || !body?.teks) throw new Error(body?.error ?? "Gagal membaca berkas.");
  return { teks: body.teks, terpotong: !!body.terpotong };
}

export default function GeneratorSoalAi({
  eventId = "",
  mapelId = "",
  mapelNama = "",
  jenjang,
  jenjangData,
  aiSiap,
  varian = "tombol",
  renderPemicu,
  tampilan = "jendela",
  mapelSaran = [],
}: {
  eventId?: string;
  /** Kosong = mode halaman sidebar (tidak terikat mapel kegiatan). */
  mapelId?: string;
  mapelNama?: string;
  /** Hanya diisi di mode admin lintas jenjang (`?jenjang=`). */
  jenjang?: Jenjang;
  /** Jenjang tempat soal disimpan — untuk label. */
  jenjangData: Jenjang | null;
  /** Kunci Gemini untuk jenjang ini sudah dipasang di server? */
  aiSiap: boolean;
  varian?: "tombol" | "kartu";
  /** Pemicu buatan sendiri (mis. ubin "3 cara input soal"). */
  renderPemicu?: (buka: () => void) => React.ReactNode;
  /** "halaman" = langsung tampil di halaman, bukan jendela melayang. */
  tampilan?: "jendela" | "halaman";
  /** Saran nama mapel (mode halaman), mis. dari Bank Soal. */
  mapelSaran?: string[];
}) {
  const router = useRouter();
  const terikatMapel = !!mapelId;
  const kunciLokal = terikatMapel ? `lms-ai-draf:${mapelId}` : `lms-ai-draf:mandiri:${jenjang ?? jenjangData ?? "x"}`;
  const [buka, setBuka] = useState(tampilan === "halaman");
  const [fase, setFase] = useState<Fase>("petunjuk");

  // ── Petunjuk ──
  const [namaMapel, setNamaMapel] = useState(mapelNama);
  const [topik, setTopik] = useState<string[]>([]);
  const [topikBaru, setTopikBaru] = useState("");
  const [jumlah, setJumlah] = useState<JumlahPerTipe>(() => ({ ...jumlahKosong(), pilgan_biasa: 10 }));
  const [pemandu, setPemandu] = useState<PemanduSoal>(pemanduKosong);
  const [infoContoh, setInfoContoh] = useState<string | null>(null);
  const [membacaContoh, setMembacaContoh] = useState(false);
  const [bergambar, setBergambar] = useState("");
  const [kesulitan, setKesulitan] = useState<Kesulitan>("campuran");
  const [persenKesulitan, setPersenKesulitan] = useState<PersenKesulitan>(PERSEN_KESULITAN_BAWAAN);
  const totalPersen = persenKesulitan.mudah + persenKesulitan.sedang + persenKesulitan.sulit;
  const persenTidakPas = kesulitan === "campuran" && totalPersen !== 100;
  const [jumlahOpsi, setJumlahOpsi] = useState<4 | 5>(4);
  const [totalSkor, setTotalSkor] = useState("100");
  const [catatan, setCatatan] = useState("");
  const [galatPetunjuk, setGalatPetunjuk] = useState<string | null>(null);

  // ── Kuota ──
  const [kuota, setKuota] = useState<StatusKuota | null>(null);
  const [alasanMinta, setAlasanMinta] = useState("");
  const [kirimMinta, setKirimMinta] = useState(false);
  const [pesanMinta, setPesanMinta] = useState<string | null>(null);

  // ── Proses, hasil, simpan ──
  const [batchStatus, setBatchStatus] = useState<StatusBatch[]>([]);
  const [draf, setDraf] = useState<DrafTinjau[]>([]);
  const [tiket, setTiket] = useState<string | null>(null);
  const [tampilHasil, setTampilHasil] = useState<"kuis" | "dokumen" | null>(null);
  const [gambarMassal, setGambarMassal] = useState(false);
  const [infoMassal, setInfoMassal] = useState<string | null>(null);
  const [paketNama, setPaketNama] = useState("");
  const [menyimpanBank, setMenyimpanBank] = useState(false);
  const [keBank, setKeBank] = useState(false);
  const [pesanBank, setPesanBank] = useState<{ ok: boolean; teks: string } | null>(null);
  const [memasukkan, setMemasukkan] = useState(false);
  const [ringkasanUjian, setRingkasanUjian] = useState<{ ok: boolean; teks: string } | null>(null);

  const rencanaTerakhir = useRef<RencanaGenerate | null>(null);
  const batal = useRef(false);
  const drafRef = useRef<DrafTinjau[]>([]);
  drafRef.current = draf;
  const fileContohRef = useRef<HTMLInputElement>(null);
  const [tautanBacaan, setTautanBacaan] = useState("");
  const [membacaTautan, setMembacaTautan] = useState(false);
  const [infoBacaan, setInfoBacaan] = useState<string | null>(null);

  const total = totalSoal(jumlah);
  const targetSkor = Number(totalSkor) > 0 ? Number(totalSkor) : 100;
  const skorOtomatis = useMemo(() => bagiSkor(jumlah, targetSkor), [jumlah, targetSkor]);
  const gambarOtomatis = useMemo(() => alokasiGambar(jumlah, null).total, [jumlah]);
  const layakGambar = TIPE_BISA_GAMBAR.reduce((n, t) => n + (jumlah[t] || 0), 0);
  const kuotaHabis = !!kuota && kuota.terbatas && (kuota.sisa <= 0 || !!kuota.galat);

  const soalDok: SoalDokumen[] = useMemo(
    () => draf.map((d) => ({ tipe: d.tipe, skor: d.skor, konten: kontenFinalDraf(d) })),
    [draf]
  );
  const skorTotalDraf = draf.reduce((n, d) => n + (Number(d.skor) || 0), 0);
  const belumBergambar = draf.filter(drafButuhGambar);
  const judulDok = `Soal ${namaMapel || "Tanpa Mapel"}`;
  const subjudulDok = [jenjangData ? `Kelas ${jenjangData}` : "", topik.join(", ")].filter(Boolean).join(" · ");

  function muatKuota() {
    statusKuotaAi()
      .then(setKuota)
      .catch(() => setKuota(null));
  }

  // Pulihkan draf yang belum selesai, dan muat kuota.
  useEffect(() => {
    if (!buka) return;
    muatKuota();
    const lama = bacaLokal(kunciLokal);
    if (lama && lama.draf.length > 0 && draf.length === 0) {
      setDraf(lama.draf.map((d) => ({ ...d, gambarStatus: { ...d.gambarStatus, proses: null } })));
      setTiket(lama.tiket);
      setKeBank(lama.keBank);
      setFase("hasil");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buka]);

  useEffect(() => {
    if (fase !== "petunjuk" && fase !== "proses") tulisLokal(kunciLokal, { draf, tiket, keBank });
  }, [draf, fase, kunciLokal, tiket, keBank]);

  // Kunci gulir halaman di belakang jendela.
  useEffect(() => {
    if (!buka || tampilan === "halaman") return;
    const lama = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = lama;
    };
  }, [buka, tampilan]);

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
    if (!terikatMapel && !namaMapel.trim()) return "Isi nama mata pelajaran dulu.";
    if (semuaTopik.length === 0) return "Isi minimal satu topik/materi.";
    if (total === 0) return "Isi jumlah soal minimal pada satu bentuk soal.";
    if (total > MAKS_SOAL_SEKALI) return `Maksimal ${MAKS_SOAL_SEKALI} soal sekali generate.`;
    if (persenTidakPas) return `Persentase LOTS + MOTS + HOTS harus 100% (sekarang ${totalPersen}%).`;
    return {
      topik: semuaTopik.slice(0, MAKS_TOPIK),
      jumlah,
      jumlahBergambar: bergambar.trim() === "" ? null : Math.max(0, Number(bergambar) || 0),
      kesulitan,
      persenKesulitan,
      jumlahOpsi,
      catatan,
      totalSkor: targetSkor,
      pemandu,
    };
  }

  async function panggilBatch(rencana: RencanaGenerate, indeksBatch: number, hindari: string[], tiketPakai: string | null) {
    return postJson<{ soal: DraftSoal[]; dibuang: number }>("/api/ai/soal", {
      jenjang,
      ...(terikatMapel ? { mapelId } : { mapelNama: namaMapel.trim() }),
      rencana,
      indeksBatch,
      hindari,
      tiket: tiketPakai,
    });
  }

  async function jalankanGenerate(rencana: RencanaGenerate, tiketPakai: string | null, tambahKe: DrafTinjau[]) {
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
        const res = await panggilBatch(rencana, i, hasil.map(cuplikanDraft), tiketPakai);
        hasil = [...hasil, ...res.soal.map(keTinjau)];
        setDraf(hasil);
        setBatchStatus((s) =>
          s.map((x, j) =>
            j === i
              ? { ...x, status: "ok", pesan: res.dibuang ? `${res.dibuang} soal dibuang karena bentuknya rusak` : undefined }
              : x
          )
        );
      } catch (e) {
        setBatchStatus((s) => s.map((x, j) => (j === i ? { ...x, status: "gagal", pesan: (e as Error).message } : x)));
      }
    }
    setDraf(hasil);
    drafRef.current = hasil;
    tulisLokal(kunciLokal, { draf: hasil, tiket: tiketPakai, keBank: false });
    if (hasil.length > 0) {
      setTampilHasil(null);
      setFase("hasil");
      // Stimulus tabel/grafik/infografis langsung digambar supaya Preview
      // & Lihat draf sudah lengkap. Tanpa AI, tidak memakai kuota.
      await renderSemuaStimulus();
    }
  }

  async function renderSemuaStimulus() {
    const antre = drafRef.current.filter(drafButuhStimulus);
    for (let i = 0; i < antre.length; i++) {
      if (batal.current) break;
      setInfoMassal(`Menggambar stimulus ${i + 1}/${antre.length}…`);
      await renderStimulusDraf(antre[i].idLokal);
    }
    setInfoMassal(null);
  }

  async function mulai() {
    const r = susunRencana();
    if (typeof r === "string") {
      setGalatPetunjuk(r);
      return;
    }
    if (draf.length > 0 && !confirm(`Masih ada ${draf.length} draf sebelumnya. Generate baru akan menggantinya. Lanjutkan?`)) {
      return;
    }
    setGalatPetunjuk(null);
    if (topikBaru.trim()) {
      setTopik(r.topik);
      setTopikBaru("");
    }
    const m = await mulaiGenerateAi(r);
    muatKuota();
    if (m.error) {
      setGalatPetunjuk(m.error);
      return;
    }
    setTiket(m.tiket);
    setKeBank(false);
    setPesanBank(null);
    setRingkasanUjian(null);
    setPaketNama(`${terikatMapel ? mapelNama : namaMapel.trim()} – ${r.topik.slice(0, 2).join(", ")} (AI)`.slice(0, 120));
    await jalankanGenerate(r, m.tiket, []);
  }

  async function kirimPermintaan() {
    setKirimMinta(true);
    setPesanMinta(null);
    const { error } = await mintaTambahKuotaAi(alasanMinta);
    setKirimMinta(false);
    setPesanMinta(error ?? "Permintaan terkirim. Tunggu persetujuan admin, lalu buka lagi jendela ini.");
    if (!error) setAlasanMinta("");
    muatKuota();
  }

  async function ambilBacaan() {
    const url = tautanBacaan.trim();
    if (!url) return;
    setMembacaTautan(true);
    setInfoBacaan(null);
    try {
      const fd = new FormData();
      fd.set("url", url);
      if (jenjang) fd.set("jenjang", String(jenjang));
      const res = await fetch("/api/ai/ekstrak", { method: "POST", body: fd });
      const body = (await res.json().catch(() => null)) as
        | { teks?: string; terpotong?: boolean; judul?: string; sumber?: string; error?: string }
        | null;
      if (!res.ok || !body?.teks) throw new Error(body?.error ?? "Gagal mengambil artikel.");
      setPemandu((p) => ({
        ...p,
        bacaan: (p.bacaan ? `${p.bacaan}\n\n` : "") + body.teks,
        sumberBacaan: p.sumberBacaan || body.sumber || url,
      }));
      setInfoBacaan(`${body.judul || "Artikel"} terambil${body.terpotong ? " (dipotong)" : ""}. Periksa isinya di bawah.`);
      setTautanBacaan("");
    } catch (e) {
      setInfoBacaan((e as Error).message);
    } finally {
      setMembacaTautan(false);
    }
  }

  async function unggahContoh(file: File) {
    setMembacaContoh(true);
    setInfoContoh(null);
    try {
      const { teks, terpotong } = await ekstrakBerkas(file, jenjang);
      setPemandu((p) => ({ ...p, contoh: (p.contoh ? `${p.contoh}\n\n` : "") + teks }));
      setInfoContoh(
        `${file.name} terbaca${terpotong ? ` (dipotong ke ${MAKS_CONTOH.toLocaleString("id-ID")} karakter)` : ""}. Periksa & rapikan teksnya di bawah.`
      );
    } catch (e) {
      setInfoContoh((e as Error).message);
    } finally {
      setMembacaContoh(false);
    }
  }

  function ubahDraf(id: string, fn: (d: DrafTinjau) => DrafTinjau) {
    setDraf((lama) => lama.map((d) => (d.idLokal === id ? fn(d) : d)));
  }

  async function prosesGambar(
    id: string,
    jenis: "diagram" | "ilustrasi" | "unggah" | "foto",
    kerja: (d: DrafTinjau) => Promise<{ url: string; jedaDetik?: number }>,
    kredit: string | null = null
  ): Promise<{ ok: boolean; jedaDetik?: number; galat?: unknown }> {
    const d = drafRef.current.find((x) => x.idLokal === id);
    if (!d) return { ok: false };
    ubahDraf(id, (x) => ({ ...x, gambarStatus: { ...x.gambarStatus, proses: jenis, galat: null } }));
    try {
      const { url, jedaDetik } = await kerja(d);
      ubahDraf(id, (x) => ({ ...x, gambarStatus: { url, proses: null, galat: null, kredit } }));
      return { ok: true, jedaDetik };
    } catch (e) {
      ubahDraf(id, (x) => ({ ...x, gambarStatus: { ...x.gambarStatus, proses: null, galat: (e as Error).message } }));
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

  function pilihFoto(id: string, k: KandidatFoto) {
    return prosesGambar(id, "foto", () => pakaiFoto(k), k.kredit);
  }

  /** Render stimulus tabel/grafik/infografis (tanpa AI, tanpa jeda). */
  async function renderStimulusDraf(id: string): Promise<boolean> {
    const d = drafRef.current.find((x) => x.idLokal === id);
    if (!d?.stimulus) return false;
    const st = (x: DrafTinjau) => x.stimulusStatus ?? STATUS_KOSONG;
    ubahDraf(id, (x) => ({ ...x, stimulusStatus: { ...st(x), proses: "stimulus", galat: null } }));
    try {
      const { url } = await renderStimulus({ jenjang, stimulus: d.stimulus });
      ubahDraf(id, (x) => ({ ...x, stimulusStatus: { ...STATUS_KOSONG, url } }));
      return true;
    } catch (e) {
      ubahDraf(id, (x) => ({ ...x, stimulusStatus: { ...st(x), proses: null, galat: (e as Error).message } }));
      return false;
    }
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
    // Stimulus dulu: dirender server tanpa AI, cepat, tanpa batas jeda.
    await renderSemuaStimulus();
    const antre = drafRef.current
      .filter((d) => !!d.gambar && !d.gambarStatus.url && !d.diedit)
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

  function tanpaGambarSemua() {
    setDraf((lama) =>
      lama.map((d) => (d.gambar && !d.gambarStatus.url && !d.diedit ? { ...d, gambar: null, gambarStatus: { ...STATUS_KOSONG } } : d))
    );
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
      const res = await panggilBatch(satu, 0, draf.map(cuplikanDraft), tiket);
      const baru = res.soal[0];
      if (!baru) throw new Error("AI tidak mengembalikan soal pengganti.");
      setDraf((lama) => lama.map((x) => (x.idLokal === id ? keTinjau(baru) : x)));
    } catch (e) {
      ubahDraf(id, (x) => ({ ...x, galatSimpan: (e as Error).message }));
    }
  }

  async function simpanKeBank() {
    if (belumBergambar.length > 0) {
      setPesanBank({ ok: false, teks: `${belumBergambar.length} soal masih butuh gambar. Buat gambarnya atau pilih "Tanpa gambar" dulu.` });
      return;
    }
    setMenyimpanBank(true);
    setPesanBank(null);
    try {
      const h = await simpanPaketKeBank(jenjang ?? null, {
        mapelNama: terikatMapel ? mapelNama : namaMapel,
        paketNama,
        soal: soalDok,
      });
      if (h.error) setPesanBank({ ok: false, teks: h.error });
      else {
        setKeBank(true);
        setPesanBank({
          ok: true,
          teks: `${h.jumlah} soal tersimpan di Bank Soal${h.tanpaNamaPaket ? " (nama paket belum tersimpan — migrasi 0025 belum dijalankan)" : ` sebagai paket "${paketNama}"`}.`,
        });
      }
    } catch {
      setPesanBank({ ok: false, teks: "Gagal menyimpan (koneksi?). Coba lagi." });
    } finally {
      setMenyimpanBank(false);
    }
  }

  async function masukkanKeUjian() {
    if (belumBergambar.length > 0) {
      setRingkasanUjian({ ok: false, teks: `${belumBergambar.length} soal masih butuh gambar. Kembali ke langkah Edit.` });
      return;
    }
    setMemasukkan(true);
    setRingkasanUjian(null);
    let berhasil = 0;
    const tersisa: DrafTinjau[] = [];
    for (const d of drafRef.current) {
      const fd = new FormData();
      fd.set("tipe", d.tipe);
      fd.set("skor", String(d.skor));
      fd.set("gambar_url", "");
      fd.set("konten_jsonb", JSON.stringify(kontenFinalDraf(d)));
      // Sudah disimpan ke bank sebagai paket → jangan disalin lagi.
      if (keBank) fd.set("lewati_bank", "1");
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
    tulisLokal(kunciLokal, { draf: tersisa, tiket, keBank });
    setMemasukkan(false);
    setRingkasanUjian(
      tersisa.length === 0
        ? { ok: true, teks: `${berhasil} soal masuk ke ujian ${mapelNama}${keBank ? "" : " (salinannya otomatis masuk Bank Soal)"}.` }
        : { ok: false, teks: `${berhasil} soal masuk · ${tersisa.length} gagal (lihat tanda merah di langkah Edit).` }
    );
    router.refresh();
  }

  function selesaiDanTutup() {
    if (draf.length > 0 && !keBank && fase === "simpan" && !terikatMapel) {
      if (!confirm("Draf belum disimpan ke Bank Soal. Kalau sudah diunduh, tutup dan buang drafnya?")) return;
    }
    if (fase === "simpan" || fase === "akhir") {
      setDraf([]);
      tulisLokal(kunciLokal, { draf: [], tiket: null, keBank: false });
      setTiket(null);
      setKeBank(false);
      setPesanBank(null);
      setRingkasanUjian(null);
      setFase("petunjuk");
    }
    if (tampilan === "jendela") setBuka(false);
  }

  function buangSemua() {
    if (!confirm("Buang semua draf? Kuota yang sudah terpakai tidak kembali.")) return;
    setDraf([]);
    tulisLokal(kunciLokal, { draf: [], tiket: null, keBank: false });
    setTiket(null);
    setFase("petunjuk");
  }

  // ───────────────────────────── Render ─────────────────────────────

  const pemicu =
    tampilan === "halaman" ? null : renderPemicu ? (
      renderPemicu(() => setBuka(true))
    ) : varian === "kartu" ? (
      <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-navy-100 bg-gradient-to-br from-navy-50 to-white p-5 sm:flex-row sm:items-center">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-navy-800 text-white">
          <i className="fas fa-wand-magic-sparkles" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-serif font-bold text-navy-900">Generate soal dengan AI</p>
          <p className="text-sm text-slate-600">
            Tulis topik, tentukan jumlah tiap bentuk soal — AI membuat draf, kamu meninjau sebelum
            dimasukkan ke ujian.
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

  const langkahTampil = terikatMapel ? LANGKAH : LANGKAH.slice(0, 5);
  const urutAktif = langkahTampil.findIndex((l) => l.fase.includes(fase));

  const jendela = (
    <div
      role={tampilan === "jendela" ? "dialog" : undefined}
      aria-modal={tampilan === "jendela" ? true : undefined}
      aria-label="Buat soal dengan AI"
      className={
        tampilan === "jendela"
          ? "flex max-h-full w-full max-w-4xl flex-col overflow-hidden bg-paper shadow-2xl sm:max-h-[92vh] sm:rounded-3xl"
          : "flex w-full flex-col overflow-hidden rounded-3xl border border-slate-200 bg-paper shadow-sm"
      }
    >
      {/* Kepala */}
      <div className="flex items-center gap-3 bg-navy-800 px-5 py-4 text-white">
        <i className="fas fa-wand-magic-sparkles" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-serif text-base font-bold leading-tight">Buat Soal dengan AI</p>
          <p className="truncate text-xs text-white/70">
            {(terikatMapel ? mapelNama : namaMapel) || "Mapel belum diisi"}
            {jenjangData ? ` · Kelas ${jenjangData}` : ""}
          </p>
        </div>
        <ol className="hidden items-center gap-1 text-[0.7rem] font-semibold md:flex">
          {langkahTampil.map((l, i) => (
            <li
              key={l.label}
              className={`rounded-full px-2.5 py-1 ${
                i === urutAktif ? "bg-white text-navy-800" : i < urutAktif ? "bg-white/25 text-white" : "bg-white/10 text-white/60"
              }`}
            >
              {i + 1}. {l.label}
            </li>
          ))}
        </ol>
        {tampilan === "jendela" && (
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
        )}
      </div>

      <div className={`min-h-0 flex-1 p-4 sm:p-6 ${tampilan === "jendela" ? "overflow-y-auto" : ""}`}>
        {!aiSiap && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <i className="fas fa-key mr-2" aria-hidden />
            Kunci Gemini untuk kelas {jenjangData ?? "ini"} belum dipasang. Admin perlu mengisi tabel{" "}
            <code>ai_kunci</code> di Supabase kelas {jenjangData ?? "ini"}. Petunjuk tetap bisa diisi.
          </div>
        )}

        {fase === "petunjuk" && (
          <div className="space-y-5">
            <PanelKuota
              kuota={kuota}
              alasan={alasanMinta}
              setAlasan={setAlasanMinta}
              kirim={kirimPermintaan}
              mengirim={kirimMinta}
              pesan={pesanMinta}
            />

            {/* 1. Mapel & topik */}
            <Bagian nomor={1} judul={terikatMapel ? "Topik atau materi" : "Mata pelajaran & topik"} ket="Topik bisa lebih dari satu. Tekan Enter atau koma untuk menambah.">
              {!terikatMapel && (
                <div className="mb-3">
                  <label className="label-field" htmlFor="ai-mapel">
                    Mata pelajaran
                  </label>
                  <input
                    id="ai-mapel"
                    list="ai-mapel-saran"
                    value={namaMapel}
                    maxLength={80}
                    onChange={(e) => setNamaMapel(e.target.value)}
                    placeholder="mis. IPA"
                    className="field"
                  />
                  <datalist id="ai-mapel-saran">
                    {mapelSaran.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </div>
              )}
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

            {/* 2. Jumlah & sebaran bentuk soal */}
            <Bagian
              nomor={2}
              judul="Jumlah soal & bentuknya"
              ket="Tentukan jumlah soal, lalu bagi ke 6 bentuk soal. Tombol − / + memindahkan soal antar bentuk; totalnya tetap."
            >
              <div className="mb-3 flex flex-wrap items-end gap-4">
                <div>
                  <label className="label-field" htmlFor="ai-total">
                    Jumlah soal
                  </label>
                  <input
                    id="ai-total"
                    type="number"
                    min={1}
                    max={MAKS_SOAL_SEKALI}
                    inputMode="numeric"
                    value={total || ""}
                    placeholder="0"
                    onChange={(e) =>
                      setJumlah((j) =>
                        sesuaikanTotal(j, Math.min(MAKS_SOAL_SEKALI, Math.max(0, Math.floor(Number(e.target.value) || 0))))
                      )
                    }
                    className="w-28 rounded-xl border border-slate-200 px-3 py-2.5 text-center text-lg font-bold tabular-nums text-ink outline-none focus:border-navy-600 focus:ring-2 focus:ring-navy-600/10"
                  />
                </div>
                <div>
                  <label className="label-field" htmlFor="ai-skor">
                    Total skor
                  </label>
                  <input
                    id="ai-skor"
                    type="number"
                    min={1}
                    value={totalSkor}
                    onChange={(e) => setTotalSkor(e.target.value)}
                    className="w-24 rounded-xl border border-slate-200 px-3 py-2.5 text-center text-lg font-bold tabular-nums text-ink outline-none focus:border-navy-600"
                  />
                </div>
                <p className="pb-2 text-xs text-slate-500">Maks. {MAKS_SOAL_SEKALI} soal sekali generate.</p>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="hidden grid-cols-[1fr_9rem_7rem] bg-navy-800 px-4 py-2 text-[0.7rem] font-bold uppercase tracking-wide text-white sm:grid">
                  <span>Bentuk soal</span>
                  <span className="text-center">Jumlah</span>
                  <span className="text-right">Skor / soal</span>
                </div>
                {TIPE_SOAL_LIST.map((t) => {
                  // Sumber soal saat menekan "+": bentuk terisi terbanyak selain dirinya.
                  const sumber = TIPE_SOAL_LIST.filter((x) => x !== t && jumlah[x] > 0).sort((a, b) => jumlah[b] - jumlah[a])[0];
                  const tujuanKurang = t === "pilgan_biasa" ? "uraian_singkat" : "pilgan_biasa";
                  return (
                    <div
                      key={t}
                      className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 border-b border-slate-100 px-4 py-2.5 last:border-0 sm:grid-cols-[1fr_9rem_7rem]"
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
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => setJumlah((j) => pindahJumlah(j, t, tujuanKurang))}
                          disabled={jumlah[t] === 0}
                          aria-label={`Kurangi ${TIPE_LABEL[t]} (pindah ke ${TIPE_LABEL[tujuanKurang]})`}
                          title={`Pindahkan 1 soal ke ${TIPE_LABEL[tujuanKurang]}`}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30"
                        >
                          <i className="fas fa-minus text-xs" aria-hidden />
                        </button>
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
                          className="w-12 rounded-lg border border-slate-200 px-1 py-1.5 text-center text-base font-bold tabular-nums text-ink outline-none focus:border-navy-600 focus:ring-2 focus:ring-navy-600/10"
                        />
                        <button
                          type="button"
                          onClick={() => setJumlah((j) => (sumber ? pindahJumlah(j, sumber, t) : { ...j, [t]: j[t] + 1 }))}
                          aria-label={`Tambah ${TIPE_LABEL[t]}`}
                          title={sumber ? `Ambil 1 soal dari ${TIPE_LABEL[sumber]}` : "Tambah 1 soal"}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                        >
                          <i className="fas fa-plus text-xs" aria-hidden />
                        </button>
                      </div>
                      <p className="col-span-2 text-right text-xs font-semibold tabular-nums text-navy-700 sm:col-span-1">
                        <span className="text-slate-400 sm:hidden">Skor/soal: </span>
                        {ringkasSkor(skorOtomatis[t])}
                      </p>
                    </div>
                  );
                })}
                <div className="flex flex-wrap items-center justify-between gap-2 bg-navy-50 px-4 py-2.5 text-sm">
                  <span className="font-semibold text-navy-900">
                    Total: {total} soal
                    {total > MAKS_SOAL_SEKALI && <span className="ml-2 text-rose-600">(maks {MAKS_SOAL_SEKALI})</span>}
                  </span>
                  <span className="text-xs text-slate-600">Skor dibagi otomatis supaya totalnya {formatAngka(targetSkor)}.</span>
                </div>
              </div>
            </Bagian>

            {/* 3. Pertanyaan pemandu */}
            <Bagian nomor={3} judul="Pertanyaan pemandu" ket="Opsional, tapi membuat soal lebih tepat sasaran.">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="label-field" htmlFor="ai-tujuan">
                    Kompetensi / tujuan pembelajaran apa yang ingin diukur?
                  </label>
                  <textarea
                    id="ai-tujuan"
                    rows={2}
                    maxLength={500}
                    value={pemandu.tujuan}
                    onChange={(e) => setPemandu((p) => ({ ...p, tujuan: e.target.value }))}
                    placeholder="mis. Peserta didik dapat menjelaskan fungsi organ pencernaan dan enzimnya"
                    className="field"
                  />
                </div>
                <div>
                  <label className="label-field" htmlFor="ai-asesmen">
                    Soal ini untuk apa?
                  </label>
                  <select
                    id="ai-asesmen"
                    value={pemandu.jenisAsesmen}
                    onChange={(e) => setPemandu((p) => ({ ...p, jenisAsesmen: e.target.value }))}
                    className="field"
                  >
                    <option value="">Tidak ditentukan</option>
                    {JENIS_ASESMEN.map((j) => (
                      <option key={j} value={j}>
                        {j}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <span className="label-field">Bentuk stimulus TKA yang dipakai</span>
                  <p className="mb-2 text-[0.72rem] text-slate-500">
                    Semua soal dibuat setara TKA: selalu diawali stimulus. Tabel, grafik, dan infografis
                    digambar otomatis dari datanya (angka pasti cocok dengan kunci, tanpa kuota AI tambahan).
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {JENIS_STIMULUS.map((j) => {
                      const aktif = pemandu.jenisStimulus.includes(j.jenis);
                      return (
                        <button
                          key={j.jenis}
                          type="button"
                          onClick={() =>
                            setPemandu((p) => {
                              const baru = aktif ? p.jenisStimulus.filter((x) => x !== j.jenis) : [...p.jenisStimulus, j.jenis];
                              return { ...p, jenisStimulus: baru.length ? baru : p.jenisStimulus };
                            })
                          }
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                            aktif ? "border-navy-700 bg-navy-700 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                          }`}
                        >
                          <i className={`fas ${j.ikon}`} aria-hidden />
                          {j.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <span className="label-field">Level kognitif yang diutamakan</span>
                  <div className="flex flex-wrap gap-2">
                    {LEVEL_KOGNITIF.map((l) => {
                      const aktif = pemandu.levelKognitif.includes(l.kode);
                      return (
                        <button
                          key={l.kode}
                          type="button"
                          onClick={() =>
                            setPemandu((p) => ({
                              ...p,
                              levelKognitif: aktif ? p.levelKognitif.filter((x) => x !== l.kode) : [...p.levelKognitif, l.kode],
                            }))
                          }
                          className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                            aktif ? "border-navy-700 bg-navy-700 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                          }`}
                        >
                          {l.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </Bagian>

            {/* 4. Contoh soal & bahan bacaan */}
            <Bagian
              nomor={4}
              judul="Contoh soal & bahan bacaan (opsional)"
              ket="Contoh soal = acuan gaya & tingkat (AI membuat soal BARU). Bahan bacaan = artikel/berita yang dijadikan stimulus."
            >
              <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <label className="label-field" htmlFor="ai-tautan">
                  Ambil bahan bacaan dari tautan (berita, artikel, Wikipedia)
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    id="ai-tautan"
                    type="url"
                    inputMode="url"
                    value={tautanBacaan}
                    onChange={(e) => setTautanBacaan(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        ambilBacaan();
                      }
                    }}
                    placeholder="https://…"
                    className="field"
                  />
                  <button
                    type="button"
                    onClick={ambilBacaan}
                    disabled={membacaTautan || !tautanBacaan.trim()}
                    className="btn-navy-outline shrink-0"
                  >
                    <i className={`fas ${membacaTautan ? "fa-circle-notch fa-spin" : "fa-globe"}`} aria-hidden />
                    {membacaTautan ? "Mengambil…" : "Ambil artikel"}
                  </button>
                </div>
                {infoBacaan && <p className="mt-2 text-xs font-medium text-navy-700">{infoBacaan}</p>}
                {(pemandu.bacaan || pemandu.sumberBacaan) && (
                  <>
                    <textarea
                      rows={5}
                      maxLength={MAKS_CONTOH}
                      value={pemandu.bacaan}
                      onChange={(e) => setPemandu((p) => ({ ...p, bacaan: e.target.value }))}
                      className="field mt-2 text-xs"
                    />
                    <input
                      value={pemandu.sumberBacaan}
                      maxLength={300}
                      onChange={(e) => setPemandu((p) => ({ ...p, sumberBacaan: e.target.value }))}
                      placeholder="Sumber (ditulis di bawah stimulus)"
                      className="field mt-2 text-xs"
                    />
                    <p className="mt-1 text-[0.7rem] text-slate-500">
                      AI meringkas & memparafrasakan bacaan ini, lalu mencantumkan sumbernya. Pastikan isinya
                      pantas untuk siswa.
                    </p>
                  </>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileContohRef.current?.click()}
                  disabled={membacaContoh}
                  className="btn-navy-outline"
                >
                  <i className={`fas ${membacaContoh ? "fa-circle-notch fa-spin" : "fa-file-arrow-up"}`} aria-hidden />
                  {membacaContoh ? "Membaca berkas…" : "Unggah contoh soal"}
                </button>
                <span className="text-xs text-slate-500">.docx, .pdf, .xlsx, .txt, atau foto (maks 4 MB)</span>
                <input
                  ref={fileContohRef}
                  type="file"
                  accept=".docx,.pdf,.xlsx,.txt,.md,.csv,.png,.jpg,.jpeg,.webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) unggahContoh(f);
                    e.target.value = "";
                  }}
                />
              </div>
              {infoContoh && <p className="mt-2 text-xs font-medium text-navy-700">{infoContoh}</p>}
              <textarea
                rows={pemandu.contoh ? 6 : 2}
                maxLength={MAKS_CONTOH}
                value={pemandu.contoh}
                onChange={(e) => setPemandu((p) => ({ ...p, contoh: e.target.value }))}
                placeholder="…atau tempel contoh soal di sini"
                className="field mt-2 font-mono text-xs"
              />
              <p className="mt-1 text-right text-[0.7rem] text-slate-400">
                {pemandu.contoh.length.toLocaleString("id-ID")} / {MAKS_CONTOH.toLocaleString("id-ID")} karakter
              </p>
            </Bagian>

            {/* 5. Detail */}
            <Bagian nomor={5} judul="Detail tambahan" ket="Boleh dikosongkan — sistem memilihkan nilai yang wajar.">
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
                    Kosong = otomatis maks. {Math.round(PERSEN_GAMBAR_OTOMATIS * 100)}%, hanya bila gambar membantu.
                    Menjodohkan tidak diberi gambar.
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
                  {kesulitan === "campuran" && (
                    <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="grid grid-cols-3 gap-2">
                        {(
                          [
                            ["mudah", "LOTS", "text-emerald-700"],
                            ["sedang", "MOTS", "text-amber-700"],
                            ["sulit", "HOTS", "text-rose-700"],
                          ] as const
                        ).map(([k, label, warna]) => (
                          <label key={k} className="block text-center">
                            <span className={`block text-[0.7rem] font-bold ${warna}`}>{label}</span>
                            <span className="mt-1 flex items-center justify-center gap-1">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                step={5}
                                inputMode="numeric"
                                value={persenKesulitan[k]}
                                onChange={(e) =>
                                  setPersenKesulitan((p) => ({
                                    ...p,
                                    [k]: Math.max(0, Math.min(100, Math.floor(Number(e.target.value) || 0))),
                                  }))
                                }
                                aria-label={`Persentase ${label}`}
                                className="w-14 rounded-lg border border-slate-200 bg-white px-1 py-1.5 text-center text-sm font-bold tabular-nums text-ink outline-none focus:border-navy-600"
                              />
                              <span className="text-xs text-slate-500">%</span>
                            </span>
                            <span className="mt-0.5 block text-[0.68rem] text-slate-500">
                              ±{Math.round((persenKesulitan[k] * total) / 100)} soal
                            </span>
                          </label>
                        ))}
                      </div>
                      <p className={`mt-2 text-center text-[0.72rem] font-semibold ${persenTidakPas ? "text-rose-600" : "text-emerald-700"}`}>
                        Total {totalPersen}%{persenTidakPas ? " — harus 100%" : ""}
                      </p>
                    </div>
                  )}
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
                          jumlahOpsi === n ? "border-navy-700 bg-navy-50 text-navy-800" : "border-slate-200 bg-white text-slate-500"
                        }`}
                      >
                        {n} opsi ({n === 4 ? "A–D" : "A–E"})
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="label-field" htmlFor="ai-catatan">
                    Detail lain untuk AI
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
                <li key={i} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
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
            {batchStatus.length > 0 && batchStatus.every((b) => b.status === "ok" || b.status === "gagal") && draf.length === 0 && (
              <button type="button" onClick={() => setFase("petunjuk")} className="btn-navy-outline mx-auto mt-5 flex">
                Kembali ke petunjuk
              </button>
            )}
          </div>
        )}

        {fase === "hasil" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
              <p className="font-serif text-lg font-bold text-emerald-900">
                <i className="fas fa-circle-check mr-2" aria-hidden />
                {draf.length} soal sudah jadi
              </p>
              <p className="mt-1 text-sm text-emerald-800">
                {TIPE_SOAL_LIST.filter((t) => draf.some((d) => d.tipe === t))
                  .map((t) => `${TIPE_LABEL[t]} ${draf.filter((d) => d.tipe === t).length}`)
                  .join(" · ")}{" "}
                · total skor {formatAngka(skorTotalDraf)}
                {belumBergambar.length > 0 && ` · ${belumBergambar.length} soal butuh gambar/stimulus (siapkan di langkah Edit)`}
              </p>
              {infoMassal && (
                <p className="mt-1 text-xs font-semibold text-emerald-900">
                  <i className="fas fa-circle-notch fa-spin mr-1.5" aria-hidden />
                  {infoMassal}
                </p>
              )}
            </div>
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <PilihanBesar
                ikon="fa-gamepad"
                judul="Preview soal"
                ket="Coba kerjakan seperti siswa, dalam bentuk kuis."
                aktif={tampilHasil === "kuis"}
                onClick={() => setTampilHasil(tampilHasil === "kuis" ? null : "kuis")}
              />
              <PilihanBesar
                ikon="fa-file-lines"
                judul="Lihat draf soal"
                ket="Naskah seperti dokumen cetak, lengkap dengan kunci."
                aktif={tampilHasil === "dokumen"}
                onClick={() => setTampilHasil(tampilHasil === "dokumen" ? null : "dokumen")}
              />
            </div>
            {tampilHasil === "kuis" && <PreviewKuis soal={soalDok} />}
            {tampilHasil === "dokumen" && <DokumenDraf soal={soalDok} judul={judulDok} subjudul={subjudulDok} />}
          </div>
        )}

        {fase === "pilih" && (
          <div className="mx-auto max-w-2xl space-y-4 py-4">
            <p className="text-center font-serif text-lg font-bold text-navy-900">Mau diapakan soalnya?</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <PilihanBesar
                ikon="fa-pen-to-square"
                judul="Edit soal"
                ket="Betulkan per soal dengan form yang sama seperti buat soal manual, siapkan gambar."
                onClick={() => setFase("edit")}
              />
              <PilihanBesar
                ikon="fa-forward"
                judul="Lanjutkan"
                ket="Soal sudah oke. Simpan ke Bank Soal atau unduh."
                onClick={() => setFase("simpan")}
              />
            </div>
            {belumBergambar.length > 0 && (
              <p className="text-center text-xs font-medium text-amber-700">
                <i className="fas fa-image mr-1" aria-hidden />
                {belumBergambar.length} soal masih butuh gambar — siapkan di Edit soal.
              </p>
            )}
          </div>
        )}

        {fase === "edit" && (
          <div className="space-y-3">
            <div className="rounded-xl border border-navy-100 bg-navy-50 px-4 py-3 text-sm text-navy-900">
              <i className="fas fa-user-check mr-2" aria-hidden />
              Klik <b>Edit</b> pada soal yang ingin dibetulkan. Siapkan gambar dulu (kalau diminta), baru edit.
              Hasil AI bisa salah — tanggung jawab akhir tetap di guru.
            </div>
            {draf.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500">Tidak ada draf tersisa.</p>
            ) : (
              draf.map((d, i) => (
                <KartuDraf
                  key={d.idLokal}
                  nomor={i + 1}
                  draf={d}
                  sedangSibuk={gambarMassal || memasukkan}
                  onUbah={(baru) => ubahDraf(d.idLokal, () => baru)}
                  onHapus={() => {
                    if (confirm(`Hapus soal nomor ${i + 1} dari paket?`)) {
                      setDraf((lama) => lama.filter((x) => x.idLokal !== d.idLokal));
                    }
                  }}
                  jenjang={jenjang}
                  onBuatGambar={(jenis) => buatGambar(d.idLokal, jenis)}
                  onPilihFoto={(k) => pilihFoto(d.idLokal, k)}
                  onRenderStimulus={() => renderStimulusDraf(d.idLokal)}
                  onUnggahGambar={(f) => prosesGambar(d.idLokal, "unggah", () => unggahBerkasGuru(f))}
                  onGantiSoal={() => gantiSoal(d.idLokal)}
                />
              ))
            )}
          </div>
        )}

        {fase === "simpan" && (
          <div className="space-y-4">
            {belumBergambar.length > 0 && (
              <PeringatanGambar
                jumlah={belumBergambar.length}
                sibuk={gambarMassal}
                info={infoMassal}
                onBuat={buatSemuaGambar}
                onTanpa={tanpaGambarSemua}
              />
            )}
            <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <h3 className="mb-1 font-serif font-bold text-navy-900">
                <i className="fas fa-box-archive mr-2 text-emerald-600" aria-hidden />
                Simpan ke Bank Soal
              </h3>
              <p className="mb-3 text-xs text-slate-500">
                Beri nama paketnya supaya mudah dicari dan dipakai lagi di kegiatan mana pun.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_14rem]">
                <div>
                  <label className="label-field" htmlFor="ai-paket">
                    Nama paket soal
                  </label>
                  <input
                    id="ai-paket"
                    value={paketNama}
                    maxLength={120}
                    onChange={(e) => setPaketNama(e.target.value)}
                    className="field"
                    disabled={keBank}
                  />
                </div>
                <div>
                  <label className="label-field" htmlFor="ai-mapel-bank">
                    Mata pelajaran
                  </label>
                  <input
                    id="ai-mapel-bank"
                    value={terikatMapel ? mapelNama : namaMapel}
                    onChange={(e) => setNamaMapel(e.target.value)}
                    readOnly={terikatMapel}
                    disabled={keBank}
                    className="field"
                  />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={simpanKeBank}
                  disabled={menyimpanBank || keBank || draf.length === 0}
                  className="btn-navy"
                >
                  <i className={`fas ${menyimpanBank ? "fa-circle-notch fa-spin" : keBank ? "fa-check" : "fa-floppy-disk"}`} aria-hidden />
                  {keBank ? "Tersimpan di Bank Soal" : menyimpanBank ? "Menyimpan…" : `Simpan ${draf.length} soal ke Bank`}
                </button>
                {pesanBank && (
                  <span className={`text-sm font-medium ${pesanBank.ok ? "text-emerald-700" : "text-rose-700"}`}>{pesanBank.teks}</span>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <h3 className="mb-1 font-serif font-bold text-navy-900">
                <i className="fas fa-download mr-2 text-navy-600" aria-hidden />
                Unduh
              </h3>
              <p className="mb-3 text-xs text-slate-500">Berkas Word (.doc) bisa langsung diedit dan dicetak.</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-navy-outline"
                  onClick={() => unduhHtml(htmlDokumenSoal(soalDok, { judul: judulDok, subjudul: subjudulDok, kunci: "lampiran" }), namaBerkas(`${judulDok} (dengan kunci)`, "doc"))}
                >
                  <i className="fas fa-file-word" aria-hidden />
                  Naskah + kunci (.doc)
                </button>
                <button
                  type="button"
                  className="btn-navy-outline"
                  onClick={() => unduhHtml(htmlDokumenSoal(soalDok, { judul: judulDok, subjudul: subjudulDok, kunci: "tidak" }), namaBerkas(`${judulDok} (siswa)`, "doc"))}
                >
                  <i className="fas fa-file-word" aria-hidden />
                  Naskah siswa saja (.doc)
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => cetakHtml(htmlDokumenSoal(soalDok, { judul: judulDok, subjudul: subjudulDok, kunci: "lampiran" }))}
                >
                  <i className="fas fa-print" aria-hidden />
                  Cetak / PDF
                </button>
              </div>
            </section>
          </div>
        )}

        {fase === "akhir" && (
          <div className="mx-auto max-w-2xl space-y-4 py-4">
            {belumBergambar.length > 0 && (
              <PeringatanGambar
                jumlah={belumBergambar.length}
                sibuk={gambarMassal}
                info={infoMassal}
                onBuat={buatSemuaGambar}
                onTanpa={tanpaGambarSemua}
              />
            )}
            <p className="text-center font-serif text-lg font-bold text-navy-900">Masukkan ke ujian {mapelNama}?</p>
            <p className="text-center text-sm text-slate-600">
              {draf.length} soal akan ditambahkan di bawah soal yang sudah ada di mapel ini.
              {keBank ? " Paket ini sudah ada di Bank Soal, jadi tidak disalin lagi." : " Salinannya otomatis masuk Bank Soal."}
            </p>
            {ringkasanUjian && (
              <div
                className={`rounded-xl px-4 py-3 text-sm font-semibold ${
                  ringkasanUjian.ok ? "border border-emerald-200 bg-emerald-50 text-emerald-800" : "border border-rose-200 bg-rose-50 text-rose-700"
                }`}
              >
                <i className={`fas ${ringkasanUjian.ok ? "fa-circle-check" : "fa-circle-exclamation"} mr-2`} aria-hidden />
                {ringkasanUjian.teks}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Kaki */}
      <div className="flex flex-col gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:px-6">
        {fase === "petunjuk" && (
          <>
            <p className="text-xs text-slate-500 sm:mr-auto">
              {total} soal · ±
              {
                pecahBatch({
                  topik: ["x"],
                  jumlah,
                  jumlahBergambar: null,
                  kesulitan,
                  jumlahOpsi,
                  catatan: "",
                  totalSkor: targetSkor,
                }).length
              }{" "}
              panggilan AI · memakai 1 kuota
              {draf.length > 0 && ` · ${draf.length} draf menunggu`}
            </p>
            {draf.length > 0 && (
              <button type="button" onClick={() => setFase("hasil")} className="btn-ghost">
                Lihat draf
              </button>
            )}
            <button
              type="button"
              onClick={mulai}
              disabled={total === 0 || total > MAKS_SOAL_SEKALI || kuotaHabis || persenTidakPas}
              className="btn-navy"
            >
              <i className="fas fa-wand-magic-sparkles" aria-hidden />
              Generate {total} Soal
            </button>
          </>
        )}
        {fase === "proses" && (
          <button type="button" onClick={() => (batal.current = true)} className="btn-ghost sm:ml-auto">
            Hentikan setelah batch ini
          </button>
        )}
        {fase === "hasil" && (
          <>
            <button type="button" onClick={buangSemua} className="btn-ghost sm:mr-auto">
              <i className="fas fa-trash" aria-hidden />
              Buang draf
            </button>
            <button type="button" onClick={() => setFase("pilih")} disabled={draf.length === 0} className="btn-navy">
              Next
              <i className="fas fa-arrow-right" aria-hidden />
            </button>
          </>
        )}
        {fase === "pilih" && (
          <button type="button" onClick={() => setFase("hasil")} className="btn-ghost sm:mr-auto">
            <i className="fas fa-arrow-left" aria-hidden />
            Kembali
          </button>
        )}
        {fase === "edit" && (
          <>
            <p className="text-xs text-slate-500 sm:mr-auto">
              <b className="text-ink">{draf.length}</b> soal · skor{" "}
              <b className={skorTotalDraf === targetSkor ? "text-emerald-600" : "text-amber-600"}>{formatAngka(skorTotalDraf)}</b>
              {belumBergambar.length > 0 && (
                <>
                  {" "}
                  · <b className="text-rose-600">{belumBergambar.length}</b> belum bergambar
                </>
              )}
              {infoMassal && (
                <span className="mt-0.5 block font-semibold text-navy-700">
                  <i className="fas fa-hourglass-half mr-1" aria-hidden />
                  {infoMassal}
                </span>
              )}
            </p>
            <button type="button" onClick={() => setFase("pilih")} className="btn-ghost">
              <i className="fas fa-arrow-left" aria-hidden />
              Kembali
            </button>
            {gambarMassal && (
              <button type="button" onClick={() => (batal.current = true)} className="btn-ghost">
                Hentikan gambar
              </button>
            )}
            {belumBergambar.length > 0 && (
              <button type="button" onClick={buatSemuaGambar} disabled={gambarMassal} className="btn-navy-outline">
                <i className={`fas ${gambarMassal ? "fa-circle-notch fa-spin" : "fa-images"}`} aria-hidden />
                Buat {belumBergambar.length} gambar
              </button>
            )}
            <button type="button" onClick={() => setFase("simpan")} disabled={draf.length === 0} className="btn-navy">
              Lanjutkan
              <i className="fas fa-arrow-right" aria-hidden />
            </button>
          </>
        )}
        {fase === "simpan" && (
          <>
            <button type="button" onClick={() => setFase("pilih")} className="btn-ghost sm:mr-auto">
              <i className="fas fa-arrow-left" aria-hidden />
              Kembali
            </button>
            {terikatMapel ? (
              <button type="button" onClick={() => setFase("akhir")} disabled={draf.length === 0} className="btn-navy">
                Next
                <i className="fas fa-arrow-right" aria-hidden />
              </button>
            ) : (
              <button type="button" onClick={selesaiDanTutup} className="btn-navy">
                <i className="fas fa-check" aria-hidden />
                Selesai
              </button>
            )}
          </>
        )}
        {fase === "akhir" && (
          <>
            <button type="button" onClick={() => setFase("simpan")} disabled={memasukkan} className="btn-ghost sm:mr-auto">
              <i className="fas fa-arrow-left" aria-hidden />
              Kembali
            </button>
            <button type="button" onClick={selesaiDanTutup} disabled={memasukkan} className="btn-ghost">
              <i className="fas fa-xmark" aria-hidden />
              Tutup
            </button>
            {!(ringkasanUjian?.ok) && (
              <button
                type="button"
                onClick={masukkanKeUjian}
                disabled={memasukkan || draf.length === 0 || gambarMassal}
                className="btn-navy"
              >
                <i className={`fas ${memasukkan ? "fa-circle-notch fa-spin" : "fa-right-to-bracket"}`} aria-hidden />
                {memasukkan ? "Memasukkan…" : `Masukkan ${draf.length} soal ke ujian`}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );

  if (tampilan === "halaman") return jendela;

  return (
    <>
      {pemicu}
      {buka && (
        <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-navy-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-6">
          {jendela}
        </div>
      )}
    </>
  );
}

function PanelKuota({
  kuota,
  alasan,
  setAlasan,
  kirim,
  mengirim,
  pesan,
}: {
  kuota: StatusKuota | null;
  alasan: string;
  setAlasan: (v: string) => void;
  kirim: () => void;
  mengirim: boolean;
  pesan: string | null;
}) {
  if (!kuota) return null;
  if (!kuota.terbatas) {
    return (
      <p className="rounded-xl bg-navy-50 px-4 py-2.5 text-xs font-semibold text-navy-700">
        <i className="fas fa-infinity mr-2" aria-hidden />
        Akun admin: generate tidak dibatasi kuota.
      </p>
    );
  }
  if (kuota.galat) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <i className="fas fa-triangle-exclamation mr-2" aria-hidden />
        {kuota.galat}
      </p>
    );
  }
  if (kuota.sisa > 0) {
    return (
      <p className="rounded-xl bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800">
        <i className="fas fa-ticket mr-2" aria-hidden />
        Kuota hari ini: {kuota.sisa} kali generate lagi (dari {kuota.jatah}). Satu kali generate = satu paket soal.
      </p>
    );
  }
  const menunggu = kuota.permintaan?.status === "menunggu";
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
      <p className="font-semibold text-rose-800">
        <i className="fas fa-lock mr-2" aria-hidden />
        Kuota generate hari ini sudah habis.
      </p>
      <p className="mt-1 text-sm text-rose-700">
        Setiap guru bisa generate 1 kali per hari. Butuh lagi? Minta tambahan ke admin.
        {kuota.permintaan?.status === "ditolak" && " Permintaan terakhirmu ditolak."}
      </p>
      {menunggu ? (
        <p className="mt-3 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-amber-700">
          <i className="fas fa-hourglass-half mr-2" aria-hidden />
          Permintaanmu sedang menunggu persetujuan admin.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={alasan}
            maxLength={300}
            onChange={(e) => setAlasan(e.target.value)}
            placeholder="Alasan singkat (opsional), mis. soal remedial kelas 8B"
            className="field"
          />
          <button type="button" onClick={kirim} disabled={mengirim} className="btn-navy shrink-0">
            <i className={`fas ${mengirim ? "fa-circle-notch fa-spin" : "fa-paper-plane"}`} aria-hidden />
            Minta ke admin
          </button>
        </div>
      )}
      {pesan && <p className="mt-2 text-xs font-medium text-rose-800">{pesan}</p>}
    </div>
  );
}

function PeringatanGambar({
  jumlah,
  sibuk,
  info,
  onBuat,
  onTanpa,
}: {
  jumlah: number;
  sibuk: boolean;
  info: string | null;
  onBuat: () => void;
  onTanpa: () => void;
}) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p>
        <i className="fas fa-image mr-2" aria-hidden />
        {jumlah} soal masih butuh gambar. Buat otomatis, atau simpan tanpa gambar.
      </p>
      {info && <p className="mt-1 text-xs font-semibold">{info}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={onBuat} disabled={sibuk} className="btn-navy-outline">
          <i className={`fas ${sibuk ? "fa-circle-notch fa-spin" : "fa-images"}`} aria-hidden />
          Buat {jumlah} gambar
        </button>
        <button type="button" onClick={onTanpa} disabled={sibuk} className="btn-ghost">
          Tanpa gambar
        </button>
      </div>
    </div>
  );
}

function PilihanBesar({
  ikon,
  judul,
  ket,
  onClick,
  aktif,
}: {
  ikon: string;
  judul: string;
  ket: string;
  onClick: () => void;
  aktif?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-start gap-3 rounded-2xl border-2 p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${
        aktif ? "border-navy-700 bg-navy-50" : "border-slate-200 bg-white hover:border-navy-300"
      }`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          aktif ? "bg-navy-800 text-white" : "bg-navy-50 text-navy-700"
        }`}
      >
        <i className={`fas ${ikon}`} aria-hidden />
      </span>
      <span>
        <span className="block font-serif font-bold text-navy-900">{judul}</span>
        <span className="mt-0.5 block text-[0.78rem] leading-snug text-slate-500">{ket}</span>
      </span>
    </button>
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
