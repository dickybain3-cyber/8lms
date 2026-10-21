/**
 * Bersih-bersih data kegiatan — SERVER-ONLY (dipanggil dengan client
 * service_role dari `src/app/admin/bersih-data/actions.ts`).
 *
 * Dua mode, karena "membersihkan" punya dua arti yang sama-sama wajar:
 *
 *   "data_siswa" — KOSONGKAN HASIL, kegiatan tetap ada.
 *       Menghapus jawaban ujian, nilai, pengumpulan tugas (beserta berkas
 *       di Storage), pesan & poin forum. Kegiatan, mapel, soal, tugas, dan
 *       topik forum TETAP — bisa dipakai lagi tahun depan / untuk uji coba
 *       ulang tanpa input soal dari nol.
 *
 *   "total" — HAPUS KEGIATAN BESERTA SEMUA ISINYA.
 *       Menghapus baris `event`; cascade di 0002/0003/0004/0019/0020
 *       ikut menghapus mapel, soal, jawaban, nilai, tugas, pengumpulan,
 *       forum. Berkas tugas di Storage dihapus lebih dulu (Storage tidak
 *       ikut cascade).
 *
 * Yang TIDAK pernah disentuh, di mode mana pun:
 *   - Bank Soal — salinan soal di sana sengaja terpisah (0014), jadi soal
 *     dari kegiatan yang dihapus total tetap bisa dipakai lagi.
 *   - Data siswa/guru/kelas dan log aktivitas.
 *   - Gambar di Cloudinary — preset unggah "unsigned" tidak bisa menghapus;
 *     gambar yang tak terpakai dibersihkan dari dashboard Cloudinary.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type ModeBersih = "data_siswa" | "total";

/** Kata yang harus diketik persis untuk mengonfirmasi pembersihan. */
export const KATA_KONFIRMASI = "HAPUS";

export interface RingkasanKegiatan {
  id: string;
  nama: string;
  jenis: string | null;
  tglMulai: string;
  tglSelesai: string;
  selesai: boolean;
  mapel: number;
  soal: number;
  jawaban: number;
  nilai: number;
  tugas: number;
  pengumpulan: number;
  berkas: number;
  forum: number;
  pesan: number;
}

async function hitung(
  db: SupabaseClient,
  tabel: string,
  kolom: string,
  ids: string[],
  hanyaBerberkas = false
): Promise<number> {
  if (ids.length === 0) return 0;
  let q = db.from(tabel).select(kolom, { count: "exact", head: true }).in(kolom, ids);
  if (hanyaBerberkas) q = q.not("berkas_path", "is", null);
  const { count, error } = await q;
  return error ? 0 : count ?? 0;
}

async function idAnak(db: SupabaseClient, tabel: string, eventIds: string[]) {
  if (eventIds.length === 0) return [] as { id: string; event_id: string }[];
  const { data, error } = await db.from(tabel).select("id, event_id").in("event_id", eventIds);
  // Tabel tugas/forum belum tentu ada (migrasi 0019/0020) — anggap kosong.
  return error ? [] : ((data ?? []) as { id: string; event_id: string }[]);
}

export async function ringkasDataKegiatan(db: SupabaseClient): Promise<RingkasanKegiatan[]> {
  const lengkap = await db
    .from("event")
    .select("id, nama, jenis, tgl_mulai, tgl_selesai")
    .order("tgl_mulai", { ascending: false });
  const dasar = lengkap.error
    ? await db.from("event").select("id, nama, tgl_mulai, tgl_selesai").order("tgl_mulai", { ascending: false })
    : lengkap;
  const events = (dasar.data ?? []) as {
    id: string;
    nama: string;
    jenis?: string | null;
    tgl_mulai: string;
    tgl_selesai: string;
  }[];

  const ids = events.map((e) => e.id);
  const [mapel, tugas, forum] = await Promise.all([
    idAnak(db, "mapel", ids),
    idAnak(db, "tugas", ids),
    idAnak(db, "forum_topik", ids),
  ]);
  const hariIni = new Date().toISOString().slice(0, 10);

  return Promise.all(
    events.map(async (e) => {
      const m = mapel.filter((x) => x.event_id === e.id).map((x) => x.id);
      const t = tugas.filter((x) => x.event_id === e.id).map((x) => x.id);
      const f = forum.filter((x) => x.event_id === e.id).map((x) => x.id);
      const [soal, jawaban, nilai, pengumpulan, berkas, pesan] = await Promise.all([
        hitung(db, "soal", "mapel_id", m),
        hitung(db, "jawaban_siswa", "mapel_id", m),
        hitung(db, "nilai", "mapel_id", m),
        hitung(db, "pengumpulan_tugas", "tugas_id", t),
        hitung(db, "pengumpulan_tugas", "tugas_id", t, true),
        hitung(db, "forum_pesan", "forum_topik_id", f),
      ]);
      return {
        id: e.id,
        nama: e.nama,
        jenis: e.jenis ?? null,
        tglMulai: e.tgl_mulai,
        tglSelesai: e.tgl_selesai,
        selesai: e.tgl_selesai < hariIni,
        mapel: m.length,
        soal,
        jawaban,
        nilai,
        tugas: t.length,
        pengumpulan,
        berkas,
        forum: f.length,
        pesan,
      };
    })
  );
}

