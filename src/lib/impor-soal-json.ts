/**
 * Impor soal dari berkas JSON — fungsi MURNI (tanpa DOM, tanpa Supabase),
 * dipakai oleh dialog "Unggah JSON" di halaman mapel dan oleh tesnya.
 *
 * ── ALUR YANG DILAYANI ──
 *
 * Guru punya soal di Word. Word dibawa ke Claude (atau AI lain) bersama
 * PROMPT_IMPOR, lalu Claude menulis JSON berformat TEMPLATE_IMPOR. JSON
 * itu diunggah di sini, dicek, dipratinjau, baru disimpan.
 *
 * ── GAMBAR ──
 *
 * JSON tidak bisa memuat gambar, jadi gambar ditulis sebagai PENANDA
 * `[[gambar:nama-berkas.png]]` di dalam teks mana pun (pertanyaan, opsi,
 * pernyataan, kolom kiri menjodohkan). Saat menyimpan, berkas bernama sama
 * — dipilih guru, atau diambil otomatis dari .docx aslinya — diunggah ke
 * Cloudinary, lalu penanda diganti `<img>`. Pencocokan nama tidak peka
 * huruf besar/kecil dan tidak peka ekstensi (`Gambar-3` = `gambar-3.jpg`).
 * Penanda yang isinya sudah URL https dipakai apa adanya.
 *
 * ── FORMAT TEKS ──
 *
 * Teks diperlakukan sebagai teks polos (di-escape), kecuali tag pendek
 * <b> <i> <u> <sub> <sup> <strong> <em> yang dikembalikan jadi tag —
 * cukup untuk H<sub>2</sub>O dan x<sup>2</sup>, tanpa membuka pintu ke
 * HTML sembarang. Hasil akhirnya tetap lewat `bersihkanHtml`.
 */

import type { TipeSoal } from "@/types";
import { TIPE_SOAL_LIST } from "@/lib/soal";
import { bersihkanHtml, escapeAtribut, htmlKeTeks, teksKeHtml } from "@/lib/html-soal";
import { validasiKonten } from "@/lib/validasi-soal";

type Obj = Record<string, unknown>;

export const MAKS_SOAL_IMPOR = 100;
export const FORMAT_IMPOR = "sipandu-soal";

/** Penanda gambar di dalam teks. Grup 1 = nama berkas / URL. */
export const RE_PENANDA = /\[\[\s*gambar\s*:\s*([^\]]+?)\s*\]\]/gi;

/** Kunci pencocokan nama berkas: huruf kecil, tanpa folder & ekstensi. */
export function kunciGambar(nama: string): string {
  return nama
    .trim()
    .replace(/^.*[\\/]/, "")
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .toLowerCase();
}

export function adalahUrl(ref: string): boolean {
  return /^https:\/\/[^\s"'<>]+$/i.test(ref.trim());
}

// ---------------------------------------------------------------------------
// Bentuk hasil normalisasi
// ---------------------------------------------------------------------------

export interface ItemTeks {
  teks: string;
  gambar?: string | null;
}

export type DataImpor =
  | { tipe: "pilgan_biasa" | "pilgan_kompleks"; opsi: (ItemTeks & { benar: boolean })[] }
  | { tipe: "uraian_singkat"; kunci: string[] }
  | { tipe: "benar_salah"; jawaban: boolean | null }
  | { tipe: "multi_benar_salah"; pernyataan: (ItemTeks & { jawaban: boolean | null })[] }
  | { tipe: "menjodohkan"; pasangan: { kiri: ItemTeks; kanan: string }[]; pengecoh: string[] };

export interface SoalImpor {
  /** Nomor tampilan (dari JSON, atau urutan kalau tidak ada). */
  nomor: number;
  tipe: TipeSoal;
  skor: number;
  pertanyaan: string;
  /** Gambar soal umum (kolom `soal.gambar_url`), nama berkas atau URL. */
  gambar: string | null;
  data: DataImpor;
  /** Catatan dari pembuat JSON (mis. "kunci ditentukan AI") — tidak disimpan. */
  catatan: string | null;
  /** Semua rujukan gambar (penanda + field gambar), unik, apa adanya. */
  rujukanGambar: string[];
  /** Kesalahan bentuk. null = siap disimpan (setelah gambar terpenuhi). */
  galat: string | null;
}

export interface HasilBaca {
  soal: SoalImpor[];
  /** Kesalahan tingkat berkas (JSON rusak, kosong, terlalu banyak). */
  galatBerkas: string | null;
}

/** Bentuk yang dikirim ke server action. */
export interface SoalSiapSimpan {
  tipe: TipeSoal;
  skor: number;
  konten: Obj;
  gambarUrl: string | null;
}

// ---------------------------------------------------------------------------
// Pembacaan
// ---------------------------------------------------------------------------

const ALIAS_TIPE: Record<string, TipeSoal> = {
  pg: "pilgan_biasa",
  pilgan: "pilgan_biasa",
  pilihan_ganda: "pilgan_biasa",
  pgk: "pilgan_kompleks",
  pilihan_ganda_kompleks: "pilgan_kompleks",
  isian: "uraian_singkat",
  isian_singkat: "uraian_singkat",
  uraian: "uraian_singkat",
  bs: "benar_salah",
  benar_salah_bertingkat: "multi_benar_salah",
  bs_bertingkat: "multi_benar_salah",
  jodohkan: "menjodohkan",
};

function normalTipe(v: unknown): TipeSoal | null {
  const t = String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s/-]+/g, "_");
  if ((TIPE_SOAL_LIST as string[]).includes(t)) return t as TipeSoal;
  return ALIAS_TIPE[t] ?? null;
}

