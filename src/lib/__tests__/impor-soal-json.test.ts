/**
 * Jalankan: npx tsx src/lib/__tests__/impor-soal-json.test.ts
 *
 * Fungsi murni impor JSON + pembaca .docx (ZIP dibuat di tes, metode
 * "stored" dan deflate lewat CompressionStream bawaan Node).
 */
import assert from "node:assert/strict";
import {
  TEMPLATE_IMPOR,
  bacaJsonSoal,
  bagiRataSkor,
  bangunKonten,
  kunciGambar,
  kunciRujukan,
} from "@/lib/impor-soal-json";
import { bacaDocx, xmlKeTeks } from "@/lib/docx-gambar";
import { validasiKonten } from "@/lib/validasi-soal";

let lulus = 0;
async function uji(nama: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    lulus++;
  } catch (e) {
    console.error(`GAGAL: ${nama}`);
    throw e;
  }
}

const URL_CONTOH = "https://res.cloudinary.com/x/image/upload/v1/a.png";

async function main() {
  await uji("template contoh terbaca tanpa galat", () => {
    const h = bacaJsonSoal(JSON.stringify(TEMPLATE_IMPOR));
    assert.equal(h.galatBerkas, null);
    assert.equal(h.soal.length, TEMPLATE_IMPOR.soal.length);
    for (const s of h.soal) assert.equal(s.galat, null, `soal ${s.nomor}: ${s.galat}`);
  });

  await uji("template: semua soal lolos validasiKonten setelah gambar terisi", () => {
    const h = bacaJsonSoal(JSON.stringify(TEMPLATE_IMPOR));
    const peta = new Map<string, string>();
    for (const s of h.soal) for (const r of s.rujukanGambar) peta.set(kunciRujukan(r), URL_CONTOH);
    for (const s of h.soal) {
      const b = bangunKonten(s, peta);
      assert.ok(!("galat" in b));
      if (!("galat" in b)) assert.equal(validasiKonten(b.tipe, b.konten), null);
    }
  });

  await uji("pagar ```json dan BOM dibuang; akar boleh array", () => {
    const h = bacaJsonSoal('﻿```json\n[{"tipe":"bs","pertanyaan":"Air itu basah","jawaban_benar":"benar"}]\n```');
    assert.equal(h.galatBerkas, null);
    assert.equal(h.soal[0].tipe, "benar_salah");
    assert.equal(h.soal[0].galat, null);
  });

  await uji("JSON rusak / kosong ditolak di tingkat berkas", () => {
    assert.match(bacaJsonSoal("{soal:").galatBerkas ?? "", /bukan JSON/);
    assert.match(bacaJsonSoal('{"soal":[]}').galatBerkas ?? "", /kosong/);
    assert.match(bacaJsonSoal('{"x":1}').galatBerkas ?? "", /daftar/);
  });

  await uji("kunci huruf memetakan ke opsi; kunci di luar opsi = galat", () => {
    const ok = bacaJsonSoal(JSON.stringify([{ tipe: "pilgan_biasa", pertanyaan: "?", opsi: ["a", "b", "c"], kunci: "c." }]));
    assert.equal(ok.soal[0].galat, null);
    const d = ok.soal[0].data;
    assert.ok(d.tipe === "pilgan_biasa" && d.opsi[2].benar && !d.opsi[0].benar);
    const salah = bacaJsonSoal(JSON.stringify([{ tipe: "pg", pertanyaan: "?", opsi: ["a", "b"], kunci: "D" }]));
    assert.match(salah.soal[0].galat ?? "", /Kunci/);
  });

  await uji("pilgan_biasa dengan dua kunci benar ditolak aturan server", () => {
    const h = bacaJsonSoal(JSON.stringify([{ tipe: "pilgan_biasa", pertanyaan: "?", opsi: ["a", "b"], kunci: ["A", "B"] }]));
    assert.match(h.soal[0].galat ?? "", /tepat satu/);
  });

  await uji("tipe tak dikenal & skor 0 ditolak", () => {
    const h = bacaJsonSoal(JSON.stringify([{ tipe: "esai", pertanyaan: "?" }, { tipe: "bs", pertanyaan: "?", jawaban_benar: true, skor: 0 }]));
    assert.match(h.soal[0].galat ?? "", /tidak dikenal/);
    assert.match(h.soal[1].galat ?? "", /Skor/);
  });

  await uji("penanda gambar -> <img>, teks polos tanpa penanda, tag sup lolos, tag lain di-escape", () => {
    const h = bacaJsonSoal(
      JSON.stringify([
        {
          tipe: "uraian_singkat",
          pertanyaan: "Lihat [[gambar:Gambar-1.PNG]] lalu hitung x<sup>2</sup> <script>x</script>",
          kunci_jawaban: ["4"],
        },
      ])
    );
    const s = h.soal[0];
    assert.deepEqual(s.rujukanGambar, ["Gambar-1.PNG"]);
    const b = bangunKonten(s, new Map([["gambar-1", URL_CONTOH]]));
    assert.ok(!("galat" in b));
    if ("galat" in b) return;
    const html = String(b.konten.pertanyaan_html);
    assert.ok(html.includes(`<img src="${URL_CONTOH}"`));
    assert.ok(html.includes("<sup>2</sup>"));
    assert.ok(!html.includes("<script>"));
    assert.ok(!String(b.konten.pertanyaan).includes("[["));
  });

  await uji("gambar belum tersedia -> galat saat bangun, tidak diam-diam hilang", () => {
    const h = bacaJsonSoal(JSON.stringify([{ tipe: "bs", pertanyaan: "[[gambar:g9.png]]", jawaban_benar: false }]));
    const b = bangunKonten(h.soal[0], new Map());
    assert.ok("galat" in b && /g9\.png/.test(b.galat));
  });

  await uji("opsi berisi gambar saja sah; field gambar soal -> gambarUrl", () => {
    const h = bacaJsonSoal(
      JSON.stringify([
        { tipe: "pilgan_biasa", pertanyaan: "Mana?", gambar: "utama.jpg", opsi: [{ teks: "[[gambar:a.png]]", benar: true }, { teks: "", gambar: "b.png" }] },
      ])
    );
    const s = h.soal[0];
    assert.equal(s.galat, null);
    assert.deepEqual(s.rujukanGambar.map(kunciGambar).sort(), ["a", "b", "utama"]);
    const b = bangunKonten(s, new Map([["a", URL_CONTOH], ["b", URL_CONTOH], ["utama", URL_CONTOH]]));
    assert.ok(!("galat" in b) && b.gambarUrl === URL_CONTOH);
  });

  await uji("URL https langsung dipakai tanpa berkas", () => {
    const h = bacaJsonSoal(JSON.stringify([{ tipe: "bs", pertanyaan: `[[gambar:${URL_CONTOH}]]`, jawaban_benar: true }]));
    const b = bangunKonten(h.soal[0], new Map());
    assert.ok(!("galat" in b));
  });

  await uji("menjodohkan: kanan dideduplikasi, pengecoh ditambah, pasangan lengkap", () => {
    const h = bacaJsonSoal(
      JSON.stringify([
        {
          tipe: "menjodohkan",
          instruksi: "Jodohkan",
          pasangan: [
            { kiri: "Sapi", kanan: "Herbivora" },
            { kiri: "Kambing", kanan: "herbivora" },
            { kiri: "Harimau", kanan: "Karnivora" },
          ],
          pengecoh: ["Omnivora", "Karnivora"],
        },
      ])
    );
    const b = bangunKonten(h.soal[0], new Map());
    assert.ok(!("galat" in b));
    if ("galat" in b) return;
    const jawaban = b.konten.jawaban as { id: string; teks: string }[];
    assert.deepEqual(jawaban.map((j) => j.teks), ["Herbivora", "Karnivora", "Omnivora"]);
    assert.deepEqual(b.konten.pasangan_benar, { s1: "j1", s2: "j1", s3: "j2" });
  });

  await uji("multi_benar_salah tanpa kunci pada satu pernyataan ditolak", () => {
    const h = bacaJsonSoal(
      JSON.stringify([{ tipe: "multi_benar_salah", instruksi: "x", pernyataan: [{ teks: "a", jawaban_benar: true }, { teks: "b" }] }])
    );
    assert.match(h.soal[0].galat ?? "", /pernyataan/);
  });

  await uji("bagiRataSkor total pas", () => {
    for (const n of [1, 3, 7, 30, 40]) {
      const s = bagiRataSkor(n);
      assert.equal(s.length, n);
      assert.equal(Math.round(s.reduce((a, b) => a + b, 0) * 100) / 100, 100);
    }
  });

  await uji("xmlKeTeks: penanda gambar di posisi, tabel, penomoran, Fallback dilewati", () => {
    const numbering = new Map([["1", new Map([[0, { fmt: "decimal", teks: "%1.", mulai: 1 }], [1, { fmt: "upperLetter", teks: "%2.", mulai: 1 }]])]]);
    const xml =
      `<w:body>` +
      `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Perhatikan &amp; lihat</w:t></w:r></w:p>` +
      `<w:p><w:r><w:drawing><a:blip r:embed="rId5"/></w:drawing></w:r></w:p>` +
      `<w:p><w:pPr><w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>opsi</w:t></w:r></w:p>` +
      `<w:p><w:pPr><w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><mc:AlternateContent><mc:Choice><w:t>dua</w:t></mc:Choice><mc:Fallback><w:t>DUPLIKAT</w:t></mc:Fallback></mc:AlternateContent></w:r></w:p>` +
      `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Soal kedua</w:t></w:r></w:p>` +
      `<w:tbl><w:tr><w:tc><w:p><w:r><w:t>a</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>b</w:t></w:r></w:p></w:tc></w:tr></w:tbl>` +
      `</w:body>`;
    const teks = xmlKeTeks(xml, (id) => (id === "rId5" ? "gambar-1.png" : null), numbering);
    assert.ok(teks.includes("1. Perhatikan & lihat"), teks);
    assert.ok(teks.includes("[[gambar:gambar-1.png]]"));
    assert.ok(teks.includes("  A. opsi"), teks);
    assert.ok(teks.includes("  B. dua"), teks);
    assert.ok(teks.includes("2. Soal kedua"), teks);
    assert.ok(!teks.includes("DUPLIKAT"));
    assert.match(teks, /a \| b/);
  });

  await uji("bacaDocx: zip nyata (stored + deflate), gambar diberi nama urut kemunculan", async () => {
    const enc = new TextEncoder();
    const deflate = async (b: Uint8Array) =>
      new Uint8Array(await new Response(new Blob([b as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer());
    const dok = enc.encode(
      `<?xml version="1.0"?><w:document><w:body>` +
        `<w:p><w:r><w:t>Soal satu</w:t></w:r><w:r><w:drawing><a:blip r:embed="rB"/></w:drawing></w:r></w:p>` +
        `<w:p><w:r><w:pict><v:imagedata r:id="rA"/></w:pict></w:r></w:p>` +
        `<w:p><w:r><w:drawing><a:blip r:embed="rB"/></w:drawing></w:r></w:p>` +
        `</w:body></w:document>`
    );
    const rels = enc.encode(
      `<Relationships>` +
        `<Relationship Id="rA" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.wmf"/>` +
        `<Relationship Id="rB" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image2.png"/>` +
        `</Relationships>`
    );
    const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
    const berkas: [string, Uint8Array, boolean][] = [
      ["word/document.xml", dok, true],
      ["word/_rels/document.xml.rels", rels, false],
      ["word/media/image2.png", png, false],
      ["word/media/image1.wmf", new Uint8Array([1]), false],
    ];
    const zip = await buatZip(berkas, deflate);
    const h = await bacaDocx(new Blob([zip as Uint8Array<ArrayBuffer>]));
    assert.deepEqual(h.gambar.map((g) => g.nama), ["gambar-1.png", "gambar-2.wmf"]);
    assert.equal(h.gambar[0].didukung, true);
    assert.equal(h.gambar[1].didukung, false);
    assert.deepEqual(new Uint8Array(await h.gambar[0].berkas!.arrayBuffer()), png);
    assert.equal(h.teks.match(/\[\[gambar:gambar-1\.png\]\]/g)?.length, 2);
    assert.ok(h.teks.startsWith("Soal satu[[gambar:gambar-1.png]]"));
  });

  console.log(`impor-soal-json: ${lulus} uji lulus`);
}

/** ZIP minimal untuk tes (CRC diisi 0 — pembaca tidak memeriksanya). */
async function buatZip(
  berkas: [string, Uint8Array, boolean][],
  deflate: (b: Uint8Array) => Promise<Uint8Array>
): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const bagian: Uint8Array[] = [];
  const pusat: Uint8Array[] = [];
  let offset = 0;
  for (const [nama, isi, kompres] of berkas) {
    const n = enc.encode(nama);
    const data = kompres ? await deflate(isi) : isi;
    const lokal = new DataView(new ArrayBuffer(30));
    lokal.setUint32(0, 0x04034b50, true);
    lokal.setUint16(8, kompres ? 8 : 0, true);
    lokal.setUint32(18, data.length, true);
    lokal.setUint32(22, isi.length, true);
    lokal.setUint16(26, n.length, true);
    bagian.push(new Uint8Array(lokal.buffer), n, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(10, kompres ? 8 : 0, true);
    c.setUint32(20, data.length, true);
    c.setUint32(24, isi.length, true);
    c.setUint16(28, n.length, true);
    c.setUint32(42, offset, true);
    pusat.push(new Uint8Array(c.buffer), n);
    offset += 30 + n.length + data.length;
  }
  const ukuranPusat = pusat.reduce((a, b) => a + b.length, 0);
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, berkas.length, true);
  eocd.setUint16(10, berkas.length, true);
  eocd.setUint32(12, ukuranPusat, true);
  eocd.setUint32(16, offset, true);
  const semua = [...bagian, ...pusat, new Uint8Array(eocd.buffer)];
  const hasil = new Uint8Array(semua.reduce((a, b) => a + b.length, 0));
  let p = 0;
  for (const s of semua) {
    hasil.set(s, p);
    p += s.length;
  }
  return hasil;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
