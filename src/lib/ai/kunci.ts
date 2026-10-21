/**
 * Kunci API dari tabel `ai_kunci` (migrasi 0022) — SERVER-ONLY.
 *
 * Dibaca lewat service_role karena tabelnya sengaja tanpa policy RLS.
 * Hasil disimpan di memori 5 menit per (jenjang, penyedia) supaya tidak
 * ada kueri tambahan di setiap panggilan AI. Kalau tabel belum dibuat
 * atau env service_role belum ada, hasilnya daftar kosong (bukan error)
 * dan aplikasi memakai kunci dari env saja.
 */

import type { Jenjang } from "@/lib/jenjang";

export type PenyediaAi = "gemini" | "pollinations";

const UMUR_CACHE_MS = 5 * 60_000;
const UMUR_CACHE_GAGAL_MS = 60_000;
const cache = new Map<string, { sampai: number; kunci: string[] }>();

export async function kunciDariDatabase(
  jenjang: Jenjang,
  penyedia: PenyediaAi
): Promise<string[]> {
  const id = `${jenjang}:${penyedia}`;
  const ada = cache.get(id);
  if (ada && ada.sampai > Date.now()) return ada.kunci;

  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const client = createAdminClient(jenjang);
    const { data, error } = await client
      .from("ai_kunci")
      .select("kunci")
      .eq("penyedia", penyedia)
      .eq("aktif", true)
      .order("dibuat_at");
    if (error) throw error;
    const kunci = (data ?? [])
      .map((r) => String((r as { kunci: string }).kunci ?? "").trim())
      .filter((k) => k.length > 10);
    cache.set(id, { sampai: Date.now() + UMUR_CACHE_MS, kunci });
    return kunci;
  } catch {
    cache.set(id, { sampai: Date.now() + UMUR_CACHE_GAGAL_MS, kunci: [] });
    return [];
  }
}
