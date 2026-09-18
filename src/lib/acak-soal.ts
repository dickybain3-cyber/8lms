import type { SoalSiswa } from "@/types";

/**
 * PENGACAKAN SOAL & OPSI JAWABAN PER SISWA (revisi keamanan ujian).
 *
 * ── MASALAH YANG DIPERBAIKI ──
 * Sampai versi sebelumnya, setiap siswa menerima soal dalam urutan yang
 * SAMA PERSIS (`soal.urutan`), dengan opsi A/B/C/D dalam urutan yang sama
 * pula. Di ruang ujian itu berarti jawaban bisa disalin hanya dengan
 * menyebut huruf: "nomor 12 jawabannya C". Tidak perlu membaca soalnya,
 * tidak perlu melihat layar tetangga lama-lama. Satu kalimat berbisik
 * sudah cukup. Itulah sebabnya pengacakan ini bukan fitur tambahan,
 * melainkan syarat supaya angka hasil ujian berarti apa-apa.
 *
 * Sekarang:
 *   - urutan soal diacak per siswa;
 *   - urutan opsi di dalam soal pilihan ganda (biasa & kompleks) diacak;
 *   - daftar pernyataan pada soal multi benar-salah diacak;
 *   - kolom kiri (soal) dan kolom kanan (pilihan jawaban) pada soal
 *     menjodohkan diacak terpisah.
 *
 * ── KENAPA BERBENIH (SEEDED), BUKAN Math.random() ──
 * Ini bagian terpenting dari berkas ini, dan yang paling gampang salah.
 *
 * Kalau urutannya diacak dengan Math.random(), susunannya akan BERUBAH
 * setiap kali halaman dimuat ulang. Bayangkan siswa mengerjakan nomor 1
 * sampai 10, lalu koneksinya putus sebentar dan halaman ter-refresh:
 * "nomor 3" yang tadi dia kerjakan sekarang jadi soal yang sama sekali
 * lain, nomor-nomor yang sudah ditandai hijau di panel navigasi berpindah
 * acak, dan siswa itu kehilangan seluruh peta pengerjaannya. Panik yang
 * ditimbulkannya di tengah ujian jauh lebih merusak daripada manfaat
 * pengacakannya.
 *
 * Karena itu benih pengacakan diturunkan dari `siswaId` + `mapelId`.
 * Konsekuensinya persis yang kita mau:
 *   - siswa yang sama + mapel yang sama  -> urutan SELALU sama, berapa
 *     kali pun halaman dimuat ulang, bahkan dari perangkat berbeda;
 *   - siswa berbeda pada mapel yang sama -> urutan hampir pasti berbeda;
 *   - tidak ada satu pun data baru yang perlu disimpan di database.
 *
 * ── KENAPA JAWABAN TETAP AMAN ──
 * Jawaban siswa disimpan sebagai `jawaban_jsonb[soal_id] = <id opsi>`,
 * BUKAN berdasarkan posisi ("opsi ke-2") maupun nomor urut soal. Jadi
 * mengubah urutan tampilan sama sekali tidak menyentuh cara jawaban
 * dicatat maupun cara `hitung_nilai` di database mengoreksinya. Tidak ada
 * migrasi database untuk perubahan ini, dan jawaban yang sudah tersimpan
 * sebelum revisi ini tetap terbaca dengan benar.
 */

/**
 * FNV-1a 32-bit. Dipilih karena pendek, tanpa dependensi, dan menyebar
 * rata untuk masukan berupa UUID — yang mana persis bentuk `siswaId` dan
 * `mapelId` kita. Ini BUKAN fungsi hash kriptografis dan memang tidak
 * perlu: yang kita butuhkan cuma angka yang stabil dan menyebar, bukan
 * yang tahan serangan.
 */
export function benihDariKunci(kunci: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < kunci.length; i++) {
    h ^= kunci.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0 || 1; // 0 adalah benih mati untuk mulberry32
}

