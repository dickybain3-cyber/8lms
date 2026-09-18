import type { KonfigRuang, SiswaDenah } from "@/lib/denah";

/**
 * PEMBAGIAN RUANG UJIAN — lapisan tipis di atas `src/lib/denah.ts`.
 *
 * `denah.ts` sudah tahu cara memasangkan siswa beda tingkat di satu meja
 * dan membagikannya ke ruang. Yang BELUM ada dan dibutuhkan panitia
 * adalah tiga hal di atasnya, dan itulah isi berkas ini:
 *
 *   1. PILIHAN PASANGAN JENJANG. Panitia tidak selalu mengacak ketiga
 *      tingkat sekaligus. Sesi pagi bisa jadi hanya kelas 7 dan 8 yang
 *      ujian, sementara kelas 9 sedang kegiatan lain. Jadi harus ada
 *      pilihan tegas: 7–8, 8–9, 7–9, atau ketiganya.
 *
 *   2. RUANG YANG BERASAL DARI KELAS SUNGGUHAN. Sekolah ini punya 18
 *      ruang kelas (7-1 sampai 9-6) dengan jumlah bangku yang berbeda-
 *      beda. Menyodorkan "18 ruang @ 32 kursi" akan salah di hampir
 *      semua ruang. Karena itu kapasitas awal tiap ruang diambil dari
 *      JUMLAH SISWA KELAS ITU SENDIRI — angka yang pasti benar, karena
 *      selama ini merekalah yang duduk di sana.
 *
 *   3. ANGKA PER KELAS YANG BISA DILIHAT SEBELUM MENEKAN GENERATE.
 *      Panitia perlu tahu "7-3 ada 31 anak" tanpa membuka spreadsheet
 *      lain, karena itulah dasar dia memutuskan menambah/mengurangi
 *      kursi di suatu ruang.
 *
 * Semua fungsi di sini MURNI perhitungan — tidak menyentuh React maupun
 * database, sehingga bisa dipanggil dari server maupun browser.
 */

export type ModePasangan = "7-8" | "8-9" | "7-9" | "semua";

export interface OpsiMode {
  id: ModePasangan;
  label: string;
  keterangan: string;
  tingkat: (7 | 8 | 9)[];
}

export const DAFTAR_MODE: OpsiMode[] = [
  {
    id: "7-8",
    label: "Kelas 7 + 8",
    keterangan: "Satu meja diisi satu siswa kelas 7 dan satu siswa kelas 8.",
    tingkat: [7, 8],
  },
  {
    id: "8-9",
    label: "Kelas 8 + 9",
    keterangan: "Satu meja diisi satu siswa kelas 8 dan satu siswa kelas 9.",
    tingkat: [8, 9],
  },
  {
    id: "7-9",
    label: "Kelas 7 + 9",
    keterangan: "Satu meja diisi satu siswa kelas 7 dan satu siswa kelas 9.",
    tingkat: [7, 9],
  },
  {
    id: "semua",
    label: "Ketiga jenjang",
    keterangan:
      "Seluruh siswa 7, 8, dan 9 diacak bersama. Pasangan meja dibuat seoptimal mungkin beda tingkat.",
    tingkat: [7, 8, 9],
  },
];

export function tingkatDariMode(mode: ModePasangan): (7 | 8 | 9)[] {
  return DAFTAR_MODE.find((m) => m.id === mode)?.tingkat ?? [7, 8, 9];
}

/** Siswa yang ikut diacak pada mode ini. Sisanya sama sekali tidak
 *  disentuh — mereka tidak muncul di denah, presensi, maupun kartu. */
export function siswaUntukMode(
  siswa: SiswaDenah[],
  mode: ModePasangan
): SiswaDenah[] {
  const tingkat = tingkatDariMode(mode);
  return siswa.filter((s) => tingkat.includes(s.tingkat));
}

// ---------------------------------------------------------------------------
// Rekap per kelas
// ---------------------------------------------------------------------------

export interface RekapKelas {
  nama: string;
  tingkat: 7 | 8 | 9;
  jumlah: number;
}

/**
 * Urutkan nama kelas secara "manusiawi": tingkat dulu, lalu nomor kelas
 * sebagai ANGKA. Perbandingan string biasa akan menaruh "7.10" sebelum
 * "7.2" — hal kecil yang membuat panitia mengira ada ruang yang hilang
 * saat menyusuri daftar 18 baris.
 *
 * Pemisahnya sengaja tidak dipatok: sekolah bisa menulis "7.1", "7-1",
 * atau "7 A". Yang diambil adalah rentetan angka terakhir pada nama.
 */
function nomorKelas(nama: string): number {
  const cocok = nama.match(/(\d+)\s*$/);
  return cocok ? Number(cocok[1]) : 0;
}

export function urutkanKelas(a: RekapKelas, b: RekapKelas): number {
  if (a.tingkat !== b.tingkat) return a.tingkat - b.tingkat;
  const na = nomorKelas(a.nama);
  const nb = nomorKelas(b.nama);
  if (na !== nb) return na - nb;
  return a.nama.localeCompare(b.nama, "id");
}