function teks(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(v);
  if (typeof v !== "string") return "";
  return v.replace(/\r\n?/g, "\n").trim();
}

function boolAtauNull(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").trim().toLowerCase();
  if (["benar", "b", "true", "ya", "t"].includes(s)) return true;
  if (["salah", "s", "false", "tidak", "f"].includes(s)) return false;
  return null;
}

function refGambar(v: unknown): string | null {
  const s = teks(v);
  if (!s) return null;
  const m = /^\[\[\s*gambar\s*:\s*([^\]]+?)\s*\]\]$/i.exec(s);
  return m ? m[1] : s;
}

/** "B" -> 1, "b." -> 1, 2 -> 1 (angka dianggap 1-based). */
function indeksKunci(k: unknown): number | null {
  if (typeof k === "number" && Number.isInteger(k) && k >= 1) return k - 1;
  const s = String(k ?? "").trim().replace(/[.)]$/, "").toUpperCase();
  if (/^[A-Z]$/.test(s)) return s.charCodeAt(0) - 65;
  if (/^\d+$/.test(s) && Number(s) >= 1) return Number(s) - 1;
  return null;
}

function itemTeks(v: unknown): ItemTeks {
  if (typeof v === "string" || typeof v === "number") return { teks: teks(v) };
  const o = (v ?? {}) as Obj;
  return { teks: teks(o.teks ?? o.text ?? o.isi), gambar: refGambar(o.gambar) };
}

function kumpulkanRujukan(...sumber: (string | null | undefined)[]): string[] {
  const hasil: string[] = [];
  const sudah = new Set<string>();
  const tambah = (r: string) => {
    const k = adalahUrl(r) ? r : kunciGambar(r);
    if (!k || sudah.has(k)) return;
    sudah.add(k);
    hasil.push(r.trim());
  };
  for (const s of sumber) {
    if (!s) continue;
    for (const m of s.matchAll(RE_PENANDA)) tambah(m[1]);
  }
  return hasil;
}

