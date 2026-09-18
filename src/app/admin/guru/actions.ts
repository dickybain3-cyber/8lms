"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  emailGuruDariUsername,
  nipValid,
  normalkanUsername,
  PASSWORD_AWAL_GURU,
} from "@/lib/akun";

/**
 * ── REVISI BESAR SESI INI: GURU LOGIN PAKAI NIP, BUKAN EMAIL ──
 *
 * File ini sebelumnya membuat akun guru dengan EMAIL ASLI sebagai
 * identitas login. Itu diganti total: identitas login guru sekarang
 * adalah NIP (kolom baru `guru.nip`/`guru.username`, migrasi
 * `0015_guru_nip_username.sql`), dan email yang dipakai Supabase Auth
 * di baliknya dirakit otomatis — guru tidak pernah melihatnya. Alasan
 * lengkapnya ada di komentar migrasi 0015 dan di `src/lib/akun.ts`.
 *
 * Password akun guru baru SERAGAM (`PASSWORD_AWAL_GURU`, "guru123456"),
 * BUKAN acak per-akun seperti sebelumnya — permintaan eksplisit.
 * Konsekuensinya: siapa pun yang tahu NIP seorang guru bisa login
 * sebagai guru itu sampai passwordnya diganti. Tombol reset password
 * tetap memakai password ACAK (lihat `resetPasswordGuru`) supaya ada
 * jalan mengeraskan satu akun tertentu kapan pun dibutuhkan.
 */

export type ImportGuruInputRow = {
  nomorBaris: number;
  no?: string | number;
  nama: string;
  nip: string;
};

export type ImportGuruRowResult =
  | {
      status: "berhasil";
      nomorBaris: number;
      nama: string;
      nip: string;
      username: string;
      password: string;
    }
  | {
      status: "dilewati";
      nomorBaris: number;
      nama: string;
      nip: string;
      alasan: string;
    };

async function pastikanPemanggilGuru(sessionSupabase: ReturnType<typeof createClient>) {
  const {
    data: { user },
  } = await sessionSupabase.auth.getUser();
  const { data: guruRow } = await sessionSupabase
    .from("guru")
    .select("id")
    .eq("auth_id", user?.id ?? "")
    .maybeSingle();
  return guruRow;
}

/**
 * Import guru dari Excel (lihat `src/lib/excel.ts`). Kolom yang dibaca:
 * No (diabaikan, cuma kenyamanan mengisi template), Nama, NIP. Username
 * dan password ditentukan OTOMATIS dari NIP — tidak diminta dari file,
 * persis permintaan: "username = NIP, password = guru123456".
 */
