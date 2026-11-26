/**
 * Jalankan: npx tsx src/lib/__tests__/tryout.test.ts
 * Fungsi murni tryout (src/lib/tryout.ts) + tanda tangan sesi (tryout-tanda.ts).
 */
import assert from "node:assert/strict";
import {
  SUBTES_BAWAAN,
  buatToken,
  daftarPaket,
  kelompokkanNilaiSaya,
  kodeSubtesDariNama,
  normalisasiBarisRekap,
  normalisasiToken,
  peringkat,
  perubahan,
  profilSiswa,
  rataPerKelas,
  rataRata,
  ringkasSubtesPaket,
  tokenValid,
  trenSiswa,
  type BarisRekapTryout,
} from "@/lib/tryout";
import { bacaTanda, buatTanda, kunciTurunan } from "@/lib/tryout-tanda";

function testToken() {
  for (let i = 0; i < 200; i++) {
    const t = buatToken();
    assert.equal(t.length, 6);
    assert.ok(tokenValid(t), t);
    assert.ok(!/[01OIL]/.test(t), `token tanpa huruf mirip: ${t}`);
  }
  assert.equal(normalisasiToken(" ab c12 "), "ABC12");
  assert.equal(tokenValid("ABC"), false);
  assert.equal(tokenValid("ABCDEFGHIJKLM"), false);
  assert.equal(tokenValid("AB-12"), false);
}

function testKodeSubtes() {
  assert.equal(kodeSubtesDariNama("Bahasa Indonesia"), "bahasa_indonesia");
  assert.equal(kodeSubtesDariNama("matematika"), "matematika");
  assert.equal(kodeSubtesDariNama("Bahasa Inggris"), "bahasa_inggris");
  assert.equal(kodeSubtesDariNama("IPA Terpadu!"), "ipa_terpadu");
  assert.equal(kodeSubtesDariNama("123"), null);
  for (const s of SUBTES_BAWAAN) assert.match(s.kode, /^[a-z][a-z0-9_]{1,39}$/);
}

function baris(
  siswa: [string, string, string],
  paket: [string, string, number, string],
  subtes: [string, string, string],
  status: BarisRekapTryout["status"],
  nilai: number | null
): BarisRekapTryout {
  return normalisasiBarisRekap({
    event_id: "e1",
    event_nama: "Tryout",
    paket_id: paket[0],
    paket_nama: paket[1],
    paket_urutan: paket[2],
    paket_mulai: paket[3],
    mapel_id: subtes[0],
    subtes: subtes[1],
    subtes_nama: subtes[2],
    siswa_id: siswa[0],
    siswa_nama: siswa[1],
    kelas_nama: siswa[2],
    status,
    total_skor: nilai === null ? null : String(nilai),
    skor_maks: "100",
    nilai_100: nilai === null ? null : String(nilai),
    mulai_at: null,
    submitted_at: null,
  });
}

const ANI: [string, string, string] = ["s1", "Ani", "9.1"];
const BUDI: [string, string, string] = ["s2", "Budi", "9.1"];
const CICI: [string, string, string] = ["s3", "Cici", "9.2"];
// Paket 2 urutan lebih kecil tapi dibuka lebih akhir -> tetap urut waktu.
const P1: [string, string, number, string] = ["p1", "Paket 1", 2, "2026-11-01T00:00:00Z"];
const P2: [string, string, number, string] = ["p2", "Paket 2", 1, "2026-11-10T00:00:00Z"];
const BI1: [string, string, string] = ["m1", "bahasa_indonesia", "Bahasa Indonesia"];
const MT1: [string, string, string] = ["m2", "matematika", "Matematika"];
const BI2: [string, string, string] = ["m3", "bahasa_indonesia", "Bahasa Indonesia"];
const MT2: [string, string, string] = ["m4", "matematika", "Matematika"];

const REKAP: BarisRekapTryout[] = [
  baris(ANI, P1, MT1, "selesai", 60),
  baris(ANI, P1, BI1, "selesai", 80),
  baris(ANI, P2, BI2, "selesai", 90),
  baris(ANI, P2, MT2, "selesai", 70),
  baris(BUDI, P1, BI1, "selesai", 80),
  baris(BUDI, P1, MT1, "selesai", 60),
  baris(BUDI, P2, BI2, "selesai", 50),
  baris(BUDI, P2, MT2, "mengerjakan", null),
  baris(CICI, P1, BI1, "selesai", 100),
  baris(CICI, P1, MT1, "selesai", 90),
  baris(CICI, P2, BI2, "belum", null),
  baris(CICI, P2, MT2, "belum", null),
];

