import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { untukInputDatetime } from "@/lib/tugas";
import { hitungDampakHapusForum } from "../actions";
import ForumTopikForm, { type KelasPilihan } from "../ForumTopikForm";
import TombolHapusForum from "../TombolHapusForum";

/**
 * Pengaturan forum: jadwal + kelas target + hapus.
 *
 * Rute ini sengaja TIDAK menyertakan `forumTopikId` di path (beda dari
 * `tugas/[tugasId]/edit`, yang perlu karena satu event bisa punya banyak
 * tugas) — satu event forum cuma punya satu forum_topik yang relevan
 * (lihat kepala 0020_forum.sql), jadi `event_id` sudah cukup untuk
 * menemukannya.
 */
export default async function ForumEditPage({
  params,
}: {
  params: { eventId: string };
}) {
  const supabase = createClient();

  const { data: event } = await supabase
    .from("event")
    .select("id, nama")
    .eq("id", params.eventId)
    .maybeSingle();

  if (!event) {
    notFound();
  }

  const { data: topik } = await supabase
    .from("forum_topik")
    .select("id, dibuka_at, ditutup_at")
    .eq("event_id", params.eventId)
    .maybeSingle();

  if (!topik) {
    notFound();
  }

  const [{ data: kelasList }, { data: kelasTerpilih }, dampak] =
    await Promise.all([
      supabase.from("kelas").select("id, nama").order("nama"),
      supabase
        .from("forum_kelas")
        .select("kelas_id")
        .eq("forum_topik_id", topik.id),
      hitungDampakHapusForum(topik.id as string),
    ]);

  const kelas: KelasPilihan[] = (kelasList ?? []).map((k) => ({
    id: k.id as string,
    nama: k.nama as string,
  }));

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-4">
        <Link
          href={`/admin/event/${params.eventId}`}
          className="text-sm text-ink/50 hover:text-ink"
        >
          ← {event.nama}
        </Link>
        <TombolHapusForum
          eventId={params.eventId}
          forumTopikId={topik.id as string}
          dampak={dampak}
        />
      </div>
      <h1 className="mb-6 font-serif text-2xl text-ink">Pengaturan Forum</h1>

      <ForumTopikForm
        eventId={params.eventId}
        forumTopikId={topik.id as string}
        kelasList={kelas}
        jumlahPesan={dampak.jumlahPesan}
        awal={{
          // Konversi ke bentuk datetime-local dilakukan DI SINI, di Server
          // Component — lihat alasan panjangnya di `untukInputDatetime()`
          // (src/lib/tugas.ts, dipakai bersama karena aturannya sama
          // persis untuk kedua mesin).
          dibuka_at: untukInputDatetime(topik.dibuka_at as string),
          ditutup_at: untukInputDatetime(topik.ditutup_at as string),
          kelasIds: (kelasTerpilih ?? []).map((k) => k.kelas_id as string),
        }}
      />
    </div>
  );
}
