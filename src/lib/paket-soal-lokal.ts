/**
 * PAKET SOAL LOKAL — "unduh dulu, kerjakan kemudian".
 *
 * ── MASALAH YANG DISELESAIKAN ──
 *
 * Sebelum ini, soal memang sudah dikirim sekaligus dalam satu render
 * server (`soalList` sebagai props `ExamClient`), jadi berpindah nomor
 * soal tidak memanggil jaringan. Tapi ada dua hal yang TETAP bergantung
 * pada jaringan di tengah ujian, dan keduanya baru terasa persis di
 * saat paling buruk:
 *
 *   1. GAMBAR. `gambar_url` menunjuk ke Cloudinary dan baru diunduh
 *      saat soal bergambar dibuka. Siswa yang sampai di soal nomor 23
 *      pada menit ke-40 — ketika 600 HP lain di gedung yang sama sedang
 *      berebut hotspot — melihat kotak kosong. Dia tidak tahu apakah
 *      soalnya rusak, HP-nya bermasalah, atau harus menunggu.
 *
 *   2. MUAT ULANG HALAMAN. Tab tertutup, HP kehabisan memori dan
 *      me-restart browser, siswa tidak sengaja menarik layar ke bawah
 *      sampai terjadi pull-to-refresh. Halaman dirender ulang dari
 *      server — dan kalau saat itu koneksinya sedang putus, yang muncul
 *      adalah halaman error, bukan soal yang tadi sedang dikerjakan.
 *
 * Solusinya: pada saat siswa menekan "Mulai Ujian" — SATU-SATUNYA momen
 * di seluruh sesi ketika menunggu beberapa detik masih wajar, karena
 * timernya memang belum jalan — seluruh soal disalin ke localStorage
 * dan seluruh gambarnya dipaksa masuk ke cache browser. Setelah itu,
 * mengerjakan ujian tidak butuh jaringan sama sekali kecuali untuk
 * menyimpan jawaban (yang sudah punya lapisan offline sendiri di
 * `autosave-lokal.ts`).
 *
 * ── KENAPA localStorage, BUKAN Cache API / IndexedDB ──
 *
 * Yang disimpan di sini hanyalah TEKS soal (JSON), bukan berkas gambar.
 * Gambarnya sendiri tidak disimpan oleh kode ini — ia cuma "disentuh"
 * lewat `new Image()` supaya browser yang menyimpannya di cache HTTP
 * miliknya sendiri, mekanisme yang sudah teruji dan tidak memakan kuota
 * localStorage. Untuk teks JSON beberapa ratus KB, localStorage sudah
 * cukup dan API-nya sinkron — sama dengan alasan yang ditulis panjang
 * di `autosave-lokal.ts`, dan konsisten dengannya.
 *
 * Batas localStorage per origin biasanya 5 MB. Satu paket soal 50 butir
 * dengan HTML lengkap jarang melewati 500 KB. Kalau tetap penuh (siswa
 * memakai HP yang penyimpanannya kritis), `simpanPaketSoal` gagal
 * diam-diam dan ujian berjalan persis seperti sebelum file ini ada —
 * tidak ada yang rusak, cuma tidak ada lapisan tambahannya.
 */

import type { SoalSiswa } from "@/types";

const PREFIX = "lms_paket_soal";

/**
 * Dinaikkan kalau bentuk `SoalSiswa` berubah. Paket dengan versi berbeda
 * diabaikan, bukan dipaksa dibaca — soal dengan bentuk lama yang dirender
 * komponen baru bisa menghasilkan layar kosong tanpa pesan error apa pun,
 * dan itu jauh lebih buruk daripada sekadar mengunduh ulang.
 */
const VERSI_PAKET = 1;

/** Umur maksimal paket. Lewat ini, paket dianggap basi dan diunduh ulang. */
const UMUR_MAKSIMAL_MS = 24 * 60 * 60 * 1000; // 24 jam

interface PaketTersimpan {
  versi: number;
  soal: SoalSiswa[];
  savedAt: number;
}

function kunci(siswaId: string, mapelId: string): string {
  return `${PREFIX}:${siswaId}:${mapelId}`;
}

