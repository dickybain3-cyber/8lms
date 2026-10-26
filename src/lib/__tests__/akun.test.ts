/**
 * Jalankan: npx tsx src/lib/__tests__/akun.test.ts
 *
 * Aturan username + password siswa (pengganti login tanggal lahir). Kasus
 * nama di sini sama dengan CEK AKHIR di
 * supabase/migrations-baru/0023_login_siswa_username.sql — kalau salah satu
 * berubah, yang lain ikut diubah.
 */
import assert from "node:assert/strict";
import {
  POLA_PASSWORD_SISWA,
  USERNAME_SISWA_DASAR_MAKS,
  buatPasswordSiswa,
  emailSiswaDariUsername,
  kandidatUsernameSiswa,
  pilihUsernameSiswa,
  usernameDasarDariNama,
} from "@/lib/akun";

// --- usernameDasarDariNama ---
const kasus: [string, string, string][] = [
  ["Muhammad Rizki Pratama", "rizki", "p"],
  ["Siti Nur Aisyah", "nur", "a"],
  ["Al Fatih Ramadhan", "alfatih", "r"],
  ["Ma'ruf Amin", "maruf", "a"],
  ["Kurniawati Dwi Lestari", "kurniawa", "dl"],
  ["Muhammad", "muhammad", ""],
  ["", "siswa", ""],
  ["Moh. Fadil", "fadil", ""],
  ["M Rafi Akbar", "rafi", "a"],
  ["  AHMAD   FAUZI ", "ahmad", "f"],
  ["Dewi-Sartika", "dewi", "s"],
];
for (const [nama, dasar, inisial] of kasus) {
  assert.deepEqual(usernameDasarDariNama(nama), { dasar, inisial }, nama);
}

for (const nama of ["Nabila Putri Ayu Lestari", "Abdurrahmanwahid Salim"]) {
  assert.ok(usernameDasarDariNama(nama).dasar.length <= USERNAME_SISWA_DASAR_MAKS, nama);
}

// --- kandidat & pilih ---
const calon = kandidatUsernameSiswa("Muhammad Rizki Pratama");
assert.deepEqual(
  [calon.next().value, calon.next().value, calon.next().value, calon.next().value],
  ["rizki", "rizkip", "rizki2", "rizki3"]
);

const terpakai = new Set<string>();
const hasil = ["Rizki Pratama", "Rizki Ramadhan", "Rizki"].map((n) => {
  const u = pilihUsernameSiswa(n, terpakai);
  terpakai.add(u);
  return u;
});
assert.deepEqual(hasil, ["rizki", "rizkir", "rizki2"]);

// Username siap dipakai sebagai email sintetis apa adanya.
assert.match(emailSiswaDariUsername("rizkip"), /^rizkip@/);

// --- password ---
const sampel = Array.from({ length: 2000 }, buatPasswordSiswa);
for (const p of sampel) {
  assert.match(p, POLA_PASSWORD_SISWA);
  assert.doesNotMatch(p, /[ilo]/, "tanpa huruf yang mirip 1/0");
}
assert.ok(new Set(sampel).size > 1990, "password acak, bukan seragam");

console.log("akun.test.ts: semua lulus");