function bacaSatu(raw: unknown, idx: number): SoalImpor {
  const o = (raw && typeof raw === "object" ? raw : {}) as Obj;
  const nomorRaw = Number(o.nomor ?? o.no);
  const nomor = Number.isInteger(nomorRaw) && nomorRaw > 0 ? nomorRaw : idx + 1;
  const tipe = normalTipe(o.tipe ?? o.jenis);
  const skorRaw = Number(o.skor ?? o.bobot ?? 1);
  const skor = Number.isFinite(skorRaw) ? Math.round(skorRaw * 100) / 100 : NaN;
  const pertanyaan = teks(o.pertanyaan ?? o.instruksi ?? o.soal_teks);
  const gambar = refGambar(o.gambar);
  const catatan = teks(o.catatan) || null;

  const dasar = { nomor, skor, pertanyaan, gambar, catatan };
  const gagal = (galat: string): SoalImpor => ({
    ...dasar,
    tipe: tipe ?? "pilgan_biasa",
    data: { tipe: "benar_salah", jawaban: null },
    rujukanGambar: [],
    galat,
  });

  if (!tipe) return gagal(`Tipe "${String(o.tipe ?? "")}" tidak dikenal.`);
  if (!(skor > 0) || skor > 1000) return gagal("Skor harus angka 0–1000 (lebih dari 0).");

  let data: DataImpor;
  const teksTambahan: string[] = [];

  switch (tipe) {
    case "pilgan_biasa":
    case "pilgan_kompleks": {
      const opsiRaw = Array.isArray(o.opsi) ? o.opsi : Array.isArray(o.pilihan) ? o.pilihan : [];
      const opsi = opsiRaw.map((x) => ({ ...itemTeks(x), benar: (x as Obj)?.benar === true }));
      // `kunci: "B"` atau `kunci: ["A","C"]` sebagai pengganti `benar` per opsi.
      if (o.kunci !== undefined && o.kunci !== null) {
        const daftar = Array.isArray(o.kunci) ? o.kunci : [o.kunci];
        opsi.forEach((x) => (x.benar = false));
        for (const k of daftar) {
          const i = indeksKunci(k);
          if (i === null || i >= opsi.length) return gagal(`Kunci "${String(k)}" tidak ada di daftar opsi.`);
          opsi[i].benar = true;
        }
      }
      opsi.forEach((x) => teksTambahan.push(x.teks));
      data = { tipe, opsi };
      break;
    }
    case "uraian_singkat": {
      const k = o.kunci_jawaban ?? o.kunci;
      const kunci = (Array.isArray(k) ? k : [k]).map(teks).filter(Boolean);
      data = { tipe, kunci };
      break;
    }
    case "benar_salah": {
      data = { tipe, jawaban: boolAtauNull(o.jawaban_benar ?? o.kunci) };
      break;
    }
    case "multi_benar_salah": {
      const pr = Array.isArray(o.pernyataan) ? o.pernyataan : [];
      const pernyataan = pr.map((x) => ({
        ...itemTeks(x),
        jawaban: boolAtauNull((x as Obj)?.jawaban_benar ?? (x as Obj)?.kunci),
      }));
      pernyataan.forEach((x) => teksTambahan.push(x.teks));
      data = { tipe, pernyataan };
      break;
    }
    case "menjodohkan": {
      const ps = Array.isArray(o.pasangan) ? o.pasangan : [];
      const pasangan = ps.map((x) => {
        const p = (x ?? {}) as Obj;
        return { kiri: itemTeks(p.kiri), kanan: teks(p.kanan) };
      });
      const pengecoh = (Array.isArray(o.pengecoh) ? o.pengecoh : []).map(teks).filter(Boolean);
      pasangan.forEach((x) => teksTambahan.push(x.kiri.teks));
      data = { tipe, pasangan, pengecoh };
      break;
    }
  }

  const gambarItem: string[] = [];
  if (data.tipe === "pilgan_biasa" || data.tipe === "pilgan_kompleks") {
    data.opsi.forEach((x) => x.gambar && gambarItem.push(x.gambar));
  } else if (data.tipe === "multi_benar_salah") {
    data.pernyataan.forEach((x) => x.gambar && gambarItem.push(x.gambar));
  } else if (data.tipe === "menjodohkan") {
    data.pasangan.forEach((x) => x.kiri.gambar && gambarItem.push(x.kiri.gambar));
  }

  const rujukanGambar = kumpulkanRujukan(
    pertanyaan,
    ...teksTambahan,
    ...[gambar, ...gambarItem].map((g) => (g ? `[[gambar:${g}]]` : null))
  );

  const soal: SoalImpor = { ...dasar, tipe, data, rujukanGambar, galat: null };

  // Validasi bentuk memakai aturan server yang SAMA, dengan gambar diganti
  // URL contoh — supaya guru melihat kesalahannya di pratinjau, bukan
  // setelah semua gambar telanjur diunggah.
  const contoh = new Map(rujukanGambar.map((r) => [kunciRujukan(r), "https://contoh.invalid/g.png"]));
  const siap = bangunKonten(soal, contoh);
  soal.galat = "galat" in siap ? siap.galat : validasiKonten(tipe, siap.konten);
  return soal;
}

