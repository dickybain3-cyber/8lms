import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { jenisEventValid, pakaiMesinForum, labelJenisEvent, type JenisEvent } from "@/lib/jenis-event";
import { untukInputDatetime } from "@/lib/tugas";
import ForumTopikForm, { type KelasPilihan } from "../ForumTopikForm";

/**
 * Buat forum baru di dalam sebuah event berjenis forum.
 *
 * Pola sama persis dengan `tugas/baru/page.tsx`: jenis event dicek DI SINI
 * juga, bukan cuma di Server Action, karena halaman ini bisa dibuka
 * langsung lewat URL. Kalau event ini sudah punya forum_topik, halaman
 * ini mengarahkan ke Pengaturan Forum alih-alih menampilkan form yang
 * akan ditolak saat disimpan — lihat `createForumTopik` untuk penjagaan
 * sisi Server Action-nya.
 */
export default async function ForumBaruPage({
  params,
}: {
  params: { eventId: string };
}) {
  const supabase = createClient();

  const lengkap = await supabase
    .from("event")
    .select("id, nama, jenis")
    .eq("id", params.eventId)
    .maybeSingle();

  const event = lengkap.error
    ? (
        await supabase
          .from("event")
          .select("id, nama")
          .eq("id", params.eventId)
          .maybeSingle()
      ).data
    : lengkap.data;

  if (!event) {
    notFound();
  }

  const jenisMentah = (event as { jenis?: unknown }).jenis;
  const jenis: JenisEvent = jenisEventValid(jenisMentah)
    ? jenisMentah
    : "asesmen_akhir";

  if (!pakaiMesinForum(jenis)) {
    return (
      <div>
        <Remah eventId={event.id} nama={event.nama} />
        <h1 className="mb-3 font-serif text-2xl text-ink">
          Tidak bisa membuat forum
        </h1>
        <p className="max-w-lg text-sm text-ink/70">
          Kegiatan <strong>{event.nama}</strong> berjenis{" "}
          <strong>{labelJenisEvent(jenis)}</strong>, dan jenis itu tidak
          memakai forum. Kalau memang ingin membuka diskusi, buat kegiatan
          baru berjenis <strong>Forum Diskusi</strong> — jenis kegiatan
          sengaja tidak bisa diubah setelah dibuat, karena isinya tersimpan
          di tabel yang berbeda.
        </p>
      </div>
    );
  }

  const { data: sudahAda } = await supabase
    .from("forum_topik")
    .select("id")
    .eq("event_id", event.id)
    .maybeSingle();

  if (sudahAda) {
    return (
      <div>
        <Remah eventId={event.id} nama={event.nama} />
        <h1 className="mb-3 font-serif text-2xl text-ink">
          Forum sudah ada
        </h1>
        <p className="mb-4 max-w-lg text-sm text-ink/70">
          Kegiatan <strong>{event.nama}</strong> sudah punya forum. Satu
          event forum cuma boleh punya satu jadwal diskusi — kalau perlu
          mengubah jam buka/tutup atau kelas targetnya, buka Pengaturan
          Forum.
        </p>
        <Link
          href={`/admin/event/${event.id}/forum/edit`}
          className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-ink-light"
        >
          <i className="fas fa-gear" aria-hidden />
          Buka Pengaturan Forum
        </Link>
      </div>
    );
  }

  const { data: kelasList } = await supabase
    .from("kelas")
    .select("id, nama")
    .order("nama");

  const kelas: KelasPilihan[] = (kelasList ?? []).map((k) => ({
    id: k.id as string,
    nama: k.nama as string,
  }));

  // Default: dibuka sekarang, ditutup tiga hari lagi pukul 23.59. Diskusi
  // kelas biasanya berlangsung dalam hitungan hari, bukan hitungan
  // minggu seperti tugas — jendelanya sengaja lebih pendek dari default
  // tenggat tugas (tujuh hari) di Tahap 4.
  const sekarang = new Date();
  const tutupDefault = new Date(sekarang);
  tutupDefault.setDate(tutupDefault.getDate() + 3);
  tutupDefault.setHours(23, 59, 0, 0);

  return (
    <div>
      <Remah eventId={event.id} nama={event.nama} />
      <h1 className="mb-6 font-serif text-2xl text-ink">Forum Baru</h1>
      <ForumTopikForm
        eventId={event.id}
        kelasList={kelas}
        awal={{
          dibuka_at: untukInputDatetime(sekarang.toISOString()),
          ditutup_at: untukInputDatetime(tutupDefault.toISOString()),
          kelasIds: [],
        }}
      />
    </div>
  );
}

function Remah({ eventId, nama }: { eventId: string; nama: string }) {
  return (
    <div className="mb-1">
      <Link
        href={`/admin/event/${eventId}`}
        className="text-sm text-ink/50 hover:text-ink"
      >
        ← {nama}
      </Link>
    </div>
  );
}
