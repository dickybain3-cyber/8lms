/**
 * Jalankan: npx tsx --tsconfig tsconfig.test.json src/lib/__tests__/forum.test.ts
 *
 * Pola uji ini sengaja meniru `tugas.test.ts` (Tahap 4): tidak ada
 * database, tidak ada mock Supabase — cuma memanggil fungsi murni dari
 * `forum.ts` dengan berbagai `sekarang` dan memeriksa hasilnya.
 */
import assert from "node:assert/strict";
import {
  faseForum,
  bolehMengirimPesan,
  alasanTidakBolehMengirim,
  apakahPesanDihitungPoin,
  hitungPoinTotal,
  POIN_BONUS_PER_KLIK,
  type ForumWaktu,
} from "@/lib/forum";

const FORUM: ForumWaktu = {
  dibuka_at: "2026-09-10T00:00:00.000Z",
  ditutup_at: "2026-09-20T00:00:00.000Z",
};

const t = (iso: string) => new Date(iso).getTime();

function testFaseForum() {
  // Sebelum dibuka.
  assert.equal(faseForum(FORUM, t("2026-09-09T23:59:59.000Z")), "belum_buka");

  // Persis di dibuka_at -> sudah berlangsung (batas inklusif, sama seperti
  // faseTugas).
  assert.equal(faseForum(FORUM, t("2026-09-10T00:00:00.000Z")), "berlangsung");

  // Di tengah jendela.
  assert.equal(faseForum(FORUM, t("2026-09-15T12:00:00.000Z")), "berlangsung");

  // Persis di ditutup_at -> MASIH berlangsung (batas inklusif di sisi
  // tutup juga — siswa yang mengetik tepat di detik terakhir tidak boleh
  // ditolak hanya karena pembulatan jam).
  assert.equal(faseForum(FORUM, t("2026-09-20T00:00:00.000Z")), "berlangsung");

  // Sedetik setelah ditutup_at -> ditutup, TIDAK ADA jalur "terlambat tapi
  // diterima" seperti tugas.
  assert.equal(faseForum(FORUM, t("2026-09-20T00:00:01.000Z")), "ditutup");
}

function testBolehMengirimPesan() {
  assert.equal(bolehMengirimPesan(FORUM, t("2026-09-09T00:00:00.000Z")), false);
  assert.equal(bolehMengirimPesan(FORUM, t("2026-09-15T00:00:00.000Z")), true);
  assert.equal(bolehMengirimPesan(FORUM, t("2026-09-21T00:00:00.000Z")), false);
}

function testAlasanTidakBolehMengirim() {
  assert.match(
    alasanTidakBolehMengirim(FORUM, t("2026-09-01T00:00:00.000Z")) ?? "",
    /belum dibuka/
  );
  assert.match(
    alasanTidakBolehMengirim(FORUM, t("2026-09-25T00:00:00.000Z")) ?? "",
    /sudah ditutup/
  );
  assert.equal(
    alasanTidakBolehMengirim(FORUM, t("2026-09-15T00:00:00.000Z")),
    null
  );
}

function testApakahPesanDihitungPoin() {
  assert.equal(apakahPesanDihitungPoin("teks"), true);
  assert.equal(apakahPesanDihitungPoin("sticker"), false);
  assert.equal(apakahPesanDihitungPoin("emoticon"), false);
}

function testHitungPoinTotal() {
  assert.equal(hitungPoinTotal(0, 0), 0);
  assert.equal(hitungPoinTotal(3, 0), 3);
  assert.equal(hitungPoinTotal(3, 5), 8);
  // Rumusnya harus persis sejalan dengan kolom generated di 0020_forum.sql
  // (poin_pesan + poin_bonus) -- kalau salah satu sisi diubah tanpa
  // mengubah yang lain, tabel poin di admin akan beda angka dengan yang
  // dihitung sisi klien saat optimistic update.
  assert.equal(hitungPoinTotal(12, 3 * POIN_BONUS_PER_KLIK), 27);
}

function testPoinBonusPerKlik() {
  // Dikunci ke 5 sesuai spesifikasi ("kelipatan 5"). Kalau nilai ini
  // berubah, migrasi 0020 (trigger toggle bonus, hardcode literal 5 di
  // SQL) HARUS ikut diubah -- lihat catatan di forum.ts.
  assert.equal(POIN_BONUS_PER_KLIK, 5);
}

function main() {
  testFaseForum();
  testBolehMengirimPesan();
  testAlasanTidakBolehMengirim();
  testApakahPesanDihitungPoin();
  testHitungPoinTotal();
  testPoinBonusPerKlik();
  console.log("Semua uji forum LULUS.");
}

main();
