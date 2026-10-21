/**
 * Jalankan: npx tsx src/lib/__tests__/analisis-jawaban.test.ts
 */
import assert from "node:assert/strict";
import {
  kategoriDayaBeda,
  kelompokAtasBawah,
  rincianJawaban,
  type PesertaAnalisis,
  type SoalAnalisis,
} from "@/lib/analisis-jawaban";

let lulus = 0;
const uji = (nama: string, fn: () => void) => {
  fn();
  lulus++;
  console.log(`  ✓ ${nama}`);
};

const pg: SoalAnalisis = {
  id: "s1",
  urutan: 1,
  tipe: "pilgan_biasa",
  skor: 2,
  konten: {
    pertanyaan: "Organ pemompa darah?",
    opsi: [
      { id: "a", teks: "Paru-paru", benar: false },
      { id: "b", teks: "Jantung", benar: true },
      { id: "c", teks: "Hati", benar: false },
      { id: "d", teks: "Ginjal", benar: false },
    ],
  },
};

/** n peserta; `pilih` per peserta; skor penuh kalau memilih "b". */
function pesertaPg(pilih: (string | null)[]): PesertaAnalisis[] {
  return pilih.map((p, i) => ({
    jawaban: p === null ? {} : { s1: p },
    detail: { s1: p === "b" ? 2 : 0 },
    totalSkor: p === "b" ? 80 + i : 20 + i,
  }));
}

uji("PG: sebaran per opsi, kunci ditandai, persen benar", () => {
  const [r] = rincianJawaban([pg], pesertaPg(["b", "b", "a", "a", "a", "c", "b", null, "b", "a"]));
  assert.equal(r.peserta, 10);
  assert.deepEqual(r.baris.map((b) => b.jumlah), [4, 4, 1, 0]);
  assert.equal(r.baris[1].benar, true);
  assert.equal(r.baris[0].persen, 40);
  assert.equal(r.kosong, 1);
  // pengecoh: a (40%) & c (10%) berfungsi, d (0%) tidak
  assert.deepEqual(r.pengecoh, { berfungsi: 2, total: 3 });
});

uji("PG: pengecoh terpilih ≥20% → miskonsepsi; lebih banyak dari kunci → peringatan kunci", () => {
  const [r] = rincianJawaban([pg], pesertaPg(["a", "a", "a", "b", "b", "c"]));
  assert.ok(r.miskonsepsi?.includes("A (\"Paru-paru\")"));
  assert.ok(r.miskonsepsi?.includes("lebih banyak dari yang menjawab benar"));
});

uji("PG: tanpa pengecoh dominan → tidak ada miskonsepsi", () => {
  const [r] = rincianJawaban([pg], pesertaPg(["b", "b", "b", "b", "b", "b", "b", "b", "a", "c"]));
  assert.equal(r.miskonsepsi, null);
});

uji("daya beda positif bila kelompok atas benar & bawah salah", () => {
  // total skor tinggi = menjawab b
  const [r] = rincianJawaban([pg], pesertaPg(["b", "b", "b", "a", "a", "a", "b", "a", "c", "b"]));
  assert.equal(r.dayaBeda, 1);
  assert.equal(r.kategoriDayaBeda, "sangat_baik");
  const kel = r.baris.find((b) => b.label === "B")!;
  assert.ok((kel.atas ?? 0) > (kel.bawah ?? 0));
});

uji("daya beda negatif bila siswa pintar justru salah", () => {
  const peserta: PesertaAnalisis[] = [
    { jawaban: { s1: "a" }, detail: { s1: 0 }, totalSkor: 95 },
    { jawaban: { s1: "a" }, detail: { s1: 0 }, totalSkor: 90 },
    { jawaban: { s1: "b" }, detail: { s1: 2 }, totalSkor: 30 },
    { jawaban: { s1: "b" }, detail: { s1: 2 }, totalSkor: 20 },
  ];
  const [r] = rincianJawaban([pg], peserta);
  assert.equal(r.kategoriDayaBeda, "negatif");
});

