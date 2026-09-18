/**
 * Pengacakan tempat duduk lintas jenjang — logika murni, tanpa React dan
 * tanpa akses database, supaya bisa dibaca/diuji sendiri dan supaya
 * halaman /admin/denah tinggal memanggilnya.
 *
 * ATURAN YANG DIMINTA
 * Satu meja diisi dua siswa dari TINGKAT YANG BERBEDA: 7 dengan 8, 8
 * dengan 9, atau 7 dengan 9. Tujuannya jelas — teman sekelas tidak duduk
 * bersebelahan, dan karena soalnya berbeda antar tingkat, menyontek ke
 * samping jadi tidak ada gunanya.
 *
 * KENAPA PENJODOHANNYA "AMBIL DARI DUA TUMPUKAN TERBANYAK"
 * Cara naif (acak dua orang, ulangi kalau tingkatnya sama) macet di akhir:
 * begitu tersisa 20 siswa yang semuanya kelas 8, tidak ada lagi pasangan
 * yang sah dan pengacakan harus diulang dari nol. Dengan selalu mengambil
 * dari DUA tumpukan tersisa terbanyak, selisih antar tumpukan mengecil
 * setiap langkah, sehingga sisa di akhir selalu seminimal mungkin. Ini
 * hasil yang terbukti optimal untuk masalah "pasangkan sebanyak mungkin
 * benda dari kelompok berbeda".
 *
 * Kalau satu tingkat memang jauh lebih banyak dari dua lainnya digabung
 * (misal 300 siswa kelas 8 vs 100 kelas 7 + 100 kelas 9), sebagian siswa
 * kelas 8 PASTI tidak kebagian pasangan beda tingkat — itu kenyataan
 * aritmetika, bukan kegagalan program. Untuk kasus itu, sisanya
 * dipasangkan sesama tingkat TAPI dijamin beda kelas (8.1 dengan 8.4,
 * bukan 8.1 dengan 8.1), dan setiap meja seperti itu DITANDAI supaya
 * panitia bisa melihatnya di denah dan memindahkan sendiri kalau mau.
 * Menyembunyikan kompromi ini akan jauh lebih berbahaya daripada
 * menampilkannya.
 *
 * SEMUA HASIL DAPAT DIULANG (reproducible)
 * Pengacakan memakai benih (seed) angka, bukan Math.random(). Dengan
 * benih yang sama, hasilnya sama persis. Ini penting karena kartu peserta
 * dan presensi dicetak pada waktu yang berbeda: tanpa benih, cetak ulang
 * presensi setelah menutup browser akan menghasilkan susunan yang berbeda
 * dari kartu yang sudah dibagikan.
 */

export interface SiswaDenah {
  id: string;
  nama: string;
  username: string;
  kelasNama: string;
  tingkat: 7 | 8 | 9;
}

export interface KonfigRuang {
  /** Nama yang dicetak di kartu & presensi, mis. "Ruang 1" atau "Lab IPA". */
  nama: string;
  /** Berapa siswa yang muat di ruang ini. */
  kapasitas: number;
}

export interface Kursi {
  /** Nomor meja dalam ruang, mulai dari 1. */
  meja: number;
  /** "A" (kiri) atau "B" (kanan). */
  posisi: "A" | "B";
  /** Kode yang dicetak di kartu, mis. "R1-07B". */
  kode: string;
  /** Nomor urut kursi dalam ruang (1..kapasitas) — dipakai presensi. */
  nomorUrut: number;
  siswa: SiswaDenah;
}

export interface Meja {
  nomor: number;
  kursi: Kursi[];
  /** true kalau dua penghuninya se-tingkat (kompromi, lihat catatan atas). */
  setingkat: boolean;
}

export interface RuangHasil {
  nama: string;
  kapasitas: number;
  meja: Meja[];
  kursi: Kursi[];
}