export interface HasilBersih {
  kegiatan: number;
  jawaban: number;
  nilai: number;
  pengumpulan: number;
  berkas: number;
  pesan: number;
  peringatan: string[];
}

/** Hapus baris `tabel` dengan `kolom` ∈ ids, mengembalikan jumlahnya. */
async function hapusDi(db: SupabaseClient, tabel: string, kolom: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const { count, error } = await db.from(tabel).delete({ count: "exact" }).in(kolom, ids);
  if (error) throw new Error(`Gagal menghapus ${tabel}: ${error.message}`);
  return count ?? 0;
}

async function hapusBerkasTugas(db: SupabaseClient, tugasIds: string[], peringatan: string[]): Promise<number> {
  if (tugasIds.length === 0) return 0;
  const { data, error } = await db
    .from("pengumpulan_tugas")
    .select("berkas_path")
    .in("tugas_id", tugasIds)
    .not("berkas_path", "is", null);
  if (error) return 0;
  const paths = (data ?? []).map((r) => String((r as { berkas_path: string }).berkas_path)).filter(Boolean);
  let terhapus = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const potong = paths.slice(i, i + 100);
    const { error: e } = await db.storage.from("tugas").remove(potong);
    if (e) peringatan.push(`Sebagian berkas tugas gagal dihapus dari Storage (${e.message}).`);
    else terhapus += potong.length;
  }
  return terhapus;
}

export async function bersihkanKegiatan(
  db: SupabaseClient,
  eventIds: string[],
  mode: ModeBersih
): Promise<HasilBersih> {
  const peringatan: string[] = [];
  const [mapel, tugas, forum] = await Promise.all([
    idAnak(db, "mapel", eventIds),
    idAnak(db, "tugas", eventIds),
    idAnak(db, "forum_topik", eventIds),
  ]);
  const mapelIds = mapel.map((m) => m.id);
  const tugasIds = tugas.map((t) => t.id);
  const forumIds = forum.map((f) => f.id);

  // Berkas dulu: setelah barisnya hilang, path-nya tidak bisa ditemukan lagi.
  const berkas = await hapusBerkasTugas(db, tugasIds, peringatan);

  // Hitung dulu untuk laporan (mode total menghapus lewat cascade).
  const hasil: HasilBersih = {
    kegiatan: 0,
    jawaban: 0,
    nilai: 0,
    pengumpulan: 0,
    berkas,
    pesan: 0,
    peringatan,
  };

  if (mode === "total") {
    const [jawaban, nilai, pengumpulan, pesan] = await Promise.all([
      hitung(db, "jawaban_siswa", "mapel_id", mapelIds),
      hitung(db, "nilai", "mapel_id", mapelIds),
      hitung(db, "pengumpulan_tugas", "tugas_id", tugasIds),
      hitung(db, "forum_pesan", "forum_topik_id", forumIds),
    ]);
    Object.assign(hasil, { jawaban, nilai, pengumpulan, pesan });
    hasil.kegiatan = await hapusDi(db, "event", "id", eventIds);
    return hasil;
  }

  // mode data_siswa — urutan aman terhadap FK (reaksi ikut cascade pesan).
  hasil.nilai = await hapusDi(db, "nilai", "mapel_id", mapelIds);
  hasil.jawaban = await hapusDi(db, "jawaban_siswa", "mapel_id", mapelIds);
  if (tugasIds.length) hasil.pengumpulan = await hapusDi(db, "pengumpulan_tugas", "tugas_id", tugasIds);
  if (forumIds.length) {
    await hapusDi(db, "forum_poin", "forum_topik_id", forumIds).catch(() => 0);
    hasil.pesan = await hapusDi(db, "forum_pesan", "forum_topik_id", forumIds);
  }
  hasil.kegiatan = eventIds.length;
  return hasil;
}
