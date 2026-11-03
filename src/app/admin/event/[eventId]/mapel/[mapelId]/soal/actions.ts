"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { TIPE_SOAL_LIST } from "@/lib/soal";
import type { TipeSoal } from "@/types";
import { getSesiGuru, pastikanBolehKeJenjang } from "@/lib/admin-guard";
import { validasiKonten } from "@/lib/validasi-soal";
import { createAdminClient } from "@/lib/supabase/admin";
import { simpanKeBankSoal } from "@/lib/bank-soal";
import { isJenjangValid, type Jenjang } from "@/lib/jenjang";
import {
  buatSoalAdmin as tulisSoalBaruAdmin,
  updateSoalAdmin as tulisUpdateSoalAdmin,
  hapusSoalAdmin as tulisHapusSoalAdmin,
  type SoalAdminInput,
  type KonteksAdmin,
} from "@/lib/supabase/admin-multi";

/**
 * Hasil satu kali submit form soal.
 *
 * `sukses` & `nonce` adalah tambahan untuk alur "input berantai" (lihat
 * `createSoal` di bawah): setelah soal tersimpan, form TIDAK lagi
 * berpindah halaman, jadi ia butuh cara mengetahui bahwa simpanan
 * barusan berhasil supaya bisa mengosongkan dirinya sendiri.
 *
 * `nonce` ada karena dua penyimpanan berturut-turut bisa menghasilkan
 * pesan `sukses` yang sama persis. Tanpa nilai yang selalu berubah,
 * `useEffect` di form tidak bisa membedakan "sukses baru" dari "sukses
 * lama yang masih tertinggal di state" — dan form hanya akan
 * mengosongkan diri pada soal pertama, lalu diam pada soal kedua dan
 * seterusnya.
 */
export type ActionState = {
  error: string | null;
  sukses?: string | null;
  nonce?: number;
  /** true kalau salinan ke Bank Soal juga berhasil. */
  keBank?: boolean;
};

/**
 * Nama mapel & event untuk label arsip Bank Soal.
 *
 * Dibaca terpisah (bukan dioper dari form) supaya nilainya selalu
 * berasal dari database, bukan dari sesuatu yang bisa diubah di
 * browser. Nama mapel inilah yang jadi pengelompokan bank soal — kalau
 * client boleh menentukannya, satu orang bisa mengarsipkan soal
 * matematika ke bawah nama "Bahasa Inggris".
 */
async function ambilLabelMapel(
  client: SupabaseClient,
  mapelId: string
): Promise<{ mapelNama: string; eventNama: string | null }> {
  const { data } = await client
    .from("mapel")
    .select("nama, event(nama)")
    .eq("id", mapelId)
    .maybeSingle();

  return {
    mapelNama: data?.nama ?? "Tanpa Mapel",
    eventNama:
      (data?.event as unknown as { nama: string } | null)?.nama ?? null,
  };
}

