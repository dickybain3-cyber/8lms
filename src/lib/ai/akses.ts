/**
 * Penjaga bersama untuk semua route `/api/ai/*` — SERVER-ONLY.
 *
 * Aturan aksesnya sama dengan Server Action soal:
 *   - harus login sebagai guru (punya baris di tabel `guru`);
 *   - guru biasa hanya ke jenjang sesinya sendiri;
 *   - admin boleh menyasar jenjang lain lewat `jenjang` di body.
 *
 * Middleware SENGAJA melewati `/api/*` (lihat middleware.ts), jadi
 * pemeriksaan di sini satu-satunya pintu — jangan dilewati.
 *
 * Ada juga pembatas laju sederhana per guru (di memori proses), supaya
 * satu tab yang macet mengulang-ulang permintaan tidak menghabiskan kuota
 * harian 10 kunci sekaligus.
 */

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSesiGuru, pastikanBolehKeJenjang, type SesiGuru } from "@/lib/admin-guard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJenjang, type Jenjang } from "@/lib/jenjang";
import { GalatAi, aiTersedia } from "@/lib/ai/gemini";
import { getJenjangFromServerCookies } from "@/lib/jenjang-server";

export interface KonteksAksesAi {
  sesi: SesiGuru;
  jenjang: Jenjang;
  client: SupabaseClient;
}

const JENDELA_MS = 10 * 60_000;
const MAKS_PER_JENDELA = 80;
const riwayat = new Map<string, number[]>();

function lewatBatasLaju(guruId: string): boolean {
  const sekarang = Date.now();
  const daftar = (riwayat.get(guruId) ?? []).filter((t) => sekarang - t < JENDELA_MS);
  if (daftar.length >= MAKS_PER_JENDELA) {
    riwayat.set(guruId, daftar);
    return true;
  }
  daftar.push(sekarang);
  riwayat.set(guruId, daftar);
  return false;
}

export async function aksesAi(
  jenjangDiminta: unknown
): Promise<KonteksAksesAi | NextResponse> {
  const sesi = await getSesiGuru();
  if (!sesi.guruId || !sesi.jenjang) {
    return gagal("Sesi guru tidak ditemukan. Login ulang lalu coba lagi.", 401);
  }

  const target =
    parseJenjang(jenjangDiminta == null ? null : String(jenjangDiminta)) ?? sesi.jenjang;
  const tidakBoleh = await pastikanBolehKeJenjang(sesi, target);
  if (tidakBoleh) return gagal(tidakBoleh, 403);

  if (lewatBatasLaju(sesi.guruId)) {
    return gagal(
      "Terlalu banyak permintaan AI dalam 10 menit terakhir. Istirahat sebentar lalu lanjutkan.",
      429
    );
  }

  const client = (
    target === sesi.jenjang ? createClient() : createAdminClient(target)
  ) as SupabaseClient;

  return { sesi, jenjang: target, client };
}

export function gagal(pesan: string, status = 400) {
  return NextResponse.json({ error: pesan }, { status });
}

/** Ubah error apa pun jadi respons JSON yang aman ditampilkan. */
export function responsGalat(e: unknown) {
  if (e instanceof GalatAi) return gagal(e.message, e.status);
  console.error("[ai]", e);
  return gagal("Terjadi kesalahan saat menghubungi AI. Coba lagi.", 500);
}

export async function bacaBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await req.json();
    return b && typeof b === "object" ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Untuk Server Component: apakah tombol AI bisa langsung dipakai di
 * jenjang ini (default: jenjang sesi dari cookie)? Hanya memeriksa
 * keberadaan kunci — tidak memanggil Gemini.
 */
export async function aiSiapJenjang(jenjang?: Jenjang | null): Promise<boolean> {
  const j = jenjang ?? getJenjangFromServerCookies();
  return j ? aiTersedia(j) : false;
}
