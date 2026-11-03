/**
 * Draf hasil "Buat Soal AI" di sisi klien — bagian MURNI (tanpa React,
 * tanpa jaringan) supaya bisa diuji: lihat src/lib/__tests__/ai-draf.test.ts.
 *
 *   - `kontenFinalDraf` — konten_jsonb yang benar-benar akan disimpan;
 *   - `tanpaKunci`      — bentuk konten yang diterima siswa (untuk Preview kuis);
 *   - `periksaJawaban`  — benar/salah jawaban di Preview kuis;
 *   - `htmlDokumenSoal` — naskah soal (Lihat draf, cetak, unduh .doc).
 */

import type { TipeSoal } from "@/types";
import { TIPE_LABEL } from "@/lib/soal";
import { bersihkanHtml, escapeAtribut, teksKeHtml } from "@/lib/html-soal";
import { normalisasiUraian } from "@/lib/analisis-jawaban";
import { formatAngka, kontenSiapSimpan, type DraftSoal } from "@/lib/ai/rencana-soal";
import { stimulusPerluRender } from "@/lib/ai/stimulus";

export interface StatusGambar {
  url: string | null;
  proses: "diagram" | "ilustrasi" | "unggah" | "foto" | "stimulus" | null;
  galat: string | null;
  /** Kredit wajib untuk foto Wikimedia (CC BY/BY-SA), ditulis di bawah gambar. */
  kredit?: string | null;
}

export const STATUS_KOSONG: StatusGambar = { url: null, proses: null, galat: null, kredit: null };

export interface DrafTinjau extends DraftSoal {
  dipakai: boolean;
  gambarStatus: StatusGambar;
  /** Gambar hasil render stimulus tabel/grafik/infografis. Opsional untuk
   *  draf lama di localStorage. */
  stimulusStatus?: StatusGambar;
  galatSimpan: string | null;
  /** true = sudah diedit lewat form soal (editor kaya). `konten` sudah
   *  final apa adanya — HTML-nya tidak diturunkan ulang dari teks polos,
   *  dan gambar (kalau ada) sudah ditempel guru di dalamnya. */
  diedit?: boolean;
}

export interface SoalDokumen {
  tipe: TipeSoal;
  skor: number;
  konten: Record<string, unknown>;
}

type Obj = Record<string, unknown>;

export function kontenFinalDraf(d: DrafTinjau): Obj {
  return d.diedit
    ? { ...d.konten }
    : kontenSiapSimpan(d, d.gambarStatus.url, {
        urlStimulus: d.stimulusStatus?.url ?? null,
        kreditGambar: d.gambarStatus.kredit ?? null,
      });
}

/** Stimulus tabel/grafik/infografis yang belum dirender jadi gambar. */
export function drafButuhStimulus(d: DrafTinjau): boolean {
  return !d.diedit && stimulusPerluRender(d.stimulus) && !d.stimulusStatus?.url;
}

/** Draf ini masih menunggu gambar (atau render stimulus) sebelum boleh disimpan? */
export function drafButuhGambar(d: DrafTinjau): boolean {
  return (!!d.gambar && !d.gambarStatus.url && !d.diedit) || drafButuhStimulus(d);
}

/** Cermin `bersihkanKunci` di halaman Pratinjau Ujian / RPC get_soal_untuk_siswa. */
export function tanpaKunci(konten: Obj): Obj {
  const salinan: Obj = { ...konten };
  delete salinan.kunci_jawaban;
  delete salinan.jawaban_benar;
  delete salinan.pasangan_benar;
  if (Array.isArray(salinan.opsi)) {
    salinan.opsi = (salinan.opsi as Obj[]).map(({ benar: _b, ...sisa }) => sisa);
  }
  if (Array.isArray(salinan.pernyataan)) {
    salinan.pernyataan = (salinan.pernyataan as Obj[]).map(({ jawaban_benar: _j, ...sisa }) => sisa);
  }
  return salinan;
}

/**
 * Benar/salah jawaban di Preview kuis. `null` = belum dijawab (lengkap).
 * Uraian singkat memakai aturan "memuat salah satu kunci" yang sama dengan
 * penilaian sungguhan.
 */