export async function createSoal(
  eventId: string,
  mapelId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const tipe = String(formData.get("tipe") ?? "") as TipeSoal;
  const skorRaw = String(formData.get("skor") ?? "").trim();
  const skor = Number(skorRaw);
  const gambarUrl = String(formData.get("gambar_url") ?? "").trim() || null;
  const kontenRaw = String(formData.get("konten_jsonb") ?? "{}");

  if (!TIPE_SOAL_LIST.includes(tipe)) {
    return { error: "Tipe soal tidak valid." };
  }
  if (!skorRaw || Number.isNaN(skor) || skor <= 0) {
    return { error: "Skor wajib diisi angka lebih dari 0." };
  }

  let konten: Record<string, unknown>;
  try {
    konten = JSON.parse(kontenRaw);
  } catch {
    return { error: "Data soal tidak valid. Coba isi ulang form." };
  }

  const validasiError = validasiKonten(tipe, konten);
  if (validasiError) {
    return { error: validasiError };
  }

  const supabase = await createClient();

  // urutan = jumlah soal yang sudah ada di mapel ini + 1 (auto, tidak
  // diisi manual — lihat PROMPT-SESI-3.md poin 4).
  const { count } = await supabase
    .from("soal")
    .select("id", { count: "exact", head: true })
    .eq("mapel_id", mapelId);

  const nomorBaru = (count ?? 0) + 1;

  const { data: soalBaru, error } = await supabase
    .from("soal")
    .insert({
      mapel_id: mapelId,
      tipe,
      urutan: nomorBaru,
      skor,
      konten_jsonb: konten,
      gambar_url: gambarUrl,
    })
    .select("id")
    .single();

  if (error || !soalBaru) {
    return { error: "Gagal menyimpan soal. Coba lagi." };
  }

  // Salinan ke Bank Soal. Kegagalannya SENGAJA tidak menggagalkan
  // penyimpanan soal — lihat komentar panjang di simpanKeBankSoal().
  // `lewati_bank=1`: dikirim generator AI kalau paket soal yang sama sudah
  // disimpan guru ke Bank Soal — tanpa ini bank berisi dua salinan.
  const sesi = await getSesiGuru();
  const label = await ambilLabelMapel(supabase, mapelId);
  const keBank = formData.get("lewati_bank") === "1" ? false : await simpanKeBankSoal(supabase, {
    mapelNama: label.mapelNama,
    tipe,
    skor,
    kontenJsonb: konten,
    gambarUrl,
    asalSoalId: soalBaru.id as string,
    asalEventNama: label.eventNama,
    dibuatOleh: sesi.guruId,
    dibuatOlehNama: sesi.nama,
  });

  revalidatePath(`/admin/event/${eventId}/mapel/${mapelId}`);

  // ── KENAPA TIDAK REDIRECT LAGI ──
  //
  // Versi lama melempar guru kembali ke daftar soal setiap kali satu
  // soal tersimpan. Untuk satu-dua soal itu terasa wajar; untuk 50 soal
  // — jumlah yang normal untuk satu mapel PAS — artinya 50 kali memuat
  // ulang halaman daftar, 50 kali menggulir ke bawah mencari tombol
  // "+ Tambah Soal", dan 50 kali menunggu form kosong dimuat lagi.
  //
  // Sekarang form tetap di tempat dan mengosongkan dirinya sendiri,
  // lalu menggulir balik ke pemilih tipe soal di atas supaya guru
  // langsung bisa memilih bentuk soal berikutnya. Kembali ke daftar
  // soal jadi tindakan yang disengaja lewat tombol, bukan efek samping
  // dari menyimpan.
  return {
    error: null,
    sukses: `Soal nomor ${nomorBaru} tersimpan.`,
    nonce: Date.now(),
    keBank,
  };
}

/**
 * Update soal yang sudah ada. Validasi konten sama persis dengan
 * createSoal (bentuk konten_jsonb per tipe tidak berubah antara tambah
 * dan edit). `urutan` sengaja tidak diubah di sini — edit tidak mengubah
 * posisi soal, cuma isinya.
 *
 * CATATAN (lihat PROMPT-SESI-5.md & PROMPT-SESI-6.md): belum ada
 * re-scoring OTOMATIS saat kunci jawaban diedit setelah ada siswa submit.
 * Kalau soal ini sudah dikerjakan siswa, guru perlu klik "Hitung Ulang
 * Nilai" di /admin/nilai secara manual setelah edit — UI form edit soal
 * menampilkan peringatan ini (lihat SoalForm.tsx prop `jumlahSudahSubmit`).
 */