/** mulberry32 — generator acak berbenih yang sama dengan yang dipakai
 *  `src/lib/denah.ts`, supaya hanya ada satu jenis pengacakan berbenih di
 *  seluruh proyek ini dan perilakunya bisa diduga dari satu tempat. */
function buatAcak(benih: number): () => number {
  let a = benih >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates, menyalin dulu supaya array asal tidak ikut berubah. */
function kocok<T>(arr: readonly T[], acak: () => number): T[] {
  const hasil = [...arr];
  for (let i = hasil.length - 1; i > 0; i--) {
    const j = Math.floor(acak() * (i + 1));
    [hasil[i], hasil[j]] = [hasil[j], hasil[i]];
  }
  return hasil;
}

function adalahArrayObjek(v: unknown): v is Record<string, unknown>[] {
  return (
    Array.isArray(v) &&
    v.every((x) => typeof x === "object" && x !== null && !Array.isArray(x))
  );
}

/**
 * Acak isi `konten_jsonb` satu soal sesuai tipenya.
 *
 * Sengaja defensif: setiap daftar hanya diacak kalau bentuknya memang
 * array objek. Soal lama yang kontennya tidak lengkap (mis. dibuat lewat
 * impor dan salah satu field-nya kosong) dikembalikan apa adanya, bukan
 * membuat halaman ujian gagal render. Di hari-H, soal yang tampil dengan
 * urutan asli jauh lebih baik daripada layar putih.
 */
function acakKonten(
  tipe: SoalSiswa["tipe"],
  konten: Record<string, unknown>,
  acak: () => number
): Record<string, unknown> {
  switch (tipe) {
    case "pilgan_biasa":
    case "pilgan_kompleks": {
      if (!adalahArrayObjek(konten.opsi)) return konten;
      return { ...konten, opsi: kocok(konten.opsi, acak) };
    }
    case "multi_benar_salah": {
      if (!adalahArrayObjek(konten.pernyataan)) return konten;
      return { ...konten, pernyataan: kocok(konten.pernyataan, acak) };
    }
    case "menjodohkan": {
      const next = { ...konten };
      // Dua kolom diacak TERPISAH. Kalau keduanya diacak dengan urutan
      // yang sama, pasangan yang benar akan tetap sejajar (baris 1 cocok
      // dengan pilihan A, baris 2 dengan B, dst) — soalnya jadi bisa
      // dijawab tanpa dibaca sama sekali.
      if (adalahArrayObjek(konten.soal)) next.soal = kocok(konten.soal, acak);
      if (adalahArrayObjek(konten.jawaban))
        next.jawaban = kocok(konten.jawaban, acak);
      return next;
    }
    // uraian_singkat & benar_salah tidak punya daftar pilihan untuk diacak.
    default:
      return konten;
  }
}

/**
 * Susun ulang daftar soal untuk SATU siswa.
 *
 * `kunci` harus mengandung identitas siswa DAN mapel — biasanya
 * `${siswaId}:${mapelId}`. Jangan memakai kunci yang sama untuk dua mapel
 * berbeda: kalau demikian, dua mapel yang kebetulan punya jumlah soal
 * sama akan memakai permutasi yang persis sama, dan pola itu ketahuan.
 *
 * Tiap soal mendapat benih turunannya sendiri (`kunci` + id soal) supaya
 * pengacakan opsi pada satu soal tidak bergeser hanya karena guru
 * menambah/menghapus soal lain di mapel yang sama.
 */
export function acakSoalUntukSiswa(
  soalList: SoalSiswa[],
  kunci: string
): SoalSiswa[] {
  if (soalList.length === 0) return soalList;

  const acakUrutan = buatAcak(benihDariKunci(`urutan:${kunci}`));
  const urutBaru = kocok(soalList, acakUrutan);

  return urutBaru.map((soal) => {
    const acakOpsi = buatAcak(benihDariKunci(`opsi:${kunci}:${soal.id}`));
    const konten = (soal.konten_jsonb ?? {}) as Record<string, unknown>;
    return {
      ...soal,
      konten_jsonb: acakKonten(soal.tipe, konten, acakOpsi),
    };
  });
}
