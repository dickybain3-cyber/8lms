/**
 * Jalankan: npx tsx src/lib/__tests__/akun-impor.test.ts
 */
import assert from "node:assert/strict";
import {
  DAFTAR_MAPEL,
  bandingKelas,
  buatPasswordGuru,
  cocokkanMapel,
  galatPasswordImpor,
  kelompokPerKelas,
} from "@/lib/akun-impor";

// Mapel: nama resmi, beda huruf/spasi, singkatan, kosong, tak dikenal.
assert.equal(cocokkanMapel("Matematika"), "Matematika");
assert.equal(cocokkanMapel("  matematika "), "Matematika");
assert.equal(cocokkanMapel("PJOK"), "Pendidikan Jasmani, Olahraga, dan Kesehatan");
assert.equal(cocokkanMapel("Pendidikan Jasmani Olahraga dan Kesehatan"), "Pendidikan Jasmani, Olahraga, dan Kesehatan");
assert.equal(cocokkanMapel("IPA"), "Ilmu Pengetahuan Alam");
assert.equal(cocokkanMapel("PAI"), "Pendidikan Agama Islam dan Budi Pekerti");
assert.equal(cocokkanMapel(""), "");
assert.equal(cocokkanMapel(undefined), "");
assert.equal(cocokkanMapel("Astrologi"), null);
for (const m of DAFTAR_MAPEL) assert.equal(cocokkanMapel(m), m);
assert.equal(new Set(DAFTAR_MAPEL).size, DAFTAR_MAPEL.length);

// Password guru: 4 huruf tanpa i/l/o + 4 angka, acak.
const pw = new Set<string>();
for (let i = 0; i < 200; i++) {
  const p = buatPasswordGuru();
  assert.match(p, /^[a-hjkmnp-z]{4}[0-9]{4}$/);
  pw.add(p);
}
assert.ok(pw.size > 190);

// Password impor.
assert.equal(galatPasswordImpor(""), null);
assert.equal(galatPasswordImpor("kmr482"), null);
assert.match(galatPasswordImpor("abc12") ?? "", /minimal 6/);
assert.match(galatPasswordImpor("abc 1234") ?? "", /spasi/);

// Kelas urut alami dan pengelompokan per kelas.
assert.deepEqual(["7.10", "8.1", "7.2", "7.1"].sort(bandingKelas), ["7.1", "7.2", "7.10", "8.1"]);
const g = kelompokPerKelas([
  { nama: "Zaki", kelas: "7.10" },
  { nama: "Ani", kelas: "7.2" },
  { nama: "Budi", kelas: "7.2" },
  { nama: "Caca", kelas: "" },
]);
assert.deepEqual(g.map((x) => x.kelas), ["7.2", "7.10", "Tanpa Kelas"]);
assert.deepEqual(g[0].baris.map((b) => b.nama), ["Ani", "Budi"]);

console.log("akun-impor: semua lulus");