export async function updateSoal(
  eventId: string,
  mapelId: string,
  soalId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const tipe = String(formData.get("tipe") ?? "") as TipeSoal;
  const skorRaw = String(formData.get("skor") ?? "").trim();
  const skor = Number(skorRaw);
  const gambarUrl = String(formData.get("gambar_url") ?? "").trim() || null;
  const kontenRaw = String(formData.get("konten_jsonb") ?? "{}");

  if (!TIPE_SOAL_LIST.includes(tipe)) {
    return { error: "Tipe soal tidak valid." };
  }
  if (!skorRaw || Number.isNaN(skor) || skor <= 0) {
    return { error: "Skor wajib diisi angka lebih dari 0." };
  }

  let konten: Record<string, unknown>;
  try {
    konten = JSON.parse(kontenRaw);
  } catch {
    return { error: "Data soal tidak valid. Coba isi ulang form." };
  }

  const validasiError = validasiKonten(tipe, konten);
  if (validasiError) {
    return { error: validasiError };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("soal")
    .update({
      tipe,
      skor,
      konten_jsonb: konten,
      gambar_url: gambarUrl,
    })
    .eq("id", soalId)
    .eq("mapel_id", mapelId);

  if (error) {
    return { error: "Gagal menyimpan perubahan soal. Coba lagi." };
  }

  revalidatePath(`/admin/event/${eventId}/mapel/${mapelId}`);
  redirect(`/admin/event/${eventId}/mapel/${mapelId}`);
}

/**
 * Hapus soal. `nilai.detail_jsonb` menyimpan skor per soal_id sebagai key
 * JSON (bukan foreign key), jadi tidak ada `on delete cascade` yang
 * otomatis bersih-bersih di situ — nilai yang sudah dihitung TETAP ada
 * (total_skor tidak berubah otomatis). Kalau soal yang dihapus sudah
 * pernah dikerjakan siswa, sarankan guru "Hitung Ulang Nilai" setelah ini
 * supaya total_skor konsisten dengan soal yang tersisa.
 */
export async function deleteSoal(
  eventId: string,
  mapelId: string,
  soalId: string
): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("soal")
    .delete()
    .eq("id", soalId)
    .eq("mapel_id", mapelId);

  if (error) {
    return { error: "Gagal menghapus soal. Coba lagi." };
  }

  revalidatePath(`/admin/event/${eventId}/mapel/${mapelId}`);
  redirect(`/admin/event/${eventId}/mapel/${mapelId}`);
}

// ---------------------------------------------------------------------------
// Varian ADMIN — sama persis validasinya dengan createSoal/updateSoal/
// deleteSoal di atas (fungsi guru biasa di atas SENGAJA tidak disentuh),
// bedanya tiga hal:
//   1. Menerima `jenjang` EKSPLISIT (dari `?jenjang=` di URL yang diklik
//      admin), bukan dari cookie sesi — lalu divalidasi ulang lewat
//      `pastikanBolehKeJenjang()` di server. Guru biasa yang mencoba
//      memanggil ini untuk jenjang lain akan ditolak di titik ini.
//   2. Menulis lewat `await createAdminClient()` (service_role, bypass RLS) via
//      `buatSoalAdmin`/`updateSoalAdmin`/`hapusSoalAdmin` di
//      admin-multi.ts — BUKAN `await createClient()` cookie-bound seperti jalur
//      guru, karena akun admin project jenjang A tidak dikenal oleh
//      project jenjang B/C.
//   3. Log `log_aktivitas` dicatat MANUAL lewat `catatLogManual()` (di
//      dalam admin-multi.ts) — trigger DB `trg_soal_log` sengaja diam
//      untuk pemanggil service_role (lihat migrasi
//      0013_admin_lintas_jenjang_soal_nilai.sql), jadi tanpa pencatatan
//      manual ini aksi admin akan berhasil menulis tapi tidak pernah
//      tercatat di /admin/log.
//
// Redirect di akhir SENGAJA membawa `?jenjang=` supaya admin yang baru
// saja menambah/mengedit/menghapus soal di kelas 8 (misalnya) tidak
// "terlempar" balik ke tampilan kelas asal sesi login-nya begitu mendarat
// lagi di halaman detail mapel.
// ---------------------------------------------------------------------------

async function ambilKonteksAdmin(): Promise<{
  sesi: Awaited<ReturnType<typeof getSesiGuru>>;
  konteks: KonteksAdmin;
}> {
  const sesi = await getSesiGuru();
  const konteks: KonteksAdmin = {
    guruId: sesi.guruId,
    nama: sesi.nama,
    email: sesi.email,
    jenjangSesi: sesi.jenjang,
  };
  return { sesi, konteks };
}

