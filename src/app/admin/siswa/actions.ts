"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  emailSiswaDariUsername,
  normalkanUsername,
  passwordDariTanggalISO,
} from "@/lib/akun";

export type ImportSiswaInputRow = {
  nomorBaris: number; // nomor baris asli di file (1-based, header tidak dihitung) — untuk pesan error yang bisa ditelusuri guru
  nama: string;
  username: string;
  kelas: string;
  /**
   * "YYYY-MM-DD", opsional. Kalau terisi, password akun mengikuti
   * konvensi login siswa yang sesungguhnya (DDMMYYYY — lihat
   * `LoginForm.tsx` dan `src/lib/akun.ts`), BUKAN password acak. Kalau
   * kosong/tidak valid, jatuh ke password acak seperti sebelumnya —
   * siswa itu tidak akan bisa login dengan tanggal lahir sampai
   * passwordnya di-reset manual, dan itu ditandai jelas di kolom
   * ringkasan hasil import.
   */
  tanggalLahir?: string;
};

export type ImportSiswaRowResult =
  | {
      status: "berhasil";
      nomorBaris: number;
      nama: string;
      username: string;
      kelasNama: string;
      password: string;
      /** true kalau password = tanggal lahir (siswa bisa login normal
       *  lewat form biasa); false kalau password acak (tanggal lahir
       *  kosong/tidak valid di file — siswa ini TIDAK bisa login pakai
       *  tanggal lahir sampai adminnya reset password manual). */
      passwordDariTanggalLahir: boolean;
    }
  | {
      status: "dilewati";
      nomorBaris: number;
      nama: string;
      username: string;
      alasan: string;
    };

/**
 * Generate password acak (12 karakter, campuran huruf+angka, tanpa
 * karakter ambigu 0/O/1/l/I) — dipilih random-per-siswa (bukan password
 * seragam) supaya satu password bocor tidak membuka akses ke seluruh
 * kelas. Trade-off: guru WAJIB menyalin/mengunduh hasilnya sebelum
 * meninggalkan halaman (lihat tombol "Download CSV hasil" di UI) karena
 * password ini tidak disimpan plaintext di mana pun setelah di-hash oleh
 * Supabase Auth — kalau hilang, satu-satunya jalan adalah reset password,
 * bukan lihat ulang.
 */
function generatePassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 12; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

/**
 * Proses satu batch (mis. 50 baris) dari import siswa. Dipanggil berulang
 * dari client per batch (lihat ImportSiswaForm.tsx) supaya 600 baris
 * tidak jadi satu Server Action raksasa yang bisa timeout / gagal total
 * tanpa jejak baris mana yang berhasil.
 *
 * Urutan tiap baris: validasi (lengkap, kelas cocok, username unik) ->
 * `auth.admin.createUser` (service role) -> insert baris `siswa`. Kalau
 * insert siswa gagal SETELAH createUser berhasil, akun auth di-rollback
 * lewat `admin.deleteUser` supaya tidak ada akun auth "yatim" tanpa baris
 * siswa yang menaut — kalau rollback itu sendiri gagal, dicatat jelas di
 * alasan supaya guru tahu perlu provisioning ulang manual.
 */
