/**
 * Kuota "Buat Soal dengan AI" (migrasi 0025) — SERVER-ONLY.
 *
 * Aturannya:
 *   - guru biasa: 1 kali generate per hari (tanggal WIB). Admin bisa
 *     menambah +1 untuk hari itu lewat permintaan yang disetujui;
 *   - akun admin (`guru.is_admin`) tidak dibatasi.
 *
 * "Satu kali generate" = satu tiket di `ai_sesi_generate`. Generate terdiri
 * dari beberapa panggilan batch ke /api/ai/soal, dan tiap panggilan harus
 * membawa tiket itu; tiket membatasi jumlah panggilan (jumlah batch + jatah
 * "Ganti soal") dan berlaku 3 jam. Jadi satu kuota tidak bisa dipakai
 * berulang dengan memanggil route-nya langsung.
 *
 * Semua tabel kuota tanpa policy RLS — dibaca/ditulis lewat service_role,
 * di project jenjang tempat guru itu login (baris `guru`-nya ada di sana).
 * Kalau migrasi 0025 belum dijalankan, guru biasa DITOLAK dengan pesan yang
 * menyebut migrasinya (kuota adalah aturan sekolah, jadi tidak dibuka
 * diam-diam), sedangkan admin tetap bisa.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SesiGuru } from "@/lib/admin-guard";
import type { Jenjang } from "@/lib/jenjang";

export const UMUR_TIKET_MS = 3 * 60 * 60_000;
/** Panggilan tambahan di luar jumlah batch: untuk tombol "Ganti soal". */
export const CADANGAN_PANGGILAN = 15;

export const PESAN_MIGRASI =
  "Fitur kuota AI belum aktif di kelas ini. Admin perlu menjalankan migrasi 0025_ai_kuota.sql.";

/** Tanggal hari ini menurut WIB (UTC+7), bentuk YYYY-MM-DD. */
export function tanggalWib(sekarang = Date.now()): string {
  return new Date(sekarang + 7 * 60 * 60_000).toISOString().slice(0, 10);
}

export interface StatusKuota {
  /** false = admin, tidak dibatasi. */
  terbatas: boolean;
  jatah: number;
  terpakai: number;
  sisa: number;
  permintaan: { status: "menunggu" | "disetujui" | "ditolak"; dibuatAt: string } | null;
  /** Diisi kalau tabel kuota belum ada / gagal dibaca. */
  galat: string | null;
}

async function klien(jenjang: Jenjang): Promise<SupabaseClient> {
  return (await createAdminClient(jenjang)) as unknown as SupabaseClient;
}

