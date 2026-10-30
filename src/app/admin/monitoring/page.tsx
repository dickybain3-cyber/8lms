import Link from "next/link";
import { getSesiGuru } from "@/lib/admin-guard";
import {
  daftarMapelSatuJenjang,
  daftarMapelSemuaJenjang,
} from "@/lib/supabase/admin-multi";
import MonitoringClient from "./MonitoringClient";

/**
 * /admin/monitoring — pengawasan ujian berjalan.
 *
 * Yang dikerjakan di server (di sini):
 *   - admin: menarik daftar ujian dari KETIGA project sekaligus (paralel)
 *   - guru biasa: hanya jenjang tempat dia login, dan hanya bisa melihat
 *     (aksi reset/kumpulkan ditolak juga di actions.ts, bukan cuma disembunyikan)
 * Yang dikerjakan di client (MonitoringClient):
 *   - memilih ujian, polling isi tabel tiap 15 detik, aksi reset/kumpulkan
 *
 * Pembagian ini disengaja: daftar ujian jarang berubah (cukup dimuat sekali
 * saat halaman dibuka), sedangkan isi tabel berubah tiap detik dan butuh
 * pembaruan tanpa memuat ulang seluruh halaman.
 */
export default async function MonitoringPage() {
  const sesi = await getSesiGuru();

  if (!sesi.guruId || !sesi.jenjang) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-ink/10 bg-white p-6 text-center">
        <p className="mb-2 font-serif text-lg text-ink">Khusus guru</p>
        <p className="mb-5 text-sm text-ink/60">
          Halaman ini hanya bisa dibuka oleh akun guru atau admin.
        </p>
        <Link
          href="/admin"
          className="text-sm font-medium text-teal hover:text-teal-light"
        >
          ← Kembali ke dashboard
        </Link>
      </div>
    );
  }

  const hasilPerJenjang = sesi.isAdmin
    ? await daftarMapelSemuaJenjang()
    : [await daftarMapelSatuJenjang(sesi.jenjang)];

  return (
    <MonitoringClient
      bolehAksi={sesi.isAdmin}
      hasilPerJenjang={hasilPerJenjang.map((h) => ({
        jenjang: h.jenjang,
        error: h.error,
        mapel: h.data,
      }))}
    />
  );
}
