/**
 * Tryout kelas 9 (migrasi 0029) — fungsi murni: token, kode subtes, dan
 * pengolahan rekap nilai untuk statistik guru & siswa.
 *
 * Tidak mengimpor Supabase / next/headers supaya bisa dipakai di server,
 * client, dan uji (`npx tsx src/lib/__tests__/tryout.test.ts`).
 *
 * Satuan nilai di seluruh file ini: 0–100 per subtes (dihitung database:
 * total skor / skor maksimal x 100). "Nilai paket" = rata-rata nilai subtes
 * yang SUDAH terkumpul; `lengkap` menandai apakah semua subtes paket itu
 * sudah dikerjakan, supaya peringkat tidak diam-diam menyamakan siswa yang
 * baru mengerjakan satu subtes dengan yang sudah semua.
 */

// ---------------------------------------------------------------------------
// Konstanta
// ---------------------------------------------------------------------------

/** Kelas peserta tryout. Sama dengan seed-kelas9.sql. */
export const KELAS_TRYOUT = ["9.1", "9.2", "9.3", "9.4", "9.5", "9.6"] as const;

/** Subtes bawaan (TKA SMP). Kode dipakai menyamakan subtes antar paket. */
export const SUBTES_BAWAAN: { kode: string; nama: string; durasi: number }[] = [
  { kode: "bahasa_indonesia", nama: "Bahasa Indonesia", durasi: 75 },
  { kode: "matematika", nama: "Matematika", durasi: 75 },
];

/** Batas autosave (sama dengan grace 3 menit di 0029). */
export const GRACE_DETIK = 180;

/** Nama cookie sesi tryout (tanpa login). */
export const COOKIE_SESI_TRYOUT = "lms_tryout";

/** Lama sesi tryout setelah memilih nama. */
export const MASA_SESI_JAM = 12;

/** Lama "tiket" setelah token benar, sebelum nama dipilih. */
export const MASA_TIKET_MENIT = 15;

// ---------------------------------------------------------------------------
// Token & kode subtes
// ---------------------------------------------------------------------------

/** Huruf/angka tanpa yang mirip (0/O, 1/I/L) supaya mudah didiktekan. */
const ABJAD_TOKEN = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function buatToken(panjang = 6, acak: (n: number) => number = acakAman): string {
  let hasil = "";
  for (let i = 0; i < panjang; i++) hasil += ABJAD_TOKEN[acak(ABJAD_TOKEN.length)];
  return hasil;
}

function acakAman(n: number): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0] % n;
}

/** Spasi dibuang, huruf kecil -> besar. Sama dengan normalisasi di 0029. */
export function normalisasiToken(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

/** Sama dengan CHECK `token ~ '^[A-Z0-9]{4,12}$'` di 0029. */
export function tokenValid(token: string): boolean {
  return /^[A-Z0-9]{4,12}$/.test(token);
}

/** Nama subtes -> kode (`^[a-z][a-z0-9_]{1,39}$`, CHECK di 0029). */
export function kodeSubtesDariNama(nama: string): string | null {
  const bawaan = SUBTES_BAWAAN.find(
    (s) => s.nama.toLowerCase() === nama.trim().toLowerCase()
  );
  if (bawaan) return bawaan.kode;
  const slug = nama
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[0-9_]+/, "")
    .slice(0, 40);
  return /^[a-z][a-z0-9_]{1,39}$/.test(slug) ? slug : null;
}

// ---------------------------------------------------------------------------
// Rekap
// ---------------------------------------------------------------------------

export type StatusSubtes = "belum" | "mengerjakan" | "selesai";

/** Satu baris RPC `tryout_rekap_nilai` (0029), angka sudah jadi number. */
export interface BarisRekapTryout {
  event_id: string;
  event_nama: string;
  paket_id: string;
  paket_nama: string;
  paket_urutan: number;
  paket_mulai: string;
  mapel_id: string;
  subtes: string;
  subtes_nama: string;
  siswa_id: string;
  siswa_nama: string;
  kelas_nama: string;
  status: StatusSubtes;
  total_skor: number | null;
  skor_maks: number;
  nilai_100: number | null;
  mulai_at: string | null;
  submitted_at: string | null;
}

