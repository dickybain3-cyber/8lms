import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import SoalForm from "@/components/admin/SoalForm/SoalForm";
import { cekMapelSudahDikerjakan } from "@/app/admin/event/actions";
import { ambilSoalAdmin } from "@/lib/supabase/admin-multi";
import { getSesiGuru } from "@/lib/admin-guard";
import { parseJenjang, type Jenjang } from "@/lib/jenjang";
import JenjangSwitcher from "@/components/admin/JenjangSwitcher";
import BadgeJenjang from "@/components/admin/BadgeJenjang";
import type { TipeSoal } from "@/types";

/** Sama seperti di soal/baru/page.tsx — query langsung, cuma butuh `nama`
 *  mapel untuk breadcrumb. */
async function ambilMapelAdmin(jenjang: Jenjang, eventId: string, mapelId: string) {
  const client = createAdminClient(jenjang);
  const { data } = await client
    .from("mapel")
    .select("id, nama, event_id")
    .eq("id", mapelId)
    .eq("event_id", eventId)
    .maybeSingle();
  return data;
}

/**
 * `cekMapelSudahDikerjakan()` (src/app/admin/event/actions.ts) cookie-bound
 * seperti `hitungDampakHapusMapel` — di luar scope sesi ini untuk dibuat
 * varian admin-nya di admin-multi.ts, jadi dihitung langsung di sini lewat
 * service_role, sama persis query-nya (jumlah siswa yang `submitted_at`
 * terisi di mapel ini).
 */
async function cekMapelSudahDikerjakanAdmin(
  jenjang: Jenjang,
  mapelId: string
): Promise<number> {
  const client = createAdminClient(jenjang);
  const { count } = await client
    .from("jawaban_siswa")
    .select("siswa_id", { count: "exact", head: true })
    .eq("mapel_id", mapelId)
    .not("submitted_at", "is", null);
  return count ?? 0;
}

/**
 * Halaman Edit Soal — pola percabangan sama persis dengan
 * soal/baru/page.tsx (baca komentarnya kalau ragu). Bedanya di sini juga
 * perlu memuat SATU soal yang mau diedit; untuk jalur admin dipakai
 * `ambilSoalAdmin()` yang SUDAH ADA di admin-multi.ts (bukan dibuat baru).
 */
export default async function SoalEditPage({
  params,
  searchParams,
}: {
  params: { eventId: string; mapelId: string; soalId: string };
  searchParams: { jenjang?: string };
}) {
  const sesi = await getSesiGuru();
  const jenjangQuery = parseJenjang(searchParams.jenjang);
  const modeAdmin = sesi.isAdmin && jenjangQuery !== null;

  if (modeAdmin) {
    const jenjang = jenjangQuery as Jenjang;

    const [mapel, soal, jumlahSudahSubmit] = await Promise.all([
      ambilMapelAdmin(jenjang, params.eventId, params.mapelId),
      ambilSoalAdmin(jenjang, params.soalId),
      cekMapelSudahDikerjakanAdmin(jenjang, params.mapelId),
    ]);

    const switcherHref = (j: Jenjang) =>
      `/admin/event/${params.eventId}/mapel/${params.mapelId}/soal/${params.soalId}/edit?jenjang=${j}`;

    if (!mapel || !soal || soal.mapel_id !== params.mapelId) {
      return (
        <div>
          <div className="mb-4">
            <JenjangSwitcher jenjangAktif={jenjang} buatHref={switcherHref} />
          </div>
          <p className="text-sm text-ink/50">
            Mapel atau soal ini tidak ditemukan di kelas {jenjang}.
          </p>
        </div>
      );
    }

    return (
      <div>
        <div className="mb-4">
          <JenjangSwitcher jenjangAktif={jenjang} buatHref={switcherHref} />
        </div>
        <div className="mb-1">
          <Link
            href={`/admin/event/${params.eventId}/mapel/${params.mapelId}?jenjang=${jenjang}`}
            className="text-sm text-ink/50 hover:text-ink"
          >
            ← {mapel.nama}
          </Link>
        </div>
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <h1 className="font-serif text-2xl text-ink">Edit Soal</h1>
          <BadgeJenjang jenjang={jenjang} />
        </div>
        <SoalForm
          eventId={params.eventId}
          mapelId={params.mapelId}
          jenjang={jenjang}
          soalAwal={{
            id: soal.id,
            tipe: soal.tipe as TipeSoal,
            skor: Number(soal.skor),
            gambar_url: soal.gambar_url,
            konten_jsonb: soal.konten_jsonb as Record<string, unknown>,
          }}
          jumlahSudahSubmit={jumlahSudahSubmit}
        />
      </div>
    );
  }

  // Guru biasa — jalur cookie-bound lama, tidak berubah.
  const supabase = createClient();

  const { data: mapel } = await supabase
    .from("mapel")
    .select("id, nama, event_id")
    .eq("id", params.mapelId)
    .eq("event_id", params.eventId)
    .maybeSingle();

  if (!mapel) {
    notFound();
  }

  const { data: soal } = await supabase
    .from("soal")
    .select("id, tipe, skor, gambar_url, konten_jsonb")
    .eq("id", params.soalId)
    .eq("mapel_id", params.mapelId)
    .maybeSingle();

  if (!soal) {
    notFound();
  }

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
      <h1 className="mb-6 font-serif text-2xl text-ink">Edit Soal</h1>
      <SoalForm
        eventId={params.eventId}
        mapelId={params.mapelId}
        soalAwal={{
          id: soal.id,
          tipe: soal.tipe as TipeSoal,
          skor: Number(soal.skor),
          gambar_url: soal.gambar_url,
          konten_jsonb: soal.konten_jsonb as Record<string, unknown>,
        }}
        jumlahSudahSubmit={jumlahSudahSubmit}
      />
    </div>
  );
}