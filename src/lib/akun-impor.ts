/**
 * Aturan bersama impor/generate akun siswa & guru — fungsi MURNI, aman
 * dipakai di browser maupun Server Action (tanpa impor khusus server).
 */

/**
 * Daftar mata pelajaran SMP (Kurikulum Merdeka + muatan lokal Jawa Timur).
 * SATU-SATUNYA ejaan yang sah untuk `guru.mapel`: dipakai dropdown form
 * manual, dropdown template Excel, dan pencocokan saat impor — supaya
 * "PJOK", "Penjas", dan "pjok " tidak jadi tiga mapel berbeda.
 */
export const DAFTAR_MAPEL = [
  "Pendidikan Agama Islam dan Budi Pekerti",
  "Pendidikan Agama Kristen dan Budi Pekerti",
  "Pendidikan Agama Katolik dan Budi Pekerti",
  "Pendidikan Agama Hindu dan Budi Pekerti",
  "Pendidikan Agama Buddha dan Budi Pekerti",
  "Pendidikan Pancasila",
  "Bahasa Indonesia",
  "Matematika",
  "Ilmu Pengetahuan Alam",
  "Ilmu Pengetahuan Sosial",
  "Bahasa Inggris",
  "Pendidikan Jasmani, Olahraga, dan Kesehatan",
  "Informatika",
  "Seni Rupa",
  "Seni Musik",
  "Seni Tari",
  "Seni Teater",
  "Prakarya",
  "Bahasa Jawa",
  "Bahasa Madura",
  "Bimbingan dan Konseling",
] as const;

export type Mapel = (typeof DAFTAR_MAPEL)[number];

/** Singkatan yang lazim ditulis staf TU -> nama resmi. */
const ALIAS_MAPEL: Record<string, Mapel> = {
  pai: "Pendidikan Agama Islam dan Budi Pekerti",
  agamaislam: "Pendidikan Agama Islam dan Budi Pekerti",
  pendidikanagamaislam: "Pendidikan Agama Islam dan Budi Pekerti",
  agamakristen: "Pendidikan Agama Kristen dan Budi Pekerti",
  agamakatolik: "Pendidikan Agama Katolik dan Budi Pekerti",
  ppkn: "Pendidikan Pancasila",
  pkn: "Pendidikan Pancasila",
  pancasila: "Pendidikan Pancasila",
  bindo: "Bahasa Indonesia",
  bahasaindo: "Bahasa Indonesia",
  mtk: "Matematika",
  mat: "Matematika",
  ipa: "Ilmu Pengetahuan Alam",
  ips: "Ilmu Pengetahuan Sosial",
  bing: "Bahasa Inggris",
  inggris: "Bahasa Inggris",
  pjok: "Pendidikan Jasmani, Olahraga, dan Kesehatan",
  penjas: "Pendidikan Jasmani, Olahraga, dan Kesehatan",
  penjaskes: "Pendidikan Jasmani, Olahraga, dan Kesehatan",
  tik: "Informatika",
  senibudaya: "Seni Rupa",
  basajawa: "Bahasa Jawa",
  bjawa: "Bahasa Jawa",
  bmadura: "Bahasa Madura",
  bk: "Bimbingan dan Konseling",
};

const normal = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

/**
 * Teks bebas -> nama mapel resmi. "" kalau kosong, null kalau tidak
 * dikenali (pemanggil yang memutuskan: tolak baris atau beri pesan).
 */
export function cocokkanMapel(raw: string | null | undefined): Mapel | "" | null {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const n = normal(s.replace(/\(.*?\)/g, ""));
  for (const m of DAFTAR_MAPEL) if (normal(m) === n || normal(m) === normal(s)) return m;
  return ALIAS_MAPEL[n] ?? null;
}

/** Tanpa i, l, o — supaya tidak tertukar dengan 1 dan 0 saat dibaca dari kartu. */
const HURUF = "abcdefghjkmnpqrstuvwxyz";
const ANGKA = "0123456789";

/**
 * Password guru hasil generate: 4 huruf + 4 angka (mis. "kmrt4821").
 * 8 karakter = batas minimum password guru di halaman profil, jadi guru
 * tidak dipaksa menggantinya hanya karena terlalu pendek.
 */
export function buatPasswordGuru(): string {
  const acak = crypto.getRandomValues(new Uint32Array(8));
  let out = "";
  for (let i = 0; i < 4; i++) out += HURUF[acak[i] % HURUF.length];
  for (let i = 4; i < 8; i++) out += ANGKA[acak[i] % ANGKA.length];
  return out;
}

/** Batas Supabase Auth bawaan: minimal 6; bcrypt membaca 72 byte pertama. */
export const PASSWORD_IMPOR_MIN = 6;
export const PASSWORD_IMPOR_MAKS = 72;

/**
 * Password yang diketik admin / dibaca dari Excel. null = sah.
 * Kosong dianggap sah di sini (pemanggil membuatkan password acak).
 */
export function galatPasswordImpor(pw: string): string | null {
  if (!pw) return null;
  if (/\s/.test(pw)) return "Password tidak boleh berisi spasi.";
  if (pw.length < PASSWORD_IMPOR_MIN) return `Password minimal ${PASSWORD_IMPOR_MIN} karakter.`;
  if (pw.length > PASSWORD_IMPOR_MAKS) return `Password maksimal ${PASSWORD_IMPOR_MAKS} karakter.`;
  return null;
}

/** Urutan kelas alami: 7.2 sebelum 7.10, 7.x sebelum 8.x. */
export function bandingKelas(a: string, b: string): number {
  return a.localeCompare(b, "id", { numeric: true, sensitivity: "base" });
}

/** Kelompokkan baris per kelas, kelas terurut alami, isi terurut nama. */
export function kelompokPerKelas<T extends { kelas: string; nama: string }>(
  baris: T[]
): { kelas: string; baris: T[] }[] {
  const peta = new Map<string, T[]>();
  for (const b of baris) {
    const k = b.kelas || "Tanpa Kelas";
    if (!peta.has(k)) peta.set(k, []);
    peta.get(k)!.push(b);
  }
  return Array.from(peta.keys())
    .sort(bandingKelas)
    .map((kelas) => ({
      kelas,
      baris: peta.get(kelas)!.sort((x, y) => x.nama.localeCompare(y.nama, "id")),
    }));
}

/** Konfirmasi teks untuk hapus seluruh data siswa. */
export const KONFIRMASI_HAPUS_SEMUA_SISWA = "HAPUS SEMUA SISWA";
