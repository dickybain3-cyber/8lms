/**
 * Sisi server tryout: klien Supabase kelas 9 (service_role), cookie sesi
 * siswa tanpa login, tiket sesudah token benar, dan kunci perangkat untuk
 * pembatas salah token.
 *
 * Semua RPC pengerjaan di 0029 hanya bisa dipanggil service_role, jadi
 * SATU-SATUNYA jalan siswa tryout ke database adalah lewat Server Action
 * yang memanggil `bacaSesiTryout()` dulu. Jangan pernah mengirim siswa_id
 * dari browser sebagai bukti identitas.
 */
import { createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSupabaseAdminConfig } from "@/lib/supabase/config";
import { bacaTanda, buatTanda, kunciTurunan } from "@/lib/tryout-tanda";
import {
  COOKIE_SESI_TRYOUT,
  MASA_SESI_JAM,
  MASA_TIKET_MENIT,
} from "@/lib/tryout";

/** Tryout hanya ada di project kelas 9. */
export const JENJANG_TRYOUT = 9 as const;

export function klienTryout() {
  return createAdminClient(JENJANG_TRYOUT);
}

function rahasiaInduk(): string {
  return getSupabaseAdminConfig(JENJANG_TRYOUT).serviceRoleKey;
}

export interface SesiTryout {
  /** event id */
  e: string;
  /** paket id */
  p: string;
  /** siswa id */
  s: string;
  /** nama siswa (tampilan saja) */
  n: string;
  /** kelas (tampilan saja) */
  k: string;
}

export interface TiketTryout {
  e: string;
  p: string;
  pn: string;
}

export async function bacaSesiTryout(): Promise<SesiTryout | null> {
  const raw = (await cookies()).get(COOKIE_SESI_TRYOUT)?.value;
  return bacaTanda<SesiTryout>(raw, kunciTurunan(rahasiaInduk(), "sesi"));
}

/** Hanya dari Server Action / Route Handler. */
export async function tulisSesiTryout(sesi: SesiTryout): Promise<void> {
  const masa = MASA_SESI_JAM * 3600;
  const nilai = buatTanda(sesi, kunciTurunan(rahasiaInduk(), "sesi"), masa);
  (await cookies()).set(COOKIE_SESI_TRYOUT, nilai, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/tryout",
    maxAge: masa,
  });
}

export async function hapusSesiTryout(): Promise<void> {
  (await cookies()).set(COOKIE_SESI_TRYOUT, "", { path: "/tryout", maxAge: 0 });
}

export function buatTiket(t: TiketTryout): string {
  return buatTanda(t, kunciTurunan(rahasiaInduk(), "tiket"), MASA_TIKET_MENIT * 60);
}

export function bacaTiket(raw: string): TiketTryout | null {
  return bacaTanda<TiketTryout>(raw, kunciTurunan(rahasiaInduk(), "tiket"));
}

/**
 * Sidik perangkat untuk pembatas salah token & log masuk. Hash dari IP +
 * User-Agent dengan kunci server — IP mentah tidak pernah disimpan.
 */
export async function kunciKlien(): Promise<string> {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "tanpa-ip";
  const ua = h.get("user-agent") ?? "";
  return createHash("sha256")
    .update(`${kunciTurunan(rahasiaInduk(), "klien")}|${ip}|${ua}`)
    .digest("hex")
    .slice(0, 32);
}

const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuidValid(v: unknown): v is string {
  return typeof v === "string" && POLA_UUID.test(v);
}

/** Pesan error Postgres dari RAISE EXCEPTION -> kalimat untuk siswa. */
export function pesanGalat(e: { message?: string } | null | undefined, cadangan: string): string {
  const m = e?.message ?? "";
  // Pesan RAISE dari 0029 sudah berbahasa Indonesia dan aman ditampilkan.
  if (/^(Paket|Subtes|Siswa|Format|Jawaban)/.test(m)) return m;
  return cadangan;
}
