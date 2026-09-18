import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import SoalForm from "@/components/admin/SoalForm/SoalForm";
import { getSesiGuru } from "@/lib/admin-guard";
import { parseJenjang, type Jenjang } from "@/lib/jenjang";
import JenjangSwitcher from "@/components/admin/JenjangSwitcher";
import BadgeJenjang from "@/components/admin/BadgeJenjang";
import { Info, KepalaHalaman, Remah } from "@/components/ui/Panel";

/**
 * Halaman Tambah Soal.
 *
 * Dua jalur (tidak berubah dari sebelumnya):
 *  - Admin dengan `?jenjang=` valid -> baca lewat service_role, submit
 *    lewat `createSoalAdmin`.
 *  - Guru biasa -> jalur cookie-bound lama.
 *
 * Perbedaan dengan versi lama: kedua jalur kini memakai SATU blok
 * markup. Versi lama menyalin seluruh markup halaman dua kali (sekali
 * per cabang), yang berarti setiap perbaikan tampilan harus diingat
 * untuk dikerjakan dua kali — dan pada praktiknya satu cabang selalu
 * tertinggal.
 *
 * ── TAMBAHAN: `nomorBerikutnya` ──
 *
 * Jumlah soal yang sudah ada dihitung di sini lalu dioper ke form,
 * supaya form bisa menampilkan "Soal ke-13" dan menaikkannya sendiri
 * setiap kali satu soal tersimpan. Ini bukan hiasan: sejak form tidak
 * lagi berpindah halaman setelah menyimpan (alur input berantai),
 * nomor itulah satu-satunya petunjuk bagi guru tentang sudah sampai
 * mana dia — tanpanya, mengisi 50 soal berturut-turut terasa seperti
 * mengetik ke ruang kosong tanpa ujung.
 *
 * Dihitung SEKALI saat halaman dimuat, bukan dibaca ulang setiap kali
 * menyimpan: form yang menaikkan hitungannya sendiri sudah cukup akurat
 * untuk satu orang yang mengetik berurutan, dan membaca ulang ke
 * database tiap simpan hanya menambah jeda di antara dua soal.
 */
async function hitungSoal(
  client: ReturnType<typeof createClient> | ReturnType<typeof createAdminClient>,
  mapelId: string
): Promise<number> {
  const { count } = await client
    .from("soal")
    .select("id", { count: "exact", head: true })
    .eq("mapel_id", mapelId);
  return count ?? 0;
}

export default async function SoalBaruPage({
  params,
  searchParams,
}: {
  params: { eventId: string; mapelId: string };
  searchParams: { jenjang?: string };
}) {
  const sesi = await getSesiGuru();
  const jenjangQuery = parseJenjang(searchParams.jenjang);
  const modeAdmin = sesi.isAdmin && jenjangQuery !== null;

  const jenjang = modeAdmin ? (jenjangQuery as Jenjang) : undefined;
  const client = jenjang ? createAdminClient(jenjang) : createClient();

  const { data: mapel } = await client
    .from("mapel")
    .select("id, nama, event_id")
    .eq("id", params.mapelId)
    .eq("event_id", params.eventId)
    .maybeSingle();

  if (!mapel) {
    if (jenjang) {
      return (
        <div>
          <div className="mb-4">
            <JenjangSwitcher
              jenjangAktif={jenjang}
              buatHref={(j) =>
                `/admin/event/${params.eventId}/mapel/${params.mapelId}/soal/baru?jenjang=${j}`
              }
            />
          </div>
          <p className="text-sm text-slate-500">
            Mapel tidak ditemukan di kelas {jenjang}.
          </p>
        </div>
      );
    }
    notFound();
  }

  const sudahAda = await hitungSoal(client, params.mapelId);
  const qs = jenjang ? `?jenjang=${jenjang}` : "";

  return (
    <div>
      {jenjang && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <JenjangSwitcher
            jenjangAktif={jenjang}
            buatHref={(j) =>
              `/admin/event/${params.eventId}/mapel/${params.mapelId}/soal/baru?jenjang=${j}`
            }
          />
          <BadgeJenjang jenjang={jenjang} />
        </div>
      )}

      <Remah
        href={`/admin/event/${params.eventId}/mapel/${params.mapelId}${qs}`}
        label={mapel.nama}
      />

      <KepalaHalaman
        judul="Tambah Soal"
        ikon="fa-file-circle-plus"
        keterangan={
          sudahAda > 0
            ? `${mapel.nama} · sudah ada ${sudahAda} soal`
            : `${mapel.nama} · belum ada soal`
        }
      />

      <Info nada="info">
        Form ini tidak menutup setelah menyimpan. Begitu satu soal
        tersimpan, isiannya dikosongkan dan kamu langsung kembali ke
        pemilih bentuk soal di atas — jadi 50 soal bisa diisi
        berturut-turut tanpa bolak-balik ke daftar. Setiap soal yang
        tersimpan otomatis ikut diarsipkan ke Bank Soal.
      </Info>

      <SoalForm
        eventId={params.eventId}
        mapelId={params.mapelId}
        jenjang={jenjang}
        nomorBerikutnya={sudahAda + 1}
      />
    </div>
  );
}
