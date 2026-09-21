/**
 * Jalankan: npx tsx --tsconfig tsconfig.test.json src/lib/__tests__/event-jenis.test.ts
 *
 * ── APA YANG BERUBAH DI TAHAP 5 ──
 *
 * `ambilDaftarEventMentah()` sekarang mencoba EMPAT bentuk select, bukan
 * tiga — satu tahap baru ditambahkan di UJUNG paling lengkap, tahap-tahap
 * lama TIDAK berpindah urutan:
 *
 *   Tahap 1: jenis + mapel(count) + tugas(count) + forum_topik(count)
 *            (0018, 0019, DAN 0020 sudah jalan)
 *   Tahap 2: jenis + mapel(count) + tugas(count)   (0020 belum jalan)
 *   Tahap 3: jenis + mapel(count)                  (0019 juga belum)
 *   Tahap 4: mapel(count)                          (0018 juga belum)
 *
 * Kenapa perlu diuji: tiga project Supabase (kelas 7, 8, 9) dimigrasi
 * manual satu per satu, jadi selalu ada jendela waktu di mana skemanya
 * berbeda-beda. Yang dijaga uji ini bukan "query-nya benar" (itu urusan
 * Postgres), tapi "halaman daftar kegiatan guru tidak pernah kosong hanya
 * karena satu kolom badge belum ada" — dan sebaliknya, "kegagalan nyata
 * tidak pernah menyamar jadi daftar kosong". `testTugasAdaForumBelum` di
 * bawah adalah kasus BARU yang paling mungkin terjadi persis setelah
 * Tahap 5 dipasang: 0019 sudah lama jalan di ketiga project, 0020 baru
 * saja dijalankan di kelas 7 tapi belum di kelas 8 dan 9.
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
  pakaiMesinForum,
  jenisEventSiap,
  labelSiswaJenisEvent,
  DAFTAR_JENIS_EVENT,
} from "@/lib/jenis-event";

type HasilQuery = { data: unknown[] | null; error: { message: string } | null };
type Tahap = 1 | 2 | 3 | 4;

/** Tahap select mana yang sedang diminta, dibaca dari string kolomnya.
 *  Urutannya penting: kolom tahap yang lebih lengkap juga mengandung kata
 *  kunci tahap di bawahnya ("jenis" ada di tahap 1, 2, DAN 3), jadi yang
 *  paling spesifik harus dicek lebih dulu. */
function tahapDariKolom(kolom: string): Tahap {
  if (kolom.includes("forum_topik(count)")) return 1;
  if (kolom.includes("tugas(count)")) return 2;
  if (kolom.includes("jenis")) return 3;
  return 4;
}

function buatKlienPalsu(opts: {
  /** Tahap mana saja yang GAGAL (seolah kolom/relasinya belum ada). */
  gagal: Tahap[];
  baris: Partial<Record<Tahap, unknown[]>>;
  /** Diisi klien palsu; dipakai untuk memastikan tahap yang sudah
   *  berhasil tidak dicoba ulang. */
  jejak?: Tahap[];
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
                        ? "could not find a relationship between 'event' and 'forum_topik'"
                        : tahap === 2
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

/** 0018, 0019, DAN 0020 semuanya sudah jalan: jenis, jumlah tugas, dan
 *  status forum terbaca apa adanya, dan tahap 2/3/4 tidak perlu dicoba
 *  sama sekali. */
async function testSkemaLengkap() {
  const jejak: Tahap[] = [];
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
          forum_topik: [{ count: 0 }],
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
          forum_topik: [{ count: 0 }],
        },
        {
          id: "e3",
          nama: "Diskusi Bab 3",
          tgl_mulai: "2026-09-03",
          tgl_selesai: "2026-09-12",
          kelas_utama: 8,
          jenis: "forum",
          mapel: [{ count: 0 }],
          tugas: [{ count: 0 }],
          forum_topik: [{ count: 1 }],
        },
      ],
    },
  });

  const hasil = await ambilDaftarEventMentah(klien);
  assert.deepEqual(jejak, [1]);
  assert.equal(hasil.length, 3);
  assert.equal(hasil[0].jenis, "kuis_harian");
  assert.equal(hasil[0].jumlah_mapel, 2);
  assert.equal(hasil[0].jumlah_tugas, 0);
  assert.equal(hasil[0].jumlah_forum_topik, 0);
  assert.equal(hasil[1].jenis, "assignment");
  assert.equal(hasil[1].jumlah_mapel, 0);
  assert.equal(hasil[1].jumlah_tugas, 3);
  assert.equal(hasil[1].jumlah_forum_topik, 0);
  assert.equal(hasil[2].jenis, "forum");
  assert.equal(hasil[2].jumlah_tugas, 0);
  assert.equal(hasil[2].jumlah_forum_topik, 1);
}