/**
 * Hitung jumlah siswa per kelas dari data mentah ketiga database.
 *
 * Kelas diturunkan DARI DATA SISWA, bukan dari daftar 18 kelas yang
 * ditulis keras di kode. Kalau suatu tahun ajaran cuma ada 5 rombel di
 * kelas 9, daftarnya ikut menyusut sendiri — tanpa ada yang perlu
 * mengubah kode, dan tanpa memunculkan ruang hantu berkapasitas 0 yang
 * membingungkan pengawas.
 */
export function rekapPerKelas(siswa: SiswaDenah[]): RekapKelas[] {
  const peta = new Map<string, RekapKelas>();
  for (const s of siswa) {
    const kunci = s.kelasNama;
    const ada = peta.get(kunci);
    if (ada) ada.jumlah += 1;
    else peta.set(kunci, { nama: kunci, tingkat: s.tingkat, jumlah: 1 });
  }
  return Array.from(peta.values()).sort(urutkanKelas);
}

// ---------------------------------------------------------------------------
// Konfigurasi ruang
// ---------------------------------------------------------------------------

export interface KonfigRuangKelas extends KonfigRuang {
  /** Nama kelas asal ruang ini, mis. "7.1" — dipakai menandai baris. */
  kelasAsal: string;
  tingkat: 7 | 8 | 9;
  /** Jumlah siswa kelas itu — kapasitas bawaan, ditampilkan sebagai acuan. */
  jumlahSiswaKelas: number;
}

/**
 * Susun daftar ruang dari daftar kelas.
 *
 * Kapasitas awal = jumlah siswa kelas itu. Untuk ruang milik tingkat yang
 * TIDAK ikut pada mode terpilih, kapasitas awalnya tetap diisi (bukan
 * dinolkan): ruang 9-1 tetap ruang fisik yang kosong dan bisa dipakai
 * mendudukkan siswa 7 dan 8 saat kelas 9 sedang tidak ujian. Panitia yang
 * memang tidak mau memakainya tinggal mengisi 0 — satu ketikan, dan itu
 * keputusan yang memang miliknya, bukan milik program.
 */
export function konfigRuangDariKelas(
  kelas: RekapKelas[]
): KonfigRuangKelas[] {
  return kelas.map((k) => ({
    nama: `Ruang ${k.nama}`,
    kapasitas: k.jumlah,
    kelasAsal: k.nama,
    tingkat: k.tingkat,
    jumlahSiswaKelas: k.jumlah,
  }));
}

/** Buang atribut tambahan sebelum dioper ke `buatDenah`, yang hanya
 *  mengenal `{ nama, kapasitas }`. Ruang berkapasitas 0 dibuang total —
 *  ruang kosong di daftar presensi hanya membuat pengawas bertanya-tanya. */
export function keKonfigDenah(konfig: KonfigRuangKelas[]): KonfigRuang[] {
  return konfig
    .filter((r) => r.kapasitas > 0)
    .map((r) => ({ nama: r.nama.trim() || "Ruang", kapasitas: r.kapasitas }));
}

/**
 * Sebarkan `jumlahSiswa` ke ruang-ruang yang dipilih semerata mungkin,
 * TAPI tidak pernah melebihi kapasitas fisik ruang itu (jumlah bangku
 * kelasnya sendiri).
 *
 * Kenapa perlu: pada mode berpasangan, jumlah peserta sering jauh lebih
 * kecil daripada total bangku sekolah. Kalau ruang diisi berurutan sampai
 * penuh, ruang pertama sesak dan ruang terakhir kosong melompong —
 * pengawasnya tidak seimbang, dan jarak antarsiswa (yang justru jadi
 * alasan pengacakan ini ada) hilang di ruang-ruang depan.
 */
export function sebarRata(
  konfig: KonfigRuangKelas[],
  ruangDipakai: Set<string>,
  jumlahSiswa: number
): KonfigRuangKelas[] {
  const terpilih = konfig.filter((r) => ruangDipakai.has(r.kelasAsal));
  if (terpilih.length === 0) return konfig;

  const batas = new Map(terpilih.map((r) => [r.kelasAsal, r.jumlahSiswaKelas]));
  const hasil = new Map(terpilih.map((r) => [r.kelasAsal, 0]));

  let sisa = jumlahSiswa;
  // Putaran berulang: tiap putaran menambah satu kursi ke setiap ruang
  // yang belum penuh. Berhenti kalau siswa habis, atau kalau satu putaran
  // penuh tidak berhasil menambah apa pun (semua ruang sudah mentok) —
  // penjaga kedua itu yang mencegah kalang tak berujung saat total
  // kapasitas lebih kecil daripada jumlah siswa.
  while (sisa > 0) {
    let bertambah = false;
    for (const r of terpilih) {
      if (sisa === 0) break;
      const kini = hasil.get(r.kelasAsal) ?? 0;
      if (kini < (batas.get(r.kelasAsal) ?? 0)) {
        hasil.set(r.kelasAsal, kini + 1);
        sisa -= 1;
        bertambah = true;
      }
    }
    if (!bertambah) break;
  }

  return konfig.map((r) =>
    ruangDipakai.has(r.kelasAsal)
      ? { ...r, kapasitas: hasil.get(r.kelasAsal) ?? 0 }
      : { ...r, kapasitas: 0 }
  );
}
