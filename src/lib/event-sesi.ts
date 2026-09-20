import { createClient } from "@/lib/supabase/server";
import type { EventAdmin } from "@/lib/supabase/admin-multi-event";

/**
 * Daftar event untuk jenjang SESI yang sedang login (cookie-bound, kena
 * RLS). Dipakai bersama oleh halaman daftar kegiatan dan dashboard supaya
 * keduanya selalu membaca dengan cara yang sama.
 *
 * SENGAJA tidak ada filter tanggal di sini: event yang sudah selesai harus
 * tetap ikut terbaca. Pengelompokan (berjalan / akan datang / selesai)
 * dilakukan di sisi tampilan lewat `@/lib/event-status`.
 */
export async function muatEventSesi(): Promise<{
  daftar: EventAdmin[];
  error: string | null;
}> {
  const supabase = createClient();
  const { data: events, error } = await supabase
    .from("event")
    .select("id, nama, tgl_mulai, tgl_selesai, kelas_utama, mapel(count)")
    .order("tgl_mulai", { ascending: false });

  const daftar: EventAdmin[] = (events ?? []).map((event) => ({
    id: event.id,
    nama: event.nama,
    tgl_mulai: event.tgl_mulai,
    tgl_selesai: event.tgl_selesai,
    kelas_utama: Number(event.kelas_utama),
    jumlah_mapel: Array.isArray(event.mapel)
      ? ((event.mapel[0] as { count: number } | undefined)?.count ?? 0)
      : 0,
  }));

  return {
    daftar,
    error: error ? "Gagal memuat daftar event." : null,
  };
}
