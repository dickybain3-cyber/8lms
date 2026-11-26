/**
 * Jalankan: npx tsx src/lib/__tests__/sesi-middleware.test.ts
 */
import assert from "node:assert/strict";
import {
  HEADER_SESI_GURU,
  HEADER_SESI_SISWA,
  dekodekan,
  kodekan,
  tanpaHeaderSesi,
} from "../sesi-middleware";

// Header sesi kiriman browser wajib dibuang (anti-pemalsuan), header lain utuh.
const palsu = new Headers({
  [HEADER_SESI_GURU]: kodekan({ authId: "x", guru: { id: "admin" } }),
  [HEADER_SESI_SISWA]: "apa saja",
  cookie: "a=1",
});
const bersih = tanpaHeaderSesi(palsu);
assert.equal(bersih.get(HEADER_SESI_GURU), null);
assert.equal(bersih.get(HEADER_SESI_SISWA), null);
assert.equal(bersih.get("cookie"), "a=1");
assert.equal(palsu.get(HEADER_SESI_SISWA), "apa saja", "salinan, bukan mutasi");

// Nama non-ASCII aman dimasukkan ke header (ByteString) dan kembali utuh.
const sesi = { authId: "u1", email: null, guru: { id: "g1", nama: "Siti Nur’aini — Ç", is_admin: true } };
const kode = kodekan(sesi);
assert.match(kode, /^[\x20-\x7e]*$/);
new Headers({ [HEADER_SESI_GURU]: kode }); // tidak melempar
assert.deepEqual(dekodekan(kode), sesi);

assert.equal(dekodekan(null), null);
assert.equal(dekodekan("%E0%A4%A"), null);
assert.equal(dekodekan("bukan-json"), null);

console.log("sesi-middleware: semua lulus");
