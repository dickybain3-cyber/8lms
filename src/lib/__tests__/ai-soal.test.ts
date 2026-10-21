/**
 * Jalankan: npx tsx src/lib/__tests__/ai-soal.test.ts
 *
 * Menguji bagian MURNI fitur Generate Soal AI — tanpa Gemini, tanpa
 * jaringan. Yang paling penting dijaga: skor otomatis selalu pas target,
 * jatah gambar tidak melebihi permintaan, dan hasil normalisasi lolos
 * aturan bentuk `konten_jsonb` yang sama dengan form manual.
 */
import assert from "node:assert/strict";
import {
  BATAS_BATCH,
  alokasiGambar,
  bagiSkor,
  jumlahKosong,
  kontenSiapSimpan,
  normalisasiItem,
  pecahBatch,
  totalSoal,
  validasiRencana,
  type RencanaGenerate,
} from "@/lib/ai/rencana-soal";
import { susunLembarKerja } from "@/lib/ai/lembar-kerja";
import { bersihkanSvg } from "@/lib/ai/svg";
import { TIPE_SOAL_LIST } from "@/lib/soal";

let lulus = 0;
function uji(nama: string, fn: () => void) {
  fn();
  lulus++;
  console.log(`  ✓ ${nama}`);
}

const jumlah = (o: Partial<Record<string, number>>) => ({ ...jumlahKosong(), ...o });
const jumlahSkor = (s: Record<string, number[]>) =>
  Object.values(s).flat().reduce((a, b) => a + b, 0);

console.log("bagiSkor");
uji("total pas 100 untuk campuran bentuk", () => {
  const j = jumlah({ pilgan_biasa: 20, benar_salah: 5, uraian_singkat: 5, menjodohkan: 2 });
  const s = bagiSkor(j, 100);
  assert.equal(jumlahSkor(s), 100);
  assert.equal(s.pilgan_biasa.length, 20);
  for (const x of Object.values(s).flat()) assert.equal((x * 2) % 1, 0, "kelipatan 0,5");
});
uji("total pas untuk banyak kombinasi acak", () => {
  for (let k = 0; k < 300; k++) {
    const j = jumlahKosong();
    for (const t of TIPE_SOAL_LIST) j[t] = Math.floor(Math.random() * 12);
    if (totalSoal(j) === 0) continue;
    const target = [50, 100, 75, 120][k % 4];
    if (totalSoal(j) > target * 2) continue;
    assert.equal(jumlahSkor(bagiSkor(j, target)), target, JSON.stringify(j));
  }
});
uji("bobot: benar/salah tidak lebih mahal dari menjodohkan", () => {
  const s = bagiSkor(jumlah({ benar_salah: 4, menjodohkan: 4 }), 100);
  assert.ok(Math.max(...s.benar_salah) <= Math.min(...s.menjodohkan));
});
uji("terlalu banyak butir → semua 0,5", () => {
  const s = bagiSkor(jumlah({ benar_salah: 30 }), 10);
  assert.ok(s.benar_salah.every((x) => x === 0.5));
});
uji("kosong → kosong", () => {
  assert.equal(jumlahSkor(bagiSkor(jumlahKosong(), 100)), 0);
});

console.log("alokasiGambar");
uji("mode tepat: total sama dengan permintaan, menjodohkan nol", () => {
  const a = alokasiGambar(jumlah({ pilgan_biasa: 10, uraian_singkat: 5, menjodohkan: 3 }), 6);
  assert.equal(a.total, 6);
  assert.equal(a.perTipe.menjodohkan, 0);
  assert.equal(a.mode, "tepat");
});
uji("mode tepat dibatasi jumlah soal yang layak", () => {
  const a = alokasiGambar(jumlah({ pilgan_biasa: 3, menjodohkan: 5 }), 10);
  assert.equal(a.total, 3);
});
uji("otomatis ±20% dan mode maksimal", () => {
  const a = alokasiGambar(jumlah({ pilgan_biasa: 20, benar_salah: 5 }), null);
  assert.equal(a.total, 5);
  assert.equal(a.mode, "maksimal");
});
uji("tidak pernah melebihi jumlah per bentuk", () => {
  const j = jumlah({ pilgan_biasa: 1, benar_salah: 1, uraian_singkat: 1 });
  const a = alokasiGambar(j, 3);
  for (const t of TIPE_SOAL_LIST) assert.ok(a.perTipe[t] <= j[t]);
});

