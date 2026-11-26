"use server";

import { getSesiGuru } from "@/lib/admin-guard";
import { untukSemuaJenjang } from "@/lib/supabase/admin-multi";
import type { Jenjang } from "@/lib/jenjang";

export interface KodePengamanJenjang {
  jenjang: Jenjang;
  kode: string | null;
  berlakuSampai: string | null;
  serverNow: string | null;
  error: string | null;
}

/**
 * Kode pengaman ketiga project (migrasi 0026). Lewat service_role karena
 * akun admin hanya dikenal di project tempat dia login; RPC
 * `get_kode_pengaman` memang hanya boleh dijalankan service_role. Karena
 * itu pemeriksaan admin di baris pertama ini satu-satunya penjaga.
 */
export async function ambilKodePengaman(): Promise<KodePengamanJenjang[]> {
  const sesi = await getSesiGuru();
  if (!sesi.isAdmin) {
    throw new Error("Kode pengaman hanya bisa dilihat akun admin.");
  }

  const hasil = await untukSemuaJenjang(async (client) => {
    const { data, error } = await client.rpc("get_kode_pengaman");
    if (error) {
      throw new Error(
        /get_kode_pengaman/.test(error.message)
          ? "Migrasi 0026_pengaman_ujian.sql belum dijalankan di database ini."
          : error.message
      );
    }
    const row = (Array.isArray(data) ? data[0] : data) as
      | { kode: string; berlaku_sampai: string; server_now: string }
      | undefined;
    return row ? [row] : [];
  });

  return hasil.map((h) => {
    const row = h.data[0];
    return {
      jenjang: h.jenjang,
      kode: row?.kode ?? null,
      berlakuSampai: row?.berlaku_sampai ?? null,
      serverNow: row?.server_now ?? null,
      error: h.error ?? (row ? null : "Database tidak mengembalikan kode."),
    };
  });
}