export async function importSiswaBatch(
  rows: ImportSiswaInputRow[]
): Promise<ImportSiswaRowResult[]> {
  // Pastikan pemanggil benar-benar guru yang login — service role di
  // bawah ini melewati RLS sepenuhnya, jadi pengecekan ini WAJIB dilakukan
  // manual di sini, bukan diserahkan ke RLS seperti action lain.
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
      username: r.username,
      alasan: "Ditolak: hanya guru/admin yang login yang boleh import akun.",
    }));
  }

  const emailSuffix =
    process.env.NEXT_PUBLIC_SISWA_EMAIL_SUFFIX ?? "@siswa.lms-cbt.local";

  let admin;
  try {
    admin = createAdminClient();
  } catch (err) {
    return rows.map((r) => ({
      status: "dilewati" as const,
      nomorBaris: r.nomorBaris,
      nama: r.nama,
      username: r.username,
      alasan: err instanceof Error ? err.message : "Konfigurasi server tidak lengkap.",
    }));
  }

  const { data: kelasList } = await admin.from("kelas").select("id, nama");
  const kelasMap = new Map((kelasList ?? []).map((k) => [k.nama, k.id]));

  // Analisis race condition dua guru import bersamaan dengan username sama
  // persis (nunggak sejak Sesi 6-7, dianalisis Sesi 10): pre-check di bawah
  // ini ("usernameSudahAda") HANYA optimisasi supaya baris yang sudah pasti
  // bentrok tidak perlu memanggil `auth.admin.createUser` sia-sia — ini
  // BUKAN satu-satunya lapisan perlindungan. `siswa.username` punya
  // constraint `unique` di level DB (0001_init.sql) yang tetap berlaku
  // walau dua request berjalan benar-benar bersamaan (pre-check di masing-
  // masing request bisa saja lolos pada saat yang sama, tapi INSERT kedua
  // akan ditolak DB). Jalur error itu SUDAH ditangani di bawah (blok
  // `insertError`): akun `auth.users` yang baru dibuat langsung di-rollback
  // (`admin.deleteUser`), jadi tidak ada akun "yatim" walau baris `siswa`-
  // nya gagal karena bentrok. Kesimpulan: skenario ini sudah aman dari sisi
  // konsistensi data TANPA perlu kode tambahan — belum ada uji manual
  // dengan dua request sungguhan bersamaan ke project Supabase asli (masih
  // nunggak, lihat README/PROMPT-SESI-11.md), tapi itu soal verifikasi,
  // bukan soal ada-tidaknya perlindungan.
  const usernamesDiBatch = rows.map((r) => r.username.trim()).filter(Boolean);
  const { data: siswaExisting } = await admin
    .from("siswa")
    .select("username")
    .in("username", usernamesDiBatch.length > 0 ? usernamesDiBatch : [""]);
  const usernameSudahAda = new Set((siswaExisting ?? []).map((s) => s.username));

  const results: ImportSiswaRowResult[] = [];
  const usernameDipakaiDiBatchIni = new Set<string>();

  for (const row of rows) {
    const nama = row.nama.trim();
    const username = row.username.trim();
    const kelasNamaInput = row.kelas.trim();

    if (!nama || !username || !kelasNamaInput) {
      results.push({
        status: "dilewati",
        nomorBaris: row.nomorBaris,
        nama,
        username,
        alasan: "Data tidak lengkap (nama/username/kelas ada yang kosong), dilewati.",
      });
      continue;
    }

    const kelasId = kelasMap.get(kelasNamaInput);
    if (!kelasId) {
      results.push({
        status: "dilewati",
        nomorBaris: row.nomorBaris,
        nama,
        username,
        alasan: `Kelas '${kelasNamaInput}' tidak ditemukan, dilewati.`,
      });
      continue;
    }

    if (usernameSudahAda.has(username) || usernameDipakaiDiBatchIni.has(username)) {
      results.push({
        status: "dilewati",
        nomorBaris: row.nomorBaris,
        nama,
        username,
        alasan: `Username '${username}' sudah dipakai, dilewati.`,
      });
      continue;
    }

    const passwordDariTanggal = row.tanggalLahir
      ? passwordDariTanggalISO(row.tanggalLahir)
      : null;
    const password = passwordDariTanggal ?? generatePassword();
    const email = `${username}${emailSuffix}`;

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
        username,
        alasan: `Gagal membuat akun auth: ${createError?.message ?? "tidak diketahui"}.`,
      });
      continue;
    }

    const { error: insertError } = await admin.from("siswa").insert({
      auth_id: created.user.id,
      nama,
      kelas_id: kelasId,
      username,
      tanggal_lahir: passwordDariTanggal ? row.tanggalLahir : null,
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
        username,
        alasan: `Gagal menyimpan baris siswa: ${insertError.message}.${rollbackMsg}`,
      });
      continue;
    }

    usernameDipakaiDiBatchIni.add(username);
    results.push({
      status: "berhasil",
      nomorBaris: row.nomorBaris,
      nama,
      username,
      kelasNama: kelasNamaInput,
      password,
      passwordDariTanggalLahir: Boolean(passwordDariTanggal),
    });
  }

  // Dicatat manual (BUKAN trigger di tabel `siswa`) — lihat poin 3 di
  // catatan keputusan desain 0009_log_aktivitas.sql: satu batch (sampai
  // 50 baris) adalah satu aksi guru, dicatat sebagai satu baris log
  // dengan ringkasan jumlah berhasil/dilewati, bukan satu baris per
  // siswa yang berhasil dibuat.
  const jumlahBerhasil = results.filter((r) => r.status === "berhasil").length;
  const jumlahDilewati = results.filter((r) => r.status === "dilewati").length;
  const { error: logError } = await sessionSupabase.rpc(
    "catat_log_aktivitas",
    {
      p_aksi: "import_siswa",
      p_entitas: "siswa",
      p_entitas_id: null,
      p_detail: {
        jumlah_baris: rows.length,
        jumlah_berhasil: jumlahBerhasil,
        jumlah_dilewati: jumlahDilewati,
      },
    }
  );
  if (logError) {
    console.error("Gagal mencatat log import_siswa:", logError);
  }

  revalidatePath("/admin/siswa");
  revalidatePath("/admin/log");
  return results;
}

