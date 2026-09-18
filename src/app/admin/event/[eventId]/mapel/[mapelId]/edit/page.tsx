import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cekMapelSudahDikerjakan } from "@/app/admin/event/actions";
import MapelEditForm from "./MapelEditForm";

export default async function MapelEditPage({
  params,
}: {
  params: { eventId: string; mapelId: string };
}) {
  const supabase = createClient();

  const { data: mapel } = await supabase
    .from("mapel")
    .select(
      "id, nama, event_id, waktu_mulai, waktu_selesai, durasi_menit, event(nama, kelas_utama)"
    )
    .eq("id", params.mapelId)
    .eq("event_id", params.eventId)
    .maybeSingle();

  if (!mapel) {
    notFound();
  }

  const eventInfo = mapel.event as unknown as {
    nama: string;
    kelas_utama: 7 | 8 | 9;
  } | null;

  const { data: kelasList } = await supabase
    .from("kelas")
    .select("id, nama")
    .eq("tingkat", eventInfo?.kelas_utama ?? 7)
    .order("nama");

  const { data: kelasTerpilih } = await supabase
    .from("mapel_kelas")
    .select("kelas_id")
    .eq("mapel_id", params.mapelId);

  const jumlahSudahSubmit = await cekMapelSudahDikerjakan(params.mapelId);

  return (
    <div>
      <div className="mb-1">
        <Link
          href={`/admin/event/${params.eventId}/mapel/${params.mapelId}`}
          className="text-sm text-ink/50 hover:text-ink"
        >
          ← {mapel.nama}
        </Link>
      </div>
      <h1 className="mb-6 font-serif text-2xl text-ink">Edit Mapel</h1>
      <MapelEditForm
        eventId={params.eventId}
        mapel={mapel}
        kelasList={kelasList ?? []}
        kelasTerpilihAwal={(kelasTerpilih ?? []).map((k) => k.kelas_id)}
        jumlahSudahSubmit={jumlahSudahSubmit}
      />
    </div>
  );
}
