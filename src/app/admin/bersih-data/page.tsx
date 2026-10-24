import Link from "next/link";
import { getSesiGuru } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJenjang } from "@/lib/jenjang";
import { ringkasDataKegiatan } from "@/lib/bersih-data";
import JenjangSwitcher from "@/components/admin/JenjangSwitcher";
import { Info, KepalaHalaman } from "@/components/ui/Panel";
import BersihDataClient from "./BersihDataClient";

/**
 * Bersih-bersih Data — admin saja.
 *
 * Per jenjang (database kelas 7/8/9 terpisah), memakai `?jenjang=` yang
 * sama dengan halaman admin lain. Angka per kegiatan dihitung saat
 * halaman dibuka supaya admin tahu persis apa yang akan hilang.
 */
export default async function BersihDataPage(
  props: {
    searchParams: Promise<{ jenjang?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const sesi = await getSesiGuru();

  if (!sesi.isAdmin) {
    return (
      <div className="max-w-xl">
        <KepalaHalaman judul="Bersih-bersih Data" ikon="fa-broom" />
        <Info nada="peringatan">
          Menu ini menghapus data secara permanen, jadi hanya bisa dibuka akun admin.
        </Info>
        <Link href="/admin" className="text-sm font-medium text-teal hover:underline">
          ← Kembali ke dashboard
        </Link>
      </div>
    );
  }

  const jenjang = parseJenjang(searchParams.jenjang) ?? sesi.jenjang ?? 7;
  const kegiatan = await ringkasDataKegiatan(await createAdminClient(jenjang));

  return (
    <div>
      <KepalaHalaman
        judul="Bersih-bersih Data"
        ikon="fa-broom"
        keterangan="Kosongkan hasil siswa atau hapus kegiatan beserta seluruh isinya."
        aksi={
          <JenjangSwitcher
            jenjangAktif={jenjang}
            buatHref={(j) => `/admin/bersih-data?jenjang=${j}`}
          />
        }
      />

      <Info nada="peringatan">
        Penghapusan <b>tidak bisa dibatalkan</b>. Unduh dulu rekap nilai yang masih
        diperlukan dari{" "}
        <Link href="/admin/nilai" className="font-semibold underline underline-offset-2">
          Rekap Penilaian
        </Link>
        . Soal yang pernah disimpan tetap aman di Bank Soal.
      </Info>

      <BersihDataClient key={jenjang} jenjang={jenjang} kegiatan={kegiatan} />
    </div>
  );
}
