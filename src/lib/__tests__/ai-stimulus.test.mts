/**
 * Jalankan: npx tsx src/lib/__tests__/ai-stimulus.test.mts
 *
 * Stimulus TKA: normalisasi jawaban AI, penyuntingan teks per baris,
 * HTML stimulus, dan render SUNGGUHAN lewat Vega-Lite & AntV Infographic
 * (tanpa jaringan, tanpa AI). Berkas .mts karena Vega hanya ESM.
 */
import assert from "node:assert/strict";
import {
  htmlStimulus,
  normalisasiStimulus,
  stimulusKeTeks,
  svgTabel,
  teksKeStimulus,
  type Stimulus,
} from "@/lib/ai/stimulus";
import { renderStimulusSvg } from "@/lib/ai/stimulus-server";
import { bersihkanSvg } from "@/lib/ai/svg";
import { kontenSiapSimpan, normalisasiItem } from "@/lib/ai/rencana-soal";

let lulus = 0;
async function uji(nama: string, fn: () => void | Promise<void>) {
  await fn();
  lulus++;
  console.log(`  ✓ ${nama}`);
}

const tabel = normalisasiStimulus({
  jenis: "tabel",
  judul: "Hasil panen <b>padi</b>",
  sumber: "Data ilustrasi",
  kolom: ["Desa", "Panen (ton)", "Luas (ha)"],
  baris: [["Kraksaan", "120", "40"], ["Paiton", "95"], ["", "", ""]],
}) as Extract<Stimulus, { jenis: "tabel" }>;
const grafik = normalisasiStimulus({
  jenis: "grafik",
  bentuk: "garis",
  judul: "Suhu harian",
  sumbu_x: "Hari",
  sumbu_y: "Suhu (°C)",
  data: [
    { label: "Senin", nilai: 30, seri: "Kota A" },
    { label: "Selasa", nilai: "31,5", seri: "Kota A" },
    { label: "Senin", nilai: 27, seri: "Kota B" },
    { label: "Selasa", nilai: "x", seri: "Kota B" },
  ],
}) as Extract<Stimulus, { jenis: "grafik" }>;
const info = normalisasiStimulus({
  jenis: "infografis",
  bentuk: "siklus",
  judul: "Siklus air",
  poin: [
    { label: "Evaporasi", teks: "Air menguap karena panas matahari" },
    { label: "Kondensasi", teks: "Uap air mengembun jadi awan" },
    { label: "Presipitasi", teks: "Hujan turun ke bumi" },
  ],
}) as Extract<Stimulus, { jenis: "infografis" }>;

console.log("normalisasi");
await uji("tabel: tag dibuang, sel disamakan dengan kolom, baris kosong dibuang", () => {
  assert.equal(tabel.jenis, "tabel");
  assert.equal(tabel.judul, "Hasil panen padi");
  assert.deepEqual(tabel.baris, [["Kraksaan", "120", "40"], ["Paiton", "95", ""]]);
});
await uji("grafik: koma desimal dibaca, nilai rusak dibuang", () => {
  assert.equal(grafik.data.length, 3);
  assert.equal(grafik.data[1].nilai, 31.5);
});
await uji("bentuk rusak turun jadi bacaan bila ada teks, null bila tidak", () => {
  assert.equal(normalisasiStimulus({ jenis: "tabel", judul: "x", kolom: ["a"], teks: "Teks bacaan yang cukup panjang untuk dipakai." })?.jenis, "bacaan");
  assert.equal(normalisasiStimulus({ jenis: "grafik", judul: "x", data: [] }), null);
  assert.equal(normalisasiStimulus({ jenis: "gambar", judul: "x" }), null, "gambar diurus field gambar");
});
await uji("jenis yang tidak dipilih guru tidak dipakai", () => {
  const s = normalisasiStimulus({ jenis: "grafik", judul: "x", data: [{ label: "a", nilai: 1 }, { label: "b", nilai: 2 }] }, ["bacaan"]);
  assert.equal(s, null);
});
await uji("normalisasiItem membawa stimulus", () => {
  const d = normalisasiItem("pilgan_biasa", { pertanyaan: "Berdasarkan tabel, desa mana panen terbanyak?", opsi: ["Kraksaan", "Paiton", "Gending", "Besuk"], indeks_benar: 0, stimulus: { jenis: "tabel", judul: "T", kolom: ["Desa", "Ton"], baris: [["Kraksaan", "120"]] } }, 2, 4);
  assert.equal(d?.stimulus?.jenis, "tabel");
});

