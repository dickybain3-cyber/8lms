"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSesiGuru, pastikanBolehKeJenjang } from "@/lib/admin-guard";
import { isJenjangValid, type Jenjang } from "@/lib/jenjang";
import type { AnalisisButirSoal, DistribusiNilai } from "@/types";
import { muatAnalisisButirMapel, muatRincianJawabanMapel } from "@/lib/statistik-kegiatan";
import type { RincianJawaban } from "@/lib/analisis-jawaban";

/**
 * Union dibedakan lewat field literal `ok` (bukan lewat `error: string |
 * null`) supaya TypeScript benar-benar mempersempit tipenya di sisi
 * pemanggil — `if (!hasil.ok)` cukup, tanpa cast apa pun.
 */
export type HasilDistribusi =
  | { ok: false; error: string }
  | { ok: true; data: DistribusiNilai[] };

/**
 * Memuat distribusi nilai satu mapel — untuk jenjang MANA PUN.
 *
 * Sebelumnya komponen `DistribusiNilai` memanggil RPC langsung dari
 * browser lewat `createClient()`, yang selalu menyasar project di cookie
 * `lms_jenjang`. Itu benar selama halaman statistik cuma menampilkan satu
 * jenjang. Begitu dashboardnya menggabung ketiganya, admin yang login di
 * kelas 7 akan mengirim `mapel_id` milik kelas 9 ke project kelas 7 —
 * hasilnya bukan error yang jelas, melainkan daftar kosong yang
 * menyesatkan ("seolah belum ada nilai").
 *
 * Karena itu pemuatannya dipindah ke Server Action ini, yang menerima
 * `jenjang` eksplisit dari baris yang diklik dan memilih jalur yang
 * tepat:
 *   - jenjang sama dengan sesi  -> client biasa + RLS (guru mana pun);
 *   - jenjang lain              -> service_role, khusus admin.
 */
export async function muatDistribusiNilai(
  jenjang: Jenjang,
  mapelId: string
): Promise<HasilDistribusi> {
  // Nilai dari client tidak pernah dipercaya apa adanya.
  if (!isJenjangValid(jenjang)) {
    return { ok: false, error: "Jenjang tidak valid." };
  }

  const sesi = await getSesiGuru();
  const tidakBoleh = await pastikanBolehKeJenjang(sesi, jenjang);
  if (tidakBoleh) return { ok: false, error: tidakBoleh };

  if (jenjang === sesi.jenjang) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("get_distribusi_nilai", {
      p_mapel_id: mapelId,
    });
    if (error) {
      return { ok: false, error: "Gagal memuat distribusi nilai. Coba lagi." };
    }
    return { ok: true, data: (data ?? []) as DistribusiNilai[] };
  }

  // Lintas jenjang: hanya sampai sini kalau sesi.isAdmin true (dijaga
  // `pastikanBolehKeJenjang` di atas).
  const admin = createAdminClient(jenjang);
  const { data, error } = await admin.rpc("get_distribusi_nilai_admin", {
    p_mapel_id: mapelId,
  });

  if (error) {
    console.error("[muatDistribusiNilai] lintas jenjang gagal:", error.message);
    return {
      ok: false,
      error: `Gagal memuat distribusi nilai dari database kelas ${jenjang}.`,
    };
  }

  return { ok: true, data: (data ?? []) as DistribusiNilai[] };
}

export type HasilAnalisisButir =
  | { ok: false; error: string }
  | { ok: true; data: AnalisisButirSoal[]; rincian: RincianJawaban[] };

/**
 * Memuat analisis butir soal satu mapel (RPC `get_analisis_butir_soal`,
 * 0012_statistik_lanjutan.sql) — untuk jenjang MANA PUN.
 *
 * Pola akses SAMA PERSIS dengan `muatDistribusiNilai()` di atas, dan
 * alasannya sama: `jenjang` datang dari baris yang diklik (bukan dari
 * cookie sesi), lalu divalidasi server-side lewat
 * `pastikanBolehKeJenjang()`. RPC-nya sendiri dijaga
 * `is_guru_atau_service()`, jadi service_role (admin lintas jenjang) lolos
 * tanpa RPC varian `_admin` tersendiri.
 *
 * Pesan error dibuat spesifik untuk kasus paling mungkin — migrasi
 * 0012_statistik_lanjutan.sql belum dijalankan di project jenjang itu —
 * supaya guru/admin tidak melihat "gagal" tanpa petunjuk apa pun.
 */
export async function muatAnalisisButir(
  jenjang: Jenjang,
  mapelId: string
): Promise<HasilAnalisisButir> {
  if (!isJenjangValid(jenjang)) {
    return { ok: false, error: "Jenjang tidak valid." };
  }

  const sesi = await getSesiGuru();
  const tidakBoleh = await pastikanBolehKeJenjang(sesi, jenjang);
  if (tidakBoleh) return { ok: false, error: tidakBoleh };

  // Dihitung di aplikasi: fungsi SQL get_analisis_butir_soal (migrasi 0012)
  // belum terpasang di database mana pun, jadi versi RPC selalu gagal.
  const [hasil, rincianMentah] = await Promise.all([
    muatAnalisisButirMapel(jenjang, mapelId),
    muatRincianJawabanMapel(jenjang, mapelId),
  ]);
  if (typeof hasil === "string") return { ok: false, error: hasil };
  // Sebaran jawaban gagal dimuat tidak menggagalkan tabel utama.
  const rincian = typeof rincianMentah === "string" ? [] : rincianMentah;
  const baris: AnalisisButirSoal[] = hasil.map((b) => ({
    soal_id: b.soalId,
    urutan: b.urutan,
    tipe: b.tipe,
    skor_maks: b.skorMaks,
    jumlah_peserta: b.peserta,
    jumlah_benar: b.benar,
    jumlah_sebagian: b.sebagian,
    jumlah_salah: b.salah,
    jumlah_kosong: b.kosong,
    rata_skor: b.rataSkor,
    persen_benar: b.persenBenar,
    kategori: b.kategori ?? "belum ada data",
  }));
  return { ok: true, data: baris, rincian };
}
