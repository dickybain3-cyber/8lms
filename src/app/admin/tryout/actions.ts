"use server";

/**
 * Server Action guru untuk tryout kelas 9 (0029).
 *
 * Tryout hanya ada di project kelas 9, jadi semua aksi memakai
 * service_role kelas 9 SETELAH memastikan pemanggil guru kelas 9 atau
 * admin (`pastikanBolehKeJenjang`). Guru kelas 7/8 yang bukan admin
 * ditolak.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSesiGuru, pastikanBolehKeJenjang } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { datetimeLocalKeIsoWib } from "@/lib/waktu-wib";
import {
  SUBTES_BAWAAN,
  buatToken,
  kodeSubtesDariNama,
  normalisasiToken,
  tokenValid,
} from "@/lib/tryout";

export type StatusAksi = { error: string | null; sukses?: string | null };

async function aksesTryout() {
  const sesi = await getSesiGuru();
  const tolak = await pastikanBolehKeJenjang(sesi, 9);
  if (tolak) return { ok: false as const, error: tolak };
  const db = await createAdminClient(9);
  // guru.id hanya berarti di project tempat guru itu login.
  const guruId = sesi.jenjang === 9 ? sesi.guruId : null;
  return { ok: true as const, db, guruId };
}

function teks(fd: FormData, k: string): string {
  return String(fd.get(k) ?? "").trim();
}

function segarkan(eventId: string, paketId?: string) {
  revalidatePath("/admin/tryout");
  revalidatePath(`/admin/tryout/${eventId}`);
  if (paketId) revalidatePath(`/admin/tryout/${eventId}/paket/${paketId}`);
  revalidatePath("/admin/event");
}

// ---------------------------------------------------------------------------
// Kegiatan tryout
// ---------------------------------------------------------------------------

export async function buatTryout(_s: StatusAksi, fd: FormData): Promise<StatusAksi> {
  const a = await aksesTryout();
  if (!a.ok) return { error: a.error };
  const nama = teks(fd, "nama");
  const tglMulai = teks(fd, "tgl_mulai");
  const tglSelesai = teks(fd, "tgl_selesai");
  if (!nama) return { error: "Nama tryout wajib diisi." };
  if (!tglMulai || !tglSelesai) return { error: "Tanggal mulai dan selesai wajib diisi." };
  if (tglSelesai < tglMulai) return { error: "Tanggal selesai tidak boleh sebelum tanggal mulai." };

  const { data, error } = await a.db
    .from("event")
    .insert({
      nama,
      tgl_mulai: tglMulai,
      tgl_selesai: tglSelesai,
      kelas_utama: 9,
      jenis: "tryout",
      created_by: a.guruId,
    })
    .select("id")
    .single();
  if (error || !data) {
    return {
      error: /jenis/.test(error?.message ?? "")
        ? "Database kelas 9 belum mengenal jenis Tryout. Jalankan migrasi 0029_tryout.sql dulu."
        : "Gagal membuat tryout. Coba lagi.",
    };
  }
  segarkan(data.id);
  redirect(`/admin/tryout/${data.id}`);
}

export async function ubahTryout(eventId: string, _s: StatusAksi, fd: FormData): Promise<StatusAksi> {
  const a = await aksesTryout();
  if (!a.ok) return { error: a.error };
  const nama = teks(fd, "nama");
  const tglMulai = teks(fd, "tgl_mulai");
  const tglSelesai = teks(fd, "tgl_selesai");
  if (!nama || !tglMulai || !tglSelesai) return { error: "Nama dan tanggal wajib diisi." };
  if (tglSelesai < tglMulai) return { error: "Tanggal selesai tidak boleh sebelum tanggal mulai." };
  const { error } = await a.db
    .from("event")
    .update({ nama, tgl_mulai: tglMulai, tgl_selesai: tglSelesai })
    .eq("id", eventId)
    .eq("jenis", "tryout");
  if (error) return { error: "Gagal menyimpan. Coba lagi." };
  segarkan(eventId);
  return { error: null, sukses: "Tersimpan." };
}

export async function hapusTryout(eventId: string): Promise<StatusAksi> {
  const a = await aksesTryout();
  if (!a.ok) return { error: a.error };
  const { error } = await a.db.from("event").delete().eq("id", eventId).eq("jenis", "tryout");
  if (error) return { error: "Gagal menghapus tryout." };
  revalidatePath("/admin/tryout");
  revalidatePath("/admin/event");
  redirect("/admin/tryout");
}

// ---------------------------------------------------------------------------
// Paket
// ---------------------------------------------------------------------------

function bacaJendela(fd: FormData): { mulai: string; selesai: string } | string {
  const m = datetimeLocalKeIsoWib(teks(fd, "waktu_mulai"));
  const s = datetimeLocalKeIsoWib(teks(fd, "waktu_selesai"));
  if (!m || !s) return "Jam buka dan jam tutup paket wajib diisi.";
  if (new Date(s) <= new Date(m)) return "Jam tutup harus setelah jam buka.";
  return { mulai: m, selesai: s };
}

function bacaTokenForm(fd: FormData): string | { error: string } {
  const raw = normalisasiToken(teks(fd, "token"));
  const token = raw || buatToken();
  if (!tokenValid(token)) return { error: "Token 4–12 huruf/angka tanpa spasi." };
  return token;
}

function pesanUnik(m: string | undefined): string | null {
  if (/tryout_paket_token_unik/.test(m ?? "")) return "Token itu sudah dipakai paket lain di tryout ini.";
  if (/tryout_paket_urutan_unik/.test(m ?? "")) return "Nomor urut paket sudah dipakai.";
  return null;
}

export async function buatPaket(eventId: string, _s: StatusAksi, fd: FormData): Promise<StatusAksi> {
  const a = await aksesTryout();
  if (!a.ok) return { error: a.error };
  const nama = teks(fd, "nama");
  if (!nama) return { error: "Nama paket wajib diisi." };
  const jendela = bacaJendela(fd);
  if (typeof jendela === "string") return { error: jendela };
  const token = bacaTokenForm(fd);
  if (typeof token !== "string") return token;

  const { data: akhir } = await a.db
    .from("tryout_paket")
    .select("urutan")
    .eq("event_id", eventId)
    .order("urutan", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await a.db
    .from("tryout_paket")
    .insert({
      event_id: eventId,
      nama,
      urutan: (akhir?.urutan ?? 0) + 1,
      token,
      waktu_mulai: jendela.mulai,
      waktu_selesai: jendela.selesai,
      created_by: a.guruId,
    })
    .select("id")
    .single();
  if (error || !data) return { error: pesanUnik(error?.message) ?? "Gagal membuat paket." };

  // Subtes bawaan TKA langsung dibuat bila dicentang.
  const bawaan = fd.getAll("subtes_bawaan").map(String);
  const baris = SUBTES_BAWAAN.filter((s) => bawaan.includes(s.kode)).map((s) => ({
    event_id: eventId,
    nama: s.nama,
    waktu_mulai: jendela.mulai,
    waktu_selesai: jendela.selesai,
    durasi_menit: s.durasi,
    tryout_paket_id: data.id,
    tryout_subtes: s.kode,
  }));
  if (baris.length) {
    const { error: e2 } = await a.db.from("mapel").insert(baris);
    if (e2) {
      segarkan(eventId, data.id);
      redirect(`/admin/tryout/${eventId}/paket/${data.id}?pesan=subtes-gagal`);
    }
  }

  segarkan(eventId, data.id);
  redirect(`/admin/tryout/${eventId}/paket/${data.id}`);
}

export async function ubahPaket(
  eventId: string,
  paketId: string,
  _s: StatusAksi,
  fd: FormData
): Promise<StatusAksi> {
  const a = await aksesTryout();
  if (!a.ok) return { error: a.error };
  const nama = teks(fd, "nama");
  if (!nama) return { error: "Nama paket wajib diisi." };
  const jendela = bacaJendela(fd);
  if (typeof jendela === "string") return { error: jendela };
  const token = normalisasiToken(teks(fd, "token"));
  if (!tokenValid(token)) return { error: "Token 4–12 huruf/angka tanpa spasi." };

  const { error } = await a.db
    .from("tryout_paket")
    .update({
      nama,
      token,
      waktu_mulai: jendela.mulai,
      waktu_selesai: jendela.selesai,
      aktif: fd.get("aktif") === "on",
    })
    .eq("id", paketId)
    .eq("event_id", eventId);
  if (error) return { error: pesanUnik(error.message) ?? "Gagal menyimpan paket." };
  segarkan(eventId, paketId);
  return { error: null, sukses: "Paket tersimpan." };
}

export async function acakUlangToken(eventId: string, paketId: string): Promise<StatusAksi> {
  const a = await aksesTryout();
  if (!a.ok) return { error: a.error };
  for (let i = 0; i < 3; i++) {
    const { error } = await a.db
      .from("tryout_paket")
      .update({ token: buatToken() })
      .eq("id", paketId)
      .eq("event_id", eventId);
    if (!error) {
      segarkan(eventId, paketId);
      return { error: null, sukses: "Token baru dibuat." };
    }
    if (!pesanUnik(error.message)) break;
  }
  return { error: "Gagal membuat token baru." };
}

export async function hapusPaket(eventId: string, paketId: string): Promise<StatusAksi> {
  const a = await aksesTryout();
  if (!a.ok) return { error: a.error };
  const { error } = await a.db.from("tryout_paket").delete().eq("id", paketId).eq("event_id", eventId);
  if (error) return { error: "Gagal menghapus paket." };
  segarkan(eventId);
  redirect(`/admin/tryout/${eventId}`);
}

// ---------------------------------------------------------------------------
// Subtes
// ---------------------------------------------------------------------------

function bacaDurasi(fd: FormData): number | string {
  const d = Number(teks(fd, "durasi_menit"));
  if (!Number.isInteger(d) || d < 1 || d > 600) return "Durasi 1–600 menit.";
  return d;
}

export async function buatSubtes(
  eventId: string,
  paketId: string,
  _s: StatusAksi,
  fd: FormData
): Promise<StatusAksi> {
  const a = await aksesTryout();
  if (!a.ok) return { error: a.error };
  const pilihan = teks(fd, "pilihan");
  const bawaan = SUBTES_BAWAAN.find((s) => s.kode === pilihan);
  const nama = bawaan ? teks(fd, "nama") || bawaan.nama : teks(fd, "nama");
  if (!nama) return { error: "Nama subtes wajib diisi." };
  const kode = bawaan?.kode ?? kodeSubtesDariNama(nama);
  if (!kode) return { error: "Nama subtes harus diawali huruf." };
  const durasi = bacaDurasi(fd);
  if (typeof durasi === "string") return { error: durasi };

  const { data: paket } = await a.db
    .from("tryout_paket")
    .select("waktu_mulai, waktu_selesai")
    .eq("id", paketId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (!paket) return { error: "Paket tidak ditemukan." };

  const { error } = await a.db.from("mapel").insert({
    event_id: eventId,
    nama,
    waktu_mulai: paket.waktu_mulai,
    waktu_selesai: paket.waktu_selesai,
    durasi_menit: durasi,
    tryout_paket_id: paketId,
    tryout_subtes: kode,
  });
  if (error) {
    return {
      error: /uq_mapel_tryout_paket_subtes/.test(error.message)
        ? "Subtes itu sudah ada di paket ini."
        : "Gagal menambah subtes.",
    };
  }
  segarkan(eventId, paketId);
  return { error: null, sukses: `${nama} ditambahkan.` };
}

export async function ubahSubtes(
  eventId: string,
  paketId: string,
  mapelId: string,
  _s: StatusAksi,
  fd: FormData
): Promise<StatusAksi> {
  const a = await aksesTryout();
  if (!a.ok) return { error: a.error };
  const nama = teks(fd, "nama");
  if (!nama) return { error: "Nama subtes wajib diisi." };
  const durasi = bacaDurasi(fd);
  if (typeof durasi === "string") return { error: durasi };
  const { error } = await a.db
    .from("mapel")
    .update({ nama, durasi_menit: durasi })
    .eq("id", mapelId)
    .eq("tryout_paket_id", paketId);
  if (error) return { error: "Gagal menyimpan subtes." };
  segarkan(eventId, paketId);
  return { error: null, sukses: "Tersimpan." };
}

export async function hapusSubtes(eventId: string, paketId: string, mapelId: string): Promise<StatusAksi> {
  const a = await aksesTryout();
  if (!a.ok) return { error: a.error };
  const { error } = await a.db.from("mapel").delete().eq("id", mapelId).eq("tryout_paket_id", paketId);
  if (error) return { error: "Gagal menghapus subtes." };
  segarkan(eventId, paketId);
  return { error: null, sukses: "Subtes dihapus." };
}

/**
 * Hapus hasil kerja satu siswa di satu subtes supaya bisa mengulang
 * (mis. salah pilih nama / gangguan teknis). Jawaban & nilai hilang.
 */
export async function resetSubtesSiswa(
  eventId: string,
  mapelId: string,
  siswaId: string
): Promise<StatusAksi> {
  const a = await aksesTryout();
  if (!a.ok) return { error: a.error };
  const { data: m } = await a.db
    .from("mapel")
    .select("id")
    .eq("id", mapelId)
    .eq("event_id", eventId)
    .not("tryout_paket_id", "is", null)
    .maybeSingle();
  if (!m) return { error: "Subtes tidak ditemukan." };
  await a.db.from("nilai").delete().eq("mapel_id", mapelId).eq("siswa_id", siswaId);
  const { error } = await a.db.from("jawaban_siswa").delete().eq("mapel_id", mapelId).eq("siswa_id", siswaId);
  if (error) return { error: "Gagal mereset." };
  revalidatePath(`/admin/tryout/statistik`, "layout");
  revalidatePath(`/admin/tryout/${eventId}`, "layout");
  return { error: null, sukses: "Direset. Siswa bisa mengerjakan ulang subtes itu." };
}