/** Baris mentah dari Supabase: numeric datang sebagai string. */
export function normalisasiBarisRekap(r: Record<string, unknown>): BarisRekapTryout {
  const angka = (v: unknown): number | null =>
    v === null || v === undefined || v === "" ? null : Number(v);
  return {
    event_id: String(r.event_id),
    event_nama: String(r.event_nama ?? ""),
    paket_id: String(r.paket_id),
    paket_nama: String(r.paket_nama ?? ""),
    paket_urutan: Number(r.paket_urutan ?? 0),
    paket_mulai: String(r.paket_mulai ?? ""),
    mapel_id: String(r.mapel_id),
    subtes: String(r.subtes ?? ""),
    subtes_nama: String(r.subtes_nama ?? ""),
    siswa_id: String(r.siswa_id),
    siswa_nama: String(r.siswa_nama ?? ""),
    kelas_nama: String(r.kelas_nama ?? ""),
    status: (["belum", "mengerjakan", "selesai"].includes(String(r.status))
      ? r.status
      : "belum") as StatusSubtes,
    total_skor: angka(r.total_skor),
    skor_maks: Number(r.skor_maks ?? 0),
    nilai_100: angka(r.nilai_100),
    mulai_at: (r.mulai_at as string | null) ?? null,
    submitted_at: (r.submitted_at as string | null) ?? null,
  };
}

export interface PaketRingkas {
  id: string;
  nama: string;
  eventId: string;
  eventNama: string;
  urutan: number;
  mulai: string;
  /** Subtes di paket ini, urut tetap (lihat `urutkanSubtes`). */
  subtes: { kode: string; nama: string; mapelId: string }[];
}

export interface SubtesRingkas {
  kode: string;
  nama: string;
}

function bulat1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function rataRata(nilai: readonly (number | null)[]): number | null {
  const v = nilai.filter((x): x is number => x !== null && Number.isFinite(x));
  if (v.length === 0) return null;
  return bulat1(v.reduce((a, b) => a + b, 0) / v.length);
}

/** Subtes bawaan dulu (urut SUBTES_BAWAAN), sisanya alfabetis. */
export function urutkanSubtes<T extends { kode: string; nama: string }>(daftar: T[]): T[] {
  const posisi = (k: string) => {
    const i = SUBTES_BAWAAN.findIndex((s) => s.kode === k);
    return i === -1 ? SUBTES_BAWAAN.length : i;
  };
  return [...daftar].sort(
    (a, b) => posisi(a.kode) - posisi(b.kode) || a.nama.localeCompare(b.nama, "id")
  );
}

/** Paket urut kronologis: jam buka, lalu nomor urut. */
export function daftarPaket(rows: readonly BarisRekapTryout[]): PaketRingkas[] {
  const peta = new Map<string, PaketRingkas>();
  for (const r of rows) {
    let p = peta.get(r.paket_id);
    if (!p) {
      p = {
        id: r.paket_id,
        nama: r.paket_nama,
        eventId: r.event_id,
        eventNama: r.event_nama,
        urutan: r.paket_urutan,
        mulai: r.paket_mulai,
        subtes: [],
      };
      peta.set(r.paket_id, p);
    }
    if (!p.subtes.some((s) => s.mapelId === r.mapel_id)) {
      p.subtes.push({ kode: r.subtes, nama: r.subtes_nama, mapelId: r.mapel_id });
    }
  }
  const hasil = [...peta.values()];
  for (const p of hasil) p.subtes = urutkanSubtes(p.subtes);
  return hasil.sort(
    (a, b) =>
      new Date(a.mulai).getTime() - new Date(b.mulai).getTime() || a.urutan - b.urutan
  );
}

/** Semua kode subtes yang muncul di rekap. */
export function daftarSubtes(rows: readonly BarisRekapTryout[]): SubtesRingkas[] {
  const peta = new Map<string, string>();
  for (const r of rows) if (!peta.has(r.subtes)) peta.set(r.subtes, r.subtes_nama);
  return urutkanSubtes([...peta].map(([kode, nama]) => ({ kode, nama })));
}

export interface NilaiPaketSiswa {
  /** kode subtes -> nilai 0–100 (null = belum terkumpul). */
  subtes: Record<string, number | null>;
  /** Rata-rata subtes yang sudah terkumpul. */
  rata: number | null;
  /** true = semua subtes paket ini sudah terkumpul. */
  lengkap: boolean;
  /** Ada subtes yang sedang dikerjakan. */
  sedang: boolean;
}

export interface ProfilSiswaTryout {
  siswaId: string;
  nama: string;
  kelas: string;
  /** paketId -> nilai. */
  paket: Record<string, NilaiPaketSiswa>;
}