export type ResetPasswordResult =
  | { success: true; password: string }
  | { success: false; error: string };

/**
 * Reset password SATU akun siswa (Sesi 11, kandidat #2 dari
 * PROMPT-SESI-11.md) — sebelum ini satu-satunya jalan kalau siswa lupa
 * password adalah reset manual lewat dashboard Supabase Auth, tidak ada
 * tombol di aplikasi sama sekali.
 *
 * Pola auth/otorisasi & generate password SENGAJA disalin persis dari
 * `importSiswaBatch` di atas (guard "pemanggil harus guru login" +
 * `generatePassword()` acak 12 karakter) — bukan diekstrak jadi helper
 * bersama, karena keduanya kebetulan sama sekarang tapi bisa saja
 * berbeda kebutuhannya nanti (mis. reset butuh syarat tambahan seperti
 * cooldown, import tidak). Kalau nanti terbukti selalu identik, boleh
 * disatukan di sesi mendatang.
 *
 * Beda dari import: di sini TIDAK ada createUser/rollback sama sekali —
 * akun auth-nya sudah ada, jadi cukup satu panggilan
 * `admin.auth.admin.updateUserById(..., { password })`. Tidak ada jalur
 * "gagal setengah jalan" yang butuh rollback seperti import, karena cuma
 * satu operasi tunggal (update password), bukan create+insert dua
 * langkah.
 *
 * Password baru ditampilkan SEKALI ke guru di client (lihat
 * `AkunAksiButtons.tsx`, Sesi 13 — menggantikan `ResetPasswordButton.tsx`
 * Sesi 11 yang sekarang disatukan dengan tombol hapus akun) — tidak
 * disimpan plaintext di mana pun setelah response ini, sama seperti
 * password hasil import.
 */
export async function resetPasswordSiswa(
  siswaId: string
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

  const { data: siswaRow, error: siswaError } = await admin
    .from("siswa")
    .select("id, nama, username, auth_id")
    .eq("id", siswaId)
    .maybeSingle();

  if (siswaError || !siswaRow) {
    return { success: false, error: "Akun siswa tidak ditemukan." };
  }

  const password = generatePassword();
  const { error: updateError } = await admin.auth.admin.updateUserById(
    siswaRow.auth_id,
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
      p_aksi: "reset_password_siswa",
      p_entitas: "siswa",
      p_entitas_id: siswaRow.id,
      p_detail: { nama: siswaRow.nama, username: siswaRow.username },
    }
  );
  if (logError) {
    console.error("Gagal mencatat log reset_password_siswa:", logError);
  }

  revalidatePath("/admin/log");
  return { success: true, password };
}

export type TambahSiswaManualResult =
  | {
      success: true;
      nama: string;
      username: string;
      password: string;
    }
  | { success: false; error: string };

