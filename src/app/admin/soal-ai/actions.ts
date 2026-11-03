"use server";

import { revalidatePath } from "next/cache";
import { getSesiGuru } from "@/lib/admin-guard";
import { isJenjangValid, type Jenjang } from "@/lib/jenjang";
import { pecahBatch, validasiRencana } from "@/lib/ai/rencana-soal";
import {
  ajukanPermintaan,
  bacaStatusKuota,
  putuskanPermintaan,
  terbitkanTiket,
  type StatusKuota,
} from "@/lib/ai/kuota";

/**
 * Aksi kuota "Buat Soal AI". Aturan & tabelnya: lihat src/lib/ai/kuota.ts.
 * Kuota selalu dicatat di project tempat guru login (`sesi.jenjang`),
 * walau admin sedang menyasar jenjang lain — admin memang tidak dibatasi.
 */

export async function statusKuotaAi(): Promise<StatusKuota> {
  return bacaStatusKuota(await getSesiGuru());
}

/**
 * Pakai satu kuota untuk SATU kali generate. Rencana divalidasi ulang di
 * sini supaya jumlah batch di tiket sama dengan yang nanti dipecah route.
 */
export async function mulaiGenerateAi(
  rencanaMentah: unknown
): Promise<{ tiket: string | null; error: string | null }> {
  const rencana = validasiRencana(rencanaMentah);
  if (typeof rencana === "string") return { tiket: null, error: rencana };
  const sesi = await getSesiGuru();
  const hasil = await terbitkanTiket(sesi, pecahBatch(rencana).length);
  return { tiket: hasil.tiket, error: hasil.error };
}

export async function mintaTambahKuotaAi(alasan: string): Promise<{ error: string | null }> {
  const error = await ajukanPermintaan(await getSesiGuru(), String(alasan ?? ""));
  if (!error) revalidatePath("/admin");
  return { error };
}

export async function putuskanPermintaanAi(
  jenjang: Jenjang,
  id: string,
  setuju: boolean
): Promise<{ error: string | null }> {
  const sesi = await getSesiGuru();
  if (!sesi.isAdmin) return { error: "Hanya admin yang bisa memutus permintaan kuota." };
  if (!isJenjangValid(jenjang)) return { error: "Jenjang tidak valid." };
  const error = await putuskanPermintaan(jenjang, String(id), setuju === true, sesi.nama);
  revalidatePath("/admin");
  return { error };
}
