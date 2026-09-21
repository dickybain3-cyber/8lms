import { createClient } from "@/lib/supabase/server";
import {
  ambilDaftarEventMentah,
  type EventAdmin,
} from "@/lib/supabase/admin-multi-event";

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
  try {
    const daftar = await ambilDaftarEventMentah(supabase);
    return { daftar, error: null };
  } catch {
    return { daftar: [], error: "Gagal memuat daftar event." };
  }
}
