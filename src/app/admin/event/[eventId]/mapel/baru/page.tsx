import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MapelForm from "./MapelForm";

export default async function MapelBaruPage({
  params,
}: {
  params: { eventId: string };
}) {
  const supabase = createClient();

  const { data: event } = await supabase
    .from("event")
    .select("id, nama, kelas_utama")
    .eq("id", params.eventId)
    .maybeSingle();

  if (!event) {
    notFound();
  }

  const { data: kelasList } = await supabase
    .from("kelas")
    .select("id, nama")
    .eq("tingkat", event.kelas_utama)
    .order("nama");

  return (
    <div>
      <div className="mb-1">
        <Link
          href={`/admin/event/${event.id}`}
          className="text-sm text-ink/50 hover:text-ink"
        >
          ← {event.nama}
        </Link>
      </div>
      <h1 className="mb-6 font-serif text-2xl text-ink">Tambah Mapel</h1>
      <MapelForm eventId={event.id} kelasList={kelasList ?? []} />
    </div>
  );
}
