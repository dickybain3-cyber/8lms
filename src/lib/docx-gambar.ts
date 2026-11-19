/**
 * Baca .docx di browser: teks dengan penanda [[gambar:gambar-N.ext]] di
 * posisi tiap gambar, plus berkas gambarnya — tanpa dependensi tambahan.
 *
 * ── KENAPA ADA ──
 *
 * Saat .docx diberikan langsung ke AI, gambar di dalamnya sering hilang
 * atau posisinya tidak diketahui. Dengan teks bertanda ini, AI cukup
 * memindahkan penanda ke field yang benar; saat JSON diunggah, .docx yang
 * sama dipilih lagi dan gambarnya dicocokkan otomatis lewat nama.
 *
 * Penomoran gambar = urutan KEMUNCULAN di dokumen (gambar yang sama
 * dipakai dua kali tetap satu nama). Urutan ini stabil: membaca berkas
 * yang sama dua kali selalu menghasilkan nama yang sama.
 *
 * ── BATASAN (dikatakan ke guru di UI) ──
 *   - Rumus Equation Editor modern (OMML) diambil teksnya saja.
 *   - Rumus/objek lama (WMF/EMF) dan gambar TIFF tidak bisa ditampilkan
 *     browser -> ditandai `didukung: false`, guru perlu tangkapan layar.
 *   - Shape/SmartArt yang digambar di Word (bukan gambar) tidak terambil.
 *
 * Pembaca ZIP & XML ditulis dengan Uint8Array + regex (bukan DOMParser)
 * supaya bisa diuji di Node; dekompresi memakai `DecompressionStream`
 * yang tersedia di browser modern dan Node 18+.
 */

export interface GambarDocx {
  /** gambar-N.ext */
  nama: string;
  /** null kalau format tidak bisa ditampilkan browser. */
  berkas: File | null;
  didukung: boolean;
  ext: string;
}

export interface HasilDocx {
  teks: string;
  gambar: GambarDocx[];
}

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
  webp: "image/webp",
};

// ---------------------------------------------------------------------------
// ZIP minimal (tanpa ZIP64 — .docx soal tidak sebesar itu)
// ---------------------------------------------------------------------------

type EntriZip = { metode: number; ukuranTerkompres: number; offsetLokal: number };

function bacaDirektoriZip(buf: Uint8Array): Map<string, EntriZip> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Berkas bukan .docx yang sah (bukan arsip ZIP).");

  const jumlah = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dekoder = new TextDecoder();
  const peta = new Map<string, EntriZip>();

  for (let n = 0; n < jumlah; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const metode = dv.getUint16(p + 10, true);
    const ukuranTerkompres = dv.getUint32(p + 20, true);
    const panjangNama = dv.getUint16(p + 28, true);
    const panjangExtra = dv.getUint16(p + 30, true);
    const panjangKomentar = dv.getUint16(p + 32, true);
    const offsetLokal = dv.getUint32(p + 42, true);
    const nama = dekoder.decode(buf.subarray(p + 46, p + 46 + panjangNama));
    peta.set(nama, { metode, ukuranTerkompres, offsetLokal });
    p += 46 + panjangNama + panjangExtra + panjangKomentar;
  }
  return peta;
}

async function ambilIsiZip(buf: Uint8Array, e: EntriZip): Promise<Uint8Array> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const o = e.offsetLokal;
  if (dv.getUint32(o, true) !== 0x04034b50) throw new Error("Isi .docx rusak.");
  const mulai = o + 30 + dv.getUint16(o + 26, true) + dv.getUint16(o + 28, true);
  const data = buf.subarray(mulai, mulai + e.ukuranTerkompres);
  if (e.metode === 0) return data;
  if (e.metode !== 8) throw new Error("Metode kompresi .docx tidak didukung.");
  const aliran = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(aliran).arrayBuffer());
}

// ---------------------------------------------------------------------------
// XML -> teks
// ---------------------------------------------------------------------------

const ENTITAS: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function urai(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, k: string) => {
    if (k[0] === "#") {
      const kode = k[1] === "x" || k[1] === "X" ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
      return String.fromCodePoint(kode);
    }
    return ENTITAS[k.toLowerCase()] ?? "";
  });
}

function atribut(mentah: string, nama: string): string | null {
  const m = new RegExp(`(?:^|\\s)${nama.replace(":", "\\:")}\\s*=\\s*"([^"]*)"`).exec(mentah);
  return m ? m[1] : null;
}

type Penomoran = Map<string, Map<number, { fmt: string; teks: string; mulai: number }>>;

