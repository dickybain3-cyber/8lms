"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSesiGuru, pastikanBolehKeJenjang } from "@/lib/admin-guard";
import { isJenjangValid, type Jenjang } from "@/lib/jenjang";
import {
  cariBankSoal,
  gunakanBankSoal as salinKeMapel,
  type BarisBankSoal,
  type FilterBank,
} from "@/lib/bank-soal";
import type { TipeSoal } from "@/types";

/**
 * Aksi untuk halaman Bank Soal.
 *
 * ── SATU POLA YANG DIULANG DI SELURUH BERKAS INI ──
 *
 * Setiap aksi memilih client-nya dengan aturan yang sama:
 *   - `jenjang` diberikan DAN pemanggilnya admin -> `createAdminClient`
 *     (service_role, lintas jenjang), setelah `pastikanBolehKeJenjang()`
 *     memverifikasi ulang di server.
 *   - selain itu -> `createClient()` cookie-bound, terbatas pada project
 *     jenjang tempat orangnya login.
 *
 * `jenjang` datang dari `?jenjang=` di URL, artinya dari browser, artinya
 * TIDAK BOLEH DIPERCAYA. Guru biasa yang mengubah angkanya di bilah
 * alamat akan ditolak `pastikanBolehKeJenjang()` — itulah kenapa
 * pemeriksaannya ada di setiap aksi, bukan cuma di halamannya.
 */
async function pilihClient(jenjang: Jenjang | null): Promise<
  | { client: ReturnType<typeof createClient>; error: null }
  | { client: null; error: string }
> {
  if (jenjang === null) {
    return { client: createClient(), error: null };
  }

  if (!isJenjangValid(jenjang)) {
    return { client: null, error: "Jenjang tidak valid." };
  }

  const sesi = await getSesiGuru();
  const tidakBoleh = await pastikanBolehKeJenjang(sesi, jenjang);
  if (tidakBoleh) {
    return { client: null, error: tidakBoleh };
  }

  return {
    client: createAdminClient(jenjang) as unknown as ReturnType<
      typeof createClient
    >,
    error: null,
  };
}

export type HasilCari = {
  error: string | null;
  soal: BarisBankSoal[];
};

export async function cariSoalDiBank(
  jenjang: Jenjang | null,
  filter: {
    mapelNorm?: string | null;
    cari?: string | null;
    tipe?: TipeSoal | null;
  }
): Promise<HasilCari> {
  const { client, error } = await pilihClient(jenjang);
  if (!client) return { error, soal: [] };

  const soal = await cariBankSoal(client, filter as FilterBank);
  return { error: null, soal };
}

export type TujuanMapel = {
  eventId: string;
  eventNama: string;
  mapelId: string;
  mapelNama: string;
  /** Kegiatan yang belum lewat tanggal selesainya. */
  sedangAktif: boolean;
};

/**
 * Daftar mapel tujuan untuk tombol "Gunakan".
 *
 * ── KENAPA KEGIATAN YANG SUDAH LEWAT TETAP DITAMPILKAN ──
 *
 * Yang aktif diletakkan di atas dan diberi penanda, tapi yang sudah
 * lewat tidak dibuang. Alasannya praktis: guru kerap menyiapkan soal
 * untuk kegiatan yang baru akan dibuat, lalu menaruhnya sementara di
 * mapel kegiatan lama sebagai tempat singgah; dan kegiatan susulan
 * sering dibuat dari kegiatan yang tanggalnya sudah lewat. Menyaring
 * keras berdasarkan tanggal akan membuat daftar tujuannya kosong persis
 * pada saat guru paling butuh — dan tidak ada cara baginya untuk
 * mengerti kenapa.
 */