export async function bacaStatusKuota(sesi: SesiGuru): Promise<StatusKuota> {
  if (sesi.isAdmin) {
    return { terbatas: false, jatah: 0, terpakai: 0, sisa: 0, permintaan: null, galat: null };
  }
  const kosong: StatusKuota = {
    terbatas: true,
    jatah: 1,
    terpakai: 0,
    sisa: 0,
    permintaan: null,
    galat: null,
  };
  if (!sesi.guruId || !sesi.jenjang) return { ...kosong, galat: "Sesi guru tidak ditemukan." };

  try {
    const c = await klien(sesi.jenjang);
    const tanggal = tanggalWib();
    const [kuota, minta] = await Promise.all([
      c
        .from("ai_kuota_harian")
        .select("jatah, terpakai")
        .eq("guru_id", sesi.guruId)
        .eq("tanggal", tanggal)
        .maybeSingle(),
      c
        .from("ai_permintaan_kuota")
        .select("status, dibuat_at")
        .eq("guru_id", sesi.guruId)
        .eq("tanggal", tanggal)
        .order("dibuat_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (kuota.error || minta.error) {
      console.error("[ai-kuota]", kuota.error?.message ?? minta.error?.message);
      return { ...kosong, galat: PESAN_MIGRASI };
    }
    const jatah = Number(kuota.data?.jatah ?? 1);
    const terpakai = Number(kuota.data?.terpakai ?? 0);
    return {
      terbatas: true,
      jatah,
      terpakai,
      sisa: Math.max(0, jatah - terpakai),
      permintaan: minta.data
        ? {
            status: minta.data.status as "menunggu" | "disetujui" | "ditolak",
            dibuatAt: String(minta.data.dibuat_at),
          }
        : null,
      galat: null,
    };
  } catch (e) {
    console.error("[ai-kuota]", e);
    return { ...kosong, galat: PESAN_MIGRASI };
  }
}

/**
 * Pakai satu kuota dan terbitkan tiket generate. Admin mendapat tiket
 * `null` (tidak diperiksa).
 */
export async function terbitkanTiket(
  sesi: SesiGuru,
  jumlahBatch: number
): Promise<{ tiket: string | null; error: null } | { tiket: null; error: string }> {
  if (sesi.isAdmin) return { tiket: null, error: null };
  if (!sesi.guruId || !sesi.jenjang) {
    return { tiket: null, error: "Sesi guru tidak ditemukan. Login ulang lalu coba lagi." };
  }
  try {
    const c = await klien(sesi.jenjang);
    const { data, error } = await c.rpc("ai_pakai_kuota", {
      p_guru_id: sesi.guruId,
      p_tanggal: tanggalWib(),
    });
    if (error) {
      console.error("[ai-kuota] ai_pakai_kuota:", error.message);
      return { tiket: null, error: PESAN_MIGRASI };
    }
    if (!Array.isArray(data) || data.length === 0) {
      return {
        tiket: null,
        error: "Kuota Buat Soal AI hari ini sudah habis. Minta tambahan ke admin.",
      };
    }
    const { data: t, error: eTiket } = await c
      .from("ai_sesi_generate")
      .insert({
        guru_id: sesi.guruId,
        maks_panggilan: Math.max(1, jumlahBatch) + CADANGAN_PANGGILAN,
        kedaluwarsa_at: new Date(Date.now() + UMUR_TIKET_MS).toISOString(),
      })
      .select("id")
      .single();
    if (eTiket || !t) {
      console.error("[ai-kuota] tiket:", eTiket?.message);
      return { tiket: null, error: "Gagal memulai sesi generate. Coba lagi." };
    }
    return { tiket: t.id as string, error: null };
  } catch (e) {
    console.error("[ai-kuota]", e);
    return { tiket: null, error: PESAN_MIGRASI };
  }
}

/** Pakai satu panggilan dari tiket. Mengembalikan pesan galat atau null. */
export async function pakaiTiket(sesi: SesiGuru, tiket: unknown): Promise<string | null> {
  if (sesi.isAdmin) return null;
  if (!sesi.guruId || !sesi.jenjang) return "Sesi guru tidak ditemukan.";
  const id = String(tiket ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return "Sesi generate tidak ditemukan. Mulai generate dari awal.";
  }
  try {
    const c = await klien(sesi.jenjang);
    const { data, error } = await c.rpc("ai_pakai_sesi", { p_id: id, p_guru_id: sesi.guruId });
    if (error) {
      console.error("[ai-kuota] ai_pakai_sesi:", error.message);
      return PESAN_MIGRASI;
    }
    return data === true
      ? null
      : "Sesi generate ini sudah berakhir (lewat 3 jam atau batas panggilan habis). Generate baru memakai kuota berikutnya.";
  } catch (e) {
    console.error("[ai-kuota]", e);
    return PESAN_MIGRASI;
  }
}

export async function ajukanPermintaan(sesi: SesiGuru, alasan: string): Promise<string | null> {
  if (sesi.isAdmin) return "Akun admin tidak dibatasi kuota.";
  if (!sesi.guruId || !sesi.jenjang) return "Sesi guru tidak ditemukan.";
  try {
    const c = await klien(sesi.jenjang);
    const { error } = await c.from("ai_permintaan_kuota").insert({
      guru_id: sesi.guruId,
      guru_nama: sesi.nama,
      alasan: alasan.trim().slice(0, 300) || null,
      tanggal: tanggalWib(),
    });
    if (error) {
      if (error.code === "23505") return "Permintaanmu sebelumnya masih menunggu admin.";
      console.error("[ai-kuota] ajukan:", error.message);
      return PESAN_MIGRASI;
    }
    return null;
  } catch (e) {
    console.error("[ai-kuota]", e);
    return PESAN_MIGRASI;
  }
}

export interface PermintaanKuota {
  id: string;
  jenjang: Jenjang;
  guruNama: string;
  alasan: string | null;
  tanggal: string;
  status: "menunggu" | "disetujui" | "ditolak";
  dibuatAt: string;
  diputusOleh: string | null;
}

/** Untuk dashboard admin: permintaan menunggu + 5 keputusan terakhir. */
export async function daftarPermintaan(jenjang: Jenjang): Promise<{
  menunggu: PermintaanKuota[];
  riwayat: PermintaanKuota[];
  galat: string | null;
}> {
  try {
    const c = await klien(jenjang);
    const kolom = "id, guru_nama, alasan, tanggal, status, dibuat_at, diputus_oleh_nama";
    const [a, b] = await Promise.all([
      c
        .from("ai_permintaan_kuota")
        .select(kolom)
        .eq("status", "menunggu")
        .order("dibuat_at", { ascending: true })
        .limit(50),
      c
        .from("ai_permintaan_kuota")
        .select(kolom)
        .neq("status", "menunggu")
        .order("diputus_at", { ascending: false })
        .limit(5),
    ]);
    if (a.error || b.error) return { menunggu: [], riwayat: [], galat: PESAN_MIGRASI };
    const ubah = (r: Record<string, unknown>): PermintaanKuota => ({
      id: String(r.id),
      jenjang,
      guruNama: String(r.guru_nama ?? "Guru"),
      alasan: (r.alasan as string | null) ?? null,
      tanggal: String(r.tanggal),
      status: r.status as PermintaanKuota["status"],
      dibuatAt: String(r.dibuat_at),
      diputusOleh: (r.diputus_oleh_nama as string | null) ?? null,
    });
    return { menunggu: (a.data ?? []).map(ubah), riwayat: (b.data ?? []).map(ubah), galat: null };
  } catch {
    return { menunggu: [], riwayat: [], galat: PESAN_MIGRASI };
  }
}

export async function putuskanPermintaan(
  jenjang: Jenjang,
  id: string,
  setuju: boolean,
  olehNama: string | null
): Promise<string | null> {
  try {
    const c = await klien(jenjang);
    const { data, error } = await c.rpc("ai_putuskan_permintaan", {
      p_id: id,
      p_setuju: setuju,
      p_tanggal: tanggalWib(),
      p_oleh: olehNama,
    });
    if (error) {
      console.error("[ai-kuota] putuskan:", error.message);
      return PESAN_MIGRASI;
    }
    return data === true ? null : "Permintaan ini sudah diputus sebelumnya.";
  } catch (e) {
    console.error("[ai-kuota]", e);
    return PESAN_MIGRASI;
  }
}