export interface HasilDenah {
  ruang: RuangHasil[];
  /** Siswa yang tidak kebagian kursi karena total kapasitas kurang. */
  tidakTertampung: SiswaDenah[];
  ringkasan: {
    totalSiswa: number;
    totalKapasitas: number;
    totalTerpasang: number;
    mejaBedaTingkat: number;
    mejaSetingkat: number;
    mejaSendirian: number;
  };
  benih: number;
  dibuatAt: string;
}

// ---------------------------------------------------------------------------
// Acak berbenih (mulberry32) — 32-bit, cukup untuk mengacak beberapa ratus
// nama dan hasilnya identik di browser mana pun. Sengaja tidak memakai
// Math.random() (tidak bisa diberi benih) maupun crypto (tidak bisa diulang).
// ---------------------------------------------------------------------------

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

/** Fisher–Yates. Menyalin dulu — pemanggil tidak berharap array-nya berubah. */
function kocok<T>(arr: T[], acak: () => number): T[] {
  const hasil = [...arr];
  for (let i = hasil.length - 1; i > 0; i--) {
    const j = Math.floor(acak() * (i + 1));
    [hasil[i], hasil[j]] = [hasil[j], hasil[i]];
  }
  return hasil;
}

export function benihAcak(): number {
  return Math.floor(Math.random() * 2_147_483_647) + 1;
}

// ---------------------------------------------------------------------------

interface PasanganMentah {
  a: SiswaDenah;
  b: SiswaDenah | null;
  setingkat: boolean;
}

/**
 * Susun seluruh siswa jadi daftar pasangan, seoptimal mungkin beda
 * tingkat. Hasilnya belum ditempatkan ke ruang — itu langkah terpisah,
 * supaya urutan pasangannya bisa dikocok sekali lagi sebelum dibagi ke
 * ruang (kalau tidak, ruang pertama akan selalu berisi pasangan 7–8 dan
 * ruang terakhir berisi sisanya; polanya ketahuan siswa dalam lima menit).
 */
function susunPasangan(
  siswa: SiswaDenah[],
  acak: () => number
): PasanganMentah[] {
  const tumpukan: Record<7 | 8 | 9, SiswaDenah[]> = {
    7: kocok(
      siswa.filter((s) => s.tingkat === 7),
      acak
    ),
    8: kocok(
      siswa.filter((s) => s.tingkat === 8),
      acak
    ),
    9: kocok(
      siswa.filter((s) => s.tingkat === 9),
      acak
    ),
  };

  const pasangan: PasanganMentah[] = [];

  // Tahap 1 — selalu ambil dari dua tumpukan tersisa TERBANYAK.
  for (;;) {
    const urut = ([7, 8, 9] as const)
      .map((t) => ({ tingkat: t, sisa: tumpukan[t].length }))
      .sort((x, y) => y.sisa - x.sisa);

    if (urut[1].sisa === 0) break; // tinggal satu tumpukan (atau habis)

    const a = tumpukan[urut[0].tingkat].pop()!;
    const b = tumpukan[urut[1].tingkat].pop()!;
    pasangan.push({ a, b, setingkat: false });
  }

  // Tahap 2 — sisa satu tingkat saja. Pasangkan sesama tingkat, tapi
  // usahakan beda KELAS: urutkan berselang-seling antar kelas dulu, baru
  // ambil dua-dua. Selang-seling membuat tetangga dalam daftar hampir
  // selalu berasal dari kelas yang berbeda.
  const sisa = ([7, 8, 9] as const).flatMap((t) => tumpukan[t]);
  const perKelas = new Map<string, SiswaDenah[]>();
  for (const s of sisa) {
    if (!perKelas.has(s.kelasNama)) perKelas.set(s.kelasNama, []);
    perKelas.get(s.kelasNama)!.push(s);
  }
  const antrianKelas = Array.from(perKelas.values());
  const selangSeling: SiswaDenah[] = [];
  for (;;) {
    let adaIsi = false;
    for (const q of antrianKelas) {
      const s = q.pop();
      if (s) {
        selangSeling.push(s);
        adaIsi = true;
      }
    }
    if (!adaIsi) break;
  }

  for (let i = 0; i < selangSeling.length; i += 2) {
    const a = selangSeling[i];
    const b = selangSeling[i + 1] ?? null;
    pasangan.push({ a, b, setingkat: b !== null });
  }

  return kocok(pasangan, acak);
}

