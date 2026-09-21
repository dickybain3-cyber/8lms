/**
 * Jalankan: npx tsx --tsconfig tsconfig.test.json src/lib/__tests__/event-jenis.test.ts
 *
 * ── APA YANG BERUBAH DI TAHAP 4 ──
 *
 * `ambilDaftarEventMentah()` sekarang mencoba TIGA bentuk select, bukan dua:
 *
 *   Tahap 1: jenis + mapel(count) + tugas(count)   (0018 & 0019 sudah jalan)
 *   Tahap 2: jenis + mapel(count)                  (0019 belum jalan)
 *   Tahap 3: mapel(count)                          (0018 juga belum jalan)
 *
 * Kenapa perlu diuji: tiga project Supabase (kelas 7, 8, 9) dimigrasi
 * manual satu per satu, jadi selalu ada jendela waktu di mana skemanya
 * berbeda-beda. Yang dijaga uji ini bukan "query-nya benar" (itu urusan
 * Postgres), tapi "halaman daftar kegiatan guru tidak pernah kosong hanya
 * karena satu kolom badge belum ada" — dan sebaliknya, "kegagalan nyata
 * tidak pernah menyamar jadi daftar kosong".
 *
 * CATATAN: berkas ini TIDAK bisa dijalankan tanpa stub untuk
 * `@/lib/supabase/admin` dan `@/lib/supabase/admin-multi`, karena
 * `admin-multi-event.ts` mengimpor keduanya di baris paling atas
 * (walau `ambilDaftarEventMentah` sendiri tidak memakainya). Di repo
 * aslinya kedua berkas itu ada, jadi `npx tsx` langsung jalan.
 */
import assert from "node:assert/strict";
import {
  ambilDaftarEventMentah,
  type KlienEventMentah,
} from "@/lib/supabase/admin-multi-event";
import {
  jenisEventValid,
  pakaiMesinUjian,
  pakaiMesinTugas,
  jenisEventSiap,
  labelSiswaJenisEvent,
  DAFTAR_JENIS_EVENT,
} from "@/lib/jenis-event";

type HasilQuery = { data: unknown[] | null; error: { message: string } | null };

/** Tahap select mana yang sedang diminta, dibaca dari string kolomnya.
 *  Urutannya penting: kolom Tahap 1 juga mengandung kata "jenis", jadi
 *  "tugas(count)" harus dicek lebih dulu. */
function tahapDariKolom(kolom: string): 1 | 2 | 3 {
  if (kolom.includes("tugas(count)")) return 1;
  if (kolom.includes("jenis")) return 2;
  return 3;
}

function buatKlienPalsu(opts: {
  /** Tahap mana saja yang GAGAL (seolah kolom/relasinya belum ada). */
  gagal: Array<1 | 2 | 3>;
  baris: Partial<Record<1 | 2 | 3, unknown[]>>;
  /** Diisi klien palsu; dipakai untuk memastikan tahap yang sudah
   *  berhasil tidak dicoba ulang. */
  jejak?: Array<1 | 2 | 3>;
}): KlienEventMentah {
  return {
    from(tabel) {
      assert.equal(tabel, "event");
      return {
        select(kolom: string) {
          const tahap = tahapDariKolom(kolom);
          opts.jejak?.push(tahap);
          return {
            order(kolomUrut: string, urut: { ascending: boolean }): PromiseLike<HasilQuery> {
              // Urutan daftar kegiatan adalah bagian dari kontraknya:
              // yang paling baru di atas. Kalau ini berubah tanpa sengaja,
              // guru akan melihat kegiatan tahun lalu lebih dulu.
              assert.equal(kolomUrut, "tgl_mulai");
              assert.equal(urut.ascending, false);

              if (opts.gagal.includes(tahap)) {
                return Promise.resolve({
                  data: null,
                  error: {
                    message:
                      tahap === 1
                        ? "could not find a relationship between 'event' and 'tugas'"
                        : "column event.jenis does not exist",
                  },
                });
              }
              return Promise.resolve({
                data: opts.baris[tahap] ?? [],
                error: null,
              });
            },
          };
        },
      };
    },
  };
}

/** 0018 dan 0019 sudah jalan: jenis dan jumlah tugas terbaca apa adanya,
 *  dan tahap 2/3 tidak perlu dicoba sama sekali. */