export async function createSoalAdmin(
  jenjang: Jenjang,
  eventId: string,
  mapelId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  if (!isJenjangValid(jenjang)) {
    return { error: "Jenjang tidak valid." };
  }

  const { sesi, konteks } = await ambilKonteksAdmin();
  const tidakBoleh = await pastikanBolehKeJenjang(sesi, jenjang);
  if (tidakBoleh) return { error: tidakBoleh };

  const tipe = String(formData.get("tipe") ?? "") as TipeSoal;
  const skorRaw = String(formData.get("skor") ?? "").trim();
  const skor = Number(skorRaw);
  const gambarUrl = String(formData.get("gambar_url") ?? "").trim() || null;
  const kontenRaw = String(formData.get("konten_jsonb") ?? "{}");

  if (!TIPE_SOAL_LIST.includes(tipe)) {
    return { error: "Tipe soal tidak valid." };
  }
  if (!skorRaw || Number.isNaN(skor) || skor <= 0) {
    return { error: "Skor wajib diisi angka lebih dari 0." };
  }

  let konten: Record<string, unknown>;
  try {
    konten = JSON.parse(kontenRaw);
  } catch {
    return { error: "Data soal tidak valid. Coba isi ulang form." };
  }

  const validasiError = validasiKonten(tipe, konten);
  if (validasiError) {
    return { error: validasiError };
  }

  const input: SoalAdminInput = {
    mapelId,
    tipe,
    skor,
    kontenJsonb: konten,
    gambarUrl,
  };

  let soalBaruId: string | null = null;
  try {
    // `buatSoalAdmin` mengembalikan id soal barunya langsung (string).
    soalBaruId = await tulisSoalBaruAdmin(jenjang, input, konteks);
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Gagal menyimpan soal.",
    };
  }

  // Bank soal jalur admin memakai service_role, sama seperti tulis
  // soalnya sendiri — akun admin project jenjang A memang tidak dikenal
  // oleh project jenjang B/C, jadi client cookie-bound akan ditolak RLS.
  let keBank = false;
  if (soalBaruId && formData.get("lewati_bank") !== "1") {
    const adminClient = await createAdminClient(jenjang);
    const label = await ambilLabelMapel(adminClient, mapelId);
    keBank = await simpanKeBankSoal(adminClient, {
      mapelNama: label.mapelNama,
      tipe,
      skor,
      kontenJsonb: konten,
      gambarUrl,
      asalSoalId: soalBaruId,
      asalEventNama: label.eventNama,
      dibuatOleh: sesi.guruId,
      dibuatOlehNama: sesi.nama,
    });
  }

  revalidatePath(`/admin/event/${eventId}/mapel/${mapelId}`);

  return {
    error: null,
    sukses: "Soal tersimpan.",
    nonce: Date.now(),
    keBank,
  };
}

/** Sama seperti updateSoal() guru — `urutan` tidak diubah, validasi konten
 *  identik lewat `validasiKonten()` yang sama. */
export async function updateSoalAdmin(
  jenjang: Jenjang,
  eventId: string,
  mapelId: string,
  soalId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  if (!isJenjangValid(jenjang)) {
    return { error: "Jenjang tidak valid." };
  }

  const { sesi, konteks } = await ambilKonteksAdmin();
  const tidakBoleh = await pastikanBolehKeJenjang(sesi, jenjang);
  if (tidakBoleh) return { error: tidakBoleh };

  const tipe = String(formData.get("tipe") ?? "") as TipeSoal;
  const skorRaw = String(formData.get("skor") ?? "").trim();
  const skor = Number(skorRaw);
  const gambarUrl = String(formData.get("gambar_url") ?? "").trim() || null;
  const kontenRaw = String(formData.get("konten_jsonb") ?? "{}");

  if (!TIPE_SOAL_LIST.includes(tipe)) {
    return { error: "Tipe soal tidak valid." };
  }
  if (!skorRaw || Number.isNaN(skor) || skor <= 0) {
    return { error: "Skor wajib diisi angka lebih dari 0." };
  }

  let konten: Record<string, unknown>;
  try {
    konten = JSON.parse(kontenRaw);
  } catch {
    return { error: "Data soal tidak valid. Coba isi ulang form." };
  }

  const validasiError = validasiKonten(tipe, konten);
  if (validasiError) {
    return { error: validasiError };
  }

  const input: SoalAdminInput = {
    mapelId,
    tipe,
    skor,
    kontenJsonb: konten,
    gambarUrl,
  };

  try {
    await tulisUpdateSoalAdmin(jenjang, soalId, input, konteks);
  } catch (e) {
    return {
      error:
        e instanceof Error ? e.message : "Gagal menyimpan perubahan soal.",
    };
  }

  revalidatePath(`/admin/event/${eventId}/mapel/${mapelId}`);
  redirect(`/admin/event/${eventId}/mapel/${mapelId}?jenjang=${jenjang}`);
}

/** Sama seperti deleteSoal() guru — nilai yang sudah dihitung tidak
 *  otomatis ikut berubah, tetap sarankan "Hitung Ulang Nilai" ke admin. */
