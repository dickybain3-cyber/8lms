export type Role = "admin" | "siswa";

export type TipeSoal =
  | "pilgan_biasa"
  | "pilgan_kompleks"
  | "uraian_singkat"
  | "benar_salah"
  | "multi_benar_salah"
  | "menjodohkan";

export interface Kelas {
  id: string;
  tingkat: 7 | 8 | 9;
  nama: string; // "7.1", "8.3", dst
}

export interface Siswa {
  id: string;
  auth_id: string;
  nama: string;
  kelas_id: string;
  username: string;
  created_at: string;
}

export interface Guru {
  id: string;
  auth_id: string;
  nama: string;
  created_at: string;
}

export interface Event {
  id: string;
  nama: string;
  tgl_mulai: string;
  tgl_selesai: string;
  kelas_utama: 7 | 8 | 9;
}

export interface Mapel {
  id: string;
  event_id: string;
  nama: string;
  waktu_mulai: string;
  waktu_selesai: string;
  /** Lama pengerjaan per siswa dalam menit, dihitung sejak dia menekan
   *  "Mulai Ujian" — bukan sejak waktu_mulai. `null` berarti siswa bisa
   *  mengerjakan sampai waktu_selesai (perilaku lama, sebelum kolom ini
   *  ada). Lihat penjelasan panjang di src/app/admin/event/actions.ts. */
  durasi_menit: number | null;
}

export interface MapelKelas {
  mapel_id: string;
  kelas_id: string;
}

export interface Soal {
  id: string;
  mapel_id: string;
  tipe: TipeSoal;
  urutan: number;
  skor: number;
  konten_jsonb: Record<string, unknown>;
  gambar_url: string | null;
}

/**
 * Bentuk baris yang dikembalikan RPC `get_soal_untuk_siswa` — sama seperti
 * `Soal` tapi tanpa `mapel_id` (tidak perlu, siswa sudah tahu dari konteks
 * halaman) dan `konten_jsonb`-nya sudah di-strip field kunci jawaban oleh
 * fungsi database (lihat 0006_soal_siswa_rpc.sql). Jangan pernah perlakukan
 * `konten_jsonb` di sini sebagai kalau berisi field kunci — memang tidak.
 */
export interface SoalSiswa {
  id: string;
  tipe: TipeSoal;
  urutan: number;
  skor: number;
  konten_jsonb: Record<string, unknown>;
  gambar_url: string | null;
}

export interface JawabanSiswaRow {
  siswa_id: string;
  mapel_id: string;
  jawaban_jsonb: Record<string, unknown>;
  submitted_at: string | null;
  updated_at: string;
}

/**
 * Baris tabel `nilai` — hasil koreksi otomatis (Sesi 5, lihat
 * 0007_scoring.sql). `detail_jsonb` berbentuk { [soal_id]: skor_didapat }.
 * `is_override` true kalau guru pernah menimpa `total_skor` manual lewat
 * /admin/nilai (lihat `overrideNilai` action) — dibedakan dari hasil murni
 * koreksi otomatis supaya UI bisa menandainya.
 */
export interface NilaiRow {
  siswa_id: string;
  mapel_id: string;
  total_skor: number;
  detail_jsonb: Record<string, number>;
  is_override: boolean;
  dihitung_at: string;
}

/** Baris hasil RPC `get_statistik_mapel()`, dipakai di /admin/statistik. */
export interface StatistikMapel {
  mapel_id: string;
  mapel_nama: string;
  event_id: string;
  event_nama: string;
  waktu_mulai: string;
  waktu_selesai: string;
  jumlah_target: number;
  jumlah_submit: number;
  skor_maksimal: number;
  rata_rata: number | null;
  skor_min: number | null;
  skor_max: number | null;
}

/** Baris hasil RPC `get_distribusi_nilai(p_mapel_id)`. */
export interface DistribusiNilai {
  rentang: string;
  jumlah: number;
}

/**
 * Baris tabel `log_aktivitas` (Sesi 9, lihat 0009_log_aktivitas.sql untuk
 * penjelasan lengkap kapan trigger DB vs pemanggilan manual dipakai).
 * `guru_id` bisa null kalau baris guru yang bersangkutan sudah dihapus —
 * pakai `detail_jsonb.oleh_nama` (snapshot nama, selalu ada) untuk
 * ditampilkan, jangan cuma mengandalkan join ke `guru`.
 */
export interface LogAktivitas {
  id: string;
  guru_id: string | null;
  aksi: string;
  entitas: string;
  entitas_id: string | null;
  detail_jsonb: Record<string, unknown>;
  created_at: string;
}
