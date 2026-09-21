import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { jenisEventValid, pakaiMesinTugas, labelJenisEvent, type JenisEvent } from "@/lib/jenis-event";
import { untukInputDatetime } from "@/lib/tugas";
import TugasForm, { type KelasPilihan } from "../TugasForm";

/**
 * Buat tugas baru di dalam sebuah event berjenis assignment.
 *
 * Jenis event dicek DI SINI juga, bukan cuma di Server Action, karena
 * halaman ini bisa dibuka langsung lewat URL. Menampilkan form lengkap
 * lalu menolaknya saat Simpan ditekan adalah cara paling menjengkelkan
 * untuk menyampaikan "kamu salah kamar" — apalagi setelah guru mengetik
 * instruksi tugas sepanjang dua paragraf.
 */
export default async function TugasBaruPage({
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

  if (!pakaiMesinTugas(jenis)) {
    return (
      <div>
        <Remah eventId={event.id} nama={event.nama} />
        <h1 className="mb-3 font-serif text-2xl text-ink">Tidak bisa menambah tugas</h1>
        <p className="max-w-lg text-sm text-ink/70">
          Kegiatan <strong>{event.nama}</strong> berjenis{" "}
          <strong>{labelJenisEvent(jenis)}</strong>, dan jenis itu tidak
          memakai tugas. Kalau memang ingin memberi tugas, buat kegiatan baru
          berjenis <strong>Tugas</strong> — jenis kegiatan sengaja tidak bisa
          diubah setelah dibuat, karena isinya tersimpan di tabel yang
          berbeda.
        </p>
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

  // Default yang masuk akal, supaya guru yang hanya ingin "kumpul minggu
  // depan" cukup mengetik judul lalu menekan Simpan: dibuka sekarang,
  // tenggat tujuh hari lagi pukul 23.59. Angka 23.59 dipilih sengaja —
  // tenggat pukul 00.00 secara teknis berarti "sebelum hari itu dimulai",
  // dan itu tidak pernah yang dimaksud siapa pun.
  const sekarang = new Date();
  const tenggatDefault = new Date(sekarang);
  tenggatDefault.setDate(tenggatDefault.getDate() + 7);
  tenggatDefault.setHours(23, 59, 0, 0);

  return (
    <div>
      <Remah eventId={event.id} nama={event.nama} />
      <h1 className="mb-6 font-serif text-2xl text-ink">Tugas Baru</h1>
      <TugasForm
        eventId={event.id}
        kelasList={kelas}
        awal={{
          judul: "",
          deskripsi: "",
          dibuka_at: untukInputDatetime(sekarang.toISOString()),
          tenggat: untukInputDatetime(tenggatDefault.toISOString()),
          skor_maksimal: 100,
          izinkan_terlambat: true,
          minta_teks: true,
          minta_berkas: false,
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