async function testSkemaLengkap() {
  const jejak: Array<1 | 2 | 3> = [];
  const klien = buatKlienPalsu({
    gagal: [],
    jejak,
    baris: {
      1: [
        {
          id: "e1",
          nama: "Kuis Matematika",
          tgl_mulai: "2026-09-01",
          tgl_selesai: "2026-09-01",
          kelas_utama: 7,
          jenis: "kuis_harian",
          mapel: [{ count: 2 }],
          tugas: [{ count: 0 }],
        },
        {
          id: "e2",
          nama: "Tugas Proyek IPA",
          tgl_mulai: "2026-09-02",
          tgl_selesai: "2026-09-10",
          kelas_utama: 8,
          jenis: "assignment",
          mapel: [{ count: 0 }],
          tugas: [{ count: 3 }],
        },
      ],
    },
  });

  const hasil = await ambilDaftarEventMentah(klien);
  assert.deepEqual(jejak, [1]);
  assert.equal(hasil.length, 2);
  assert.equal(hasil[0].jenis, "kuis_harian");
  assert.equal(hasil[0].jumlah_mapel, 2);
  assert.equal(hasil[0].jumlah_tugas, 0);
  assert.equal(hasil[1].jenis, "assignment");
  assert.equal(hasil[1].jumlah_mapel, 0);
  assert.equal(hasil[1].jumlah_tugas, 3);
}

/** 0018 sudah, 0019 BELUM: jenis tetap terbaca (badge "Tugas" tetap
 *  benar), jumlah tugas jatuh ke 0 — bukan error. Ini kondisi paling
 *  mungkin terjadi di lapangan: project kelas 7 sudah dimigrasi, kelas 9
 *  belum. */
async function testTugasBelumAda() {
  const jejak: Array<1 | 2 | 3> = [];
  const klien = buatKlienPalsu({
    gagal: [1],
    jejak,
    baris: {
      2: [
        {
          id: "e3",
          nama: "Tugas Proyek IPA",
          tgl_mulai: "2026-09-02",
          tgl_selesai: "2026-09-10",
          kelas_utama: 9,
          jenis: "assignment",
          mapel: [{ count: 0 }],
        },
      ],
    },
  });

  const hasil = await ambilDaftarEventMentah(klien);
  assert.deepEqual(jejak, [1, 2]);
  assert.equal(hasil.length, 1);
  assert.equal(hasil[0].jenis, "assignment");
  assert.equal(hasil[0].jumlah_tugas, 0);
}

/** 0018 dan 0019 dua-duanya belum jalan: semua event dianggap
 *  'asesmen_akhir' (DEFAULT kolomnya di migrasi 0018) dan daftarnya tetap
 *  tampil. Ini perilaku Tahap 3 yang wajib tidak rusak oleh Tahap 4. */
async function testSkemaLamaFallback() {
  const jejak: Array<1 | 2 | 3> = [];
  const klien = buatKlienPalsu({
    gagal: [1, 2],
    jejak,
    baris: {
      3: [
        {
          id: "e4",
          nama: "PTS Ganjil",
          tgl_mulai: "2026-09-01",
          tgl_selesai: "2026-09-05",
          kelas_utama: 9,
          mapel: [{ count: 5 }],
        },
      ],
    },
  });

  const hasil = await ambilDaftarEventMentah(klien);
  assert.deepEqual(jejak, [1, 2, 3]);
  assert.equal(hasil.length, 1);
  assert.equal(hasil[0].jenis, "asesmen_akhir");
  assert.equal(hasil[0].jumlah_mapel, 5);
  assert.equal(hasil[0].jumlah_tugas, 0);
}

/** Kegagalan yang bukan soal skema (koneksi putus, kredensial salah)
 *  harus sampai ke pemanggil sebagai error. Kalau ini ditelan, guru akan
 *  melihat "belum ada kegiatan" padahal datanya utuh — dan akan membuat
 *  ulang kegiatan yang sebenarnya masih ada. */
async function testKegagalanLainTetapDilempar() {
  const klien: KlienEventMentah = {
    from(tabel) {
      assert.equal(tabel, "event");
      return {
        select() {
          return {
            order(): PromiseLike<HasilQuery> {
              return Promise.resolve({
                data: null,
                error: { message: "connection refused" },
              });
            },
          };
        },
      };
    },
  };

  await assert.rejects(() => ambilDaftarEventMentah(klien));
}

/** Nilai `jenis` di luar enum (mis. sisa percobaan manual lewat SQL
 *  editor) tidak boleh membuat halaman meledak. */