/** Baca teks JSON mentah. Akar boleh `{ soal: [...] }` atau langsung `[...]`. */
export function bacaJsonSoal(mentah: string): HasilBaca {
  const bersih = mentah
    .replace(/^﻿/, "")
    .trim()
    // Jawaban AI sering dibungkus ```json ... ``` — buang pagarnya.
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  let akar: unknown;
  try {
    akar = JSON.parse(bersih);
  } catch (e) {
    const pesan = e instanceof Error ? e.message : "";
    return { soal: [], galatBerkas: `Berkas bukan JSON yang sah. ${pesan}`.trim() };
  }

  const daftar = Array.isArray(akar) ? akar : Array.isArray((akar as Obj)?.soal) ? ((akar as Obj).soal as unknown[]) : null;
  if (!daftar) return { soal: [], galatBerkas: 'JSON harus berisi daftar "soal": [ ... ].' };
  if (daftar.length === 0) return { soal: [], galatBerkas: "Daftar soal kosong." };
  if (daftar.length > MAKS_SOAL_IMPOR) {
    return { soal: [], galatBerkas: `Maksimal ${MAKS_SOAL_IMPOR} soal sekali unggah (berkas ini ${daftar.length}). Pecah jadi beberapa berkas.` };
  }

  return { soal: daftar.map(bacaSatu), galatBerkas: null };
}

// ---------------------------------------------------------------------------
// Pembangunan konten_jsonb
// ---------------------------------------------------------------------------

/** Kunci peta gambar untuk satu rujukan (URL utuh, atau nama ternormalisasi). */
export function kunciRujukan(ref: string): string {
  return adalahUrl(ref) ? ref.trim() : kunciGambar(ref);
}

const TAG_FORMAT = /&lt;(\/?)(b|i|u|sub|sup|strong|em)&gt;/gi;

class GambarHilang extends Error {}

/** Teks + penanda -> { teks polos, html aman }. */
function teksKeKonten(sumber: string, peta: Map<string, string>, lebar: string): { teks: string; html: string } {
  let html = teksKeHtml(sumber).replace(TAG_FORMAT, "<$1$2>");
  html = html.replace(RE_PENANDA, (_, ref: string) => {
    const url = adalahUrl(ref) ? ref.trim() : peta.get(kunciGambar(ref));
    if (!url) throw new GambarHilang(ref);
    return `<img src="${escapeAtribut(url)}" alt="" data-lebar="${lebar}" />`;
  });
  html = bersihkanHtml(html);
  return { teks: htmlKeTeks(html), html };
}

function urlDari(ref: string | null | undefined, peta: Map<string, string>): string | null {
  if (!ref) return null;
  const url = adalahUrl(ref) ? ref.trim() : peta.get(kunciGambar(ref));
  if (!url) throw new GambarHilang(ref);
  return url;
}

/**
 * Ubah satu soal hasil baca jadi baris siap simpan. `peta` memetakan
 * `kunciRujukan()` -> URL https hasil unggah.
 */
export function bangunKonten(
  s: SoalImpor,
  peta: Map<string, string>
): SoalSiapSimpan | { galat: string } {
  try {
    const t = teksKeKonten(s.pertanyaan, peta, "75");
    const gambarUrl = urlDari(s.gambar, peta);
    const d = s.data;
    let konten: Obj;

    switch (d.tipe) {
      case "pilgan_biasa":
      case "pilgan_kompleks":
        konten = {
          pertanyaan: t.teks,
          pertanyaan_html: t.html,
          opsi: d.opsi.map((o, i) => {
            const k = teksKeKonten(o.teks, peta, "50");
            return { id: `o${i + 1}`, teks: k.teks, teks_html: k.html, gambar_url: urlDari(o.gambar, peta), benar: o.benar };
          }),
        };
        break;
      case "uraian_singkat":
        konten = { pertanyaan: t.teks, pertanyaan_html: t.html, kunci_jawaban: d.kunci };
        break;
      case "benar_salah":
        konten = { pertanyaan: t.teks, pertanyaan_html: t.html, ...(d.jawaban === null ? {} : { jawaban_benar: d.jawaban }) };
        break;
      case "multi_benar_salah":
        konten = {
          instruksi: t.teks,
          instruksi_html: t.html,
          pernyataan: d.pernyataan.map((p, i) => {
            const k = teksKeKonten(p.teks, peta, "50");
            return {
              id: `p${i + 1}`,
              teks: k.teks,
              teks_html: k.html,
              gambar_url: urlDari(p.gambar, peta),
              ...(p.jawaban === null ? {} : { jawaban_benar: p.jawaban }),
            };
          }),
        };
        break;
      case "menjodohkan": {
        // Kolom kanan: jawaban unik (dua kiri boleh berbagi satu kanan) + pengecoh.
        const kanan: { id: string; teks: string }[] = [];
        const idKanan = new Map<string, string>();
        const tambahKanan = (x: string) => {
          const k = x.toLowerCase();
          if (!x || idKanan.has(k)) return idKanan.get(k);
          const id = `j${kanan.length + 1}`;
          idKanan.set(k, id);
          kanan.push({ id, teks: x });
          return id;
        };
        const pasanganBenar: Record<string, string> = {};
        const kiri = d.pasangan.map((p, i) => {
          const k = teksKeKonten(p.kiri.teks, peta, "50");
          const id = `s${i + 1}`;
          const j = tambahKanan(p.kanan);
          if (j) pasanganBenar[id] = j;
          return { id, teks: k.teks, teks_html: k.html, gambar_url: urlDari(p.kiri.gambar, peta) };
        });
        d.pengecoh.forEach(tambahKanan);
        konten = { instruksi: t.teks, instruksi_html: t.html, soal: kiri, jawaban: kanan, pasangan_benar: pasanganBenar };
        break;
      }
    }

    return { tipe: s.tipe, skor: s.skor, konten, gambarUrl };
  } catch (e) {
    if (e instanceof GambarHilang) return { galat: `Gambar "${e.message}" belum ada.` };
    throw e;
  }
}