function testRekap() {
  const paket = daftarPaket(REKAP);
  assert.deepEqual(paket.map((p) => p.id), ["p1", "p2"], "urut jam buka, bukan nomor urut");
  assert.deepEqual(paket[0].subtes.map((s) => s.kode), ["bahasa_indonesia", "matematika"]);

  const profil = profilSiswa(REKAP);
  const ani = profil.find((s) => s.siswaId === "s1")!;
  assert.equal(ani.paket.p1.rata, 70);
  assert.equal(ani.paket.p2.rata, 80);
  assert.equal(ani.paket.p2.lengkap, true);
  const budi = profil.find((s) => s.siswaId === "s2")!;
  assert.equal(budi.paket.p2.lengkap, false);
  assert.equal(budi.paket.p2.sedang, true);
  assert.equal(budi.paket.p2.rata, 50, "rata dari subtes yang sudah terkumpul");

  const t = trenSiswa(ani, paket);
  assert.deepEqual(t.awalAkhir, { selisih: 10, arah: "naik" });
  const tMt = trenSiswa(ani, paket, "matematika");
  assert.deepEqual(tMt.terakhir, { selisih: 10, arah: "naik" });
  assert.equal(trenSiswa(profil.find((s) => s.siswaId === "s3")!, paket).awalAkhir, null);

  // Peringkat paket 1: Cici 95, Ani 70 & Budi 70 (seri), urutan nama.
  const r1 = peringkat(profil, "p1");
  assert.deepEqual(
    r1.map((r) => [r.nama, r.peringkat]),
    [["Cici", 1], ["Ani", 2], ["Budi", 2]]
  );
  // Paket 2: Ani lengkap 80 di atas Budi belum lengkap 50.
  const r2 = peringkat(profil, "p2");
  assert.deepEqual(r2.map((r) => [r.nama, r.lengkap]), [["Ani", true], ["Budi", false]]);
  // Per subtes + per kelas
  assert.deepEqual(peringkat(profil, "p1", { kode: "matematika", kelas: "9.1" }).map((r) => r.nama), ["Ani", "Budi"]);

  const kelas = rataPerKelas(profil, "p1");
  assert.deepEqual(kelas.map((k) => [k.label, k.rata, k.peserta]), [["9.1", 70, 2], ["9.2", 95, 1]]);
  // Rata paket per kelas hanya yang lengkap: Budi p2 tidak dihitung.
  assert.deepEqual(rataPerKelas(profil, "p2").map((k) => [k.label, k.rata]), [["9.1", 80], ["9.2", null]]);

  const ring = ringkasSubtesPaket(REKAP, paket[1]);
  const mt2 = ring.find((r) => r.kode === "matematika")!;
  assert.equal(mt2.peserta, 1);
  assert.equal(mt2.mengerjakan, 1);
  assert.equal(mt2.belum, 1);
}

function testUtil() {
  assert.equal(rataRata([]), null);
  assert.equal(rataRata([null, 50, 75]), 62.5);
  assert.equal(perubahan(null, 5), null);
  assert.deepEqual(perubahan(70, 70.01), { selisih: 0, arah: "tetap" });
  assert.deepEqual(perubahan(70, 65), { selisih: -5, arah: "turun" });

  const saya = kelompokkanNilaiSaya([
    { event_nama: "T", paket_id: "p2", paket_nama: "Paket 2", paket_urutan: 2, paket_mulai: "2026-11-10T00:00:00Z", subtes: "matematika", subtes_nama: "Matematika", nilai_100: 70, submitted_at: "x" },
    { event_nama: "T", paket_id: "p1", paket_nama: "Paket 1", paket_urutan: 1, paket_mulai: "2026-11-01T00:00:00Z", subtes: "matematika", subtes_nama: "Matematika", nilai_100: "60" as unknown as number, submitted_at: "x" },
    { event_nama: "T", paket_id: "p1", paket_nama: "Paket 1", paket_urutan: 1, paket_mulai: "2026-11-01T00:00:00Z", subtes: "bahasa_indonesia", subtes_nama: "Bahasa Indonesia", nilai_100: 80, submitted_at: "x" },
  ]);
  assert.deepEqual(saya.map((p) => [p.paketId, p.rata]), [["p1", 70], ["p2", 70]]);
  assert.deepEqual(saya[0].subtes.map((s) => s.kode), ["bahasa_indonesia", "matematika"]);
}

function testTanda() {
  const kunci = kunciTurunan("rahasia-uji", "sesi");
  const t = buatTanda({ e: "e1", s: "s1" }, kunci, 60, 1_000_000);
  assert.deepEqual(bacaTanda<{ e: string; s: string }>(t, kunci, 1_000_000)?.s, "s1");
  assert.equal(bacaTanda(t, kunci, 1_000_000 + 61_000), null, "kedaluwarsa");
  assert.equal(bacaTanda(t, kunciTurunan("rahasia-uji", "tiket"), 1_000_000), null, "tiket != sesi");
  const [isi, tanda] = t.split(".");
  const palsu = Buffer.from(JSON.stringify({ e: "e1", s: "s2", exp: 9e9 })).toString("base64url");
  assert.equal(bacaTanda(`${palsu}.${tanda}`, kunci, 1_000_000), null, "isi diubah");
  assert.equal(bacaTanda(`${isi}.x${tanda.slice(1)}`, kunci, 1_000_000), null, "tanda diubah");
  assert.equal(bacaTanda("sampah", kunci), null);
  assert.equal(bacaTanda(undefined, kunci), null);
}

testToken();
testKodeSubtes();
testRekap();
testUtil();
testTanda();
console.log("tryout.test.ts: semua lulus");
