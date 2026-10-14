/**
 * Jalankan: npx tsx src/lib/__tests__/statistik.test.ts
 * Fungsi murni di `statistik.ts` — tanpa database.
 */
import assert from "node:assert/strict";
import {
  analisisButir,
  histogram,
  kategoriKesukaran,
  nilai100,
  predikat,
  ringkas,
  ringkasPerKelompok,
} from "../statistik";

// nilai100
assert.equal(nilai100(50, 100), 50);
assert.equal(nilai100(18, 24), 75);
assert.equal(nilai100(1, 3), 33.3);
assert.equal(nilai100(10, 0), null, "skor maks 0 tidak bisa dihitung");
assert.equal(nilai100(120, 100), 100, "dijepit ke 100");

// ringkas
const r = ringkas([70, 80, 90, 60]);
assert.equal(r.jumlah, 4);
assert.equal(r.rata, 75);
assert.equal(r.median, 75);
assert.equal(r.min, 60);
assert.equal(r.max, 90);
assert.equal(r.simpangan, 11.2);
assert.deepEqual(ringkas([]), { jumlah: 0, rata: null, median: null, min: null, max: null, simpangan: null });
assert.equal(ringkas([5, 1, 3]).median, 3, "median jumlah ganjil");

// histogram: 100 masuk rentang terakhir, 9.9 masuk rentang pertama
const h = histogram([0, 9.9, 10, 55, 99, 100]);
assert.equal(h.length, 10);
assert.equal(h[0].jumlah, 2);
assert.equal(h[1].jumlah, 1);
assert.equal(h[5].jumlah, 1);
assert.equal(h[9].jumlah, 2);
assert.equal(h.reduce((a, b) => a + b.jumlah, 0), 6);

// kategori kesukaran: sama dengan SQL (>70 mudah, 30–70 sedang, <30 sulit)
assert.equal(kategoriKesukaran(71), "mudah");
assert.equal(kategoriKesukaran(70), "sedang");
assert.equal(kategoriKesukaran(30), "sedang");
assert.equal(kategoriKesukaran(29.9), "sulit");

assert.equal(predikat(90), "A");
assert.equal(predikat(79.9), "C");

// per kelompok: urut alami ("7.2" sebelum "7.10"), siswa tanpa nilai tidak dihitung
const kel = ringkasPerKelompok(
  [
    { k: "7.10", n: 80 },
    { k: "7.2", n: 60 },
    { k: "7.2", n: null },
    { k: "7.2", n: 100 },
  ],
  (b) => b.k,
  (b) => b.n
);
assert.deepEqual(kel.map((x) => x.kunci), ["7.2", "7.10"]);
assert.equal(kel[0].ringkasan.jumlah, 2);
assert.equal(kel[0].ringkasan.rata, 80);

console.log("statistik.test.ts: semua lulus");

// analisisButir: sama dengan aturan SQL 0012
const butir = analisisButir(
  [
    { id: "b", urutan: 2, tipe: "menjodohkan", skor: 4 },
    { id: "a", urutan: 1, tipe: "pilgan", skor: 2 },
  ],
  [
    { jawaban: { a: "x", b: {} }, detail: { a: 2, b: 2 } }, // a benar, b sebagian
    { jawaban: { a: "y" }, detail: { a: 0 } }, // a salah, b kosong
    { jawaban: { a: "x", b: {} }, detail: { a: 2, b: 4 } }, // a benar, b benar
    { jawaban: {}, detail: {} }, // dua-duanya kosong
  ]
);
assert.deepEqual(butir.map((b) => b.soalId), ["a", "b"], "urut menurut nomor soal");
assert.deepEqual([butir[0].benar, butir[0].sebagian, butir[0].salah, butir[0].kosong], [2, 0, 1, 1]);
assert.deepEqual([butir[1].benar, butir[1].sebagian, butir[1].salah, butir[1].kosong], [1, 1, 0, 2]);
assert.equal(butir[0].persenBenar, 50);
assert.equal(butir[0].kategori, "sedang");
assert.equal(butir[1].persenBenar, 25);
assert.equal(butir[1].kategori, "sulit");
assert.equal(analisisButir([{ id: "a", urutan: 1, tipe: "pilgan", skor: 1 }], [])[0].kategori, null, "tanpa peserta");
console.log("statistik.test.ts: analisisButir lulus");
