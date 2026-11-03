/**
 * Jalankan: npx tsx src/lib/__tests__/ai-draf.test.ts
 *
 * Bagian murni alur baru "Buat Soal AI": sebaran jumlah per bentuk soal,
 * pertanyaan pemandu di prompt, Preview kuis (periksa jawaban, buang
 * kunci), dan naskah dokumen yang diunduh.
 */
import assert from "node:assert/strict";
import {
  buatPromptBatch,
  jumlahKosong,
  normalisasiItem,
  pecahBatch,
  pindahJumlah,
  sesuaikanTotal,
  totalSoal,
  validasiRencana,
  MAKS_CONTOH,
} from "@/lib/ai/rencana-soal";
import {
  drafButuhGambar,
  htmlDokumenSoal,
  kontenFinalDraf,
  namaBerkas,
  periksaJawaban,
  tanpaKunci,
  teksKunci,
  type DrafTinjau,
} from "@/lib/ai/draf";
import { validasiKonten } from "@/lib/validasi-soal";

let lulus = 0;
function uji(nama: string, fn: () => void) {
  fn();
  lulus++;
  console.log(`  ✓ ${nama}`);
}

const jumlah = (o: Partial<Record<string, number>>) => ({ ...jumlahKosong(), ...o });

console.log("sebaran jumlah");
uji("total naik → selisih masuk ke bentuk pertama yang terisi", () => {
  const j = sesuaikanTotal(jumlah({ uraian_singkat: 3, menjodohkan: 1 }), 10);
  assert.equal(totalSoal(j), 10);
  assert.equal(j.uraian_singkat, 9);
  assert.equal(j.menjodohkan, 1);
});
uji("total naik dari kosong → Pilihan Ganda", () => {
  assert.equal(sesuaikanTotal(jumlahKosong(), 5).pilgan_biasa, 5);
});
uji("total turun → dikurangi dari bentuk paling bawah dulu", () => {
  const j = sesuaikanTotal(jumlah({ pilgan_biasa: 10, benar_salah: 3, menjodohkan: 2 }), 11);
  assert.equal(totalSoal(j), 11);
  assert.equal(j.pilgan_biasa, 10);
  assert.equal(j.menjodohkan, 0);
  assert.equal(j.benar_salah, 1);
});
uji("total 0 → semua kosong, tidak minus", () => {
  const j = sesuaikanTotal(jumlah({ pilgan_biasa: 4, uraian_singkat: 2 }), 0);
  assert.equal(totalSoal(j), 0);
  for (const v of Object.values(j)) assert.ok(v >= 0);
});
uji("pindah menjaga total dan tidak bisa minus", () => {
  const awal = jumlah({ pilgan_biasa: 2, uraian_singkat: 1 });
  const j = pindahJumlah(awal, "pilgan_biasa", "benar_salah", 5);
  assert.equal(totalSoal(j), 3);
  assert.equal(j.pilgan_biasa, 0);
  assert.equal(j.benar_salah, 2);
  assert.equal(pindahJumlah(j, "pilgan_biasa", "uraian_singkat"), j, "asal kosong → tidak berubah");
});

console.log("pemandu");
uji("validasi membuang level kognitif asing & memotong contoh", () => {
  const r = validasiRencana({
    topik: ["Pecahan"],
    jumlah: { pilgan_biasa: 3 },
    pemandu: {
      tujuan: "Menjumlahkan pecahan",
      jenisAsesmen: "PTS",
      levelKognitif: ["C3", "C9", "C3", "<b>C4</b>"],
      stimulus: "ya",
      contoh: "x".repeat(MAKS_CONTOH + 500),
    },
  });
  assert.ok(typeof r !== "string");
  assert.deepEqual(r.pemandu!.levelKognitif, ["C3"]);
  assert.equal(r.pemandu!.stimulus, false, "hanya true yang dianggap ya");
  assert.equal(r.pemandu!.contoh.length, MAKS_CONTOH);
});
uji("prompt memuat tujuan, level, stimulus, dan contoh", () => {
  const r = validasiRencana({
    topik: ["Pecahan"],
    jumlah: { pilgan_biasa: 3 },
    pemandu: { tujuan: "Menjumlahkan pecahan", levelKognitif: ["C3"], stimulus: true, contoh: "1. 1/2 + 1/4 = ..." },
  });
  assert.ok(typeof r !== "string");
  const p = buatPromptBatch(pecahBatch(r)[0], {
    mapel: "Matematika",
    jenjang: 7,
    topik: r.topik,
    kesulitan: r.kesulitan,
    jumlahOpsi: 4,
    catatan: "",
    pemandu: r.pemandu,
    hindari: [],
  });
  assert.match(p, /Menjumlahkan pecahan/);
  assert.match(p, /C3/);
  assert.match(p, /stimulus/);
  assert.match(p, /1\/2 \+ 1\/4/);
  assert.match(p, /JANGAN menyalin/);
});
uji("tanpa pemandu → prompt tidak menyebut contoh", () => {
  const r = validasiRencana({ topik: ["Pecahan"], jumlah: { pilgan_biasa: 3 } });
  assert.ok(typeof r !== "string");
  const p = buatPromptBatch(pecahBatch(r)[0], {
    mapel: "Matematika", jenjang: 7, topik: r.topik, kesulitan: r.kesulitan, jumlahOpsi: 4, catatan: "", pemandu: r.pemandu, hindari: [],
  });
  assert.doesNotMatch(p, /contoh soal dari guru/);
});

