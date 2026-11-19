"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSesiGuru, pastikanBolehKeJenjang } from "@/lib/admin-guard";
import { isJenjangValid, type Jenjang } from "@/lib/jenjang";
import { TIPE_SOAL_LIST } from "@/lib/soal";
import { validasiKonten } from "@/lib/validasi-soal";
import { catatLogManual } from "@/lib/supabase/admin-multi";
import { MAKS_SOAL_IMPOR, type SoalSiapSimpan } from "@/lib/impor-soal-json";

/**
 * Simpan banyak soal hasil "Unggah JSON" sekaligus.
 *
 * Klien sudah membaca JSON, mengunggah gambar ke Cloudinary, dan
 * membangun `konten_jsonb`. Server TIDAK mempercayai itu: setiap butir
 * divalidasi ulang dengan `validasiKonten` yang sama dengan form manual,
 * dan SEMUA ditolak kalau satu saja salah — guru lebih mudah memperbaiki
 * satu berkas lalu mengunggah ulang daripada mencari soal mana yang sudah
 * masuk dan mana yang belum.
 *
 * Pemilihan client sama dengan aksi Bank Soal: `jenjang` null = jalur
 * guru (cookie-bound, log lewat trigger DB); `jenjang` diisi = jalur admin
 * lintas jenjang (service_role setelah `pastikanBolehKeJenjang`, log
 * dicatat manual karena trigger diam untuk service_role).
 */
export async function imporSoalJson(
  jenjang: Jenjang | null,
  eventId: string,
  mapelId: string,
  daftar: SoalSiapSimpan[],
  simpanKeBank: boolean
): Promise<{ error: string | null; jumlah: number; keBank: boolean }> {
  const gagal = (error: string) => ({ error, jumlah: 0, keBank: false });

  if (!Array.isArray(daftar) || daftar.length === 0) return gagal("Tidak ada soal untuk disimpan.");
  if (daftar.length > MAKS_SOAL_IMPOR) return gagal(`Maksimal ${MAKS_SOAL_IMPOR} soal sekali unggah.`);

  for (let i = 0; i < daftar.length; i++) {
    const s = daftar[i];
    const no = `Soal ${i + 1}`;
    if (!s || !TIPE_SOAL_LIST.includes(s.tipe)) return gagal(`${no}: tipe tidak valid.`);
    const skor = Number(s.skor);
    if (!(skor > 0) || skor > 1000) return gagal(`${no}: skor harus lebih dari 0 dan maksimal 1000.`);
    if (!s.konten || typeof s.konten !== "object") return gagal(`${no}: isi soal kosong.`);
    if (s.gambarUrl !== null && !/^https:\/\/[^\s"'<>]+$/i.test(String(s.gambarUrl))) {
      return gagal(`${no}: alamat gambar tidak sah.`);
    }
    const salah = validasiKonten(s.tipe, s.konten);
    if (salah) return gagal(`${no}: ${salah}`);
  }

  const sesi = await getSesiGuru();
  let client: Awaited<ReturnType<typeof createClient>>;
  if (jenjang === null) {
    client = await createClient();
  } else {
    if (!isJenjangValid(jenjang)) return gagal("Jenjang tidak valid.");
    const tidakBoleh = await pastikanBolehKeJenjang(sesi, jenjang);
    if (tidakBoleh) return gagal(tidakBoleh);
    client = (await createAdminClient(jenjang)) as unknown as typeof client;
  }

  const { data: mapel } = await client
    .from("mapel")
    .select("id, nama, event_id, event(nama)")
    .eq("id", mapelId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (!mapel) return gagal("Mapel tidak ditemukan. Muat ulang halaman lalu coba lagi.");

  const { count } = await client
    .from("soal")
    .select("id", { count: "exact", head: true })
    .eq("mapel_id", mapelId);
  const awal = count ?? 0;

  const baris = daftar.map((s, i) => ({
    mapel_id: mapelId,
    tipe: s.tipe,
    urutan: awal + i + 1,
    skor: Number(s.skor),
    konten_jsonb: s.konten,
    gambar_url: s.gambarUrl,
  }));

  const { data: masuk, error } = await client.from("soal").insert(baris).select("id, urutan");
  if (error || !masuk) {
    console.error("[impor-json] gagal insert soal:", error?.message);
    return gagal(
      /unique|duplicate/i.test(error?.message ?? "")
        ? "Nomor urut bentrok dengan soal yang baru ditambahkan orang lain. Muat ulang halaman lalu unggah lagi."
        : "Gagal menyimpan soal. Coba lagi."
    );
  }

  if (jenjang !== null) {
    await catatLogManual(
      client as unknown as Parameters<typeof catatLogManual>[0],
      { guruId: sesi.guruId, nama: sesi.nama, email: sesi.email, jenjangSesi: sesi.jenjang },
      jenjang,
      "insert",
      "soal",
      null,
      { mapel_id: mapelId, jumlah: masuk.length, sumber: "impor_json" }
    );
  }

  let keBank = false;
  if (simpanKeBank) {
    const idPerUrutan = new Map(masuk.map((m) => [Number(m.urutan), m.id as string]));
    const eventNama = (mapel.event as unknown as { nama: string } | null)?.nama ?? null;
    const { error: bankError } = await client.from("bank_soal").upsert(
      baris.map((b) => ({
        mapel_nama: mapel.nama,
        tipe: b.tipe,
        skor: b.skor,
        konten_jsonb: b.konten_jsonb,
        gambar_url: b.gambar_url,
        asal_soal_id: idPerUrutan.get(b.urutan) ?? null,
        asal_event_nama: eventNama,
        dibuat_oleh: sesi.guruId,
        dibuat_oleh_nama: sesi.nama,
      })),
      { onConflict: "asal_soal_id" }
    );
    // Sama seperti simpanKeBankSoal: kegagalan bank tidak menggagalkan soal.
    if (bankError) console.error("[impor-json] gagal salin ke bank:", bankError.message);
    else keBank = true;
  }

  revalidatePath(`/admin/event/${eventId}/mapel/${mapelId}`);
  return { error: null, jumlah: masuk.length, keBank };
}