console.log("pecahBatch");
const rencanaContoh: RencanaGenerate = {
  topik: ["Pecahan"],
  jumlah: jumlah({ pilgan_biasa: 23, multi_benar_salah: 7 }),
  jumlahBergambar: 5,
  kesulitan: "campuran",
  jumlahOpsi: 4,
  catatan: "",
  totalSkor: 100,
};
uji("batch tidak melebihi batas dan isinya utuh", () => {
  const b = pecahBatch(rencanaContoh);
  for (const x of b) assert.ok(x.jumlah <= BATAS_BATCH[x.tipe]);
  assert.equal(b.filter((x) => x.tipe === "pilgan_biasa").reduce((n, x) => n + x.jumlah, 0), 23);
  assert.equal(b.reduce((n, x) => n + x.skor.length, 0), 30);
  assert.equal(b.reduce((n, x) => n + x.skor.reduce((a, c) => a + c, 0), 0), 100);
  assert.equal(b.reduce((n, x) => n + x.jumlahBergambar, 0), 5);
});
uji("batch dibagi rata (23 → 8,8,7)", () => {
  const pg = pecahBatch(rencanaContoh).filter((x) => x.tipe === "pilgan_biasa");
  assert.deepEqual(pg.map((x) => x.jumlah), [8, 8, 7]);
});

console.log("normalisasiItem");
uji("pilgan biasa: tepat satu benar, opsi tetap 4, huruf dibuang", () => {
  const d = normalisasiItem(
    "pilgan_biasa",
    {
      pertanyaan: "**Hasil** 3/4 + 1/4 adalah …",
      opsi: ["A. 1", "B. 2", "C. 3/4", "D. 1/2", "E. ekstra"],
      indeks_benar: 0,
      topik: "Pecahan",
      pembahasan: "3/4+1/4 = 1",
      gambar: { perlu: false, jenis: "diagram", deskripsi: "", prompt_en: "" },
    },
    2,
    4
  );
  assert.ok(d);
  const opsi = d!.konten.opsi as { teks: string; benar: boolean }[];
  assert.equal(opsi.length, 4);
  assert.equal(opsi.filter((o) => o.benar).length, 1);
  assert.equal(opsi.find((o) => o.benar)!.teks, "1");
  assert.equal(d!.konten.pertanyaan, "Hasil 3/4 + 1/4 adalah …");
  assert.equal(d!.gambar, null);
  assert.ok(!("pembahasan" in d!.konten), "pembahasan tidak boleh masuk konten_jsonb");
});
uji("pilgan biasa dengan dua kunci ditolak", () => {
  const d = normalisasiItem("pilgan_biasa", { pertanyaan: "x?", opsi: ["a1", "b2"], indeks_benar: [0, 1] }, 2, 4);
  assert.equal(d, null);
});
uji("uraian: kunci terlalu pendek dibuang, duplikat dihapus", () => {
  const d = normalisasiItem(
    "uraian_singkat",
    { pertanyaan: "Proses tumbuhan membuat makanan?", kunci_jawaban: ["fotosintesis", "a", "fotosintesis"] },
    3,
    4
  );
  assert.deepEqual(d!.konten.kunci_jawaban, ["fotosintesis"]);
});
uji("benar/salah wajib boolean", () => {
  assert.equal(normalisasiItem("benar_salah", { pertanyaan: "x", jawaban_benar: "ya" }, 1, 4), null);
  assert.equal(normalisasiItem("benar_salah", { pertanyaan: "x", jawaban_benar: false }, 1, 4)!.konten.jawaban_benar, false);
});
uji("menjodohkan: pasangan_benar konsisten dengan id", () => {
  const d = normalisasiItem(
    "menjodohkan",
    {
      instruksi: "Jodohkan",
      pasangan: [
        { kiri: "Jantung", kanan: "Memompa darah" },
        { kiri: "Paru-paru", kanan: "Bernapas" },
        { kiri: "Ginjal", kanan: "Bernapas" },
      ],
      pengecoh: ["Mencerna"],
    },
    4,
    4
  )!;
  const soal = d.konten.soal as { id: string }[];
  const jawaban = d.konten.jawaban as { id: string }[];
  const pasangan = d.konten.pasangan_benar as Record<string, string>;
  assert.equal(soal.length, 2, "pasangan dengan kolom kanan kembar dibuang");
  assert.equal(jawaban.length, 3);
  for (const s of soal) assert.ok(jawaban.some((j) => j.id === pasangan[s.id]));
  assert.equal(d.gambar, null);
});
uji("gambar diminta → terbaca, lalu disisipkan aman saat simpan", () => {
  const d = normalisasiItem(
    "benar_salah",
    {
      pertanyaan: "Perhatikan gambar berikut! Segitiga itu siku-siku.",
      jawaban_benar: true,
      gambar: { perlu: true, jenis: "diagram", deskripsi: "Segitiga \"ABC\" siku di B", prompt_en: "" },
    },
    1,
    4
  )!;
  assert.equal(d.gambar!.jenis, "diagram");
  const k = kontenSiapSimpan(d, "https://res.cloudinary.com/x/image/upload/v1/a.png");
  assert.match(String(k.pertanyaan_html), /<img src="https:\/\/res\.cloudinary\.com[^"]+" alt="Segitiga &quot;ABC&quot;/);
  assert.equal(k.pertanyaan, "Perhatikan gambar berikut! Segitiga itu siku-siku.");
  const tanpa = kontenSiapSimpan(d, "blob:http://x");
  assert.ok(!String(tanpa.pertanyaan_html).includes("<img"), "URL non-https tidak boleh tersimpan");
});
uji("kontenSiapSimpan menurunkan ulang _html dari teks yang diedit guru", () => {
  const d = normalisasiItem("pilgan_biasa", { pertanyaan: "1 < 2?", opsi: ["ya", "tidak"], indeks_benar: 0 }, 2, 4)!;
  const opsi = (d.konten.opsi as { teks: string }[]).map((o) => ({ ...o, teks: o.teks + " <b>" }));
  const k = kontenSiapSimpan({ ...d, konten: { ...d.konten, opsi } }, null);
  assert.equal(k.pertanyaan_html, "1 &lt; 2?");
  for (const o of k.opsi as { teks_html: string }[]) assert.ok(o.teks_html.includes("&lt;b&gt;"));
});