export function profilSiswa(rows: readonly BarisRekapTryout[]): ProfilSiswaTryout[] {
  const peta = new Map<string, ProfilSiswaTryout>();
  for (const r of rows) {
    let s = peta.get(r.siswa_id);
    if (!s) {
      s = { siswaId: r.siswa_id, nama: r.siswa_nama, kelas: r.kelas_nama, paket: {} };
      peta.set(r.siswa_id, s);
    }
    let p = s.paket[r.paket_id];
    if (!p) {
      p = { subtes: {}, rata: null, lengkap: true, sedang: false };
      s.paket[r.paket_id] = p;
    }
    p.subtes[r.subtes] = r.status === "selesai" ? r.nilai_100 : null;
    if (r.status !== "selesai") p.lengkap = false;
    if (r.status === "mengerjakan") p.sedang = true;
  }
  for (const s of peta.values()) {
    for (const p of Object.values(s.paket)) p.rata = rataRata(Object.values(p.subtes));
  }
  return [...peta.values()].sort(
    (a, b) => a.kelas.localeCompare(b.kelas, "id", { numeric: true }) || a.nama.localeCompare(b.nama, "id")
  );
}

export type ArahPerubahan = "naik" | "turun" | "tetap";

export interface Perubahan {
  selisih: number;
  arah: ArahPerubahan;
}

/** Selisih b - a. null bila salah satu tidak ada. Batas "tetap": < 0.05. */
export function perubahan(a: number | null, b: number | null): Perubahan | null {
  if (a === null || b === null) return null;
  const selisih = bulat1(b - a);
  return { selisih, arah: Math.abs(selisih) < 0.05 ? "tetap" : selisih > 0 ? "naik" : "turun" };
}

/**
 * Perubahan nilai siswa dari paket pertama yang punya nilai ke paket
 * terakhir yang punya nilai, plus dari paket sebelumnya ke paket terakhir.
 * `kode` null = rata-rata paket; diisi = subtes tertentu.
 */
export function trenSiswa(
  s: ProfilSiswaTryout,
  paketUrut: readonly PaketRingkas[],
  kode: string | null = null
): { titik: { paketId: string; nilai: number | null }[]; awalAkhir: Perubahan | null; terakhir: Perubahan | null } {
  const titik = paketUrut.map((p) => {
    const n = s.paket[p.id];
    const nilai = !n ? null : kode === null ? n.rata : (n.subtes[kode] ?? null);
    return { paketId: p.id, nilai };
  });
  const ada = titik.filter((t) => t.nilai !== null) as { paketId: string; nilai: number }[];
  return {
    titik,
    awalAkhir: ada.length >= 2 ? perubahan(ada[0].nilai, ada[ada.length - 1].nilai) : null,
    terakhir: ada.length >= 2 ? perubahan(ada[ada.length - 2].nilai, ada[ada.length - 1].nilai) : null,
  };
}

export interface BarisPeringkat {
  peringkat: number;
  siswaId: string;
  nama: string;
  kelas: string;
  nilai: number;
  lengkap: boolean;
}

/**
 * Peringkat satu paket (kode null = rata-rata paket) atau satu subtes.
 * Hanya siswa yang punya nilai. Nilai sama = peringkat sama (1, 2, 2, 4).
 * Untuk rata-rata paket, siswa yang belum lengkap tetap tampil tapi
 * ditaruh di bawah siswa yang lengkap.
 */
export function peringkat(
  profil: readonly ProfilSiswaTryout[],
  paketId: string,
  opsi: { kode?: string | null; kelas?: string | null } = {}
): BarisPeringkat[] {
  const kode = opsi.kode ?? null;
  const baris: Omit<BarisPeringkat, "peringkat">[] = [];
  for (const s of profil) {
    if (opsi.kelas && s.kelas !== opsi.kelas) continue;
    const n = s.paket[paketId];
    if (!n) continue;
    const nilai = kode === null ? n.rata : (n.subtes[kode] ?? null);
    if (nilai === null) continue;
    baris.push({
      siswaId: s.siswaId,
      nama: s.nama,
      kelas: s.kelas,
      nilai,
      lengkap: kode === null ? n.lengkap : true,
    });
  }
  baris.sort(
    (a, b) =>
      Number(b.lengkap) - Number(a.lengkap) || b.nilai - a.nilai || a.nama.localeCompare(b.nama, "id")
  );
  const hasil: BarisPeringkat[] = [];
  baris.forEach((b, i) => {
    const sebelum = hasil[i - 1];
    const sama = sebelum && sebelum.nilai === b.nilai && sebelum.lengkap === b.lengkap;
    hasil.push({ ...b, peringkat: sama ? sebelum.peringkat : i + 1 });
  });
  return hasil;
}

