"use server";

import { createClient } from "@/lib/supabase/server";
import {
  daftarSiswaSemuaJenjang,
  daftarGuruSemuaJenjang,
  type BarisSiswaExport,
  type BarisGuruExport,
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