console.log("draf, preview kuis, dokumen");
function draf(tipe: Parameters<typeof normalisasiItem>[0], raw: unknown): DrafTinjau {
  const d = normalisasiItem(tipe, raw, 2, 4);
  assert.ok(d, `normalisasi ${tipe}`);
  return { ...d, dipakai: true, gambarStatus: { url: null, proses: null, galat: null }, galatSimpan: null };
}
const pg = draf("pilgan_biasa", {
  pertanyaan: "2 + 2 = ?",
  opsi: ["4", "3", "5", "<script>x</script>6"],
  indeks_benar: 0,
  gambar: { perlu: false },
});
const us = draf("uraian_singkat", { pertanyaan: "Proses tumbuhan membuat makanan?", kunci_jawaban: ["fotosintesis"] });
const mbs = draf("multi_benar_salah", {
  instruksi: "Tentukan benar/salah",
  pernyataan: [
    { teks: "Air mendidih 100°C", benar: true },
    { teks: "Es lebih berat dari air", benar: false },
  ],
});
const jodoh = draf("menjodohkan", {
  instruksi: "Jodohkan",
  pasangan: [
    { kiri: "Ibu kota Jawa Timur", kanan: "Surabaya" },
    { kiri: "Ibu kota Jawa Tengah", kanan: "Semarang" },
  ],
});

uji("konten final lolos validasi server untuk semua bentuk", () => {
  for (const d of [pg, us, mbs, jodoh]) assert.equal(validasiKonten(d.tipe, kontenFinalDraf(d)), null, d.tipe);
});
uji("draf yang diedit memakai konten apa adanya", () => {
  const html = "<p><b>Tebal</b> 2 + 2?</p>";
  const d = { ...pg, diedit: true, konten: { ...pg.konten, pertanyaan_html: html } };
  assert.equal(kontenFinalDraf(d).pertanyaan_html, html);
});
uji("butuh gambar hanya bila belum ada url dan belum diedit", () => {
  const g = { ...pg, gambar: { jenis: "diagram" as const, deskripsi: "segitiga", promptEn: "" } };
  assert.equal(drafButuhGambar(g), true);
  assert.equal(drafButuhGambar({ ...g, gambarStatus: { url: "https://x/a.png", proses: null, galat: null } }), false);
  assert.equal(drafButuhGambar({ ...g, diedit: true }), false);
});
uji("tanpaKunci membuang semua field kunci", () => {
  for (const d of [pg, us, mbs, jodoh]) {
    const teks = JSON.stringify(tanpaKunci(kontenFinalDraf(d)));
    assert.doesNotMatch(teks, /"benar"|jawaban_benar|kunci_jawaban|pasangan_benar/, d.tipe);
  }
});
uji("periksa jawaban per bentuk", () => {
  const kpg = kontenFinalDraf(pg);
  const benar = (kpg.opsi as { id: string; benar: boolean }[]).find((o) => o.benar)!.id;
  const salah = (kpg.opsi as { id: string; benar: boolean }[]).find((o) => !o.benar)!.id;
  assert.equal(periksaJawaban("pilgan_biasa", kpg, benar), true);
  assert.equal(periksaJawaban("pilgan_biasa", kpg, salah), false);
  assert.equal(periksaJawaban("pilgan_biasa", kpg, undefined), null);
  assert.equal(periksaJawaban("uraian_singkat", kontenFinalDraf(us), "  Fotosintesis "), true);
  const kmbs = kontenFinalDraf(mbs);
  const [p1, p2] = kmbs.pernyataan as { id: string }[];
  assert.equal(periksaJawaban("multi_benar_salah", kmbs, { [p1.id]: true }), null);
  assert.equal(periksaJawaban("multi_benar_salah", kmbs, { [p1.id]: true, [p2.id]: false }), true);
  const kj = kontenFinalDraf(jodoh);
  assert.equal(periksaJawaban("menjodohkan", kj, kj.pasangan_benar), true);
});
uji("teks kunci", () => {
  assert.match(teksKunci("pilgan_biasa", kontenFinalDraf(pg)), /^[A-D]$/);
  assert.equal(teksKunci("multi_benar_salah", kontenFinalDraf(mbs)), "1-B, 2-S");
  assert.match(teksKunci("menjodohkan", kontenFinalDraf(jodoh)), /^1-[A-B], 2-[A-B]$/);
});
uji("dokumen: escape, kunci lampiran opsional", () => {
  const soal = [pg, us, mbs, jodoh].map((d) => ({ tipe: d.tipe, skor: d.skor, konten: kontenFinalDraf(d) }));
  const dengan = htmlDokumenSoal(soal, { judul: "Soal <IPA>", kunci: "lampiran" });
  const tanpa = htmlDokumenSoal(soal, { judul: "Soal IPA", kunci: "tidak" });
  assert.doesNotMatch(dengan, /<script>/);
  assert.match(dengan, /Soal &lt;IPA&gt;/);
  assert.match(dengan, /Kunci Jawaban/);
  assert.doesNotMatch(tanpa, /Kunci Jawaban/);
  assert.match(dengan, /4 soal · total skor 8/);
});
uji("nama berkas aman", () => {
  assert.equal(namaBerkas('Soal IPA: "Bab 1/2"', "doc"), "Soal IPA Bab 1 2.doc");
});

console.log(`\n${lulus} uji lulus.`);
