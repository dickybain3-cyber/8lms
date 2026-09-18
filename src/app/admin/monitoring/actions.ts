"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  monitoringSatuMapel,
  resetUjianSiswa,
  paksaKumpulkanSiswa,
  resetUjianSatuMapel,
  type BarisMonitoring,
} from "@/lib/supabase/admin-multi";
import { isJenjangValid, type Jenjang } from "@/lib/jenjang";

/**
 * SATU-SATUNYA gerbang menuju service_role lintas jenjang.
 *
 * Semua fungsi di file ini memanggil `pastikanAdmin()` sebagai baris
 * PERTAMA, tanpa kecuali. Alasannya sudah dijelaskan panjang di
 * admin-multi.ts: begitu service_role dipakai, RLS tidak lagi menjaga
 * apa pun, dan pemeriksaan di sinilah satu-satunya yang tersisa.
 *
 * Pemeriksaannya dilakukan di project tempat admin LOGIN (jenjang dari
 * cookie sesinya) — bukan di project yang sedang dia lihat. Konsekuensi
 * yang harus dipahami saat memberi hak admin: cukup satu baris `guru`
 * dengan `is_admin = true` di salah satu project untuk bisa mengawasi
 * ketiganya. Itu memang niatnya (admin sekolah = satu orang, satu akun),
 * tapi artinya menaikkan `is_admin` seseorang di project mana pun sama
 * saja memberinya akses ke seluruh sekolah. Jangan diberikan ke guru
 * mapel biasa.
 */
async function pastikanAdmin(): Promise<{ guruId: string; nama: string }> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Sesi sudah berakhir. Silakan login ulang.");
  }

  const { data: guru } = await supabase
    .from("guru")
    .select("id, nama, is_admin")
    .eq("auth_id", user.id)
    .maybeSingle();

  if (!guru || !guru.is_admin) {
    throw new Error(
      "Halaman ini khusus admin. Hubungi pengelola sistem kalau kamu merasa seharusnya punya akses."
    );
  }

  return { guruId: guru.id, nama: guru.nama };
}

function parseJenjangWajib(nilai: unknown): Jenjang {
  const n = Number(nilai);
  if (!isJenjangValid(n)) {
    throw new Error("Jenjang tidak valid.");
  }
  return n;
}

export type HasilAksi = { ok: boolean; pesan: string };

/**
 * Dipanggil berkala (polling) oleh MonitoringClient. Sengaja server action,
 * bukan Route Handler: service_role tidak boleh terekspos sebagai endpoint
 * HTTP yang bisa di-hit langsung dari luar, dan server action otomatis
 * terikat pada sesi + origin aplikasi.
 */
export async function ambilMonitoring(
  jenjangRaw: number,
  mapelId: string
): Promise<{ baris: BarisMonitoring[]; error: string | null }> {
  try {
    await pastikanAdmin();
    const jenjang = parseJenjangWajib(jenjangRaw);
    const baris = await monitoringSatuMapel(jenjang, mapelId);
    return { baris, error: null };
  } catch (e) {
    return {
      baris: [],
      error: e instanceof Error ? e.message : "Gagal memuat data monitoring.",
    };
  }
}

export async function aksiResetSiswa(
  jenjangRaw: number,
  siswaId: string,
  mapelId: string
): Promise<HasilAksi> {
  try {
    await pastikanAdmin();
    const jenjang = parseJenjangWajib(jenjangRaw);
    await resetUjianSiswa(jenjang, siswaId, mapelId);
    revalidatePath("/admin/monitoring");
    return {
      ok: true,
      pesan:
        "Ujian siswa direset. Siswa bisa mulai lagi dari awal dengan durasi penuh.",
    };
  } catch (e) {
    return {
      ok: false,
      pesan: e instanceof Error ? e.message : "Gagal mereset ujian siswa.",
    };
  }
}

/**
 * Untuk siswa yang jawabannya sudah tersimpan di server tapi koneksinya
 * putus sebelum sempat menekan Kumpulkan. Nilainya langsung terhitung
 * karena trigger koreksi otomatis menyala begitu `submitted_at` terisi.
 */
export async function aksiPaksaKumpulkan(
  jenjangRaw: number,
  siswaId: string,
  mapelId: string
): Promise<HasilAksi> {
  try {
    await pastikanAdmin();
    const jenjang = parseJenjangWajib(jenjangRaw);
    await paksaKumpulkanSiswa(jenjang, siswaId, mapelId);
    revalidatePath("/admin/monitoring");
    return {
      ok: true,
      pesan: "Jawaban terakhir siswa dikumpulkan dan langsung dinilai.",
    };
  } catch (e) {
    return {
      ok: false,
      pesan: e instanceof Error ? e.message : "Gagal mengumpulkan jawaban siswa.",
    };
  }
}

/**
 * Reset seluruh peserta satu mapel. Destruktif — UI wajib meminta konfirmasi
 * ketik ulang nama mapel sebelum memanggil ini (lihat MonitoringClient).
 */
export async function aksiResetMapel(
  jenjangRaw: number,
  mapelId: string
): Promise<HasilAksi> {
  try {
    await pastikanAdmin();
    const jenjang = parseJenjangWajib(jenjangRaw);
    const jumlah = await resetUjianSatuMapel(jenjang, mapelId);
    revalidatePath("/admin/monitoring");
    return {
      ok: true,
      pesan: `${jumlah} data pengerjaan dihapus. Seluruh peserta bisa mengulang dari awal.`,
    };
  } catch (e) {
    return {
      ok: false,
      pesan: e instanceof Error ? e.message : "Gagal mereset ujian.",
    };
  }
}
