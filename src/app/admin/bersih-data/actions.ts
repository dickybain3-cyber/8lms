"use server";

import { revalidatePath } from "next/cache";
import { getSesiGuru, pastikanBolehKeJenjang } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { isJenjangValid, type Jenjang } from "@/lib/jenjang";
import {
  KATA_KONFIRMASI,
  bersihkanKegiatan,
  type HasilBersih,
  type ModeBersih,
} from "@/lib/bersih-data";

export type HasilAksiBersih = { error: string } | { error: null; hasil: HasilBersih };

/**
 * Bersihkan satu atau beberapa kegiatan.
 *
 * Penjaga berlapis, karena tindakan ini tidak bisa dibatalkan:
 *   1. Hanya akun ADMIN (`guru.is_admin`), bukan sembarang guru.
 *   2. `pastikanBolehKeJenjang` — jenjang dari browser diverifikasi ulang.
 *   3. Konfirmasi ketik "HAPUS" diperiksa lagi DI SERVER.
 *   4. Kegiatan yang sedang berlangsung ditolak kecuali dicentang paksa
 *      (menghapus jawaban ujian yang sedang dikerjakan = siswa kehilangan
 *      pekerjaannya di tengah ujian).
 * Setiap pembersihan dicatat sebagai satu baris di Log Aktivitas.
 */
export async function bersihkanKegiatanAksi(
  jenjang: Jenjang,
  eventIds: string[],
  mode: ModeBersih,
  konfirmasi: string,
  izinkanBerjalan: boolean
): Promise<HasilAksiBersih> {
  if (!isJenjangValid(jenjang)) return { error: "Jenjang tidak valid." };
  const sesi = await getSesiGuru();
  if (!sesi.isAdmin) return { error: "Hanya akun admin yang boleh membersihkan data." };
  const tidakBoleh = await pastikanBolehKeJenjang(sesi, jenjang);
  if (tidakBoleh) return { error: tidakBoleh };
  if (konfirmasi.trim() !== KATA_KONFIRMASI) {
    return { error: `Ketik ${KATA_KONFIRMASI} (huruf besar) untuk konfirmasi.` };
  }
  if (mode !== "data_siswa" && mode !== "total") return { error: "Pilihan tidak valid." };

  const ids = Array.from(new Set(eventIds.filter((x) => typeof x === "string" && x.length > 0)));
  if (ids.length === 0) return { error: "Pilih minimal satu kegiatan." };

  const db = await createAdminClient(jenjang);
  const { data: events, error: bacaError } = await db
    .from("event")
    .select("id, nama, tgl_mulai, tgl_selesai")
    .in("id", ids);
  if (bacaError || !events || events.length === 0) {
    return { error: "Kegiatan tidak ditemukan. Muat ulang halaman." };
  }

  const hariIni = new Date().toISOString().slice(0, 10);
  const berjalan = events.filter((e) => e.tgl_mulai <= hariIni && e.tgl_selesai >= hariIni);
  if (berjalan.length > 0 && !izinkanBerjalan) {
    return {
      error: `${berjalan.map((e) => `"${e.nama}"`).join(", ")} masih berlangsung. Centang "saya paham" kalau memang ingin tetap dibersihkan.`,
    };
  }

  let hasil: HasilBersih;
  try {
    hasil = await bersihkanKegiatan(db, events.map((e) => e.id), mode);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Gagal membersihkan data." };
  }

  await db.from("log_aktivitas").insert({
    guru_id: jenjang === sesi.jenjang ? sesi.guruId : null,
    aksi: mode === "total" ? "hapus_total_kegiatan" : "kosongkan_data_siswa",
    entitas: "event",
    entitas_id: events.length === 1 ? events[0].id : null,
    detail_jsonb: {
      oleh_nama: sesi.nama ?? sesi.email ?? "tidak diketahui",
      oleh_email: sesi.email,
      jenjang_target: jenjang,
      nama_kegiatan: events.map((e) => e.nama),
      ...hasil,
    },
  });

  revalidatePath("/admin/bersih-data");
  revalidatePath("/admin/event");
  revalidatePath("/admin");
  return { error: null, hasil };
}
