import { redirect } from "next/navigation";
import { bacaSesiTryout, klienTryout, uuidValid } from "@/lib/tryout-server";
import { acakSoalUntukSiswa } from "@/lib/acak-soal";
import type { SoalSiswa } from "@/types";
import TryoutExamClient from "./TryoutExamClient";

export const dynamic = "force-dynamic";

/**
 * Membuka halaman ini = memulai / melanjutkan subtes (RPC idempoten:
 * mulai_at tidak pernah ditimpa). Link ke sini sengaja `prefetch={false}`
 * dan hanya muncul setelah siswa menekan "Mulai" di dialog konfirmasi.
 */
export default async function HalamanKerjakan(props: {
  params: Promise<{ eventId: string; mapelId: string }>;
}) {
  const { eventId, mapelId } = await props.params;
  const portal = `/tryout/${eventId}`;
  if (!uuidValid(eventId) || !uuidValid(mapelId)) redirect(portal);

  const sesi = await bacaSesiTryout();
  if (!sesi || sesi.e !== eventId) redirect(portal);

  const db = await klienTryout();
  const mulai = await db.rpc("tryout_mulai_subtes", {
    p_paket_id: sesi.p,
    p_siswa_id: sesi.s,
    p_mapel_id: mapelId,
  });
  const baris = (mulai.data as Record<string, unknown>[] | null)?.[0];
  if (mulai.error || !baris) redirect(`${portal}?pesan=sesi`);
  if (baris.submitted_at) redirect(`${portal}?pesan=selesai`);

  const [soalRes, mapelRes] = await Promise.all([
    db.rpc("tryout_soal", { p_paket_id: sesi.p, p_siswa_id: sesi.s, p_mapel_id: mapelId }),
    db.from("mapel").select("nama").eq("id", mapelId).maybeSingle(),
  ]);
  // Gagal ambil soal di sini hampir selalu = waktu baru saja habis.
  if (soalRes.error) redirect(`${portal}?pesan=selesai`);

  const soal = acakSoalUntukSiswa(
    ((soalRes.data ?? []) as Record<string, unknown>[]).map((s) => ({
      id: String(s.id),
      tipe: s.tipe as SoalSiswa["tipe"],
      urutan: Number(s.urutan),
      skor: Number(s.skor),
      konten_jsonb: (s.konten_jsonb ?? {}) as Record<string, unknown>,
      gambar_url: (s.gambar_url as string | null) ?? null,
    })),
    `${sesi.s}:${mapelId}`
  );

  return (
    <TryoutExamClient
      eventId={eventId}
      mapelId={mapelId}
      mapelNama={mapelRes.data?.nama ?? "Subtes"}
      siswaId={sesi.s}
      siswaNama={sesi.n}
      soalList={soal}
      jawabanAwal={(baris.jawaban_jsonb ?? {}) as Record<string, unknown>}
      deadline={String(baris.deadline)}
      serverNow={String(baris.server_now)}
    />
  );
}