export async function deleteSoalAdmin(
  jenjang: Jenjang,
  eventId: string,
  mapelId: string,
  soalId: string
): Promise<ActionState> {
  if (!isJenjangValid(jenjang)) {
    return { error: "Jenjang tidak valid." };
  }

  const { sesi, konteks } = await ambilKonteksAdmin();
  const tidakBoleh = await pastikanBolehKeJenjang(sesi, jenjang);
  if (tidakBoleh) return { error: tidakBoleh };

  try {
    await tulisHapusSoalAdmin(jenjang, soalId, mapelId, konteks);
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Gagal menghapus soal. Coba lagi.",
    };
  }

  revalidatePath(`/admin/event/${eventId}/mapel/${mapelId}`);
  redirect(`/admin/event/${eventId}/mapel/${mapelId}?jenjang=${jenjang}`);
}
// ===========================================================================
// EDIT SKOR CEPAT — dari daftar soal, tanpa membuka butir soalnya
//
// ── KENAPA PERLU JALUR SENDIRI ──
//
// Menyetel bobot adalah pekerjaan yang dilakukan pada SELURUH mapel
// sekaligus, bukan per soal: guru melihat "total skor 87" lalu ingin
// membuatnya pas 100. Untuk itu dia perlu membandingkan bobot antar soal
// dan menggeser beberapa di antaranya — pekerjaan yang mustahil dilakukan
// kalau setiap perubahan bobot berarti membuka halaman edit soal,
// menunggu form berisi lengkap dengan seluruh opsi dan gambarnya dimuat,
// mengubah satu angka, menyimpan, lalu kembali ke daftar.
//
// Aksi ini HANYA menyentuh kolom `skor`. Konten soal tidak ikut dibaca
// maupun ditulis — jadi tidak ada risiko menyimpan versi konten yang
// sudah usang dari form yang kebetulan terbuka di tab lain.
// ===========================================================================

export type SkorState = { error: string | null; nilaiBaru?: number };

function validasiSkor(raw: string): { skor: number } | { error: string } {
  const skor = Number(raw.trim());
  if (!raw.trim() || Number.isNaN(skor)) {
    return { error: "Skor harus berupa angka." };
  }
  if (skor <= 0) {
    return { error: "Skor harus lebih dari 0." };
  }
  // Batas atas dipasang bukan karena database tidak sanggup, tapi karena
  // salah ketik "100" jadi "1000" pada satu butir akan diam-diam membuat
  // seluruh bobot mapel itu timpang, dan baru ketahuan setelah nilai
  // keluar.
  if (skor > 1000) {
    return { error: "Skor terlalu besar — maksimal 1000 per butir." };
  }
  return { skor };
}

export async function updateSkorSoal(
  eventId: string,
  mapelId: string,
  soalId: string,
  skorRaw: string
): Promise<SkorState> {
  const hasil = validasiSkor(skorRaw);
  if ("error" in hasil) return hasil;

  const supabase = await createClient();
  const { error } = await supabase
    .from("soal")
    .update({ skor: hasil.skor })
    .eq("id", soalId)
    .eq("mapel_id", mapelId);

  if (error) {
    return { error: "Gagal menyimpan skor. Coba lagi." };
  }

  revalidatePath(`/admin/event/${eventId}/mapel/${mapelId}`);
  return { error: null, nilaiBaru: hasil.skor };
}

/** Varian admin lintas jenjang — service_role, dijaga `pastikanBolehKeJenjang`. */
export async function updateSkorSoalAdmin(
  jenjang: Jenjang,
  eventId: string,
  mapelId: string,
  soalId: string,
  skorRaw: string
): Promise<SkorState> {
  if (!isJenjangValid(jenjang)) {
    return { error: "Jenjang tidak valid." };
  }

  const { sesi } = await ambilKonteksAdmin();
  const tidakBoleh = await pastikanBolehKeJenjang(sesi, jenjang);
  if (tidakBoleh) return { error: tidakBoleh };

  const hasil = validasiSkor(skorRaw);
  if ("error" in hasil) return hasil;

  const client = await createAdminClient(jenjang);
  const { error } = await client
    .from("soal")
    .update({ skor: hasil.skor })
    .eq("id", soalId)
    .eq("mapel_id", mapelId);

  if (error) {
    return { error: "Gagal menyimpan skor. Coba lagi." };
  }

  revalidatePath(`/admin/event/${eventId}/mapel/${mapelId}`);
  return { error: null, nilaiBaru: hasil.skor };
}
