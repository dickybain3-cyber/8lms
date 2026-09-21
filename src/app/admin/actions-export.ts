"use server";

import { createClient } from "@/lib/supabase/server";
import {
  daftarSiswaSemuaJenjang,
  daftarGuruSemuaJenjang,
  daftarGuruDetailSemuaJenjang,
  type BarisSiswaExport,
  type BarisGuruExport,
  type BarisGuruDetailExport,
  type HasilJenjang,
} from "@/lib/supabase/admin-multi";

/**
 * Duplikat sengaja dari `pastikanAdmin()` di
 * src/app/admin/monitoring/actions.ts — bukan kelupaan, tapi supaya file
 * export ini berdiri sendiri dan tidak menyeret perubahan pada file
 * monitoring kalau salah satunya perlu direvisi. Kalau nanti mau
 * dirapikan, pindahkan berdua ke satu tempat: src/lib/supabase/pastikan-admin.ts.
 */
async function pastikanAdmin(): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Sesi sudah berakhir. Silakan login ulang.");

  const { data: guru } = await supabase
    .from("guru")
    .select("is_admin")
    .eq("auth_id", user.id)
    .maybeSingle();

  if (!guru?.is_admin) {
    throw new Error("Hanya admin yang boleh mengekspor data lintas jenjang.");
  }
}

export interface HasilExportLintasJenjang<T> {
  baris: (T & { jenjang: 7 | 8 | 9 })[];
  /** Jenjang yang gagal ditarik, kalau ada — supaya UI tetap bisa mengekspor sisanya. */
  jenjangGagal: { jenjang: 7 | 8 | 9; pesan: string }[];
}

function pisahkanHasil<T>(
  hasil: HasilJenjang<T>[]
): HasilExportLintasJenjang<T> {
  const baris = hasil.flatMap((h) =>
    h.data.map((row) => ({ ...row, jenjang: h.jenjang }))
  );
  const jenjangGagal = hasil
    .filter((h) => h.error !== null)
    .map((h) => ({ jenjang: h.jenjang, pesan: h.error as string }));
  return { baris, jenjangGagal };
}

/** Dipanggil tombol "Export semua siswa" hanya saat pemakainya admin. */
export async function ambilSiswaSemuaJenjang(): Promise<
  HasilExportLintasJenjang<BarisSiswaExport>
> {
  await pastikanAdmin();
  const hasil = await daftarSiswaSemuaJenjang();
  return pisahkanHasil(hasil);
}

/** Dipanggil tombol "Export semua guru" hanya saat pemakainya admin. */
export async function ambilGuruSemuaJenjang(): Promise<
  HasilExportLintasJenjang<BarisGuruExport>
> {
  await pastikanAdmin();
  const hasil = await daftarGuruSemuaJenjang();
  return pisahkanHasil(hasil);
}

/**
 * Dipanggil tombol "Unduh detail guru" (Tahap 2, /admin/guru). Beda dari
 * `ambilGuruSemuaJenjang()` di atas: ini membawa nip/username/status
 * password mentah untuk kolom Password di file unduhan, jadi aksesnya
 * dicatat ke log_aktivitas — TANPA mencatat isi passwordnya sendiri, cuma
 * jumlah baris dan jenjang mana yang gagal ditarik (kalau ada).
 */
export async function ambilDetailGuruSemuaJenjang(): Promise<
  HasilExportLintasJenjang<BarisGuruDetailExport>
> {
  await pastikanAdmin();
  const hasil = await daftarGuruDetailSemuaJenjang();
  const dipisah = pisahkanHasil(hasil);

  const sessionSupabase = createClient();
  const { error: logError } = await sessionSupabase.rpc(
    "catat_log_aktivitas",
    {
      p_aksi: "unduh_detail_guru",
      p_entitas: "guru",
      p_entitas_id: null,
      p_detail: {
        jumlah_baris: dipisah.baris.length,
        jenjang_gagal: dipisah.jenjangGagal.map((j) => j.jenjang),
      },
    }
  );
  // Kegagalan mencatat log tidak membatalkan unduhan — admin sudah
  // menerima datanya, dan ini konsisten dengan pola log_aktivitas lain
  // di seluruh project (importGuruBatch, resetPasswordGuru, dst).
  if (logError) {
    console.error("Gagal mencatat log unduh_detail_guru:", logError.message);
  }

  return dipisah;
}