/** Bagi rata `total` ke n soal, dua desimal; sisa pembulatan ke soal terakhir. */
export function bagiRataSkor(n: number, total = 100): number[] {
  if (n <= 0) return [];
  const satu = Math.floor((total / n) * 100) / 100;
  const hasil = Array(n).fill(satu);
  hasil[n - 1] = Math.round((total - satu * (n - 1)) * 100) / 100;
  return hasil;
}

// ---------------------------------------------------------------------------
// Template & prompt yang diunduh guru
// ---------------------------------------------------------------------------

export const TEMPLATE_IMPOR = {
  format: FORMAT_IMPOR,
  versi: 1,
  soal: [
    {
      nomor: 1,
      tipe: "pilgan_biasa",
      skor: 2,
      pertanyaan: "Perhatikan gambar berikut.\n[[gambar:gambar-1.png]]\nBangun datar di atas disebut ....",
      opsi: [
        { teks: "persegi", benar: false },
        { teks: "trapesium", benar: true },
        { teks: "jajargenjang", benar: false },
        { teks: "belah ketupat", benar: false },
      ],
    },
    {
      nomor: 2,
      tipe: "pilgan_biasa",
      skor: 2,
      pertanyaan: "Rumus kimia air adalah ....",
      opsi: ["H<sub>2</sub>O", "CO<sub>2</sub>", "O<sub>2</sub>", "NaCl"],
      kunci: "A",
    },
    {
      nomor: 3,
      tipe: "pilgan_kompleks",
      skor: 3,
      pertanyaan: "Pilih SEMUA bilangan prima di bawah ini.",
      opsi: [
        { teks: "2", benar: true },
        { teks: "9", benar: false },
        { teks: "11", benar: true },
        { teks: "15", benar: false },
      ],
    },
    {
      nomor: 4,
      tipe: "pilgan_biasa",
      skor: 2,
      pertanyaan: "Manakah gambar segitiga siku-siku?",
      opsi: [
        { teks: "[[gambar:gambar-2.png]]", benar: false },
        { teks: "[[gambar:gambar-3.png]]", benar: true },
        { teks: "[[gambar:gambar-4.png]]", benar: false },
        { teks: "[[gambar:gambar-5.png]]", benar: false },
      ],
    },
    {
      nomor: 5,
      tipe: "uraian_singkat",
      skor: 2,
      pertanyaan: "Ibu kota Provinsi Jawa Timur adalah ....",
      kunci_jawaban: ["Surabaya"],
    },
    {
      nomor: 6,
      tipe: "benar_salah",
      skor: 1,
      pertanyaan: "Matahari terbit dari arah timur.",
      jawaban_benar: true,
    },
    {
      nomor: 7,
      tipe: "multi_benar_salah",
      skor: 4,
      instruksi: "Tentukan Benar atau Salah setiap pernyataan berikut.",
      pernyataan: [
        { teks: "2 + 2 = 4", jawaban_benar: true },
        { teks: "5 × 3 = 18", jawaban_benar: false },
        { teks: "x<sup>2</sup> = x × x", jawaban_benar: true },
      ],
    },
    {
      nomor: 8,
      tipe: "menjodohkan",
      skor: 4,
      instruksi: "Jodohkan nama hewan dengan jenis makanannya.",
      pasangan: [
        { kiri: "Sapi", kanan: "Herbivora" },
        { kiri: "Harimau", kanan: "Karnivora" },
        { kiri: "Ayam", kanan: "Omnivora" },
      ],
      pengecoh: ["Insektivora"],
    },
  ],
};