console.log("validasiRencana");
uji("menolak tanpa topik / tanpa soal / kebanyakan", () => {
  assert.equal(typeof validasiRencana({ topik: [], jumlah: { pilgan_biasa: 5 } }), "string");
  assert.equal(typeof validasiRencana({ topik: ["a"], jumlah: {} }), "string");
  assert.equal(typeof validasiRencana({ topik: ["a"], jumlah: { pilgan_biasa: 40, benar_salah: 40 } }), "string");
});
uji("bergambar kosong = otomatis (null), nilai aneh dinormalkan", () => {
  const r = validasiRencana({ topik: ["a"], jumlah: { pilgan_biasa: 5, xx: 9 }, jumlahBergambar: "", jumlahOpsi: 7 });
  assert.ok(typeof r !== "string");
  if (typeof r !== "string") {
    assert.equal(r.jumlahBergambar, null);
    assert.equal(r.jumlahOpsi, 4);
    assert.equal(r.totalSkor, 100);
    assert.equal(totalSoal(r.jumlah), 5);
  }
});

console.log("lembar kerja & svg");
uji("lembar kerja tersusun jadi teks berpoin", () => {
  const lk = susunLembarKerja({
    judul: "LKPD Fotosintesis",
    tujuan: ["Memahami fotosintesis"],
    langkah: ["1. Siapkan daun", "Amati"],
    pertanyaan: ["Apa hasilnya?"],
    pengumpulan: "Foto hasil kerja",
    kriteria: ["Ketepatan"],
  })!;
  assert.equal(lk.judul, "LKPD Fotosintesis");
  assert.match(lk.deskripsi, /LANGKAH KERJA\n1\. Siapkan daun\n2\. Amati/);
  assert.equal(susunLembarKerja({ judul: "x" }), null);
});
uji("svg: skrip, image, handler, href eksternal dibuang", () => {
  const svg = bersihkanSvg(
    'teks <svg viewBox="0 0 10 10" onload="x()"><script>alert(1)</script><image href="http://e/a.png"/><a href="https://e">l</a><use href="#k"/><rect fill="url(http://e/x)"/></svg> sisa'
  )!;
  assert.ok(svg.startsWith("<svg"));
  assert.ok(!/script|onload|<image|https?:\/\//i.test(svg.replace('xmlns="http://www.w3.org/2000/svg"', "")));
  assert.ok(svg.includes('href="#k"'));
  assert.equal(bersihkanSvg("bukan svg"), null);
});

console.log(`\n${lulus} uji lulus.`);