/**
 * Simpan seluruh soal ke localStorage. Mengembalikan `true` kalau
 * berhasil — pemanggil boleh mengabaikan hasilnya, tapi `ExamClient`
 * memakainya untuk memutuskan apakah perlu memberi tahu siswa bahwa
 * ujiannya akan tetap butuh koneksi.
 */
export function simpanPaketSoal(
  siswaId: string,
  mapelId: string,
  soal: SoalSiswa[]
): boolean {
  try {
    const paket: PaketTersimpan = { versi: VERSI_PAKET, soal, savedAt: Date.now() };
    localStorage.setItem(kunci(siswaId, mapelId), JSON.stringify(paket));
    return true;
  } catch {
    return false;
  }
}

/**
 * Baca paket soal yang tersimpan. `null` kalau tidak ada, versinya beda,
 * sudah kedaluwarsa, atau isinya rusak.
 *
 * URUTAN SOAL AMAN DIPAKAI ULANG. Pengacakan soal per siswa memakai
 * benih tetap `"{siswaId}:{mapelId}"` (lihat `acak-soal.ts`), jadi paket
 * yang disimpan kemarin punya urutan yang sama persis dengan yang akan
 * dikirim server hari ini. Tanpa sifat itu, memulihkan dari cache akan
 * mengacaukan peta "nomor 7 itu yang mana" di kepala siswa — dan lebih
 * buruk lagi, jawaban yang sudah tersimpan (dikunci per `soal.id`, bukan
 * per nomor urut) akan tampak berpindah-pindah tempat.
 */
export function bacaPaketSoal(
  siswaId: string,
  mapelId: string
): SoalSiswa[] | null {
  try {
    const raw = localStorage.getItem(kunci(siswaId, mapelId));
    if (!raw) return null;

    const paket = JSON.parse(raw) as PaketTersimpan;
    if (paket.versi !== VERSI_PAKET) return null;
    if (!Array.isArray(paket.soal) || paket.soal.length === 0) return null;
    if (Date.now() - paket.savedAt > UMUR_MAKSIMAL_MS) return null;

    return paket.soal;
  } catch {
    return null;
  }
}

/** Hapus paket — dipanggil setelah ujian dikumpulkan. */
export function hapusPaketSoal(siswaId: string, mapelId: string) {
  try {
    localStorage.removeItem(kunci(siswaId, mapelId));
  } catch {
    // abaikan
  }
}

/**
 * Kumpulkan SEMUA URL gambar yang mungkin muncul di satu paket soal.
 *
 * Gambar di sistem ini datang dari dua jalur yang berbeda sejarahnya
 * (lihat komentar di `SoalViewer.tsx`):
 *
 *   a. Kolom `gambar_url` — satu gambar per soal/opsi, jalur lama.
 *   b. Tag `<img>` yang ditempel guru di tengah teks lewat editor kaya,
 *      tersimpan sebagai HTML di dalam `konten_jsonb`.
 *
 * Keduanya harus ikut terunduh. Menangkap yang (a) saja akan membuat
 * soal matematika — justru yang paling sering memakai gambar sisipan —
 * tetap kosong saat koneksi hilang.
 *
 * Caranya sengaja kasar: seluruh `konten_jsonb` di-JSON.stringify lalu
 * dipindai dengan satu regex. Tidak perlu tahu bentuk persisnya untuk
 * tiap tipe soal (pilgan punya `opsi[]`, menjodohkan punya
 * `pernyataan[]`, dan seterusnya), dan yang lebih penting: struktur baru
 * yang ditambahkan nanti otomatis ikut terpindai tanpa file ini perlu
 * disentuh. Kalau regex ini kebetulan menangkap sesuatu yang bukan
 * gambar, akibat terburuknya cuma satu permintaan jaringan yang gagal
 * dan diabaikan — bukan ujian yang rusak.
 */
