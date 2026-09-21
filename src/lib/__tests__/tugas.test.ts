/**
 * Jalankan: npx tsx --tsconfig tsconfig.test.json src/lib/__tests__/tugas.test.ts
 *
 * Semua yang diuji di sini adalah perhitungan murni — tidak ada Supabase,
 * tidak ada jam sistem. Itu bukan kebetulan: `src/lib/tugas.ts` sengaja
 * menerima `sekarang` sebagai parameter supaya seluruh aturan pintu
 * pengumpulan bisa diperiksa tanpa menunggu tengah malam.
 */
import assert from "node:assert/strict";
import {
  faseTugas,
  bolehMengumpulkan,
  alasanTidakBolehMengumpulkan,
  ringkasPengumpulan,
  papanTugas,
  validasiNilai,
  parseNilai,
  formatSisaSingkat,
  formatUkuranBerkas,
  type PengumpulanRingkas,
} from "@/lib/tugas";
import {
  bersihkanNamaBerkas,
  pathBerkasTugas,
  validasiBerkas,
  MAKS_UKURAN_BERKAS,
} from "@/lib/tugas-berkas";
import {
  pakaiMesinTugas,
  pakaiMesinUjian,
  jenisEventSiap,
  definisiJenisEvent,
  DAFTAR_JENIS_EVENT,
  istilahIsiKegiatan,
} from "@/lib/jenis-event";

const JAM = 3600_000;
const DIBUKA = "2026-09-20T00:00:00.000Z";
const TENGGAT = "2026-09-27T00:00:00.000Z";

const t0 = new Date(DIBUKA).getTime();
const tTenggat = new Date(TENGGAT).getTime();

const tugasBiasa = {
  dibuka_at: DIBUKA,
  tenggat: TENGGAT,
  izinkan_terlambat: true,
};
const tugasTegas = { ...tugasBiasa, izinkan_terlambat: false };

function testFaseDanPintu() {
  assert.equal(faseTugas(tugasBiasa, t0 - JAM), "belum_dibuka");
  assert.equal(faseTugas(tugasBiasa, t0 + JAM), "berjalan");
  assert.equal(faseTugas(tugasBiasa, tTenggat + JAM), "lewat_tenggat");

  // Tepat pada detik dibuka = sudah boleh. Tepat pada detik tenggat =
  // masih boleh. Batas yang inklusif ini disengaja: siswa yang menekan
  // Kumpulkan pada detik terakhir tidak boleh kalah oleh pembulatan.
  assert.equal(faseTugas(tugasBiasa, t0), "berjalan");
  assert.equal(faseTugas(tugasBiasa, tTenggat), "berjalan");

  // Belum dibuka -> tertutup untuk kedua jenis tugas.
  assert.equal(bolehMengumpulkan(tugasBiasa, t0 - JAM), false);
  assert.equal(bolehMengumpulkan(tugasTegas, t0 - JAM), false);

  // Lewat tenggat -> bergantung pada izinkan_terlambat. Inilah satu-
  // satunya tempat kedua tugas berbeda perilaku.
  assert.equal(bolehMengumpulkan(tugasBiasa, tTenggat + JAM), true);
  assert.equal(bolehMengumpulkan(tugasTegas, tTenggat + JAM), false);

  assert.match(
    alasanTidakBolehMengumpulkan(tugasBiasa, t0 - JAM) ?? "",
    /belum dibuka/i
  );
  assert.match(
    alasanTidakBolehMengumpulkan(tugasTegas, tTenggat + JAM) ?? "",
    /tenggat/i
  );
  assert.equal(alasanTidakBolehMengumpulkan(tugasBiasa, t0 + JAM), null);
  // Terlambat TAPI diizinkan bukan alasan menolak — kalau ini pernah
  // berubah jadi string, tombol Kumpulkan siswa akan terkunci padahal
  // gurunya sengaja membuka keterlambatan.
  assert.equal(alasanTidakBolehMengumpulkan(tugasBiasa, tTenggat + JAM), null);
}

