/**
 * Jalankan: npx tsx src/lib/__tests__/host-siswa.test.ts
 */
import assert from "node:assert/strict";
import { daftarHostKhususGuru, hostTertutupUntukSiswa } from "../host-siswa";

const LAMA = "8lms.vercel.app";
const BARU = "smpn8-ujian-x7k2.vercel.app";

// Env kosong = fitur mati.
assert.equal(hostTertutupUntukSiswa(LAMA, undefined), false);
assert.equal(hostTertutupUntukSiswa(LAMA, ""), false);
assert.deepEqual(daftarHostKhususGuru(" , "), []);

// Domain lama tertutup, domain baru terbuka.
assert.equal(hostTertutupUntukSiswa(LAMA, LAMA), true);
assert.equal(hostTertutupUntukSiswa(BARU, LAMA), false);

// Huruf besar, port, titik akhir, spasi, beberapa domain.
assert.equal(hostTertutupUntukSiswa("8LMS.Vercel.App:443", ` ${LAMA} `), true);
assert.equal(hostTertutupUntukSiswa(`${LAMA}.`, LAMA), true);
assert.equal(hostTertutupUntukSiswa("lain.vercel.app", `x.vercel.app,${LAMA}`), false);
assert.equal(hostTertutupUntukSiswa(LAMA, `x.vercel.app,${LAMA}`), true);

// Bukan pencocokan sebagian.
assert.equal(hostTertutupUntukSiswa(`a${LAMA}`, LAMA), false);
assert.equal(hostTertutupUntukSiswa(null, LAMA), false);

console.log("host-siswa: semua lulus");
