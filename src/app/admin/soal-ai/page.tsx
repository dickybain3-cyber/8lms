import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSesiGuru } from "@/lib/admin-guard";
import { parseJenjang } from "@/lib/jenjang";
import { aiSiapJenjang } from "@/lib/ai/akses";
import { daftarMapelBank } from "@/lib/bank-soal";
import JenjangSwitcher from "@/components/admin/JenjangSwitcher";
import BadgeJenjang from "@/components/admin/BadgeJenjang";
import { KepalaHalaman } from "@/components/ui/Panel";
import GeneratorSoalAi from "@/components/admin/AiSoal/GeneratorSoalAi";

/**
 * "Buat Soal AI" di sidebar — generator yang sama dengan di mapel
 * kegiatan, tapi tidak terikat mapel mana pun: guru mengetik nama mapel,
 * lalu hasilnya disimpan ke Bank Soal (diberi nama paket) dan/atau
 * diunduh. Kuota harian berlaku sama (lihat src/lib/ai/kuota.ts).
 *
 * Admin boleh menyasar jenjang lain lewat `?jenjang=`, seperti Bank Soal.
 */
export default async function SoalAiPage(props: { searchParams: Promise<{ jenjang?: string }> }) {
  const searchParams = await props.searchParams;
  const sesi = await getSesiGuru();
  const jenjangAdmin = sesi.isAdmin ? parseJenjang(searchParams.jenjang) : null;
  const jenjangData = jenjangAdmin ?? sesi.jenjang;

  const client = jenjangAdmin ? await createAdminClient(jenjangAdmin) : await createClient();
  const [aiSiap, mapelBank] = await Promise.all([aiSiapJenjang(jenjangData), daftarMapelBank(client)]);

  return (
    <div>
      {sesi.isAdmin && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <JenjangSwitcher
            jenjangAktif={jenjangData ?? 7}
            buatHref={(j) => `/admin/soal-ai?jenjang=${j}`}
          />
          {jenjangData && <BadgeJenjang jenjang={jenjangData} />}
        </div>
      )}

      <KepalaHalaman
        judul="Buat Soal AI"
        ikon="fa-wand-magic-sparkles"
        keterangan="Susun paket soal dengan AI, tinjau, lalu simpan ke Bank Soal atau unduh. Setiap guru bisa generate 1 kali per hari."
      />

      <GeneratorSoalAi
        key={jenjangData ?? 0}
        tampilan="halaman"
        jenjang={jenjangAdmin ?? undefined}
        jenjangData={jenjangData}
        aiSiap={aiSiap}
        mapelSaran={mapelBank.map((m) => m.nama_tampil)}
      />
    </div>
  );
}