export const PROMPT_IMPOR = `Kamu membantu guru SMP mengubah naskah soal (dari Word) menjadi JSON untuk LMS CBT Sipandu.

KELUARAN
- Hanya SATU blok JSON yang sah, tanpa penjelasan di luar JSON. Kalau bisa, berikan sebagai berkas "soal.json".
- Akar: { "format": "sipandu-soal", "versi": 1, "soal": [ ... ] }. Maksimal 100 soal per berkas.
- Salin teks soal APA ADANYA (ejaan, angka, satuan). Jangan meringkas, jangan menambah soal.
- Buang nomor soal ("1.") dan huruf opsi ("A.", "b)") dari teks — urutan sudah menentukan.

TIPE SOAL (field "tipe")
1. "pilgan_biasa"      pilihan ganda, TEPAT satu jawaban benar.
   { "tipe":"pilgan_biasa", "skor":2, "pertanyaan":"...", "opsi":[{"teks":"...","benar":false}, ...] }
   Boleh juga: "opsi":["...","...","...","..."] + "kunci":"C".
2. "pilgan_kompleks"   pilihan ganda, bisa LEBIH DARI satu benar. Sama dengan di atas, "kunci":["A","C"].
3. "uraian_singkat"    isian singkat. "kunci_jawaban":["jawaban1","variasi ejaan lain"].
4. "benar_salah"       satu pernyataan. "jawaban_benar": true / false.
5. "multi_benar_salah" beberapa pernyataan Benar/Salah.
   { "tipe":"multi_benar_salah", "instruksi":"...", "pernyataan":[{"teks":"...","jawaban_benar":true}, ...] }
6. "menjodohkan"
   { "tipe":"menjodohkan", "instruksi":"...", "pasangan":[{"kiri":"...","kanan":"..."}], "pengecoh":["..."] }
Soal uraian panjang/esai TIDAK didukung — lewati dan sebutkan di "catatan" soal sebelumnya, atau ubah jadi uraian_singkat bila jawabannya pendek dan pasti.

FIELD LAIN
- "nomor": nomor soal di naskah. "skor": ikuti naskah; kalau tidak tertulis, isi 1.
- "catatan": opsional, untuk hal yang harus dicek guru. WAJIB diisi bila kunci jawaban tidak ada di naskah dan kamu yang menentukannya: "Kunci ditentukan AI, mohon dicek."

GAMBAR (penting)
- Gambar ditulis sebagai penanda [[gambar:NAMA]] di posisi gambar itu berada: di "pertanyaan", di "teks" opsi, di "teks" pernyataan, atau di "kiri" menjodohkan. Opsi yang isinya hanya gambar: "teks":"[[gambar:gambar-3.png]]".
- Kalau naskah yang diberikan SUDAH berisi penanda [[gambar:gambar-N.png]], PINDAHKAN penanda itu apa adanya ke tempat yang sesuai. Jangan ganti namanya, jangan dibuang.
- Kalau naskah berupa Word dengan gambar tanpa penanda, beri nama gambar-1.png, gambar-2.png, ... berurutan sesuai kemunculan gambar dari atas ke bawah dokumen (urutan ini sama dengan urutan yang dipakai aplikasi saat mengambil gambar dari Word), lalu isi "catatan" soal tersebut dengan isi gambarnya, misal "gambar-4.png = grafik kecepatan".
- Rumus matematika: tulis dengan karakter Unicode (x², √, π, ≤, ≥, ×, ÷, ½) atau <sup>/<sub>. Pecahan sederhana boleh a/b. Rumus yang terlalu rumit: jadikan penanda gambar dan beri catatan.
- Tabel di soal: tulis baris per baris dengan pemisah " | ", atau jadikan penanda gambar bila rumit.

FORMAT TEKS
- Teks polos. Baris baru dengan \\n. Hanya tag <b> <i> <u> <sub> <sup> yang boleh dipakai.
- Jangan pakai Markdown (**tebal**, # judul) di dalam teks.

PERIKSA SEBELUM MENGIRIM
- pilgan_biasa: tepat satu benar. pilgan_kompleks: minimal satu benar. Minimal 2 opsi.
- multi_benar_salah: minimal 2 pernyataan, masing-masing punya jawaban_benar.
- menjodohkan: minimal 2 pasangan.
- JSON valid (tanda kutip ganda, tanpa koma di akhir daftar).

Berikut contoh lengkap formatnya:
`;