/** numbering.xml -> numId -> ilvl -> format. */
function bacaPenomoran(xml: string): Penomoran {
  const abstrak = new Map<string, Map<number, { fmt: string; teks: string; mulai: number }>>();
  for (const a of xml.matchAll(/<w:abstractNum\b([^>]*)>([\s\S]*?)<\/w:abstractNum>/g)) {
    const id = atribut(a[1], "w:abstractNumId");
    if (!id) continue;
    const lv = new Map<number, { fmt: string; teks: string; mulai: number }>();
    for (const l of a[2].matchAll(/<w:lvl\b([^>]*)>([\s\S]*?)<\/w:lvl>/g)) {
      const ilvl = Number(atribut(l[1], "w:ilvl") ?? 0);
      const fmt = /<w:numFmt\b[^>]*w:val="([^"]*)"/.exec(l[2])?.[1] ?? "decimal";
      const teks = /<w:lvlText\b[^>]*w:val="([^"]*)"/.exec(l[2])?.[1] ?? "";
      const mulai = Number(/<w:start\b[^>]*w:val="(\d+)"/.exec(l[2])?.[1] ?? 1);
      lv.set(ilvl, { fmt, teks: urai(teks), mulai });
    }
    abstrak.set(id, lv);
  }
  const hasil: Penomoran = new Map();
  for (const n of xml.matchAll(/<w:num\b([^>]*)>([\s\S]*?)<\/w:num>/g)) {
    const numId = atribut(n[1], "w:numId");
    const abs = /<w:abstractNumId\b[^>]*w:val="([^"]*)"/.exec(n[2])?.[1];
    if (numId && abs && abstrak.has(abs)) hasil.set(numId, abstrak.get(abs)!);
  }
  return hasil;
}