export interface RingkasKelompok {
  label: string;
  peserta: number;
  rata: number | null;
  min: number | null;
  max: number | null;
}

function ringkasNilai(label: string, nilai: number[]): RingkasKelompok {
  return {
    label,
    peserta: nilai.length,
    rata: rataRata(nilai),
    min: nilai.length ? Math.min(...nilai) : null,
    max: nilai.length ? Math.max(...nilai) : null,
  };
}

/** Ringkasan per subtes satu paket (seluruh angkatan). */
export function ringkasSubtesPaket(
  rows: readonly BarisRekapTryout[],
  paket: PaketRingkas
): (RingkasKelompok & { kode: string; mapelId: string; mengerjakan: number; belum: number })[] {
  return paket.subtes.map((s) => {
    const baris = rows.filter((r) => r.mapel_id === s.mapelId);
    const nilai = baris
      .filter((r) => r.status === "selesai" && r.nilai_100 !== null)
      .map((r) => r.nilai_100 as number);
    return {
      ...ringkasNilai(s.nama, nilai),
      kode: s.kode,
      mapelId: s.mapelId,
      mengerjakan: baris.filter((r) => r.status === "mengerjakan").length,
      belum: baris.filter((r) => r.status === "belum").length,
    };
  });
}

/** Rata-rata per kelas satu paket: kode null = rata paket; diisi = subtes. */
export function rataPerKelas(
  profil: readonly ProfilSiswaTryout[],
  paketId: string,
  kode: string | null = null
): RingkasKelompok[] {
  const kelasSemua = [...new Set(profil.map((s) => s.kelas))].sort((a, b) =>
    a.localeCompare(b, "id", { numeric: true })
  );
  return kelasSemua.map((k) => {
    const nilai: number[] = [];
    for (const s of profil) {
      if (s.kelas !== k) continue;
      const n = s.paket[paketId];
      const v = !n ? null : kode === null ? (n.lengkap ? n.rata : null) : (n.subtes[kode] ?? null);
      if (v !== null) nilai.push(v);
    }
    return ringkasNilai(k, nilai);
  });
}

// ---------------------------------------------------------------------------
// Nilai siswa sendiri (RPC tryout_nilai_saya)
// ---------------------------------------------------------------------------

export interface BarisNilaiSaya {
  event_nama: string;
  paket_id: string;
  paket_nama: string;
  paket_urutan: number;
  paket_mulai: string;
  subtes: string;
  subtes_nama: string;
  nilai_100: number | null;
  submitted_at: string;
}

export interface PaketSaya {
  paketId: string;
  paketNama: string;
  eventNama: string;
  mulai: string;
  urutan: number;
  subtes: { kode: string; nama: string; nilai: number | null }[];
  rata: number | null;
}

export function kelompokkanNilaiSaya(rows: readonly BarisNilaiSaya[]): PaketSaya[] {
  const peta = new Map<string, PaketSaya>();
  for (const r of rows) {
    let p = peta.get(r.paket_id);
    if (!p) {
      p = {
        paketId: r.paket_id,
        paketNama: r.paket_nama,
        eventNama: r.event_nama,
        mulai: r.paket_mulai,
        urutan: r.paket_urutan,
        subtes: [],
        rata: null,
      };
      peta.set(r.paket_id, p);
    }
    p.subtes.push({
      kode: r.subtes,
      nama: r.subtes_nama,
      nilai: r.nilai_100 === null ? null : Number(r.nilai_100),
    });
  }
  const hasil = [...peta.values()];
  for (const p of hasil) {
    p.subtes = urutkanSubtes(p.subtes);
    p.rata = rataRata(p.subtes.map((s) => s.nilai));
  }
  return hasil.sort(
    (a, b) => new Date(a.mulai).getTime() - new Date(b.mulai).getTime() || a.urutan - b.urutan
  );
}

// ---------------------------------------------------------------------------
// Waktu
// ---------------------------------------------------------------------------

export function formatTanggalJamWib(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