console.log("edit teks per baris");
await uji("tabel bolak-balik teks", () => {
  const t = stimulusKeTeks(tabel);
  assert.equal(t.split("\n")[0], "Desa | Panen (ton) | Luas (ha)");
  const baru = teksKeStimulus(tabel, t.replace("120", "150")) as typeof tabel;
  assert.equal(baru.baris[0][1], "150");
  assert.equal(baru.judul, tabel.judul);
});
await uji("grafik bolak-balik teks; isian rusak → stimulus lama", () => {
  const baru = teksKeStimulus(grafik, "Senin | 20\nSelasa | 25") as typeof grafik;
  assert.deepEqual(baru.data.map((d) => d.nilai), [20, 25]);
  assert.equal(teksKeStimulus(grafik, "cuma satu baris"), grafik);
});

console.log("html & konten");
await uji("bacaan jadi paragraf + sumber, aman dari HTML", () => {
  const h = htmlStimulus({ jenis: "bacaan", judul: "Banjir", sumber: "BMKG", teks: "Paragraf <script>1</script>.\n\nParagraf dua." }, null);
  assert.doesNotMatch(h, /<script>/);
  assert.equal((h.match(/text-align:justify/g) ?? []).length, 2);
  assert.match(h, /Sumber: BMKG/);
});
await uji("stimulus bergambar tanpa url → kosong (belum boleh disimpan)", () => {
  assert.equal(htmlStimulus(tabel, null), "");
  assert.match(htmlStimulus(tabel, "https://res.cloudinary.com/x/a.png"), /<img src="https:\/\/res\.cloudinary\.com/);
});
await uji("urutan konten: stimulus → gambar+kredit → pertanyaan", () => {
  const d = normalisasiItem("benar_salah", { pertanyaan: "Panen Paiton lebih kecil.", jawaban_benar: true, stimulus: { jenis: "bacaan", judul: "J", teks: "Teks bacaan cukup panjang untuk dipakai sebagai stimulus." } }, 1, 4)!;
  const k = kontenSiapSimpan(d, "https://res.cloudinary.com/x/f.jpg", { kreditGambar: "Foto: A, CC BY 4.0, via Wikimedia Commons" });
  const h = String(k.pertanyaan_html);
  assert.ok(h.indexOf("Teks bacaan") < h.indexOf("<img") && h.indexOf("<img") < h.indexOf("Panen Paiton"));
  assert.match(h, /Wikimedia Commons/);
  assert.equal(k.pertanyaan, "Panen Paiton lebih kecil.", "teks polos tidak berubah");
});

console.log("render sungguhan");
await uji("tabel SVG punya viewBox & semua sel", () => {
  const svg = svgTabel(tabel);
  assert.match(svg, /viewBox="0 0 800 \d+"/);
  assert.match(svg, /Kraksaan/);
  assert.match(svg, /Sumber: Data ilustrasi/);
});
for (const s of [
  tabel,
  grafik,
  { ...grafik, bentuk: "batang" as const },
  { ...grafik, bentuk: "lingkaran" as const, data: grafik.data.map((d) => ({ ...d, seri: "" })) },
  info,
  { ...info, bentuk: "proses" as const },
  { ...info, bentuk: "daftar" as const },
  { ...info, bentuk: "piramida" as const },
  {
    ...info,
    bentuk: "perbandingan" as const,
    poin: [
      { label: "Hewan", teks: "", anak: ["Heterotrof", "Bergerak"] },
      { label: "Tumbuhan", teks: "", anak: ["Autotrof", "Menetap"] },
    ],
  },
] as Stimulus[]) {
  const nama = `${s.jenis}${"bentuk" in s ? ` ${s.bentuk}` : ""}`;
  await uji(`render ${nama} → SVG lolos penyaring, teks data terlihat`, async () => {
    const svg = bersihkanSvg(await renderStimulusSvg(s));
    assert.ok(svg, "SVG kosong setelah disaring");
    const kata =
      s.jenis === "tabel" ? "Paiton" : s.jenis === "grafik" ? "Senin" : s.jenis === "infografis" ? s.poin[0].label.slice(0, 5) : "";
    assert.ok(svg!.toLowerCase().includes(kata.toLowerCase()), `teks "${kata}" tidak ada di SVG`);
    assert.doesNotMatch(svg!, /foreignObject|<script/i);
  });
}

console.log(`\n${lulus} uji lulus.`);