export async function importGuruBatch(
  rows: ImportGuruInputRow[]
): Promise<ImportGuruRowResult[]> {
  const sessionSupabase = createClient();
  const guruRow = await pastikanPemanggilGuru(sessionSupabase);

  if (!guruRow) {
    return rows.map((r) => ({
      status: "dilewati" as const,
      nomorBaris: r.nomorBaris,
      nama: r.nama,
      nip: String(r.nip ?? ""),
      alasan: "Ditolak: hanya guru/admin yang login yang boleh import akun.",
    }));
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (err) {
    return rows.map((r) => ({
      status: "dilewati" as const,
      nomorBaris: r.nomorBaris,
      nama: r.nama,
      nip: String(r.nip ?? ""),
      alasan:
        err instanceof Error ? err.message : "Konfigurasi server tidak lengkap.",
    }));
  }

  const results: ImportGuruRowResult[] = [];
  const usernameDipakaiDiBatchIni = new Set<string>();

  for (const row of rows) {
    const nama = String(row.nama ?? "").trim();
    // NIP dari Excel sering ikut format angka murni atau ada spasi
    // pemisah grup ("1965 0412 ..."). Spasinya dibuang di sini; validasi
    // panjang/digit berlaku pada hasil yang sudah dibersihkan.
    const nip = String(row.nip ?? "").trim().replace(/\s+/g, "");

    if (!nama || !nip) {
      results.push({
        status: "dilewati",
        nomorBaris: row.nomorBaris,
        nama,
        nip,
        alasan: "Data tidak lengkap (nama/NIP ada yang kosong), dilewati.",
      });
      continue;
    }

    if (!nipValid(nip)) {
      results.push({
        status: "dilewati",
        nomorBaris: row.nomorBaris,
        nama,
        nip,
        alasan: `NIP '${nip}' tidak valid (harus 8-25 digit angka), dilewati.`,
      });
      continue;
    }

    const username = normalkanUsername(nip);

    if (usernameDipakaiDiBatchIni.has(username)) {
      results.push({
        status: "dilewati",
        nomorBaris: row.nomorBaris,
        nama,
        nip,
        alasan: `NIP '${nip}' dobel di dalam file ini, dilewati.`,
      });
      continue;
    }

    // Cek dobel dengan guru yang SUDAH ADA di database sebelum mencoba
    // createUser, supaya pesan errornya jelas ("NIP sudah dipakai guru
    // lain") bukan pesan mentah Supabase Auth soal email terdaftar.
    const { data: nipSudahAda } = await admin
      .from("guru")
      .select("nama")
      .eq("username", username)
      .maybeSingle();

    if (nipSudahAda) {
      results.push({
        status: "dilewati",
        nomorBaris: row.nomorBaris,
        nama,
        nip,
        alasan: `NIP '${nip}' sudah dipakai guru lain (${nipSudahAda.nama}), dilewati.`,
      });
      continue;
    }

    const email = emailGuruDariUsername(username);
    const password = PASSWORD_AWAL_GURU;

    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (createError || !created?.user) {
      results.push({
        status: "dilewati",
        nomorBaris: row.nomorBaris,
        nama,
        nip,
        alasan: `Gagal membuat akun auth: ${
          createError?.message ?? "tidak diketahui"
        }.`,
      });
      continue;
    }

    const { error: insertError } = await admin.from("guru").insert({
      auth_id: created.user.id,
      nama,
      nip,
      username,
    });

    if (insertError) {
      const { error: rollbackError } = await admin.auth.admin.deleteUser(
        created.user.id
      );
      const rollbackMsg = rollbackError
        ? ` Rollback akun auth JUGA GAGAL (id: ${created.user.id}) — perlu dihapus manual lewat dashboard Supabase Auth.`
        : " Akun auth sudah di-rollback (dihapus lagi) otomatis.";
      results.push({
        status: "dilewati",
        nomorBaris: row.nomorBaris,
        nama,
        nip,
        alasan: `Gagal menyimpan baris guru: ${insertError.message}.${rollbackMsg}`,
      });
      continue;
    }

    usernameDipakaiDiBatchIni.add(username);
    results.push({
      status: "berhasil",
      nomorBaris: row.nomorBaris,
      nama,
      nip,
      username,
      password,
    });
  }

  const jumlahBerhasil = results.filter((r) => r.status === "berhasil").length;
  const jumlahDilewati = results.filter((r) => r.status === "dilewati").length;
  const { error: logError } = await sessionSupabase.rpc(
    "catat_log_aktivitas",
    {
      p_aksi: "import_guru",
      p_entitas: "guru",
      p_entitas_id: null,
      p_detail: {
        jumlah_baris: rows.length,
        jumlah_berhasil: jumlahBerhasil,
        jumlah_dilewati: jumlahDilewati,
      },
    }
  );
  if (logError) console.error("Gagal mencatat log import_guru:", logError);

  revalidatePath("/admin/guru");
  revalidatePath("/admin/log");
  return results;
}

export type TambahGuruManualResult =
  | { success: true; nama: string; username: string; password: string }
  | { success: false; error: string };

/**
 * Tambah SATU guru lewat form manual (bukan Excel) — poin 2 sisi admin.
 * Bidangnya persis yang diminta: nama, NIP; username dan password
 * diturunkan otomatis (username = NIP, password = "guru123456"), tidak
 * diminta dari form supaya tidak ada peluang admin mengetik username
 * yang berbeda dari NIP-nya sendiri secara tidak sengaja.
 */
export async function tambahGuruManual(
  nama: string,
  nip: string
): Promise<TambahGuruManualResult> {
  const sessionSupabase = createClient();
  const guruRow = await pastikanPemanggilGuru(sessionSupabase);
  if (!guruRow) {
    return {
      success: false,
      error: "Ditolak: hanya guru/admin yang login yang boleh menambah akun.",
    };
  }

  const namaBersih = nama.trim();
  const nipBersih = nip.trim().replace(/\s+/g, "");

  if (!namaBersih) return { success: false, error: "Nama tidak boleh kosong." };
  if (!nipValid(nipBersih)) {
    return {
      success: false,
      error: "NIP tidak valid — harus 8 sampai 25 digit angka.",
    };
  }

  const username = normalkanUsername(nipBersih);

  let admin;
  try {
    admin = createAdminClient();
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Konfigurasi server tidak lengkap.",
    };
  }

  const { data: nipSudahAda } = await admin
    .from("guru")
    .select("nama")
    .eq("username", username)
    .maybeSingle();
  if (nipSudahAda) {
    return {
      success: false,
      error: `NIP ini sudah dipakai guru lain (${nipSudahAda.nama}).`,
    };
  }

  const email = emailGuruDariUsername(username);
  const { data: created, error: createError } = await admin.auth.admin.createUser(
    { email, password: PASSWORD_AWAL_GURU, email_confirm: true }
  );
  if (createError || !created?.user) {
    return {
      success: false,
      error: `Gagal membuat akun auth: ${createError?.message ?? "tidak diketahui"}.`,
    };
  }

  const { error: insertError } = await admin.from("guru").insert({
    auth_id: created.user.id,
    nama: namaBersih,
    nip: nipBersih,
    username,
  });

  if (insertError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return {
      success: false,
      error: `Gagal menyimpan data guru: ${insertError.message}.`,
    };
  }

  const { error: logError } = await sessionSupabase.rpc("catat_log_aktivitas", {
    p_aksi: "tambah_guru_manual",
    p_entitas: "guru",
    p_entitas_id: created.user.id,
    p_detail: { nama: namaBersih, username },
  });
  if (logError) console.error("Gagal mencatat log tambah_guru_manual:", logError);

  revalidatePath("/admin/guru");
  revalidatePath("/admin/log");
  return { success: true, nama: namaBersih, username, password: PASSWORD_AWAL_GURU };
}

