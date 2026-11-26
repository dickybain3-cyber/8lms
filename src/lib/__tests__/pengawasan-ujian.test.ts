/**
 * Jalankan: npx tsx src/lib/__tests__/pengawasan-ujian.test.ts
 */
import assert from "node:assert/strict";
import {
  BATAS_PERINGATAN,
  MENIT_KODE_PENGAMAN,
  bukaKunciServer,
  catatPelanggaranServer,
  diAplikasiExamSafer,
  terlihatLayarTerbagi,
} from "@/lib/pengawasan-ujian";

// Harus sama dengan 0026_pengaman_ujian.sql (>= 3, slot 300 detik).
assert.equal(BATAS_PERINGATAN, 3);
assert.equal(MENIT_KODE_PENGAMAN * 60, 300);

const HP = { lebarLayar: 400, tinggiLayar: 880 };
const ukur = (lebar: number, tinggi: number, sedangMengetik = false) =>
  terlihatLayarTerbagi({
    ...HP,
    lebarJendela: lebar,
    tinggiJendela: tinggi,
    sedangMengetik,
  });

// Layar penuh dan browser biasa (bilah alamat + navigasi) bukan pelanggaran.
assert.equal(ukur(400, 880), false);
assert.equal(ukur(400, 700), false);
// Split screen potret: tinggi tinggal separuh.
assert.equal(ukur(400, 420), true);
// Keyboard di layar saat mengetik: tinggi pendek tapi bukan split.
assert.equal(ukur(400, 420, true), false);
// Split screen lanskap/tablet: lebar tinggal separuh, walau sedang mengetik.
assert.equal(ukur(190, 880, true), true);
// Ukuran layar tidak terbaca: jangan menuduh.
assert.equal(
  terlihatLayarTerbagi({
    lebarJendela: 100,
    tinggiJendela: 100,
    lebarLayar: 0,
    tinggiLayar: 0,
    sedangMengetik: false,
  }),
  false
);

// ExamSafer dikenali dari user agent; browser biasa tidak.
const pasangUA = (ua: string) =>
  Object.defineProperty(globalThis, "navigator", {
    value: { userAgent: ua },
    configurable: true,
  });
pasangUA("Mozilla/5.0 (Linux; Android 13; wv) Chrome/120.0 Mobile Safari/537.36 ExamSaferSMPN8/1.2.0");
assert.equal(diAplikasiExamSafer(), true);
pasangUA("Mozilla/5.0 (Linux; Android 13) Chrome/120.0 Mobile Safari/537.36");
assert.equal(diAplikasiExamSafer(), false);
// Safe Exam Browser (labkom): UA bawaan "SEB/3.x" dan UA custom .seb.
pasangUA("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36 SEB/3.7.1");
assert.equal(diAplikasiExamSafer(), true);
pasangUA("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36 ExamSaferSMPN8/seb");
assert.equal(diAplikasiExamSafer(), true);
pasangUA("Mozilla/5.0 (Windows NT 10.0) Chrome/124.0 Safari/537.36 WEBSEB/x");
assert.equal(diAplikasiExamSafer(), false);

type Rpc = Parameters<typeof catatPelanggaranServer>[0];
let terakhir: { fn: string; args: Record<string, unknown> } | null = null;
const klien = (data: unknown, error: { message: string } | null = null) =>
  ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      terakhir = { fn, args };
      return { data, error };
    },
  }) as unknown as Rpc;

(async () => {
  assert.deepEqual(
    await catatPelanggaranServer(klien([{ jumlah: 2, terkunci: false }]), "m1", "layar_terbagi"),
    { jumlah: 2, terkunci: false }
  );
  assert.deepEqual(terakhir, {
    fn: "catat_pelanggaran_ujian",
    args: { p_mapel_id: "m1", p_jenis: "layar_terbagi" },
  });
  assert.equal(
    await catatPelanggaranServer(klien(null, { message: "x" }), "m1", "pindah_aplikasi"),
    null
  );

  assert.deepEqual(await bukaKunciServer(klien(true), "m1", " 123 456 "), { ok: true });
  assert.equal((terakhir as { args: Record<string, unknown> } | null)?.args.p_kode, "123456");
  const salah = await bukaKunciServer(klien(false), "m1", "000000");
  assert.equal(salah.ok, false);
  const tunggu = await bukaKunciServer(
    klien(null, { message: "Terlalu banyak kode salah. Tunggu 1 menit lalu coba lagi." }),
    "m1",
    "000000"
  );
  assert.ok(!tunggu.ok && /Tunggu 1 menit/.test(tunggu.pesan));

  console.log("pengawasan-ujian: semua lulus");
})();
