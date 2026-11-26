import { notFound } from "next/navigation";
import { bacaSesiTryout, klienTryout, uuidValid } from "@/lib/tryout-server";
import { KELAS_TRYOUT, formatTanggalJamWib } from "@/lib/tryout";
import GerbangTryout from "./GerbangTryout";
import PortalPaket, { type SubtesPortal } from "./PortalPaket";

export const dynamic = "force-dynamic";

/**
 * Halaman link tryout (satu link untuk semua paket di kegiatan ini).
 *
 *  - Belum punya sesi untuk kegiatan ini -> gerbang: token -> kelas -> nama.
 *  - Sudah punya sesi -> daftar subtes paket itu (urutan bebas).
 *
 * Sesi untuk kegiatan LAIN diabaikan (tidak dihapus) — siswa cukup
 * memasukkan token lagi.
 */
export default async function HalamanTryout(props: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ pesan?: string }>;
}) {
  const { eventId } = await props.params;
  const { pesan } = await props.searchParams;
  if (!uuidValid(eventId)) notFound();

  const db = await klienTryout();
  const { data: event } = await db
    .from("event")
    .select("id, nama, jenis, tgl_mulai, tgl_selesai, ditutup_at")
    .eq("id", eventId)
    .maybeSingle();
  if (!event || event.jenis !== "tryout") notFound();

  const sesi = await bacaSesiTryout();

  if (sesi && sesi.e === eventId) {
    const [{ data: paket }, status] = await Promise.all([
      db.from("tryout_paket").select("id, nama, waktu_mulai, waktu_selesai").eq("id", sesi.p).maybeSingle(),
      db.rpc("tryout_status_paket", { p_paket_id: sesi.p, p_siswa_id: sesi.s }),
    ]);

    if (paket && !status.error) {
      const subtes: SubtesPortal[] = ((status.data ?? []) as Record<string, unknown>[]).map((r) => ({
        mapelId: String(r.mapel_id),
        nama: String(r.nama),
        durasiMenit: Number(r.durasi_menit ?? 0),
        jumlahSoal: Number(r.jumlah_soal ?? 0),
        status: r.status as SubtesPortal["status"],
        deadline: (r.deadline as string | null) ?? null,
        nilai: r.nilai_100 === null || r.nilai_100 === undefined ? null : Number(r.nilai_100),
      }));
      const serverNow = String(
        ((status.data ?? []) as Record<string, unknown>[])[0]?.server_now ?? new Date().toISOString()
      );

      return (
        <PortalPaket
          eventId={eventId}
          eventNama={event.nama}
          paketNama={paket.nama}
          paketTutup={formatTanggalJamWib(paket.waktu_selesai)}
          paketSudahTutup={new Date(paket.waktu_selesai).getTime() < Date.now()}
          siswaNama={sesi.n}
          kelas={sesi.k}
          subtes={subtes}
          serverNow={serverNow}
          pesan={pesan ?? null}
        />
      );
    }
    // Paket dinonaktifkan / ditutup / siswa dipindah: jatuh ke gerbang.
  }

  return (
    <GerbangTryout
      eventId={eventId}
      eventNama={event.nama}
      kelas={[...KELAS_TRYOUT]}
      ditutup={event.ditutup_at !== null}
    />
  );
}
