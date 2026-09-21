import { createClient } from "@/lib/supabase/server";
import { getSesiGuru } from "@/lib/admin-guard";
import { cariAkunTerhubung } from "@/lib/profil-guru";
import { Info, KepalaHalaman } from "@/components/ui/Panel";
import ProfilClient, { type ProfilData } from "./ProfilClient";

/**
 * Profil guru: foto, username, password.
 *
 * Server Component yang hanya MEMBACA. Semua penulisan lewat
 * `./actions.ts`, yang menurunkan identitas dari sesi — halaman ini tidak
 * mengoper id guru ke client sama sekali, jadi tidak ada nilai di browser
 * yang bisa diubah untuk menunjuk akun orang lain.
 */
export default async function ProfilPage() {
  const sesi = await getSesiGuru();

  if (!sesi.guruId || !sesi.jenjang) {
    return (
      <div>
        <KepalaHalaman judul="Profil saya" ikon="fa-user-gear" />
        <Info nada="peringatan">
          Sesi login tidak terbaca. Keluar lalu login ulang untuk membuka
          profil.
        </Info>
      </div>
    );
  }

  const supabase = createClient();

  // Kolom `foto_url` & `password_diganti_at` datang dari migrasi 0016.
  // Kalau belum dijalankan di project ini, select lengkap gagal — jangan
  // biarkan halamannya ikut mati; tampilkan yang ada dan katakan terus
  // terang apa yang kurang.
  let migrasiBelumJalan = false;
  let baris: {
    nama: string;
    nip: string | null;
    username: string | null;
    foto_url?: string | null;
    password_diganti_at?: string | null;
  } | null = null;

  const lengkap = await supabase
    .from("guru")
    .select("nama, nip, username, foto_url, password_diganti_at")
    .eq("id", sesi.guruId)
    .maybeSingle();

  if (!lengkap.error) {
    baris = lengkap.data;
  } else {
    migrasiBelumJalan = true;
    const dasar = await supabase
      .from("guru")
      .select("nama, nip, username")
      .eq("id", sesi.guruId)
      .maybeSingle();
    baris = dasar.data;
  }

  if (!baris) {
    return (
      <div>
        <KepalaHalaman judul="Profil saya" ikon="fa-user-gear" />
        <Info nada="peringatan">
          Data guru untuk akun ini tidak ditemukan di database.
        </Info>
      </div>
    );
  }

  const status = migrasiBelumJalan
    ? []
    : await cariAkunTerhubung({
        jenjangSesi: sesi.jenjang,
        guruIdSesi: sesi.guruId,
        nip: baris.nip,
        denganEmail: false,
      });

  const data: ProfilData = {
    nama: baris.nama,
    nip: baris.nip,
    username: baris.username,
    email: sesi.email,
    fotoUrl: baris.foto_url ?? null,
    passwordDigantiAt: baris.password_diganti_at ?? null,
    peran: sesi.isAdmin ? "Administrator" : "Guru",
    jenjangSesi: sesi.jenjang,
    // Hanya jenjang + nama yang dikirim ke browser. Nama ikut supaya guru
    // bisa melihat sendiri kalau NIP-nya ternyata terpasang ke orang lain
    // di jenjang sebelah (salah ketik admin), sebelum perubahan menyebar.
    terhubung: status.map((s) =>
      s.status === "terhubung"
        ? { jenjang: s.jenjang, status: "terhubung", nama: s.akun.nama }
        : s.status === "gagal"
          ? { jenjang: s.jenjang, status: "gagal", alasan: s.alasan }
          : { jenjang: s.jenjang, status: "tidak_ada" }
    ),
    nonaktif: migrasiBelumJalan,
  };

  return (
    <div>
      <KepalaHalaman
        judul="Profil saya"
        ikon="fa-user-gear"
        keterangan="Ubah foto, username, dan password. Perubahan berlaku di semua jenjang tempat kamu terdaftar."
      />

      {migrasiBelumJalan && (
        <Info nada="peringatan">
          Database kelas {sesi.jenjang} belum menjalankan migrasi{" "}
          <code className="rounded bg-amber-100 px-1">0016_guru_profil.sql</code>
          , jadi foto dan password belum bisa disimpan. Jalankan migrasinya di
          ketiga project, lalu muat ulang halaman ini.
        </Info>
      )}

      <ProfilClient data={data} />
    </div>
  );
}