export function periksaJawaban(tipe: TipeSoal, konten: Obj, jawaban: unknown): boolean | null {
  switch (tipe) {
    case "pilgan_biasa": {
      if (typeof jawaban !== "string" || !jawaban) return null;
      const benar = ((konten.opsi as Obj[]) ?? []).find((o) => o.benar === true);
      return benar?.id === jawaban;
    }
    case "pilgan_kompleks": {
      if (!Array.isArray(jawaban) || jawaban.length === 0) return null;
      const kunci = ((konten.opsi as Obj[]) ?? []).filter((o) => o.benar === true).map((o) => String(o.id));
      const dipilih = new Set(jawaban.map(String));
      return kunci.length === dipilih.size && kunci.every((k) => dipilih.has(k));
    }
    case "uraian_singkat": {
      const j = normalisasiUraian(jawaban);
      if (!j) return null;
      return ((konten.kunci_jawaban as unknown[]) ?? []).some((k) => {
        const n = normalisasiUraian(k);
        return !!n && j.includes(n);
      });
    }
    case "benar_salah":
      return typeof jawaban === "boolean" ? jawaban === konten.jawaban_benar : null;
    case "multi_benar_salah": {
      const daftar = (konten.pernyataan as Obj[]) ?? [];
      const j = (jawaban ?? {}) as Record<string, unknown>;
      if (daftar.some((p) => typeof j[String(p.id)] !== "boolean")) return null;
      return daftar.every((p) => j[String(p.id)] === p.jawaban_benar);
    }
    case "menjodohkan": {
      const kiri = (konten.soal as Obj[]) ?? [];
      const pasangan = (konten.pasangan_benar ?? {}) as Record<string, string>;
      const j = (jawaban ?? {}) as Record<string, unknown>;
      if (kiri.some((s) => !j[String(s.id)])) return null;
      return kiri.every((s) => j[String(s.id)] === pasangan[String(s.id)]);
    }
  }
}

// ---------------------------------------------------------------------------
// Naskah dokumen
// ---------------------------------------------------------------------------

const HURUF = "ABCDEFGHIJ";

function html(o: Obj, field: string): string {
  const h = o[`${field}_html`];
  const isi = typeof h === "string" && h.trim() ? bersihkanHtml(h) : teksKeHtml(String(o[field] ?? ""));
  // Word mengabaikan max-width; lebar tetap supaya gambar tidak melebar
  // keluar halaman.
  return isi.replace(/<img (?![^>]*\bwidth=)/g, '<img width="360" ');
}

function gambarLama(k: Obj): string {
  const url = String(k.gambar_pertanyaan_url ?? "");
  return /^https:\/\//i.test(url) ? `<p><img width="360" src="${escapeAtribut(url)}" alt="" /></p>` : "";
}

/** Teks kunci jawaban satu soal, mis. "C", "A, D", "1-B, 2-S". */
export function teksKunci(tipe: TipeSoal, k: Obj): string {
  switch (tipe) {
    case "pilgan_biasa":
    case "pilgan_kompleks":
      return ((k.opsi as Obj[]) ?? [])
        .map((o, i) => (o.benar === true ? HURUF[i] : ""))
        .filter(Boolean)
        .join(", ");
    case "uraian_singkat":
      return ((k.kunci_jawaban as unknown[]) ?? []).map(String).join(" / ");
    case "benar_salah":
      return k.jawaban_benar === true ? "Benar" : "Salah";
    case "multi_benar_salah":
      return ((k.pernyataan as Obj[]) ?? [])
        .map((p, i) => `${i + 1}-${p.jawaban_benar === true ? "B" : "S"}`)
        .join(", ");
    case "menjodohkan": {
      const kanan = ((k.jawaban as Obj[]) ?? []).map((j) => String(j.id));
      const pasangan = (k.pasangan_benar ?? {}) as Record<string, string>;
      return ((k.soal as Obj[]) ?? [])
        .map((s, i) => `${i + 1}-${HURUF[kanan.indexOf(pasangan[String(s.id)])] ?? "?"}`)
        .join(", ");
    }
  }
}

/** Isi satu soal (tanpa nomor) — dipakai naskah dokumen dan kartu edit. */
export function htmlSatuSoal(s: SoalDokumen): string {
  const k = s.konten;
  switch (s.tipe) {
    case "pilgan_biasa":
    case "pilgan_kompleks":
      return (
        gambarLama(k) +
        html(k, "pertanyaan") +
        (s.tipe === "pilgan_kompleks" ? `<p class="ket">(Jawaban benar bisa lebih dari satu.)</p>` : "") +
        `<table class="opsi">${((k.opsi as Obj[]) ?? [])
          .map((o, i) => `<tr><td class="huruf">${HURUF[i]}.</td><td>${html(o, "teks")}</td></tr>`)
          .join("")}</table>`
      );
    case "uraian_singkat":
      return gambarLama(k) + html(k, "pertanyaan") + `<p>Jawaban: ......................................................</p>`;
    case "benar_salah":
      return gambarLama(k) + html(k, "pertanyaan") + `<p class="ket">Benar / Salah</p>`;
    case "multi_benar_salah":
      return (
        gambarLama(k) +
        html(k, "instruksi") +
        `<table class="grid"><tr><th>No</th><th>Pernyataan</th><th>Benar</th><th>Salah</th></tr>${(
          (k.pernyataan as Obj[]) ?? []
        )
          .map((p, i) => `<tr><td class="c">${i + 1}</td><td>${html(p, "teks")}</td><td></td><td></td></tr>`)
          .join("")}</table>`
      );
    case "menjodohkan": {
      const kiri = (k.soal as Obj[]) ?? [];
      const kanan = (k.jawaban as Obj[]) ?? [];
      const n = Math.max(kiri.length, kanan.length);
      let baris = "";
      for (let i = 0; i < n; i++) {
        baris += `<tr><td>${kiri[i] ? `${i + 1}. ${html(kiri[i], "teks")}` : ""}</td><td>${
          kanan[i] ? `${HURUF[i]}. ${html(kanan[i], "teks")}` : ""
        }</td></tr>`;
      }
      return gambarLama(k) + html(k, "instruksi") + `<table class="grid jodoh">${baris}</table>`;
    }
  }
}