export type ResetPasswordResult =
  | { success: true; password: string }
  | { success: false; error: string };

/**
 * Password ACAK — khusus reset, sengaja berbeda dari password awal
 * seragam. Kalau reset ikut memakai `PASSWORD_AWAL_GURU`, tombol
 * "Reset Password" tidak berguna sebagai jalan mengeraskan satu akun
 * (hasilnya balik ke password yang sama-sama diketahui semua orang).
 */
function generatePasswordAcak(): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export async function resetPasswordGuru(
  guruId: string
): Promise<ResetPasswordResult> {
  const sessionSupabase = createClient();
  const guruRow = await pastikanPemanggilGuru(sessionSupabase);

  if (!guruRow) {
    return {
      success: false,
      error: "Ditolak: hanya guru/admin yang login yang boleh reset password.",
    };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Konfigurasi server tidak lengkap.",
    };
  }

  const { data: targetGuru, error: guruError } = await admin
    .from("guru")
    .select("id, nama, auth_id, username")
    .eq("id", guruId)
    .maybeSingle();

  if (guruError || !targetGuru) {
    return { success: false, error: "Akun guru tidak ditemukan." };
  }

  const password = generatePasswordAcak();
  const { error: updateError } = await admin.auth.admin.updateUserById(
    targetGuru.auth_id,
    { password }
  );

  if (updateError) {
    return {
      success: false,
      error: `Gagal reset password: ${updateError.message}.`,
    };
  }

  const { error: logError } = await sessionSupabase.rpc(
    "catat_log_aktivitas",
    {
      p_aksi: "reset_password_guru",
      p_entitas: "guru",
      p_entitas_id: targetGuru.id,
      p_detail: { nama: targetGuru.nama, username: targetGuru.username },
    }
  );
  if (logError) console.error("Gagal mencatat log reset_password_guru:", logError);

  revalidatePath("/admin/log");
  return { success: true, password };
}

export type DampakHapusGuru = { jumlahEventDibuat: number };

export async function hitungDampakHapusGuru(
  guruId: string
): Promise<DampakHapusGuru> {
  const supabase = createClient();
  const { count: jumlahEventDibuat } = await supabase
    .from("event")
    .select("id", { count: "exact", head: true })
    .eq("created_by", guruId);
  return { jumlahEventDibuat: jumlahEventDibuat ?? 0 };
}

export type HapusAkunResult = { success: true } | { success: false; error: string };

export async function deleteGuru(guruId: string): Promise<HapusAkunResult> {
  const sessionSupabase = createClient();
  const guruRow = await pastikanPemanggilGuru(sessionSupabase);

  if (!guruRow) {
    return {
      success: false,
      error: "Ditolak: hanya guru/admin yang login yang boleh menghapus akun.",
    };
  }

  if (guruRow.id === guruId) {
    return {
      success: false,
      error:
        "Tidak bisa menghapus akun sendiri yang sedang dipakai login. Minta guru lain untuk menghapusnya.",
    };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Konfigurasi server tidak lengkap.",
    };
  }

  const { data: targetGuru, error: guruError } = await admin
    .from("guru")
    .select("id, nama, auth_id, username")
    .eq("id", guruId)
    .maybeSingle();

  if (guruError || !targetGuru) {
    return { success: false, error: "Akun guru tidak ditemukan." };
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(
    targetGuru.auth_id
  );
  if (deleteError) {
    return {
      success: false,
      error: `Gagal menghapus akun: ${deleteError.message}.`,
    };
  }

  const { error: logError } = await sessionSupabase.rpc(
    "catat_log_aktivitas",
    {
      p_aksi: "hapus_guru",
      p_entitas: "guru",
      p_entitas_id: targetGuru.id,
      p_detail: { nama: targetGuru.nama, username: targetGuru.username },
    }
  );
  if (logError) console.error("Gagal mencatat log hapus_guru:", logError);

  revalidatePath("/admin/guru");
  revalidatePath("/admin/log");
  return { success: true };
}