/**
 * Tambah SATU siswa lewat form manual — poin 2 sisi admin. Password
 * diturunkan dari tanggal lahir (format DDMMYYYY, konsisten dengan
 * `LoginForm.tsx` dan akun siswa lama — lihat `src/lib/akun.ts` untuk
 * penjelasan kenapa format INI yang dipakai, bukan varian lain yang
 * pernah ada di kode lama), bukan diketik admin — supaya siswa dan
 * admin tidak perlu bertukar password lewat kertas terpisah; siswa
 * cukup diberi tahu username-nya, sisanya sudah dia hafal.
 */
export async function tambahSiswaManual(
  nama: string,
  username: string,
  kelasId: string,
  tanggalLahirISO: string
): Promise<TambahSiswaManualResult> {
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
      error: "Ditolak: hanya guru/admin yang login yang boleh menambah akun.",
    };
  }

  const namaBersih = nama.trim();
  const usernameBersih = normalkanUsername(username);
  const password = passwordDariTanggalISO(tanggalLahirISO);

  if (!namaBersih || !usernameBersih || !kelasId) {
    return {
      success: false,
      error: "Nama, username, dan kelas wajib diisi.",
    };
  }
  if (!password) {
    return {
      success: false,
      error: "Tanggal lahir tidak valid.",
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

  const { data: usernameSudahAda } = await admin
    .from("siswa")
    .select("nama")
    .eq("username", usernameBersih)
    .maybeSingle();
  if (usernameSudahAda) {
    return {
      success: false,
      error: `Username ini sudah dipakai siswa lain (${usernameSudahAda.nama}).`,
    };
  }

  const email = emailSiswaDariUsername(usernameBersih);
  const { data: created, error: createError } = await admin.auth.admin.createUser(
    { email, password, email_confirm: true }
  );
  if (createError || !created?.user) {
    return {
      success: false,
      error: `Gagal membuat akun auth: ${createError?.message ?? "tidak diketahui"}.`,
    };
  }

  const { error: insertError } = await admin.from("siswa").insert({
    auth_id: created.user.id,
    nama: namaBersih,
    kelas_id: kelasId,
    username: usernameBersih,
    tanggal_lahir: tanggalLahirISO,
  });

  if (insertError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return {
      success: false,
      error: `Gagal menyimpan data siswa: ${insertError.message}.`,
    };
  }

  const { error: logError } = await sessionSupabase.rpc("catat_log_aktivitas", {
    p_aksi: "tambah_siswa_manual",
    p_entitas: "siswa",
    p_entitas_id: created.user.id,
    p_detail: { nama: namaBersih, username: usernameBersih },
  });
  if (logError) console.error("Gagal mencatat log tambah_siswa_manual:", logError);

  revalidatePath("/admin/siswa");
  revalidatePath("/admin/log");
  return { success: true, nama: namaBersih, username: usernameBersih, password };
}

export type DampakHapusSiswa = {
  jumlahJawabanSiswa: number;
  jumlahSudahSubmit: number;
  jumlahNilai: number;
};

/**
 * Hitung dampak sebelum akun siswa dihapus (Sesi 13, kandidat #1 dari
 * PROMPT-SESI-13.md — digeser dari Sesi 11 ke 12 ke 13 tanpa disentuh,
 * baru dikerjakan di sini). Pola sama dengan
 * `hitungDampakHapusEvent`/`hitungDampakHapusMapel` (Sesi 6, lihat
 * `admin/event/actions.ts`): dipanggil TEPAT SEBELUM guru mengonfirmasi
 * hapus (dari `AkunAksiButtons.tsx`, bukan dihitung untuk semua baris
 * tabel saat halaman dirender) — beda dari `/admin/event/[eventId]`
 * (satu halaman detail, satu event, murah dihitung tiap render),
 * `/admin/siswa` menampilkan sampai 200 baris sekaligus, jadi pra-hitung
 * dampak semua baris di render akan jadi ratusan query sia-sia untuk
 * baris yang mungkin tidak pernah diklik "Hapus" sama sekali.
 *
 * Pakai client session (RLS), BUKAN admin client — cukup untuk SELECT
 * count, konsisten dengan `hitungDampakHapusEvent` yang juga tidak pakai
 * service role untuk baca-baca saja (RLS guru sudah full-read di tabel
 * ini, lihat 0005_rls_policies.sql).
 */
export async function hitungDampakHapusSiswa(
  siswaId: string
): Promise<DampakHapusSiswa> {
  const supabase = createClient();

  const { count: jumlahJawabanSiswa } = await supabase
    .from("jawaban_siswa")
    .select("mapel_id", { count: "exact", head: true })
    .eq("siswa_id", siswaId);

  const { count: jumlahSudahSubmit } = await supabase
    .from("jawaban_siswa")
    .select("mapel_id", { count: "exact", head: true })
    .eq("siswa_id", siswaId)
    .not("submitted_at", "is", null);

  const { count: jumlahNilai } = await supabase
    .from("nilai")
    .select("mapel_id", { count: "exact", head: true })
    .eq("siswa_id", siswaId);

  return {
    jumlahJawabanSiswa: jumlahJawabanSiswa ?? 0,
    jumlahSudahSubmit: jumlahSudahSubmit ?? 0,
    jumlahNilai: jumlahNilai ?? 0,
  };
}

export type HapusAkunResult = { success: true } | { success: false; error: string };

/**
 * Hapus SATU akun siswa permanen (Sesi 13, kandidat #1). Cukup SATU
 * panggilan `admin.auth.admin.deleteUser` — `siswa.auth_id` punya FK
 * `references auth.users (id) on delete cascade` (0001_init.sql), jadi
 * baris `siswa` ikut terhapus OTOMATIS oleh Postgres begitu baris
 * `auth.users`-nya hilang. `jawaban_siswa` dan `nilai` punya FK cascade
 * ke `siswa` juga (0004_jawaban_siswa.sql), jadi ikut terhapus secara
 * transitif — TIDAK ADA satu pun statement DELETE manual ke tabel-tabel
 * itu yang ditulis di sini, cukup satu panggilan Auth API di titik
 * paling atas rantai referensi.
 *
 * Konsekuensinya: TIDAK ADA jalur rollback yang perlu ditangani di sini
 * (beda dari `importSiswaBatch` yang punya jalur create-lalu-gagal-
 * insert dua langkah) — ini satu operasi tunggal yang atomik dari sudut
 * pandang DB (cascade dijamin oleh constraint FK Postgres, bukan
 * langkah terpisah yang dikoordinasi manual dari kode aplikasi).
 *
 * Dicatat MANUAL ke log_aktivitas (bukan trigger) — konsisten dengan
 * `import_siswa`/`reset_password_siswa` di atas: entitas 'siswa' selalu
 * dicatat manual di SELURUH jenis aksinya (import, reset, hapus), supaya
 * tidak campur trigger-untuk-satu-aksi-tapi-manual-untuk-aksi-lain di
 * entitas yang sama (lihat juga alasan kenapa `siswa`/`guru` tidak punya
 * trigger generik sama sekali di 0009_log_aktivitas.sql). Snapshot
 * nama/username diambil SEBELUM delete — baris `siswa` sudah tidak ada
 * lagi begitu delete berhasil, jadi tidak bisa dibaca ulang sesudahnya.
 */
export async function deleteSiswa(siswaId: string): Promise<HapusAkunResult> {
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

  let admin;
  try {
    admin = createAdminClient();
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Konfigurasi server tidak lengkap.",
    };
  }

  const { data: siswaRow, error: siswaError } = await admin
    .from("siswa")
    .select("id, nama, username, auth_id")
    .eq("id", siswaId)
    .maybeSingle();

  if (siswaError || !siswaRow) {
    return { success: false, error: "Akun siswa tidak ditemukan." };
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(
    siswaRow.auth_id
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
      p_aksi: "hapus_siswa",
      p_entitas: "siswa",
      p_entitas_id: siswaRow.id,
      p_detail: { nama: siswaRow.nama, username: siswaRow.username },
    }
  );
  if (logError) {
    console.error("Gagal mencatat log hapus_siswa:", logError);
  }

  revalidatePath("/admin/siswa");
  revalidatePath("/admin/log");
  return { success: true };
}
