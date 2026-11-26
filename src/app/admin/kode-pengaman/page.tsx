import Link from "next/link";
import { getSesiGuru } from "@/lib/admin-guard";
import { KepalaHalaman } from "@/components/ui/Panel";
import { BATAS_PERINGATAN, MENIT_KODE_PENGAMAN } from "@/lib/pengawasan-ujian";
import { ambilKodePengaman } from "./actions";
import KodePengamanClient from "./KodePengamanClient";

/**
 * /admin/kode-pengaman — kode pembuka ujian yang terkunci karena
 * pelanggaran layar penuh/pindah aplikasi/layar terbagi. Satu kode per
 * jenjang (tiap project punya rahasia sendiri), berganti tiap 5 menit.
 * Khusus admin, sama seperti /admin/denah.
 */
export default async function KodePengamanPage() {
  const sesi = await getSesiGuru();

  if (!sesi.isAdmin) {
    return (
      <div className="max-w-xl">
        <h1 className="mb-2 font-serif text-2xl text-ink">Kode Pengaman</h1>
        <p className="rounded-xl border border-gold/30 bg-gold/5 p-4 text-sm text-ink/70">
          Kode pengaman hanya bisa dilihat akun admin. Kalau ada siswa yang
          ujiannya terkunci, minta kodenya ke admin.
        </p>
        <Link
          href="/admin"
          className="mt-4 inline-block text-sm font-medium text-teal hover:underline"
        >
          ← Kembali ke dashboard
        </Link>
      </div>
    );
  }

  const awal = await ambilKodePengaman();

  return (
    <div className="max-w-4xl">
      <KepalaHalaman
        judul="Kode Pengaman"
        ikon="fa-shield-halved"
        keterangan={
          <>
            Siswa yang {BATAS_PERINGATAN} kali keluar layar penuh, pindah
            aplikasi, atau membagi layar akan terkunci. Bacakan kode sesuai
            jenjang siswanya. Kode berganti otomatis tiap {MENIT_KODE_PENGAMAN}{" "}
            menit; kode sebelumnya masih diterima {MENIT_KODE_PENGAMAN} menit
            lagi.
          </>
        }
      />
      <KodePengamanClient awal={awal} />
    </div>
  );
}