export interface OpsiDokumen {
  judul: string;
  subjudul?: string;
  /** "lampiran" = tabel kunci di halaman terakhir; "tidak" = naskah siswa. */
  kunci: "lampiran" | "tidak";
}

/**
 * Satu berkas HTML utuh. Dipakai untuk tampilan "Lihat draf" (iframe),
 * cetak/PDF dari browser, dan unduhan .doc (Word membuka HTML ber-namespace
 * Office sebagai dokumen biasa — tanpa pustaka tambahan).
 */
export function htmlDokumenSoal(daftar: SoalDokumen[], opsi: OpsiDokumen): string {
  const total = daftar.reduce((n, s) => n + (Number(s.skor) || 0), 0);
  const isi = daftar
    .map(
      (s, i) =>
        `<div class="soal"><div class="no">${i + 1}.</div><div class="isi">${htmlSatuSoal(s)}<p class="meta">${
          TIPE_LABEL[s.tipe]
        } · skor ${formatAngka(Number(s.skor) || 0)}</p></div></div>`
    )
    .join("");
  const kunci =
    opsi.kunci === "lampiran"
      ? `<h2 class="putus">Kunci Jawaban</h2><table class="grid"><tr><th>No</th><th>Bentuk</th><th>Kunci</th><th>Skor</th></tr>${daftar
          .map(
            (s, i) =>
              `<tr><td class="c">${i + 1}</td><td>${TIPE_LABEL[s.tipe]}</td><td>${teksKeHtml(
                teksKunci(s.tipe, s.konten)
              )}</td><td class="c">${formatAngka(Number(s.skor) || 0)}</td></tr>`
          )
          .join("")}</table>`
      : "";

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" lang="id">
<head>
<meta charset="utf-8" />
<title>${teksKeHtml(opsi.judul)}</title>
<style>
  body { font-family: "Times New Roman", serif; font-size: 12pt; color: #111; background: #fff; margin: 24px; line-height: 1.45; }
  h1 { font-size: 15pt; text-align: center; margin: 0 0 4px; }
  .sub { text-align: center; font-size: 11pt; margin: 0 0 16px; color: #333; }
  hr { border: 0; border-top: 1.5px solid #111; margin: 0 0 16px; }
  .soal { display: flex; gap: 8px; margin: 0 0 14px; page-break-inside: avoid; }
  .no { min-width: 26px; font-weight: bold; }
  .isi { flex: 1; }
  .isi p { margin: 0 0 4px; }
  .isi img { max-width: 100%; height: auto; }
  .opsi td { vertical-align: top; padding: 1px 4px; }
  .huruf { width: 22px; }
  .grid { border-collapse: collapse; width: 100%; margin: 4px 0; }
  .grid th, .grid td { border: 1px solid #555; padding: 3px 6px; vertical-align: top; font-size: 11pt; }
  .grid th { background: #eee; }
  .jodoh td { width: 50%; }
  .c { text-align: center; }
  .ket { font-style: italic; font-size: 11pt; }
  .meta { font-size: 9pt; color: #777; }
  .putus { page-break-before: always; font-size: 13pt; margin-top: 24px; }
  @media print { body { margin: 0; } .meta { display: none; } }
</style>
</head>
<body>
<h1>${teksKeHtml(opsi.judul)}</h1>
<p class="sub">${opsi.subjudul ? `${teksKeHtml(opsi.subjudul)} · ` : ""}${daftar.length} soal · total skor ${formatAngka(total)}</p>
<hr />
${isi}
${kunci}
</body>
</html>`;
}

/** Nama berkas aman, mis. "Soal IPA - Pencernaan.doc". */
export function namaBerkas(judul: string, ext: string): string {
  const dasar = judul.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "soal";
  return `${dasar}.${ext}`;
}
