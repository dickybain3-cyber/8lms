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
  jenisIsiValid,
  rapikanIsiPesan,
  urlGambarForumSah,
  apakahUuid,
  emojiReaksiValid,
  REAKSI_TERSEDIA,
  ISI_FOTO_TANPA_CAPTION,
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
  // Foto TIDAK dihitung poin, alasan sama persis dengan sticker/emoticon —
  // lihat komentar JenisIsiPesan di forum.ts (mencegah spam foto demi poin).
  assert.equal(apakahPesanDihitungPoin("gambar"), false);
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

function testJenisIsiValid() {
  for (const j of ["teks", "sticker", "emoticon", "gambar"]) {
    assert.equal(jenisIsiValid(j), true, j);
  }
  for (const j of ["", "Teks", "video", "gambar ", null, undefined, 5]) {
    assert.equal(jenisIsiValid(j), false, String(j));
  }
}

function testRapikanIsiPesan() {
  assert.equal(rapikanIsiPesan("teks", "  halo  "), "halo");
  // Teks/sticker/emoticon kosong ditolak.
  assert.equal(rapikanIsiPesan("teks", "   "), null);
  assert.equal(rapikanIsiPesan("sticker", ""), null);
  assert.equal(rapikanIsiPesan("emoticon", "\n"), null);
  // Hanya foto yang boleh tanpa keterangan -> placeholder (kolom isi not null).
  assert.equal(rapikanIsiPesan("gambar", ""), ISI_FOTO_TANPA_CAPTION);
  assert.equal(rapikanIsiPesan("gambar", "   "), "[Foto]");
  assert.equal(rapikanIsiPesan("gambar", " grafik nomor 3 "), "grafik nomor 3");
}

function testUrlGambarForumSah() {
  const CLOUD = "sekolah7";
  const ok = `https://res.cloudinary.com/${CLOUD}/image/upload/v1712345678/abc123.jpg`;
  assert.equal(urlGambarForumSah(ok, CLOUD), true);
  // Dengan segmen transformasi di depan tetap sah (masih di bawah /image/upload/).
  assert.equal(
    urlGambarForumSah(`https://res.cloudinary.com/${CLOUD}/image/upload/f_auto/v1/abc.jpg`, CLOUD),
    true
  );

  const tolak: Record<string, string> = {
    kosong: "",
    "bukan url": "bukan url",
    http: `http://res.cloudinary.com/${CLOUD}/image/upload/v1/a.jpg`,
    "situs lain": `https://contoh.com/${CLOUD}/image/upload/v1/a.jpg`,
    "cloud lain": "https://res.cloudinary.com/punyaorang/image/upload/v1/a.jpg",
    "cloud lain (jenjang lain)": "https://res.cloudinary.com/sekolah8/image/upload/v1/a.jpg",
    "prefix mirip": `https://res.cloudinary.com/${CLOUD}x/image/upload/v1/a.jpg`,
    "bukan image/upload": `https://res.cloudinary.com/${CLOUD}/video/upload/v1/a.mp4`,
    "userinfo trik": `https://res.cloudinary.com@evil.example/${CLOUD}/image/upload/v1/a.jpg`,
    "subdomain trik": `https://res.cloudinary.com.evil.example/${CLOUD}/image/upload/v1/a.jpg`,
    "query pelacak": `${ok}?track=1`,
    fragment: `${ok}#x`,
    port: `https://res.cloudinary.com:8443/${CLOUD}/image/upload/v1/a.jpg`,
    "tanpa nama berkas": `https://res.cloudinary.com/${CLOUD}/image/upload/`,
    "path traversal": `https://res.cloudinary.com/${CLOUD}/../evil/image/upload/v1/a.jpg`,
    "data uri": "data:image/png;base64,AAAA",
    javascript: "javascript:alert(1)",
    kepanjangan: ok + "a".repeat(600),
  };
  for (const [nama, url] of Object.entries(tolak)) {
    assert.equal(urlGambarForumSah(url, CLOUD), false, nama);
  }
  // cloudName kosong (env belum diisi) -> selalu tolak, bukan lolos semua.
  assert.equal(urlGambarForumSah(ok, ""), false);
}

function testApakahUuid() {
  assert.equal(apakahUuid("3f2b8c1e-9a4d-4e57-8b6a-1c2d3e4f5a6b"), true);
  assert.equal(apakahUuid("3F2B8C1E-9A4D-4E57-8B6A-1C2D3E4F5A6B"), true);
  for (const v of ["", "abc", "3f2b8c1e9a4d4e578b6a1c2d3e4f5a6b", "' or 1=1 --", null, 7]) {
    assert.equal(apakahUuid(v), false, String(v));
  }
}

function testEmojiReaksiValid() {
  for (const e of REAKSI_TERSEDIA) {
    assert.equal(emojiReaksiValid(e), true, e);
  }
  // Di luar daftar, kosong, gabungan, dan bukan string ditolak.
  for (const e of ["", "👎", "👍👍", "👍 ", "thumbs", "<script>", null, undefined, 5]) {
    assert.equal(emojiReaksiValid(e), false, String(e));
  }
}

function main() {
  testFaseForum();
  testBolehMengirimPesan();
  testAlasanTidakBolehMengirim();
  testApakahPesanDihitungPoin();
  testHitungPoinTotal();
  testPoinBonusPerKlik();
  testJenisIsiValid();
  testRapikanIsiPesan();
  testUrlGambarForumSah();
  testApakahUuid();
  testEmojiReaksiValid();
  console.log("Semua uji forum LULUS.");
}

main();
