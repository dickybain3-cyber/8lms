"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ImportGuruInputRow = {
  nomorBaris: number; // nomor baris asli di CSV (1-based, header tidak dihitung) — untuk pesan error yang bisa ditelusuri
  nama: string;
  email: string;
};

export type ImportGuruRowResult =
  | {
      status: "berhasil";
      nomorBaris: number;
      nama: string;
      email: string;
      password: string;
    }
  | {
      status: "dilewati";
      nomorBaris: number;
      nama: string;
      email: string;
      alasan: string;
    };

/**
 * Generate password acak (12 karakter, campuran huruf+angka, tanpa
 * karakter ambigu 0/O/1/l/I) — sama seperti `importSiswaBatch`, acak
 * per-guru (bukan seragam) supaya satu password bocor tidak membuka
 * akses ke seluruh akun guru yang diimport sekaligus.
 */
function generatePassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 12; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function emailValid(email: string): boolean {
  // Validasi minimal, cukup untuk menyaring salah ketik yang jelas
  // (bukan validasi RFC 5322 penuh) — Supabase Auth sendiri yang jadi
  // sumber kebenaran akhir soal format email valid.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Proses satu batch import guru. Pola sama persis dengan
 * `importSiswaBatch` (`/admin/siswa/actions.ts`): validasi per baris ->
 * `auth.admin.createUser` (service role) -> insert baris `guru`, dengan
 * rollback `admin.deleteUser` kalau insert baris `guru` gagal setelah
 * akun auth berhasil dibuat.
 *
 * Beda dari import siswa:
 * - Guru login pakai EMAIL ASLI (cek `LoginForm.tsx` tab Admin/Guru —
 *   `identifier` langsung dipakai sebagai email, tidak ditempeli suffix
 *   apa pun), jadi tidak ada email sintetis dan tidak ada kolom
 *   `username` (tabel `guru` memang tidak punya kolom itu, lihat
 *   `0001_init.sql`).
 * - Tidak ada kolom `kelas` — guru tidak terikat ke satu kelas.
 * - Validasi keunikan dicek ke `auth.users` (lewat percobaan
 *   `createUser`, yang akan gagal dengan pesan jelas kalau email sudah
 *   terdaftar) alih-alih tabel `guru` sendiri, karena email adalah
 *   identitas login-nya (unik di `auth.users`, bukan di kolom `guru`).
 *
 * Siapa yang boleh menjalankan import guru? Keputusan Sesi 7: SAMA
 * seperti import siswa — "siapa saja yang sudah jadi guru login" boleh
 * menjalankan, BUKAN dibatasi ke guru pertama/owner. Alasan: skema saat
 * ini tidak punya kolom role/peringkat di tabel `guru` (semua guru yang
 * ada di tabel itu setara hak aksesnya, lihat RLS di
 * `0005_rls_policies.sql`), jadi membatasi ke "guru pertama" berarti
 * menambah konsep baru (mis. kolom `is_owner` atau bergantung ke urutan
 * `created_at`, yang rapuh kalau baris pertama pernah dihapus) yang
 * belum diminta eksplisit oleh spec. Kalau nanti sekolah butuh jenjang
 * hak akses (mis. hanya kepala sekolah yang boleh import guru baru),
 * ini titik yang tepat untuk direvisit — dicatat di PROMPT-SESI-8.md.
 */
export async function importGuruBatch(
  rows: ImportGuruInputRow[]
): Promise<ImportGuruRowResult[]> {
  // Pastikan pemanggil benar-benar guru yang login — service role di
  // bawah ini melewati RLS sepenuhnya, jadi pengecekan ini WAJIB
  // dilakukan manual di sini, bukan diserahkan ke RLS seperti action lain.
  const sessionSupabase = createClient();
  const {
    data: { user },
  } = await sessionSupabase.auth.getUser();
  const { data: guruRow } = await sessionSupabase
    .from("guru")
    .select("id")
    .eq("auth_id", user?.id ?? "")
    .maybeSingle();

  if (!guruRow) {
    return rows.map((r) => ({
      status: "dilewati" as const,
      nomorBaris: r.nomorBaris,
      nama: r.nama,
      email: r.email,
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
      email: r.email,
      alasan:
        err instanceof Error ? err.message : "Konfigurasi server tidak lengkap.",
    }));
  }

  const results: ImportGuruRowResult[] = [];
  const emailDipakaiDiBatchIni = new Set<string>();

  for (const row of rows) {
    const nama = row.nama.trim();
    const email = row.email.trim().toLowerCase();

    if (!nama || !email) {
      results.push({
        status: "dilewati",
        nomorBaris: row.nomorBaris,
        nama,
        email,
        alasan: "Data tidak lengkap (nama/email ada yang kosong), dilewati.",
      });
      continue;
    }

    if (!emailValid(email)) {
      results.push({
        status: "dilewati",
        nomorBaris: row.nomorBaris,
        nama,
        email,
        alasan: `Format email '${email}' tidak valid, dilewati.`,
      });
      continue;
    }

    if (emailDipakaiDiBatchIni.has(email)) {
      results.push({
        status: "dilewati",
        nomorBaris: row.nomorBaris,
        nama,
        email,
        alasan: `Email '${email}' dobel di dalam batch ini, dilewati.`,
      });
      continue;
    }

    const password = generatePassword();

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
        email,
        alasan: `Gagal membuat akun auth: ${
          createError?.message ?? "tidak diketahui"
        }.`,
      });
      continue;
    }

    const { error: insertError } = await admin.from("guru").insert({
      auth_id: created.user.id,
      nama,
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
        email,
        alasan: `Gagal menyimpan baris guru: ${insertError.message}.${rollbackMsg}`,
      });
      continue;
    }

    emailDipakaiDiBatchIni.add(email);
    results.push({
      status: "berhasil",
      nomorBaris: row.nomorBaris,
      nama,
      email,
      password,
    });
  }

  // Dicatat manual, pola identik dengan importSiswaBatch — lihat komentar
  // di sana / poin 3 di 0009_log_aktivitas.sql.
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
  if (logError) {
    console.error("Gagal mencatat log import_guru:", logError);
  }

  revalidatePath("/admin/guru");
  revalidatePath("/admin/log");
  return results;
}

