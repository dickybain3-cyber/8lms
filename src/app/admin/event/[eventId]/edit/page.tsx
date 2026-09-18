import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EventEditForm from "./EventEditForm";

export default async function EventEditPage({
  params,
}: {
  params: { eventId: string };
}) {
  const supabase = createClient();

  const { data: event } = await supabase
    .from("event")
    .select("id, nama, tgl_mulai, tgl_selesai, kelas_utama")
    .eq("id", params.eventId)
    .maybeSingle();

  if (!event) {
    notFound();
  }

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
      <h1 className="mb-6 font-serif text-2xl text-ink">Edit Event</h1>
      <EventEditForm event={event} />
    </div>
  );
}