uji("peserta < 4 → daya beda tidak dihitung", () => {
  assert.equal(kelompokAtasBawah([{ totalSkor: 1 }, { totalSkor: 2 }]), null);
  const [r] = rincianJawaban([pg], pesertaPg(["b", "a"]));
  assert.equal(r.dayaBeda, null);
});

uji("uraian: jawaban terbanyak dinormalkan, benar memakai aturan 'memuat kunci'", () => {
  const s: SoalAnalisis = {
    id: "u",
    urutan: 2,
    tipe: "uraian_singkat",
    skor: 3,
    konten: { pertanyaan: "Proses membuat makanan?", kunci_jawaban: ["fotosintesis"] },
  };
  const peserta = ["Respirasi", "respirasi ", "Fotosintesis", "proses fotosintesis", "respirasi"].map((j) => ({
    jawaban: { u: j },
    detail: {},
    totalSkor: 0,
  }));
  const [r] = rincianJawaban([s], peserta);
  assert.equal(r.baris[0].teks, "respirasi");
  assert.equal(r.baris[0].jumlah, 3);
  assert.equal(r.baris[0].benar, false);
  assert.ok(r.baris.filter((b) => b.benar).length === 2);
  assert.ok(r.miskonsepsi?.includes("\"respirasi\""));
});

uji("B/S bertingkat: menghitung yang keliru per pernyataan", () => {
  const s: SoalAnalisis = {
    id: "m",
    urutan: 3,
    tipe: "multi_benar_salah",
    skor: 3,
    konten: {
      instruksi: "Tentukan",
      pernyataan: [
        { id: "p1", teks: "Air mendidih 100°C", jawaban_benar: true },
        { id: "p2", teks: "Es lebih berat dari air", jawaban_benar: false },
      ],
    },
  };
  const peserta = [
    { jawaban: { m: { p1: true, p2: true } }, detail: {}, totalSkor: 0 },
    { jawaban: { m: { p1: true, p2: true } }, detail: {}, totalSkor: 0 },
    { jawaban: { m: { p1: false, p2: false } }, detail: {}, totalSkor: 0 },
  ];
  const [r] = rincianJawaban([s], peserta);
  assert.equal(r.jenisBaris, "keliru");
  assert.deepEqual(r.baris.map((b) => b.jumlah), [1, 2]);
  assert.ok(r.miskonsepsi?.includes("Es lebih berat"));
});

uji("menjodohkan: pasangan salah terbanyak", () => {
  const s: SoalAnalisis = {
    id: "j",
    urutan: 4,
    tipe: "menjodohkan",
    skor: 4,
    konten: {
      instruksi: "Jodohkan",
      soal: [{ id: "k1", teks: "Jantung" }, { id: "k2", teks: "Paru-paru" }],
      jawaban: [{ id: "x", teks: "Memompa darah" }, { id: "y", teks: "Bernapas" }],
      pasangan_benar: { k1: "x", k2: "y" },
    },
  };
  const peserta = [
    { jawaban: { j: { k1: "y", k2: "x" } }, detail: {}, totalSkor: 0 },
    { jawaban: { j: { k1: "y", k2: "y" } }, detail: {}, totalSkor: 0 },
    { jawaban: { j: { k1: "x", k2: "y" } }, detail: {}, totalSkor: 0 },
  ];
  const [r] = rincianJawaban([s], peserta);
  assert.equal(r.baris[0].jumlah, 2);
  assert.ok(r.baris[0].teks.startsWith("Jantung → Bernapas"));
});

uji("kategori daya beda", () => {
  assert.equal(kategoriDayaBeda(0.45), "sangat_baik");
  assert.equal(kategoriDayaBeda(0.3), "baik");
  assert.equal(kategoriDayaBeda(0.2), "cukup");
  assert.equal(kategoriDayaBeda(0.1), "jelek");
  assert.equal(kategoriDayaBeda(-0.1), "negatif");
});

console.log(`\n${lulus} uji lulus.`);