async function testJenisNilaiTidakValidJadiAsesmen() {
  const klien = buatKlienPalsu({
    gagal: [],
    baris: {
      1: [
        {
          id: "e5",
          nama: "Event rusak",
          tgl_mulai: "2026-09-01",
          tgl_selesai: "2026-09-01",
          kelas_utama: 7,
          jenis: "nilai-yang-tidak-ada-di-enum",
          mapel: [],
          tugas: null,
        },
      ],
    },
  });
  const hasil = await ambilDaftarEventMentah(klien);
  assert.equal(hasil[0].jenis, "asesmen_akhir");
  assert.equal(hasil[0].jumlah_mapel, 0);
  assert.equal(hasil[0].jumlah_tugas, 0);
}

/** PostgREST kadang mengembalikan embedded count sebagai objek, kadang
 *  sebagai array satu elemen, tergantung versi. Keduanya harus dibaca. */
async function testBentukCountObjekMaupunArray() {
  const klien = buatKlienPalsu({
    gagal: [],
    baris: {
      1: [
        {
          id: "e6",
          nama: "Bentuk objek",
          tgl_mulai: "2026-09-01",
          tgl_selesai: "2026-09-01",
          kelas_utama: 7,
          jenis: "assignment",
          mapel: { count: 1 },
          tugas: { count: 4 },
        },
      ],
    },
  });
  const hasil = await ambilDaftarEventMentah(klien);
  assert.equal(hasil[0].jumlah_mapel, 1);
  assert.equal(hasil[0].jumlah_tugas, 4);
}

function testHelperJenisEvent() {
  assert.equal(DAFTAR_JENIS_EVENT.length, 4);

  // `pakaiMesinUjian` sengaja TIDAK berubah artinya di Tahap 4: ia masih
  // menjawab "apakah kegiatan ini punya mapel & sesi ujian", karena itulah
  // yang dipakai penjaga `createMapel()` dan trigger di migrasi 0018.
  assert.equal(pakaiMesinUjian("asesmen_akhir"), true);
  assert.equal(pakaiMesinUjian("kuis_harian"), true);
  assert.equal(pakaiMesinUjian("assignment"), false);
  assert.equal(pakaiMesinUjian("forum"), false);

  // Yang baru: mesin tugas. Hanya 'assignment'.
  assert.equal(pakaiMesinTugas("assignment"), true);
  assert.equal(pakaiMesinTugas("asesmen_akhir"), false);
  assert.equal(pakaiMesinTugas("kuis_harian"), false);
  assert.equal(pakaiMesinTugas("forum"), false);

  // Tidak ada jenis yang dua-duanya sekaligus — halaman detail event
  // memilih satu cabang berdasarkan ini.
  for (const def of DAFTAR_JENIS_EVENT) {
    assert.equal(
      pakaiMesinUjian(def.value) && pakaiMesinTugas(def.value),
      false,
      `${def.value} tidak boleh memakai dua mesin sekaligus`
    );
  }

  // Sejak Tahap 4, 'assignment' siap dipakai; 'forum' masih menunggu
  // Tahap 5. Kalau baris ini gagal saat Tahap 5 dikerjakan, itu memang
  // penanda bahwa uji ini yang harus diperbarui.
  assert.equal(jenisEventSiap("assignment"), true);
  assert.equal(jenisEventSiap("asesmen_akhir"), true);
  assert.equal(jenisEventSiap("kuis_harian"), true);
  assert.equal(jenisEventSiap("forum"), false);

  assert.equal(labelSiswaJenisEvent("asesmen_akhir"), "Ujian");
  assert.equal(labelSiswaJenisEvent("kuis_harian"), "Kuis");

  assert.equal(jenisEventValid("kuis_harian"), true);
  assert.equal(jenisEventValid("assignment"), true);
  assert.equal(jenisEventValid("kuis-harian-typo"), false);
  assert.equal(jenisEventValid(null), false);
  assert.equal(jenisEventValid(undefined), false);
}

async function main() {
  await testSkemaLengkap();
  await testTugasBelumAda();
  await testSkemaLamaFallback();
  await testKegagalanLainTetapDilempar();
  await testJenisNilaiTidakValidJadiAsesmen();
  await testBentukCountObjekMaupunArray();
  testHelperJenisEvent();
  console.log("Semua uji event-jenis LULUS.");
}

main().catch((e) => {
  console.error("GAGAL:", e);
  process.exit(1);
});