export type ResetPasswordResult =
  | { success: true; password: string }
  | { success: false; error: string };

/**
 * Reset password SATU akun guru (Sesi 11) — pasangan `resetPasswordSiswa`
 * di `/admin/siswa/actions.ts`, lihat komentar panjang di sana untuk
 * alasan desain (kenapa pola auth/password disalin bukan diekstrak,
 * kenapa tidak butuh rollback seperti import). Beda satu-satunya: entitas
 * `guru` tidak punya kolom `username` (guru login pakai email asli dari
 * `auth.users`), jadi detail log & pesan pakai email hasil query balik ke
 * `auth.users` lewat `admin.auth.admin.getUserById`, bukan kolom tabel
 * `guru` sendiri.
 */
export async function resetPasswordGuru(
  guruId: string
): Promise<ResetPasswordResult> {
  const sessionSupabase = createClient();
  const {
    data: { user },
  } = await sessionSupabase.auth.getUser();
  const { data: guruRow } = await sessionSupabase
    .from("guru")
    .select("id")
    .eq("auth_id", user?.id ?? "")
    .maybeSingle();

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
    .select("id, nama, auth_id")
    .eq("id", guruId)
    .maybeSingle();

  if (guruError || !targetGuru) {
    return { success: false, error: "Akun guru tidak ditemukan." };
  }

  const password = generatePassword();
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

  // Gagal-lunak (bukan wajib berhasil): kalau lookup email gagal, log
  // tetap dicatat tanpa email — reset password-nya sendiri sudah sukses
  // di atas dan tidak boleh dianggap gagal cuma karena detail log kurang
  // lengkap.
  let email: string | null = null;
  try {
    const { data: authUser } = await admin.auth.admin.getUserById(
      targetGuru.auth_id
    );
    email = authUser?.user?.email ?? null;
  } catch {
    email = null;
  }

  const { error: logError } = await sessionSupabase.rpc(
    "catat_log_aktivitas",
    {
      p_aksi: "reset_password_guru",
      p_entitas: "guru",
      p_entitas_id: targetGuru.id,
      p_detail: { nama: targetGuru.nama, email },
    }
  );
  if (logError) {
    console.error("Gagal mencatat log reset_password_guru:", logError);
  }

  revalidatePath("/admin/log");
  return { success: true, password };
}

