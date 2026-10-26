"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  PENANDA_AKUN_SISWA,
  buatPasswordSiswa,
  emailSiswaDariUsername,
  normalkanUsername,
  pilihUsernameSiswa,
} from "@/lib/akun";

export type ImportSiswaInputRow = {
  nomorBaris: number; // nomor baris asli di file (1-based, header tidak dihitung) — untuk pesan error yang bisa ditelusuri guru
  nama: string;
  /** Kosong = dibuat otomatis dari nama (lihat `pilihUsernameSiswa`). */
  username: string;
  kelas: string;
};

export type ImportSiswaRowResult =
  | {
      status: "berhasil";
      nomorBaris: number;
      nama: string;
      username: string;
      kelasNama: string;
      password: string;
    }
  | {
      status: "dilewati";
      nomorBaris: number;
      nama: string;
      username: string;
      alasan: string;
    };

type AdminClient = Awaited<ReturnType<typeof createAdminClient>>;

/** Semua username siswa di project ini (huruf kecil), untuk memilih username otomatis. */
async function ambilUsernameTerpakai(admin: AdminClient): Promise<Set<string>> {
  const { data } = await admin.from("siswa").select("username");
  return new Set((data ?? []).map((s) => String(s.username).toLowerCase()));
}

/**
 * Buat akun Supabase Auth untuk satu siswa.
 *
 * `usernameDiminta` kosong = username dibuat dari nama. Kalau email hasil
 * username otomatis ternyata sudah dipegang akun auth lain (sisa siswa yang
 * barisnya dihapus lewat SQL), calon berikutnya dicoba. Username yang
 * diketik admin tidak pernah diganti diam-diam — bentrok = gagal.
 *
 * Password: 3 huruf + 3 angka (`buatPasswordSiswa`), tampil sekali ke admin
 * lalu hanya tersimpan sebagai hash di Supabase Auth.
 */
async function buatAkunAuthSiswa(
  admin: AdminClient,
  nama: string,
  usernameDiminta: string,
  terpakai: Set<string>,
  password: string
): Promise<
  { ok: true; userId: string; username: string } | { ok: false; pesan: string }