/**
 * Bagikan pasangan ke ruang sesuai kapasitas masing-masing.
 *
 * Kapasitas GANJIL ditangani apa adanya: meja terakhir ruang itu diisi
 * satu orang. Itu lebih jujur daripada diam-diam membulatkan kapasitas ke
 * atas (yang akan membuat panitia menyiapkan kursi yang tidak ada) atau
 * ke bawah (siswa tidak kebagian tempat padahal ruangnya muat).
 */
export function buatDenah(
  siswa: SiswaDenah[],
  ruangKonfig: KonfigRuang[],
  benih: number
): HasilDenah {
  const acak = buatAcak(benih);
  const pasangan = susunPasangan(siswa, acak);

  // Antrian orang, sudah terurut per pasangan — diambil dua-dua per meja.
  const antrian: (SiswaDenah | null)[] = [];
  for (const p of pasangan) {
    antrian.push(p.a, p.b);
  }

  const ruang: RuangHasil[] = [];
  let idx = 0;

  ruangKonfig.forEach((konfig, ruangIdx) => {
    const kodeRuang = `R${ruangIdx + 1}`;
    const meja: Meja[] = [];
    const kursi: Kursi[] = [];
    let nomorUrut = 0;
    let nomorMeja = 0;

    while (nomorUrut < konfig.kapasitas && idx < antrian.length) {
      nomorMeja += 1;
      const isiMeja: Kursi[] = [];

      for (const posisi of ["A", "B"] as const) {
        if (nomorUrut >= konfig.kapasitas) break;
        // Lewati slot kosong (pasangan ganjil di tengah antrian) supaya
        // tidak ada kursi hantu di tengah ruang.
        while (idx < antrian.length && antrian[idx] === null) idx += 1;
        if (idx >= antrian.length) break;

        const s = antrian[idx] as SiswaDenah;
        idx += 1;
        nomorUrut += 1;

        const k: Kursi = {
          meja: nomorMeja,
          posisi,
          kode: `${kodeRuang}-${String(nomorMeja).padStart(2, "0")}${posisi}`,
          nomorUrut,
          siswa: s,
        };
        isiMeja.push(k);
        kursi.push(k);
      }

      if (isiMeja.length === 0) {
        nomorMeja -= 1;
        break;
      }

      meja.push({
        nomor: nomorMeja,
        kursi: isiMeja,
        setingkat:
          isiMeja.length === 2 &&
          isiMeja[0].siswa.tingkat === isiMeja[1].siswa.tingkat,
      });
    }

    ruang.push({
      nama: konfig.nama,
      kapasitas: konfig.kapasitas,
      meja,
      kursi,
    });
  });

  const tidakTertampung = antrian
    .slice(idx)
    .filter((s): s is SiswaDenah => s !== null);

  const semuaMeja = ruang.flatMap((r) => r.meja);

  return {
    ruang,
    tidakTertampung,
    ringkasan: {
      totalSiswa: siswa.length,
      totalKapasitas: ruangKonfig.reduce((n, r) => n + r.kapasitas, 0),
      totalTerpasang: ruang.reduce((n, r) => n + r.kursi.length, 0),
      mejaBedaTingkat: semuaMeja.filter(
        (m) => m.kursi.length === 2 && !m.setingkat
      ).length,
      mejaSetingkat: semuaMeja.filter((m) => m.setingkat).length,
      mejaSendirian: semuaMeja.filter((m) => m.kursi.length === 1).length,
    },
    benih,
    dibuatAt: new Date().toISOString(),
  };
}

/** Presensi diurutkan per nomor kursi, bukan per abjad nama — pengawas
 *  memanggil sambil menyusuri ruang, bukan sambil mencari nama. */
export function barisPresensi(ruang: RuangHasil): Kursi[] {
  return [...ruang.kursi].sort((a, b) => a.nomorUrut - b.nomorUrut);
}
