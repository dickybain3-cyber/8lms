/**
 * Jalankan: npx tsx src/lib/__tests__/guru-detail-export.test.ts
 *
 * Tidak menyentuh Supabase sungguhan — `buatKlienPalsu()` di bawah meniru
 * bentuk `.from("guru").select(...).order(...)` seperlunya saja (lihat
 * `KlienGuruMentah` di admin-multi.ts).
 */
import assert from "node:assert/strict";
import {
  ambilDetailGuruSatuProject,
  type KlienGuruMentah,
} from "@/lib/supabase/admin-multi";
import {
  labelStatusPassword,
  isiKolomPassword,
  statusPasswordPerluDitindaklanjuti,
} from "@/lib/guru-password-status";

type HasilQuery = { data: unknown[] | null; error: { message: string } | null };

/**
 * `kolomLengkapGagal: true` mensimulasikan project yang migrasi 0017-nya
 * BELUM dijalankan: select yang menyebut `password_status` gagal (pesan
 * error meniru Postgres asli: "column guru.password_status does not
 * exist"), select tanpa kolom itu tetap berhasil.
 */
function buatKlienPalsu(opts: {
  barisLengkap: unknown[];
  barisLama: unknown[];
  kolomLengkapGagal: boolean;
}): KlienGuruMentah {
  return {
    from(tabel) {
      assert.equal(tabel, "guru");
      return {
        select(kolom: string) {
          const pakaiKolomLengkap = kolom.includes("password_status");
          return {
            order(): PromiseLike<HasilQuery> {
              if (pakaiKolomLengkap && opts.kolomLengkapGagal) {
                return Promise.resolve({
                  data: null,
                  error: { message: "column guru.password_status does not exist" },
                });
              }
              return Promise.resolve({
                data: pakaiKolomLengkap ? opts.barisLengkap : opts.barisLama,
                error: null,
              });
            },
          };
        },
      };
    },
  };
}

async function testMigrasiSudahJalan() {
  const klien = buatKlienPalsu({
    kolomLengkapGagal: false,
    barisLengkap: [
      {
        id: "g1",
        nama: "Budi",
        nip: "123",
        username: "123",
        is_admin: false,
        password_status: "diganti_guru",
        password_diganti_at: "2026-01-01T00:00:00Z",
        created_at: "2025-01-01T00:00:00Z",
      },
    ],
    barisLama: [],
  });

  const hasil = await ambilDetailGuruSatuProject(klien);
  assert.equal(hasil.length, 1);
  assert.equal(hasil[0].passwordStatus, "diganti_guru");
  assert.equal(hasil[0].nip, "123");
}

async function testMigrasiBelumJalanFallback() {
  const klien = buatKlienPalsu({
    kolomLengkapGagal: true,
    barisLengkap: [],
    barisLama: [
      {
        id: "g2",
        nama: "Sari",
        nip: "456",
        username: "456",
        is_admin: true,
        password_diganti_at: null,
        created_at: "2025-01-01T00:00:00Z",
      },
    ],
  });

  const hasil = await ambilDetailGuruSatuProject(klien);
  assert.equal(hasil.length, 1);
  // Inilah inti perilaku yang wajib dijaga: kolom belum ada -> null,
  // BUKAN "tidak_diketahui" dan BUKAN error yang menghentikan unduhan.
  assert.equal(hasil[0].passwordStatus, null);
  assert.equal(hasil[0].nama, "Sari");
}

async function testKegagalanLainTetapDilempar() {
  // Error yang BUKAN soal kolom hilang (mis. koneksi putus) harus tetap
  // gagal total, bukan diam-diam ditelan seperti kasus fallback di atas.
  const klien: KlienGuruMentah = {
    from(tabel) {
      assert.equal(tabel, "guru");
      return {
        select() {
          return {
            order(): PromiseLike<HasilQuery> {
              return Promise.resolve({
                data: null,
                error: { message: "kolom password_status: connection refused" },
              });
            },
          };
        },
      };
    },
  };

  await assert.rejects(() => ambilDetailGuruSatuProject(klien));
}

function testLabelPassword() {
  assert.equal(labelStatusPassword("awal"), "Awal (belum pernah diganti)");
  assert.equal(isiKolomPassword("awal"), "guru123456");

  assert.equal(isiKolomPassword("diganti_guru").includes("tidak bisa dibaca"), true);
  assert.equal(isiKolomPassword("direset_admin").includes("hanya tampil"), true);

  // Baris ini yang menegaskan aturan paling penting Tahap 2: TIDAK PERNAH
  // menuliskan "guru123456" untuk status apa pun selain 'awal'.
  for (const status of ["direset_admin", "diganti_guru", "tidak_diketahui", null] as const) {
    assert.notEqual(isiKolomPassword(status), "guru123456");
  }

  assert.equal(statusPasswordPerluDitindaklanjuti("tidak_diketahui"), true);
  assert.equal(statusPasswordPerluDitindaklanjuti(null), true);
  assert.equal(statusPasswordPerluDitindaklanjuti("awal"), false);
  assert.equal(statusPasswordPerluDitindaklanjuti("diganti_guru"), false);
}

async function main() {
  await testMigrasiSudahJalan();
  await testMigrasiBelumJalanFallback();
  await testKegagalanLainTetapDilempar();
  testLabelPassword();
  console.log("Semua uji guru-detail-export LULUS.");
}

main().catch((e) => {
  console.error("GAGAL:", e);
  process.exit(1);
});