export type DampakHapusGuru = { jumlahEventDibuat: number };

/**
 * Hitung dampak sebelum akun guru dihapus (Sesi 13, pasangan
 * `hitungDampakHapusSiswa` — lihat komentar panjang di sana untuk alasan
 * dipanggil per-klik, bukan pra-hitung semua baris saat render).
 *
 * Beda penting dari siswa: `event.created_by` punya FK `references guru
 * (id) on delete set null` (0002_event_mapel.sql) — BUKAN cascade. Jadi
 * menghapus guru TIDAK menghapus event yang pernah dia buat, cuma
 * melepas kaitan "dibuat oleh"-nya jadi kosong. Dampaknya bersifat
 * informasional ("guru ini pernah membuat N event"), bukan peringatan
 * destruktif seperti versi siswa — dibedakan lewat field `destruktif`
 * yang dihitung di `AkunAksiButtons.tsx`, bukan di sini.
 */
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

/**
 * Hapus SATU akun guru permanen (Sesi 13, kandidat #1 dari
 * PROMPT-SESI-13.md). Pola inti sama dengan `deleteSiswa` (satu
 * panggilan `admin.auth.admin.deleteUser`, cascade FK `guru.auth_id ->
 * auth.users` menghapus baris `guru` otomatis, tidak ada rollback yang
 * perlu ditangani, log dicatat manual) — lihat komentar lengkap di
 * `admin/siswa/actions.ts` untuk alasan pola ini, tidak diulang di sini.
 *
 * Beda dari `deleteSiswa`: ADA pengecekan tambahan — guru tidak boleh
 * menghapus akunnya SENDIRI yang sedang dipakai login saat itu juga
 * (kalau berhasil, sesi login yang sedang berjalan langsung jadi tidak
 * valid di tengah aksi, pengalaman yang membingungkan dan berisiko
 * mengunci diri sendiri dari sistem kalau kebetulan itu satu-satunya
 * akun guru yang ada). Guru lain yang harus menjalankan penghapusan ini
 * — tidak ada override "paksa hapus akun sendiri" yang disediakan,
 * sengaja, supaya tidak ada jalan pintas untuk kondisi yang berisiko
 * mengunci akses admin.
 */
export async function deleteGuru(guruId: string): Promise<HapusAkunResult> {
  const sessionSupabase = createClient();
  const {
    data: { user },
  } = await sessionSupabase.auth.getUser();
  const { data: guruRow } = await sessionSupabase
    .from("guru")
    .select("id")
    .eq("auth_id", user?.id ?? "")
    .maybeSingle();

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
    .select("id, nama, auth_id")
    .eq("id", guruId)
    .maybeSingle();

  if (guruError || !targetGuru) {
    return { success: false, error: "Akun guru tidak ditemukan." };
  }

  // Gagal-lunak sama seperti resetPasswordGuru: lookup email cuma untuk
  // detail log, bukan syarat sukses-tidaknya penghapusan.
  let email: string | null = null;
  try {
    const { data: authUser } = await admin.auth.admin.getUserById(
      targetGuru.auth_id
    );
    email = authUser?.user?.email ?? null;
  } catch {
    email = null;
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
      p_detail: { nama: targetGuru.nama, email },
    }
  );
  if (logError) {
    console.error("Gagal mencatat log hapus_guru:", logError);
  }

  revalidatePath("/admin/guru");
  revalidatePath("/admin/log");
  return { success: true };
}