function testRingkasPengumpulan() {
  // Tidak ada baris sama sekali.
  assert.deepEqual(ringkasPengumpulan(null, TENGGAT), {
    status: "belum",
    terlambat: false,
  });

  // Baris ada tapi kosong dan belum disubmit = tetap "belum". Baris sisa
  // (siswa membuka halaman lalu menutupnya) tidak boleh terlihat sebagai
  // pekerjaan yang menunggu dibaca guru.
  assert.deepEqual(
    ringkasPengumpulan(
      { teks: "   ", berkas_path: null, submitted_at: null, nilai: null },
      TENGGAT
    ),
    { status: "belum", terlambat: false }
  );

  // Ada isi tapi belum disubmit = draf.
  assert.equal(
    ringkasPengumpulan(
      { teks: "setengah jalan", berkas_path: null, submitted_at: null, nilai: null },
      TENGGAT
    ).status,
    "draf"
  );
  // Berkas saja (tanpa teks) juga dihitung sebagai isi.
  assert.equal(
    ringkasPengumpulan(
      { teks: "", berkas_path: "a/b/c.jpg", submitted_at: null, nilai: null },
      TENGGAT
    ).status,
    "draf"
  );

  // Tepat waktu, belum dinilai.
  assert.deepEqual(
    ringkasPengumpulan(
      {
        teks: "selesai",
        berkas_path: null,
        submitted_at: "2026-09-26T10:00:00.000Z",
        nilai: null,
      },
      TENGGAT
    ),
    { status: "terkumpul", terlambat: false }
  );

  // Terlambat DAN sudah dinilai — dua sumbu, keduanya harus bertahan.
  assert.deepEqual(
    ringkasPengumpulan(
      {
        teks: "telat",
        berkas_path: null,
        submitted_at: "2026-09-28T10:00:00.000Z",
        nilai: 80,
      },
      TENGGAT
    ),
    { status: "dinilai", terlambat: true }
  );

  // nilai 0 adalah DINILAI, bukan belum dinilai. Ini pembeda yang paling
  // mudah rusak kalau seseorang menulis `if (!nilai)` di suatu tempat.
  assert.equal(
    ringkasPengumpulan(
      {
        teks: "x",
        berkas_path: null,
        submitted_at: "2026-09-26T10:00:00.000Z",
        nilai: 0,
      },
      TENGGAT
    ).status,
    "dinilai"
  );
}

function testPapanTugas() {
  const daftar: PengumpulanRingkas[] = [
    // tepat waktu, dinilai 80
    { teks: "a", submitted_at: "2026-09-26T00:00:00.000Z", nilai: 80 },
    // terlambat, dinilai 60
    { teks: "b", submitted_at: "2026-09-28T00:00:00.000Z", nilai: 60 },
    // terkumpul, belum dinilai
    { teks: "c", submitted_at: "2026-09-26T00:00:00.000Z", nilai: null },
    // draf saja — tidak dihitung terkumpul
    { teks: "d", submitted_at: null, nilai: null },
  ];

  // target 10, bukan 4: enam siswa lain belum punya baris sama sekali.
  const papan = papanTugas(daftar, TENGGAT, 10);

  assert.equal(papan.target, 10);
  assert.equal(papan.terkumpul, 3);
  assert.equal(papan.terlambat, 1);
  assert.equal(papan.dinilai, 2);
  assert.equal(papan.belum, 7); // 10 - 3, BUKAN 4 - 3
  assert.equal(papan.rataRata, 70); // (80 + 60) / 2, draf & belum dinilai tidak ikut

  // Belum ada yang dinilai -> rata-rata null, bukan 0. Nol akan terbaca
  // sebagai "semua anak dapat nol".
  assert.equal(papanTugas([], TENGGAT, 5).rataRata, null);
  assert.equal(papanTugas([], TENGGAT, 5).belum, 5);

  // Target lebih kecil dari yang mengumpulkan (mis. siswa pindah kelas
  // setelah mengumpulkan) tidak boleh menghasilkan angka negatif.
  assert.equal(papanTugas(daftar, TENGGAT, 1).belum, 0);
}

function testValidasiNilai() {
  assert.equal(validasiNilai("", 100), null); // kosong = batalkan penilaian
  assert.equal(validasiNilai("  ", 100), null);
  assert.equal(validasiNilai("0", 100), null);
  assert.equal(validasiNilai("100", 100), null);
  assert.equal(validasiNilai("87,5", 100), null); // koma ala Indonesia
  assert.match(validasiNilai("-1", 100) ?? "", /negatif/i);
  assert.match(validasiNilai("101", 100) ?? "", /maksimal/i);
  assert.match(validasiNilai("bagus", 100) ?? "", /angka/i);

  assert.equal(parseNilai(""), null);
  assert.equal(parseNilai("87,5"), 87.5);
  assert.equal(parseNilai("90"), 90);
}

function testBerkas() {
  // Nama dibersihkan, tapi tidak sampai hilang.
  assert.equal(bersihkanNamaBerkas("Laporan IPA.pdf"), "Laporan-IPA.pdf");
  assert.equal(bersihkanNamaBerkas("foto (1).jpg"), "foto-1-.jpg");

  // Path traversal tidak boleh lolos — kalau ini rusak, siswa bisa
  // menulis ke folder pengumpulan siswa lain.
  const jahat = bersihkanNamaBerkas("../../rahasia.txt");
  assert.ok(!jahat.includes("/"), "tidak boleh ada garis miring");
  assert.ok(!jahat.startsWith("."), "tidak boleh diawali titik");

  // Nama yang seluruhnya tidak sah tetap menghasilkan sesuatu, bukan
  // path dengan segmen kosong.
  assert.equal(bersihkanNamaBerkas("///"), "berkas");
  assert.equal(bersihkanNamaBerkas(""), "berkas");

  // Urutan segmen dikunci policy storage di 0019: [tugas, siswa, nama].
  const path = pathBerkasTugas("tugas-1", "siswa-2", "Foto Tugas.png");
  assert.equal(path.split("/")[0], "tugas-1");
  assert.equal(path.split("/")[1], "siswa-2");
  assert.equal(path.split("/").length, 3);

  assert.equal(
    validasiBerkas({ name: "a.jpg", size: 1000, type: "image/jpeg" }),
    null
  );
  assert.match(
    validasiBerkas({ name: "a.jpg", size: 0, type: "image/jpeg" }) ?? "",
    /kosong/i
  );
  assert.match(
    validasiBerkas({
      name: "a.jpg",
      size: MAKS_UKURAN_BERKAS + 1,
      type: "image/jpeg",
    }) ?? "",
    /besar/i
  );
  assert.match(
    validasiBerkas({ name: "a.exe", size: 100, type: "application/x-msdownload" }) ??
      "",
    /tidak diterima/i
  );
  // Tipe kosong (browser tidak mengenali) ditolak, bukan diloloskan.
  assert.ok(validasiBerkas({ name: "a", size: 100, type: "" }) !== null);
}