> {
  for (let percobaan = 0; percobaan < 5; percobaan++) {
    const username = usernameDiminta || pilihUsernameSiswa(nama, terpakai);
    const { data, error } = await admin.auth.admin.createUser({
      email: emailSiswaDariUsername(username),
      password,
      email_confirm: true,
      app_metadata: PENANDA_AKUN_SISWA,
    });
    if (data?.user) return { ok: true, userId: data.user.id, username };

    const bentrok = /already|registered|exists/i.test(error?.message ?? "");
    if (usernameDiminta || !bentrok) {
      return {
        ok: false,
        pesan: `Gagal membuat akun auth: ${error?.message ?? "tidak diketahui"}.`,
      };
    }
    terpakai.add(username);
  }
  return {
    ok: false,
    pesan: "Gagal membuat akun auth: username otomatis terus bentrok dengan akun lama.",
  };
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
  const sessionSupabase = await createClient();
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

  let admin;
  try {
    admin = await createAdminClient();
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
  // ini ("terpakai") HANYA optimisasi supaya baris yang sudah pasti
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
  //
  // Seluruh username project dimuat sekali (±200 baris per jenjang), bukan
  // hanya yang ada di batch: username otomatis harus menghindari SEMUA
  // username yang sudah ada, dan bertambah tiap baris yang berhasil.
  const terpakai = await ambilUsernameTerpakai(admin);

  const results: ImportSiswaRowResult[] = [];

  for (const row of rows) {
    const nama = row.nama.trim();
    const usernameDiminta = normalkanUsername(row.username);
    const kelasNamaInput = row.kelas.trim();

    if (!nama || !kelasNamaInput) {
      results.push({
        status: "dilewati",
        nomorBaris: row.nomorBaris,
        nama,
        username: usernameDiminta,
        alasan: "Data tidak lengkap (nama/kelas ada yang kosong), dilewati.",
      });
      continue;
    }

    const kelasId = kelasMap.get(kelasNamaInput);
    if (!kelasId) {
      results.push({
        status: "dilewati",
        nomorBaris: row.nomorBaris,
        nama,
        username: usernameDiminta,
        alasan: `Kelas '${kelasNamaInput}' tidak ditemukan, dilewati.`,
      });
      continue;
    }

    if (usernameDiminta && terpakai.has(usernameDiminta)) {
      results.push({
        status: "dilewati",
        nomorBaris: row.nomorBaris,
        nama,
        username: usernameDiminta,
        alasan: `Username '${usernameDiminta}' sudah dipakai, dilewati. Kosongkan kolom Username supaya dibuat otomatis dari nama.`,
      });
      continue;
    }

    const password = buatPasswordSiswa();
    const akun = await buatAkunAuthSiswa(admin, nama, usernameDiminta, terpakai, password);
    if (!akun.ok) {
      results.push({
        status: "dilewati",
        nomorBaris: row.nomorBaris,
        nama,
        username: usernameDiminta,
        alasan: akun.pesan,
      });
      continue;
    }
    const { username } = akun;

    const { error: insertError } = await admin.from("siswa").insert({
      auth_id: akun.userId,
      nama,
      kelas_id: kelasId,
      username,
    });

    if (insertError) {
      const { error: rollbackError } = await admin.auth.admin.deleteUser(
        akun.userId
      );
      const rollbackMsg = rollbackError
        ? ` Rollback akun auth JUGA GAGAL (id: ${akun.userId}) — perlu dihapus manual lewat dashboard Supabase Auth.`
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

    terpakai.add(username);
    results.push({
      status: "berhasil",
      nomorBaris: row.nomorBaris,
      nama,
      username,
      kelasNama: kelasNamaInput,
      password,
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
 * Pola auth/otorisasi SENGAJA disalin persis dari `importSiswaBatch` di
 * atas (guard "pemanggil harus guru login"); password baru dari
 * `buatPasswordSiswa()` (3 huruf + 3 angka), sama seperti import.
 *
 * Beda dari import: biasanya akun auth-nya sudah ada, jadi cukup satu
 * panggilan `admin.auth.admin.updateUserById(..., { password })`. Baris
 * siswa yang dimasukkan lewat SQL dan belum punya akun auth (`auth_id`
 * kosong, lihat 0023) dibuatkan akunnya di sini dengan username barisnya.
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
  const sessionSupabase = await createClient();
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
    admin = await createAdminClient();
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

  const password = buatPasswordSiswa();

  if (siswaRow.auth_id) {
    const { error: updateError } = await admin.auth.admin.updateUserById(
      siswaRow.auth_id,
      { password, app_metadata: PENANDA_AKUN_SISWA }
    );

    if (updateError) {
      return {
        success: false,
        error: `Gagal reset password: ${updateError.message}.`,
      };
    }
  } else {
    const akun = await buatAkunAuthSiswa(
      admin,
      siswaRow.nama,
      normalkanUsername(siswaRow.username),
      new Set(),
      password
    );
    if (!akun.ok) return { success: false, error: akun.pesan };

    const { error: tautError } = await admin
      .from("siswa")
      .update({ auth_id: akun.userId })
      .eq("id", siswaRow.id);
    if (tautError) {
      await admin.auth.admin.deleteUser(akun.userId);
      return {
        success: false,
        error: `Gagal menautkan akun baru ke data siswa: ${tautError.message}.`,
      };
    }
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
 * Tambah SATU siswa lewat form manual — poin 2 sisi admin. Username boleh
 * dikosongkan (dibuat dari nama), password selalu acak 3 huruf + 3 angka
 * dan ditampilkan sekali ke admin untuk ditulis di kartu login siswa.
 */
export async function tambahSiswaManual(
  nama: string,
  username: string,
  kelasId: string
): Promise<TambahSiswaManualResult> {
  const sessionSupabase = await createClient();
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
  const usernameDiminta = normalkanUsername(username);

  if (!namaBersih || !kelasId) {
    return {
      success: false,
      error: "Nama dan kelas wajib diisi.",
    };
  }

  let admin;
  try {
    admin = await createAdminClient();
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Konfigurasi server tidak lengkap.",
    };
  }

  const terpakai = await ambilUsernameTerpakai(admin);
  if (usernameDiminta && terpakai.has(usernameDiminta)) {
    return {
      success: false,
      error: "Username ini sudah dipakai siswa lain. Kosongkan supaya dibuat otomatis dari nama.",
    };
  }

  const password = buatPasswordSiswa();
  const akun = await buatAkunAuthSiswa(admin, namaBersih, usernameDiminta, terpakai, password);
  if (!akun.ok) return { success: false, error: akun.pesan };

  const { error: insertError } = await admin.from("siswa").insert({
    auth_id: akun.userId,
    nama: namaBersih,
    kelas_id: kelasId,
    username: akun.username,
  });

  if (insertError) {
    await admin.auth.admin.deleteUser(akun.userId);
    return {
      success: false,
      error: `Gagal menyimpan data siswa: ${insertError.message}.`,
    };
  }

  const { error: logError } = await sessionSupabase.rpc("catat_log_aktivitas", {
    p_aksi: "tambah_siswa_manual",
    p_entitas: "siswa",
    p_entitas_id: akun.userId,
    p_detail: { nama: namaBersih, username: akun.username },
  });
  if (logError) console.error("Gagal mencatat log tambah_siswa_manual:", logError);

  revalidatePath("/admin/siswa");
  revalidatePath("/admin/log");
  return { success: true, nama: namaBersih, username: akun.username, password };
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
  const supabase = await createClient();

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
  const sessionSupabase = await createClient();
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
    admin = await createAdminClient();
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

  // Baris dari SQL yang belum punya akun auth (0023): tidak ada akun untuk
  // dihapus, jadi barisnya sendiri yang dihapus (cascade tetap berlaku).
  const { error: deleteError } = siswaRow.auth_id
    ? await admin.auth.admin.deleteUser(siswaRow.auth_id)
    : await admin.from("siswa").delete().eq("id", siswaRow.id);
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
