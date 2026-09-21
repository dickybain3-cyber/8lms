import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { untukInputDatetime } from "@/lib/tugas";
import TugasForm, { type KelasPilihan } from "../../TugasForm";

export default async function TugasEditPage({
  params,
}: {
  params: { eventId: string; tugasId: string };
}) {
  const supabase = createClient();

  const { data: tugas } = await supabase
    .from("tugas")
    .select(
      "id, event_id, judul, deskripsi, dibuka_at, tenggat, skor_maksimal, izinkan_terlambat, minta_teks, minta_berkas"
    )
    .eq("id", params.tugasId)
    .maybeSingle();

  if (!tugas) {
    notFound();
  }

  const [{ data: kelasList }, { data: kelasTerpilih }, { count: jumlahKumpul }] =
    await Promise.all([
      supabase.from("kelas").select("id, nama").order("nama"),
      supabase
        .from("tugas_kelas")
        .select("kelas_id")
        .eq("tugas_id", params.tugasId),
      supabase
        .from("pengumpulan_tugas")
        .select("siswa_id", { count: "exact", head: true })
        .eq("tugas_id", params.tugasId)
        .not("submitted_at", "is", null),
    ]);

  const kelas: KelasPilihan[] = (kelasList ?? []).map((k) => ({
    id: k.id as string,
    nama: k.nama as string,
  }));

  return (
    <div>
      <div className="mb-1">
        <Link
          href={`/admin/event/${params.eventId}/tugas/${tugas.id}`}
          className="text-sm text-ink/50 hover:text-ink"
        >
          ← {tugas.judul}
        </Link>
      </div>
      <h1 className="mb-6 font-serif text-2xl text-ink">Edit Tugas</h1>

      <TugasForm
        eventId={params.eventId}
        tugasId={tugas.id as string}
        kelasList={kelas}
        adaPengumpulan={jumlahKumpul ?? 0}
        awal={{
          judul: tugas.judul as string,
          deskripsi: (tugas.deskripsi as string) ?? "",
          // Konversi ke bentuk datetime-local dilakukan DI SINI, di Server
          // Component — lihat alasan panjangnya di `untukInputDatetime()`.
          dibuka_at: untukInputDatetime(tugas.dibuka_at as string),
          tenggat: untukInputDatetime(tugas.tenggat as string),
          skor_maksimal: Number(tugas.skor_maksimal),
          izinkan_terlambat: Boolean(tugas.izinkan_terlambat),
          minta_teks: Boolean(tugas.minta_teks),
          minta_berkas: Boolean(tugas.minta_berkas),
          kelasIds: (kelasTerpilih ?? []).map((k) => k.kelas_id as string),
        }}
      />
    </div>
  );
}
