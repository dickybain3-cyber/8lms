/**
 * Pemuat data halaman guru tryout (Server Component). Tryout hanya di
 * project kelas 9; akses: guru kelas 9 atau admin.
 */
import { headers } from "next/headers";
import { getSesiGuru, pastikanBolehKeJenjang } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalisasiBarisRekap, type BarisRekapTryout } from "@/lib/tryout";

export type KlienAdmin = Awaited<ReturnType<typeof createAdminClient>>;

export async function aksesHalamanTryout(): Promise<
  { ok: true; db: KlienAdmin } | { ok: false; pesan: string }
> {
  const sesi = await getSesiGuru();
  const tolak = await pastikanBolehKeJenjang(sesi, 9);
  if (tolak) {
    return {
      ok: false,
      pesan: sesi.guruId
        ? "Tryout hanya untuk kelas 9. Masuk sebagai guru kelas 9, atau gunakan akun admin."
        : tolak,
    };
  }
  return { ok: true, db: await createAdminClient(9) };
}

/** Rekap semua siswa kelas 9 x semua subtes (eventId null = semua tryout). */
export async function muatRekapTryout(
  db: KlienAdmin,
  eventId: string | null
): Promise<{ ok: true; baris: BarisRekapTryout[] } | { ok: false; pesan: string }> {
  const { data, error } = await db.rpc("tryout_rekap_nilai", { p_event_id: eventId });
  if (error) {
    return {
      ok: false,
      pesan: /tryout_rekap_nilai/.test(error.message)
        ? "Fungsi statistik tryout belum ada. Jalankan migrasi 0029_tryout.sql di project kelas 9."
        : "Gagal memuat rekap tryout.",
    };
  }
  return { ok: true, baris: ((data ?? []) as Record<string, unknown>[]).map(normalisasiBarisRekap) };
}

/** URL absolut link tryout untuk dibagikan ke siswa. */
export async function urlTryout(eventId: string): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}/tryout/${eventId}`;
}

export interface PaketAdmin {
  id: string;
  nama: string;
  urutan: number;
  token: string;
  waktu_mulai: string;
  waktu_selesai: string;
  aktif: boolean;
}

export interface SubtesAdmin {
  id: string;
  nama: string;
  tryout_subtes: string;
  durasi_menit: number;
  jumlahSoal: number;
  totalSkor: number;
}

export async function muatSubtesPaket(db: KlienAdmin, paketIds: string[]): Promise<Record<string, SubtesAdmin[]>> {
  if (paketIds.length === 0) return {};
  const { data } = await db
    .from("mapel")
    .select("id, nama, tryout_subtes, durasi_menit, tryout_paket_id, soal(skor)")
    .in("tryout_paket_id", paketIds)
    .order("nama");
  const hasil: Record<string, SubtesAdmin[]> = {};
  for (const m of (data ?? []) as Record<string, unknown>[]) {
    const soal = (m.soal as { skor: number | string }[] | null) ?? [];
    const pid = String(m.tryout_paket_id);
    (hasil[pid] ??= []).push({
      id: String(m.id),
      nama: String(m.nama),
      tryout_subtes: String(m.tryout_subtes ?? ""),
      durasi_menit: Number(m.durasi_menit ?? 0),
      jumlahSoal: soal.length,
      totalSkor: soal.reduce((a, s) => a + Number(s.skor), 0),
    });
  }
  return hasil;
}