/** 0018 dan 0019 sudah jalan, 0020 BELUM. Kondisi paling mungkin terjadi
 *  persis setelah Tahap 5 dipasang: migrasi barunya belum sempat
 *  dijalankan di ketiga project sekaligus. Jenis dan jumlah tugas tetap
 *  benar (badge "Tugas" tidak boleh ikut rusak gara-gara migrasi forum),
 *  jumlah_forum_topik jatuh ke 0 — bukan error. */
async function testTugasAdaForumBelum() {
  const jejak: Tahap[] = [];
  const klien = buatKlienPalsu({
    gagal: [1],
    jejak,
    baris: {
      2: [
        {
          id: "e2b",
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
  assert.deepEqual(jejak, [1, 2]);
  assert.equal(hasil.length, 1);
  assert.equal(hasil[0].jenis, "assignment");
  assert.equal(hasil[0].jumlah_tugas, 3);
  assert.equal(hasil[0].jumlah_forum_topik, 0);
}

/** 0018 sudah, 0019 (dan otomatis 0020) BELUM: jenis tetap terbaca (badge
 *  "Tugas" tetap benar), jumlah tugas & forum jatuh ke 0 — bukan error.
 *  Ini kondisi yang mungkin terjadi di lapangan: project kelas 7 sudah
 *  dimigrasi sampai 0018, kelas 9 belum lanjut sama sekali. */
async function testTugasBelumAda() {
  const jejak: Tahap[] = [];
  const klien = buatKlienPalsu({
    gagal: [1, 2],
    jejak,
    baris: {
      3: [
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
  assert.deepEqual(jejak, [1, 2, 3]);
  assert.equal(hasil.length, 1);
  assert.equal(hasil[0].jenis, "assignment");
  assert.equal(hasil[0].jumlah_tugas, 0);
  assert.equal(hasil[0].jumlah_forum_topik, 0);
}

/** 0018, 0019, dan 0020 semuanya belum jalan: semua event dianggap
 *  'asesmen_akhir' (DEFAULT kolomnya di migrasi 0018) dan daftarnya tetap
 *  tampil. Ini perilaku Tahap 3 yang wajib tidak rusak oleh Tahap 4 maupun
 *  Tahap 5. */
async function testSkemaLamaFallback() {
  const jejak: Tahap[] = [];
  const klien = buatKlienPalsu({
    gagal: [1, 2, 3],
    jejak,
    baris: {
      4: [
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
  assert.deepEqual(jejak, [1, 2, 3, 4]);
  assert.equal(hasil.length, 1);
  assert.equal(hasil[0].jenis, "asesmen_akhir");
  assert.equal(hasil[0].jumlah_mapel, 5);
  assert.equal(hasil[0].jumlah_tugas, 0);
  assert.equal(hasil[0].jumlah_forum_topik, 0);
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
          forum_topik: null,
        },
      ],
    },
  });
  const hasil = await ambilDaftarEventMentah(klien);
  assert.equal(hasil[0].jenis, "asesmen_akhir");
  assert.equal(hasil[0].jumlah_mapel, 0);
  assert.equal(hasil[0].jumlah_tugas, 0);
  assert.equal(hasil[0].jumlah_forum_topik, 0);
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
          forum_topik: { count: 0 },
        },
      ],
    },
  });
  const hasil = await ambilDaftarEventMentah(klien);
  assert.equal(hasil[0].jumlah_mapel, 1);
  assert.equal(hasil[0].jumlah_tugas, 4);
  assert.equal(hasil[0].jumlah_forum_topik, 0);
}

function testHelperJenisEvent() {
  assert.equal(DAFTAR_JENIS_EVENT.length, 4);

  // `pakaiMesinUjian` sengaja TIDAK berubah artinya sejak Tahap 4: ia
  // masih menjawab "apakah kegiatan ini punya mapel & sesi ujian", karena
  // itulah yang dipakai penjaga `createMapel()` dan trigger di migrasi
  // 0018.
  assert.equal(pakaiMesinUjian("asesmen_akhir"), true);
  assert.equal(pakaiMesinUjian("kuis_harian"), true);
  assert.equal(pakaiMesinUjian("assignment"), false);
  assert.equal(pakaiMesinUjian("forum"), false);

  // Mesin tugas (Tahap 4). Hanya 'assignment'.
  assert.equal(pakaiMesinTugas("assignment"), true);
  assert.equal(pakaiMesinTugas("asesmen_akhir"), false);
  assert.equal(pakaiMesinTugas("kuis_harian"), false);
  assert.equal(pakaiMesinTugas("forum"), false);

  // Yang baru di Tahap 5: mesin forum. Hanya 'forum'.
  assert.equal(pakaiMesinForum("forum"), true);
  assert.equal(pakaiMesinForum("asesmen_akhir"), false);
  assert.equal(pakaiMesinForum("kuis_harian"), false);
  assert.equal(pakaiMesinForum("assignment"), false);

  // Tidak ada jenis yang memakai dua mesin sekaligus — halaman detail
  // event memilih satu cabang berdasarkan ini. Sejak Tahap 5 ada TIGA
  // mesin yang harus saling eksklusif, bukan cuma dua.
  for (const def of DAFTAR_JENIS_EVENT) {
    const jumlahMesinAktif = [
      pakaiMesinUjian(def.value),
      pakaiMesinTugas(def.value),
      pakaiMesinForum(def.value),
    ].filter(Boolean).length;
    assert.equal(
      jumlahMesinAktif,
      1,
      `${def.value} harus memakai TEPAT SATU mesin, dapat ${jumlahMesinAktif}`
    );
  }

  // Sejak Tahap 5, seluruh jenis event yang ada sudah siap dipakai —
  // 'forum' tidak lagi menunggu tahap berikutnya. Kalau suatu saat ada
  // jenis event baru yang ditambahkan sebelum halamannya dibangun, baris
  // ini yang akan gagal duluan dan mengingatkan untuk menambahkan
  // pengecualiannya di sini.
  for (const def of DAFTAR_JENIS_EVENT) {
    assert.equal(
      jenisEventSiap(def.value),
      true,
      `${def.value} seharusnya sudah siap sejak Tahap 5`
    );
  }

  assert.equal(labelSiswaJenisEvent("asesmen_akhir"), "Ujian");
  assert.equal(labelSiswaJenisEvent("kuis_harian"), "Kuis");
  assert.equal(labelSiswaJenisEvent("forum"), "Forum");

  assert.equal(jenisEventValid("kuis_harian"), true);
  assert.equal(jenisEventValid("assignment"), true);
  assert.equal(jenisEventValid("forum"), true);
  assert.equal(jenisEventValid("kuis-harian-typo"), false);
  assert.equal(jenisEventValid(null), false);
  assert.equal(jenisEventValid(undefined), false);
}

async function main() {
  await testSkemaLengkap();
  await testTugasAdaForumBelum();
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
