import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { daftarMapelSemuaJenjang } from "@/lib/supabase/admin-multi";
import MonitoringClient from "./MonitoringClient";

/**
 * /admin/monitoring — pengawasan ujian berjalan LINTAS 3 jenjang dalam satu
 * halaman, tanpa admin perlu logout dan berganti jenjang.
 *
 * Yang dikerjakan di server (di sini):
 *   - memastikan yang membuka memang admin (bukan guru mapel biasa)
 *   - menarik daftar ujian dari KETIGA project sekaligus (paralel)
 * Yang dikerjakan di client (MonitoringClient):
 *   - memilih ujian, polling isi tabel tiap 15 detik, aksi reset/kumpulkan
 *
 * Pembagian ini disengaja: daftar ujian jarang berubah (cukup dimuat sekali
 * saat halaman dibuka), sedangkan isi tabel berubah tiap detik dan butuh
 * pembaruan tanpa memuat ulang seluruh halaman.
 */
export default async function MonitoringPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: guru } = await supabase
    .from("guru")
    .select("nama, is_admin")
    .eq("auth_id", user?.id ?? "")
    .maybeSingle();

  if (!guru?.is_admin) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-ink/10 bg-white p-6 text-center">
        <p className="mb-2 font-serif text-lg text-ink">Khusus admin</p>
        <p className="mb-5 text-sm text-ink/60">
          Halaman pengawasan ujian lintas kelas hanya bisa dibuka oleh akun
          admin. Guru mapel tetap bisa melihat rekap dan statistik kelasnya
          sendiri lewat menu Rekap Penilaian.
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

  const hasilPerJenjang = await daftarMapelSemuaJenjang();

  return (
    <MonitoringClient
      hasilPerJenjang={hasilPerJenjang.map((h) => ({
        jenjang: h.jenjang,
        error: h.error,
        mapel: h.data,
      }))}
    />
  );
}