function formatAngka(n: number, fmt: string): string {
  const huruf = (k: number) => {
    let s = "";
    for (let x = k; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(97 + ((x - 1) % 26)) + s;
    return s;
  };
  const romawi = (k: number) => {
    const t: [number, string][] = [[1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
    let s = "";
    for (const [v, r] of t) while (k >= v) { s += r; k -= v; }
    return s;
  };
  switch (fmt) {
    case "lowerLetter": return huruf(n);
    case "upperLetter": return huruf(n).toUpperCase();
    case "lowerRoman": return romawi(n);
    case "upperRoman": return romawi(n).toUpperCase();
    case "bullet": return "•";
    case "none": return "";
    default: return String(n);
  }
}

/**
 * document.xml -> teks bertanda. `namaGambar(rId)` mengembalikan nama
 * penanda untuk satu relasi gambar (dan mencatat urutannya).
 */
export function xmlKeTeks(
  xml: string,
  namaGambar: (rId: string) => string | null,
  penomoran: Penomoran = new Map()
): string {
  const keluar: string[] = [];
  const re = /<(\/?)([\w]+:[\w]+|[\w]+)([^>]*?)(\/?)>|([^<]+)/g;
  let lewati = 0; // di dalam mc:Fallback / w:instrText / w:delText
  let dalamTeks = false;
  let paragraf: string[] = [];
  let awalanParagraf = "";
  let selDalamBaris = 0;
  let dalamSel = 0;
  const pencacah = new Map<string, number[]>();
  const LEWATI = new Set(["mc:Fallback", "w:instrText", "w:delText", "w:rPr", "w:pPr"]);
  let dalamPPr = false;
  let numId: string | null = null;
  let ilvl = 0;

  const tutupParagraf = () => {
    const isi = paragraf.join("").replace(/[ \t]+$/g, "");
    keluar.push(awalanParagraf + isi + (dalamSel > 0 ? " " : "\n"));
    paragraf = [];
    awalanParagraf = "";
  };

  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    if (m[5] !== undefined) {
      if (dalamTeks && lewati === 0) paragraf.push(urai(m[5]));
      continue;
    }
    const tutup = m[1] === "/";
    const tag = m[2];
    const attr = m[3];
    const tunggal = m[4] === "/";

    // w:pPr dilewati teksnya tapi penomorannya dibaca.
    if (tag === "w:pPr") {
      if (!tutup && !tunggal) dalamPPr = true;
      if (tutup) dalamPPr = false;
      continue;
    }
    if (dalamPPr) {
      if (tag === "w:numId" && !tutup) numId = atribut(attr, "w:val");
      if (tag === "w:ilvl" && !tutup) ilvl = Number(atribut(attr, "w:val") ?? 0);
      continue;
    }

    if (LEWATI.has(tag)) {
      if (!tunggal) lewati += tutup ? -1 : 1;
      continue;
    }
    if (lewati > 0) continue;

    switch (tag) {
      case "w:p":
        if (!tutup && !tunggal) {
          paragraf = [];
          numId = null;
          ilvl = 0;
        } else {
          if (numId && numId !== "0" && penomoran.has(numId)) {
            const lv = penomoran.get(numId)!;
            const c = pencacah.get(numId) ?? [];
            for (let k = 0; k < ilvl; k++) if (c[k] === undefined) c[k] = (lv.get(k)?.mulai ?? 1) - 1;
            c[ilvl] = (c[ilvl] ?? (lv.get(ilvl)?.mulai ?? 1) - 1) + 1;
            c.length = ilvl + 1;
            pencacah.set(numId, c);
            const def = lv.get(ilvl);
            if (def) {
              const label = def.teks.replace(/%(\d)/g, (_, d: string) => {
                const i = Number(d) - 1;
                return formatAngka(c[i] ?? 1, lv.get(i)?.fmt ?? "decimal");
              });
              awalanParagraf = "  ".repeat(ilvl) + (label ? label + " " : "");
            }
          }
          tutupParagraf();
        }
        break;
      case "w:t":
      case "m:t":
        dalamTeks = !tutup && !tunggal;
        break;
      case "w:tab":
        if (!tutup) paragraf.push("\t");
        break;
      case "w:br":
      case "w:cr":
        if (!tutup) paragraf.push("\n");
        break;
      case "w:tr":
        if (!tutup) selDalamBaris = 0;
        else keluar.push("\n");
        break;
      case "w:tc":
        if (tunggal) break;
        if (tutup) dalamSel--;
        else {
          if (selDalamBaris++ > 0) keluar.push("| ");
          dalamSel++;
        }
        break;
      case "a:blip": {
        const id = atribut(attr, "r:embed") ?? atribut(attr, "r:link");
        const nama = id ? namaGambar(id) : null;
        if (nama && !tutup) paragraf.push(`[[gambar:${nama}]]`);
        break;
      }
      case "v:imagedata": {
        const id = atribut(attr, "r:id");
        const nama = id ? namaGambar(id) : null;
        if (nama && !tutup) paragraf.push(`[[gambar:${nama}]]`);
        break;
      }
    }
  }

  return keluar
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Baca .docx -> teks bertanda + gambar berurutan. */
export async function bacaDocx(berkas: Blob): Promise<HasilDocx> {
  const buf = new Uint8Array(await berkas.arrayBuffer());
  const dir = bacaDirektoriZip(buf);
  const dekoder = new TextDecoder();
  const baca = async (nama: string) => {
    const e = dir.get(nama);
    return e ? dekoder.decode(await ambilIsiZip(buf, e)) : null;
  };

  const dokumen = await baca("word/document.xml");
  if (!dokumen) throw new Error("Berkas bukan dokumen Word (.docx).");
  const rels = (await baca("word/_rels/document.xml.rels")) ?? "";
  const penomoran = bacaPenomoran((await baca("word/numbering.xml")) ?? "");

  const target = new Map<string, string>();
  for (const r of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = atribut(r[1], "Id");
    const t = atribut(r[1], "Target");
    const eksternal = atribut(r[1], "TargetMode") === "External";
    if (id && t && !eksternal && /\/image$/.test(atribut(r[1], "Type") ?? "")) {
      target.set(id, t.startsWith("/") ? t.slice(1) : `word/${t}`.replace(/\/\.\//g, "/"));
    }
  }

  const urutan: { nama: string; jalur: string; ext: string }[] = [];
  const namaPerJalur = new Map<string, string>();
  const namaGambar = (rId: string) => {
    const jalur = target.get(rId);
    if (!jalur) return null;
    const ada = namaPerJalur.get(jalur);
    if (ada) return ada;
    const ext = (/\.([a-z0-9]+)$/i.exec(jalur)?.[1] ?? "png").toLowerCase();
    const nama = `gambar-${urutan.length + 1}.${ext}`;
    namaPerJalur.set(jalur, nama);
    urutan.push({ nama, jalur, ext });
    return nama;
  };

  const teks = xmlKeTeks(dokumen, namaGambar, penomoran);

  const gambar: GambarDocx[] = [];
  for (const g of urutan) {
    const e = dir.get(g.jalur);
    const mime = MIME[g.ext];
    if (!e || !mime) {
      gambar.push({ nama: g.nama, berkas: null, didukung: false, ext: g.ext });
      continue;
    }
    const isi = await ambilIsiZip(buf, e);
    const salin = new Uint8Array(isi.byteLength);
    salin.set(isi);
    gambar.push({ nama: g.nama, berkas: new File([salin], g.nama, { type: mime }), didukung: true, ext: g.ext });
  }

  return { teks, gambar };
}
