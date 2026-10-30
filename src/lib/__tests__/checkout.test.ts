/**
 * Jalankan: npx tsx src/lib/__tests__/checkout.test.ts
 */
import assert from "node:assert/strict";
import {
  MENIT_CHECKOUT,
  catatanCheckout,
  checkoutSatuSiswa,
  hitungStatusCheckout,
  jamWib,
  muatCheckoutMapel,
} from "@/lib/checkout";

const TUTUP = "2026-11-02T01:30:00.000Z"; // 08.30 WIB
const tutupMs = new Date(TUTUP).getTime();
const bukaMs = tutupMs - MENIT_CHECKOUT * 60_000;

const status = (sekarangMs: number, sudahMulai = true, sudahCheckout = false) =>
  hitungStatusCheckout({
    sudahMulai,
    sudahCheckout,
    waktuSelesai: TUTUP,
    sekarangMs,
  });

// Contoh dari pemilik: tutup 08.30, jendela buka 08.25.
assert.equal(jamWib(new Date(bukaMs).toISOString()), "08.25");
assert.equal(jamWib(TUTUP), "08.30");

assert.equal(status(bukaMs - 1), "belum_waktunya");
assert.equal(status(bukaMs), "terbuka");
assert.equal(status(tutupMs - 1), "terbuka");
assert.equal(status(tutupMs), "terlewat");

// Siswa yang tidak pernah mulai tidak boleh dicatat "belum checkout".
assert.equal(status(tutupMs + 1, false), "tidak_ikut");
assert.equal(status(tutupMs + 1, true, true), "sudah");

assert.equal(catatanCheckout("terlewat", null), "Belum checkout");
assert.equal(catatanCheckout("terbuka", null), "Belum checkout");
assert.equal(catatanCheckout("belum_waktunya", null), "");
assert.equal(catatanCheckout("tidak_ikut", null), "");
assert.equal(catatanCheckout("sudah", true), "");
assert.match(catatanCheckout("sudah", false), /TIDAK/);
// null = mapel lama / migrasi belum jalan: tidak boleh ada catatan apa pun.
assert.equal(catatanCheckout(null, null), "");

assert.deepEqual(checkoutSatuSiswa(null, "a", true, tutupMs + 1), {
  status: null,
  checkoutAt: null,
  masihDiRuang: null,
});
const data = {
  waktuSelesai: TUTUP,
  perSiswa: new Map([["a", { checkoutAt: TUTUP, masihDiRuang: false }]]),
};
assert.equal(checkoutSatuSiswa(data, "a", true, tutupMs + 1).status, "sudah");
assert.equal(checkoutSatuSiswa(data, "b", true, tutupMs + 1).status, "terlewat");

function klienTiruan(hasil: Record<string, { data: unknown; error: unknown }>) {
  const from = (tabel: string) => {
    const q = {
      select: () => q,
      eq: () => q,
      maybeSingle: async () => hasil[tabel],
      then: (ok: (v: unknown) => unknown) => ok(hasil[tabel]),
    };
    return q;
  };
  return { from } as unknown as Parameters<typeof muatCheckoutMapel>[0];
}

async function main() {
  const galat = { data: null, error: { message: "kolom tidak ada" } };

  // Migrasi belum jalan: harus diam, bukan melempar.
  assert.equal(await muatCheckoutMapel(klienTiruan({ mapel: galat }), "m"), null);

  // Mapel lama: tidak berlaku.
  assert.equal(
    await muatCheckoutMapel(
      klienTiruan({
        mapel: {
          data: { waktu_selesai: TUTUP, checkout_wajib: false },
          error: null,
        },
      }),
      "m"
    ),
    null
  );

  const hasil = await muatCheckoutMapel(
    klienTiruan({
      mapel: {
        data: { waktu_selesai: TUTUP, checkout_wajib: true },
        error: null,
      },
      checkout_ujian: {
        data: [{ siswa_id: "a", checkout_at: TUTUP, masih_di_ruang: true }],
        error: null,
      },
    }),
    "m"
  );
  assert.equal(hasil?.perSiswa.get("a")?.masihDiRuang, true);

  console.log("checkout: semua uji lulus");
}

void main();
