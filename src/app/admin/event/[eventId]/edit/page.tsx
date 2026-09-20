import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { statusEvent } from "@/lib/event-status";
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

  const sudahSelesai =
    statusEvent(event.tgl_mulai, event.tgl_selesai) === "selesai";

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
      {sudahSelesai && (
        <p className="mb-5 max-w-lg rounded-md border border-gold/30 bg-gold/5 px-3 py-2.5 text-sm text-ink/70">
          Kegiatan ini sudah selesai. Untuk membukanya lagi (mis. ujian
          susulan), ubah <strong>Tanggal selesai</strong> ke hari yang akan
          datang. Jangan lupa perpanjang juga jadwal di mapel yang mau
          dibuka — jendela ujian siswa mengikuti jadwal mapel.
        </p>
      )}
      <EventEditForm event={event} />
    </div>
  );
}