export function kumpulkanUrlGambar(soal: SoalSiswa[]): string[] {
  const hasil = new Set<string>();

  const tambah = (u: unknown) => {
    if (typeof u !== "string") return;
    const url = u.trim();
    if (url.startsWith("http://") || url.startsWith("https://")) hasil.add(url);
  };

  for (const s of soal) {
    tambah(s.gambar_url);

    try {
      const teks = JSON.stringify(s.konten_jsonb ?? {});

      // src="..." di dalam HTML yang sudah ter-escape maupun belum.
      for (const m of teks.matchAll(/src=\\?"([^"\\]+)\\?"/g)) tambah(m[1]);

      // Nilai properti bernama *gambar*/​*image*/*url* di kedalaman mana pun.
      for (const m of teks.matchAll(
        /"(?:gambar_url|gambar|image|img|url)"\s*:\s*"([^"]+)"/g
      )) {
        tambah(m[1]);
      }
    } catch {
      // konten yang tidak bisa di-stringify (circular) — lewati saja.
    }
  }

  return [...hasil];
}

/**
 * Paksa browser mengunduh & meng-cache daftar gambar.
 *
 * `new Image()` dipilih, bukan `fetch()`, karena inilah yang membuat
 * gambarnya masuk ke cache gambar browser dengan kunci yang SAMA PERSIS
 * dengan yang nanti dipakai `<img src>` saat soalnya dibuka. `fetch()`
 * bisa berakhir di partisi cache yang berbeda (tergantung mode CORS dan
 * header dari Cloudinary), yang artinya gambarnya terunduh dua kali dan
 * lapisan ini tidak memberi manfaat apa pun saat koneksi hilang.
 *
 * Dibatasi 4 unduhan serentak. Bukan karena browser tidak sanggup lebih,
 * tapi karena yang jadi leher botol di sini adalah titik akses WiFi
 * sekolah: 600 HP yang masing-masing membuka 20 koneksi serentak akan
 * membuat sebagian siswa gagal total alih-alih semuanya selesai agak
 * lambat.
 *
 * TIDAK PERNAH menolak (reject). Gambar yang gagal diunduh tetap
 * dihitung "selesai" supaya satu URL rusak tidak menggantung seluruh
 * layar persiapan — soalnya tetap bisa dikerjakan, gambarnya saja yang
 * akan dicoba lagi oleh browser saat soal itu dibuka.
 */
export async function pramuatGambar(
  urls: string[],
  onProgress?: (selesai: number, total: number) => void,
  batasSerentak = 4
): Promise<{ berhasil: number; gagal: number }> {
  const total = urls.length;
  let selesai = 0;
  let berhasil = 0;
  let gagal = 0;

  if (total === 0) {
    onProgress?.(0, 0);
    return { berhasil: 0, gagal: 0 };
  }

  let indeks = 0;

  async function pekerja(): Promise<void> {
    while (indeks < urls.length) {
      const url = urls[indeks++];
      await new Promise<void>((resolve) => {
        const img = new window.Image();

        // Jaring pengaman: gambar yang tidak pernah memicu onload maupun
        // onerror (server menggantung, bukan menolak) tidak boleh
        // menahan siswa di layar persiapan selamanya.
        const batalkan = setTimeout(() => {
          gagal++;
          rampung();
        }, 15_000);

        function rampung() {
          clearTimeout(batalkan);
          selesai++;
          onProgress?.(selesai, total);
          resolve();
        }

        img.onload = () => {
          berhasil++;
          rampung();
        };
        img.onerror = () => {
          gagal++;
          rampung();
        };
        img.src = url;
      });
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(batasSerentak, total) }, () => pekerja())
  );

  return { berhasil, gagal };
}

/**
 * Satu langkah "unduh semuanya": simpan JSON + pramuat gambar.
 * Dipanggil `ExamClient` tepat sebelum timer dijalankan.
 */
export async function unduhPaketSoal(
  siswaId: string,
  mapelId: string,
  soal: SoalSiswa[],
  onProgress?: (selesai: number, total: number) => void
): Promise<{ tersimpan: boolean; gambarBerhasil: number; gambarGagal: number }> {
  const tersimpan = simpanPaketSoal(siswaId, mapelId, soal);
  const urls = kumpulkanUrlGambar(soal);
  const { berhasil, gagal } = await pramuatGambar(urls, onProgress);
  return { tersimpan, gambarBerhasil: berhasil, gambarGagal: gagal };
}
