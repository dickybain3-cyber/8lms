/**
 * Perhitungan statistik nilai — fungsi MURNI (tanpa database), dipakai halaman
 * Statistik dan diuji di `src/lib/__tests__/statistik.test.ts`.
 *
 * Semua nilai dinormalkan ke skala 0–100 (`total_skor / skor_maks × 100`)
 * supaya mapel dengan skor maksimal berbeda bisa dibandingkan dan dirata-rata
 * dalam satu kegiatan.
 */

export interface Ringkasan {
  jumlah: number;
  rata: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  simpangan: number | null;
}

/** Skor mentah -> nilai 0–100 (1 desimal). Skor maks 0 = tidak bisa dihitung. */
export function nilai100(totalSkor: number, skorMaks: number): number | null {
  if (!Number.isFinite(totalSkor) || !(skorMaks > 0)) return null;
  const n = (totalSkor / skorMaks) * 100;
  return Math.round(Math.min(100, Math.max(0, n)) * 10) / 10;
}

export function bulat1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function ringkas(nilai: readonly number[]): Ringkasan {
  const v = nilai.filter((x) => Number.isFinite(x));
  if (v.length === 0) {
    return { jumlah: 0, rata: null, median: null, min: null, max: null, simpangan: null };
  }
  const urut = [...v].sort((a, b) => a - b);
  const jumlah = v.length;
  const rata = v.reduce((a, b) => a + b, 0) / jumlah;
  const tengah = Math.floor(jumlah / 2);
  const median = jumlah % 2 ? urut[tengah] : (urut[tengah - 1] + urut[tengah]) / 2;
  const varian = v.reduce((a, b) => a + (b - rata) ** 2, 0) / jumlah;
  return {
    jumlah,
    rata: bulat1(rata),
    median: bulat1(median),
    min: urut[0],
    max: urut[jumlah - 1],
    simpangan: bulat1(Math.sqrt(varian)),
  };
}

export interface Rentang {
  label: string;
  dari: number;
  sampai: number;
  jumlah: number;
}

/** Sebaran nilai 0–100 dalam 10 rentang: 0–9, 10–19, …, 90–100. */
export function histogram(nilai: readonly number[]): Rentang[] {
  const hasil: Rentang[] = Array.from({ length: 10 }, (_, i) => ({
    label: i === 9 ? "90–100" : `${i * 10}–${i * 10 + 9}`,
    dari: i * 10,
    sampai: i === 9 ? 100 : i * 10 + 9,
    jumlah: 0,
  }));
  for (const x of nilai) {
    if (!Number.isFinite(x)) continue;
    const i = Math.min(9, Math.max(0, Math.floor(x / 10)));
    hasil[i].jumlah++;
  }
  return hasil;
}

export type Kesukaran = "mudah" | "sedang" | "sulit";

/** Ambang sama dengan fungsi database `get_analisis_butir_soal`: >70 mudah, 30–70 sedang, <30 sulit. */
export function kategoriKesukaran(persenBenar: number): Kesukaran {
  if (persenBenar > 70) return "mudah";
  if (persenBenar >= 30) return "sedang";
  return "sulit";
}

/** Predikat sederhana untuk dibaca guru/wali murid (bukan nilai rapor resmi). */
export function predikat(nilai: number): "A" | "B" | "C" | "D" {
  if (nilai >= 90) return "A";
  if (nilai >= 80) return "B";
  if (nilai >= 70) return "C";
  return "D";
}

/** Kelompokkan nilai per kunci (mis. nama kelas), lalu ringkas per kelompok. */
export function ringkasPerKelompok<T>(
  baris: readonly T[],
  kunci: (b: T) => string,
  ambilNilai: (b: T) => number | null
): { kunci: string; ringkasan: Ringkasan }[] {
  const peta = new Map<string, number[]>();
  for (const b of baris) {
    const k = kunci(b);
    const n = ambilNilai(b);
    if (!peta.has(k)) peta.set(k, []);
    if (n !== null) peta.get(k)!.push(n);
  }
  return Array.from(peta.entries())
    .map(([k, v]) => ({ kunci: k, ringkasan: ringkas(v) }))
    .sort((a, b) => a.kunci.localeCompare(b.kunci, "id", { numeric: true }));
}

export interface ButirHasil {
  soalId: string;
  urutan: number;
  tipe: string;
  skorMaks: number;
  peserta: number;
  benar: number;
  sebagian: number;
  salah: number;
  kosong: number;
  persenBenar: number;
  /** Rata-rata skor yang didapat peserta pada butir ini. */
  rataSkor: number;
  kategori: Kesukaran | null;
}

/**
 * Analisis per butir soal — logika SAMA dengan fungsi SQL
 * `get_analisis_butir_soal` (migrasi 0012), dihitung di aplikasi karena fungsi
 * itu belum terpasang di database mana pun:
 *   skor ≥ maks            -> benar
 *   0 < skor < maks        -> sebagian (soal yang dinilai proporsional)
 *   skor 0 & dijawab       -> salah
 *   tidak dijawab          -> kosong
 * `peserta` HANYA siswa yang sudah mengumpulkan.
 */
export function analisisButir(
  soal: readonly { id: string; urutan: number; tipe: string; skor: number }[],
  peserta: readonly { jawaban: Record<string, unknown>; detail: Record<string, unknown> }[]
): ButirHasil[] {
  return [...soal]
    .sort((a, b) => a.urutan - b.urutan)
    .map((s) => {
      let benar = 0, sebagian = 0, salah = 0, kosong = 0, totalSkor = 0;
      for (const p of peserta) {
        const skor = Number(p.detail?.[s.id] ?? 0) || 0;
        totalSkor += skor;
        const j = p.jawaban?.[s.id];
        const dijawab = j !== undefined && j !== null;
        if (s.skor > 0 && skor >= s.skor) benar++;
        else if (skor > 0) sebagian++;
        else if (dijawab) salah++;
        else kosong++;
      }
      const n = peserta.length;
      const persenBenar = n ? Math.round((benar * 1000) / n) / 10 : 0;
      return {
        soalId: s.id,
        urutan: s.urutan,
        tipe: s.tipe,
        skorMaks: s.skor,
        peserta: n,
        benar,
        sebagian,
        salah,
        kosong,
        persenBenar,
        rataSkor: n ? Math.round((totalSkor * 100) / n) / 100 : 0,
        kategori: n ? kategoriKesukaran(persenBenar) : null,
      };
    });
}