export async function daftarMapelTujuan(
  jenjang: Jenjang | null
): Promise<{ error: string | null; mapel: TujuanMapel[] }> {
  const { client, error } = await pilihClient(jenjang);
  if (!client) return { error, mapel: [] };

  const { data, error: bacaError } = await client
    .from("mapel")
    .select("id, nama, event_id, event(nama, tgl_selesai)")
    .order("waktu_mulai", { ascending: false })
    .limit(200);

  if (bacaError) {
    return { error: "Gagal memuat daftar mapel tujuan.", mapel: [] };
  }

  const sekarang = Date.now();

  const mapel: TujuanMapel[] = (data ?? []).map((m) => {
    const ev = m.event as unknown as {
      nama: string;
      tgl_selesai: string;
    } | null;
    return {
      eventId: m.event_id,
      eventNama: ev?.nama ?? "Tanpa kegiatan",
      mapelId: m.id,
      mapelNama: m.nama,
      sedangAktif: ev
        ? new Date(ev.tgl_selesai).getTime() >= sekarang
        : false,
    };
  });

  // Yang aktif naik ke atas, sisanya mengikuti urutan waktu dari query.
  mapel.sort((a, b) => Number(b.sedangAktif) - Number(a.sedangAktif));

  return { error: null, mapel };
}

export async function pakaiSoalDariBank(
  jenjang: Jenjang | null,
  bankIds: string[],
  mapelIdTujuan: string
): Promise<{ error: string | null; jumlah: number; eventId?: string }> {
  const { client, error } = await pilihClient(jenjang);
  if (!client) return { error, jumlah: 0 };

  if (!mapelIdTujuan) {
    return { error: "Pilih mapel tujuan dulu.", jumlah: 0 };
  }

  // Mapel tujuan diverifikasi ADA lewat client yang sama dengan yang
  // dipakai menulis. Tanpa ini, id mapel dari jenjang lain yang kebetulan
  // dikirim akan lolos ke insert dan gagal dengan error Postgres mentah
  // yang tidak berarti apa-apa bagi guru.
  const { data: mapel } = await client
    .from("mapel")
    .select("id, event_id")
    .eq("id", mapelIdTujuan)
    .maybeSingle();

  if (!mapel) {
    return {
      error: "Mapel tujuan tidak ditemukan. Muat ulang halaman lalu coba lagi.",
      jumlah: 0,
    };
  }

  const hasil = await salinKeMapel(client, bankIds, mapelIdTujuan);
  if (hasil.error) {
    return { error: hasil.error, jumlah: 0 };
  }

  revalidatePath(`/admin/event/${mapel.event_id}/mapel/${mapelIdTujuan}`);

  return { error: null, jumlah: hasil.jumlah, eventId: mapel.event_id };
}

/**
 * Hapus satu entri arsip.
 *
 * Yang dihapus HANYA arsipnya. Soal yang sudah terlanjur dipakai di
 * event mana pun tidak ikut terhapus — keduanya memang baris yang
 * berbeda sejak awal (lihat alasan "salinan, bukan referensi" di
 * 0014_bank_soal.sql). Ini perlu dikatakan jelas ke guru di UI, karena
 * dugaan wajar orang adalah sebaliknya.
 *
 * Batasan siapa yang boleh menghapus ditegakkan RLS di database
 * (`bank_soal_delete_pemilik`: pembuatnya sendiri atau akun admin),
 * bukan di sini — supaya aturannya tetap berlaku walau nanti ada jalur
 * kode lain yang menghapus.
 */
export async function hapusDariBank(
  jenjang: Jenjang | null,
  bankId: string
): Promise<{ error: string | null }> {
  const { client, error } = await pilihClient(jenjang);
  if (!client) return { error };

  const { error: hapusError } = await client
    .from("bank_soal")
    .delete()
    .eq("id", bankId);

  if (hapusError) {
    return {
      error:
        "Gagal menghapus. Kamu hanya bisa menghapus soal yang kamu buat sendiri.",
    };
  }

  revalidatePath("/admin/bank-soal");
  return { error: null };
}