function testFormat() {
  assert.equal(formatSisaSingkat(0), "sebentar lagi");
  assert.equal(formatSisaSingkat(-5000), "sebentar lagi");
  // Sisa detik dibulatkan KE ATAS ke menit terdekat — perilaku ini
  // diwarisi apa adanya dari versi lama di DashboardSiswaClient, dan
  // sengaja tidak diubah: kalimatnya "akan terbuka dalam 1 menit", dan
  // membulatkan ke bawah akan menghasilkan "akan terbuka dalam 0 menit"
  // selama satu menit penuh.
  assert.equal(formatSisaSingkat(30_000), "1 menit");
  assert.equal(formatSisaSingkat(45 * 60_000), "45 menit");
  assert.equal(formatSisaSingkat(2 * JAM), "2 jam");
  assert.equal(formatSisaSingkat(2 * JAM + 12 * 60_000), "2 jam 12 menit");
  assert.equal(formatSisaSingkat(49 * JAM), "2 hari 1 jam");

  assert.equal(formatUkuranBerkas(null), "—");
  assert.equal(formatUkuranBerkas(0), "—");
  assert.equal(formatUkuranBerkas(512), "512 B");
  assert.equal(formatUkuranBerkas(2048), "2 KB");
  assert.equal(formatUkuranBerkas(3 * 1024 * 1024), "3.0 MB");
}

function testJenisEventTahap4() {
  // assignment kini SIAP dan memakai mesin tugas.
  assert.equal(pakaiMesinTugas("assignment"), true);
  assert.equal(jenisEventSiap("assignment"), true);
  assert.equal(definisiJenisEvent("assignment").tahapRencana, null);

  // Forum (Tahap 5): mesinnya sendiri, bukan tugas, dan sejak Tahap 5
  // sudah siap juga — diperbarui dari Tahap 4, ketika forum masih
  // menunggu dan baris ini mengharapkan `false`/`5`. Lihat
  // `forum.test.ts` dan `event-jenis.test.ts` untuk uji forum yang lebih
  // lengkap; di sini cukup dipastikan `assignment` tidak ikut berubah
  // gara-gara forum selesai dikerjakan.
  assert.equal(pakaiMesinTugas("forum"), false);
  assert.equal(jenisEventSiap("forum"), true);
  assert.equal(definisiJenisEvent("forum").tahapRencana, null);

  // `pakaiMesinUjian` TIDAK boleh berubah artinya — ia dipakai sebagai
  // penjaga di createMapel dan dicerminkan trigger 0018. Kalau suatu saat
  // assignment lolos di sini, mapel bisa disisipkan ke event tugas.
  assert.equal(pakaiMesinUjian("asesmen_akhir"), true);
  assert.equal(pakaiMesinUjian("kuis_harian"), true);
  assert.equal(pakaiMesinUjian("assignment"), false);
  assert.equal(pakaiMesinUjian("forum"), false);

  // Setiap jenis punya tepat satu mesin, dan `pakaiMesinUjian` selalu
  // setara dengan mesin === "ujian".
  for (const def of DAFTAR_JENIS_EVENT) {
    assert.equal(def.pakaiMesinUjian, def.mesin === "ujian", def.value);
    assert.equal(
      def.siap === false ? def.tahapRencana !== null : def.tahapRencana === null,
      true,
      `tahapRencana tidak konsisten untuk ${def.value}`
    );
  }

  assert.equal(istilahIsiKegiatan("asesmen_akhir"), "mata pelajaran");
  assert.equal(istilahIsiKegiatan("assignment"), "tugas");
  assert.equal(istilahIsiKegiatan("forum"), "topik diskusi");
}

function main() {
  testFaseDanPintu();
  testRingkasPengumpulan();
  testPapanTugas();
  testValidasiNilai();
  testBerkas();
  testFormat();
  testJenisEventTahap4();
  console.log("Semua uji tugas LULUS.");
}

main();
