"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSesiGuru, pastikanBolehKeJenjang } from "@/lib/admin-guard";
import { isJenjangValid, type Jenjang } from "@/lib/jenjang";
import {
  // overrideNilaiAdmin (data-layer) SENGAJA tidak diimpor lagi — lihat
  // komentar di overrideNilaiAdmin() (action) di bawah: jalur override
  // manual dimatikan total, termasuk di level ini.
  hitungUlangNilaiMapelAdmin as hitungUlangNilaiMapelAdminData,
  type KonteksAdmin,
} from "@/lib/supabase/admin-multi";

export type ActionResult = { error: string | null };

/**
 * Tombol "Hitung Ulang Nilai" — memanggil RPC yang menjalankan ulang
 * `hitung_nilai` untuk semua siswa yang sudah submit di mapel ini (lihat
 * 0007_scoring.sql). Berguna kalau guru mengedit soal/kunci jawaban
 * setelah ada siswa yang sudah submit & dinilai — nilai lama tidak
 * otomatis ter-update sendiri, ini pemicu manualnya.
 */
export async function hitungUlangNilaiMapel(
  mapelId: string
): Promise<ActionResult> {
  const supabase = createClient();

  const { data: jumlahDihitungUlang, error } = await supabase.rpc(
    "hitung_ulang_semua_nilai",
    { p_mapel_id: mapelId }
  );

  if (error) {
    return {
      error:
        "Gagal menghitung ulang nilai. Pastikan kamu login sebagai guru, lalu coba lagi.",
    };
  }

  // Dicatat manual (BUKAN trigger) — lihat poin 3 di catatan keputusan
  // desain 0009_log_aktivitas.sql: `hitung_ulang_semua_nilai` menulis ke
  // `nilai` dengan `is_override = false` untuk tiap siswa yang sudah
  // submit, jadi trigger override tidak menyala (memang sengaja tidak,
  // ini bukan override manual). Satu aksi guru ("hitung ulang nilai
  // mapel X") = satu baris log dengan ringkasan jumlah siswa yang
  // terpengaruh, bukan satu baris log per siswa.
  const { error: logError } = await supabase.rpc("catat_log_aktivitas", {
    p_aksi: "hitung_ulang_nilai",
    p_entitas: "nilai",
    p_entitas_id: mapelId,
    p_detail: { mapel_id: mapelId, jumlah_siswa: jumlahDihitungUlang ?? 0 },
  });
  if (logError) {
    // Kegagalan mencatat log TIDAK membatalkan aksi utama (nilai sudah
    // terhitung ulang) — cukup diabaikan di sini, jangan sampai fitur
    // audit yang gagal membuat fitur inti (pengolahan nilai) ikut gagal.
    console.error("Gagal mencatat log hitung_ulang_nilai:", logError);
  }

  revalidatePath("/admin/nilai");
  revalidatePath("/admin/statistik");
  revalidatePath("/admin/log");
  return { error: null };
}

/**
 * DINONAKTIFKAN SENGAJA — Rekap Penilaian sekarang bersifat fixed/read-only.
 *
 * Dulu fungsi ini melakukan override nilai manual satu siswa (menimpa
 * `total_skor` di tabel `nilai` dengan `is_override = true`). Sekarang
 * SENGAJA dimatikan di level server ini, bukan cuma disembunyikan di UI
 * (lihat NilaiTable.tsx) — supaya nilai benar-benar tidak bisa diubah
 * siapa pun lewat jalur apa pun, termasuk kalau ada yang mencoba memanggil
 * Server Action ini langsung (mis. lewat devtools) tanpa lewat tombol
 * "Ubah" yang sudah dihapus dari UI.
 *
 * Fungsi tetap ada (tidak dihapus) supaya signature-nya tidak memutus
 * pemanggil lama secara diam-diam — panggilan apa pun ke sini akan selalu
 * gagal dengan pesan yang jelas, tidak pernah menyentuh database.
 */
export async function overrideNilai(): Promise<ActionResult> {
  return {
    error:
      "Nilai di Rekap Penilaian bersifat tetap dan tidak bisa diubah manual.",
  };
}

/**
 * Reset ujian satu siswa: menghapus jawabannya di satu mapel beserta
 * nilainya, supaya dia bisa mengerjakan ulang dari nol. Dipakai saat ada
 * insiden nyata di lab (listrik mati, browser tertutup, siswa salah klik
 * "kumpulkan" sebelum selesai).
 *
 * ── KENAPA ADA PARAMETER `jenjang`? ──────────────────────────────────
 * Semua Server Action lama di project ini mengambil project Supabase-nya
 * dari cookie `lms_jenjang` — yaitu dari SESI orang yang mengklik. Untuk
 * aksi ini itu tidak cukup: admin yang sedang menangani insiden biasanya
 * membuka satu daftar berisi siswa dari beberapa jenjang, dan memaksanya
 * logout–login setiap ganti jenjang justru menambah waktu di saat paling
 * genting. Jadi jenjang di sini adalah properti dari BARIS yang diklik.
 *
 * Nilai itu datang dari browser, karena itu TIDAK dipercaya: yang
 * memutuskan boleh atau tidak adalah `pastikanBolehKeJenjang()` di
 * server. Guru biasa hanya lolos untuk jenjang yang sedang dia login-i;
 * cuma `guru.is_admin = true` yang boleh lintas jenjang.
 *
 * ── KENAPA service_role, PADAHAL GURU PUNYA AKSES KE MAPELNYA? ───────
 * Tabel `jawaban_siswa` sengaja TIDAK punya policy DELETE untuk siapa
 * pun (lihat 0005_rls_policies.sql — guru cuma select, siswa cuma
 * insert/update miliknya sendiri). Itu keputusan yang benar dan tidak
 * saya longgarkan: menghapus jawaban adalah operasi merusak yang tidak
 * pantas tersedia lewat anon key di browser. Jalur satu-satunya adalah
 * server, jadi aksi ini memakai service_role bahkan untuk jenjang
 * sendiri, sesudah penjaga di atas lolos.
 */
export async function resetUjianSiswa(params: {
  jenjang: Jenjang;
  mapelId: string;
  siswaId: string;
}): Promise<ActionResult> {
  const { jenjang, mapelId, siswaId } = params;

  if (!isJenjangValid(jenjang)) {
    return { error: "Jenjang tidak valid." };
  }

  const sesi = await getSesiGuru();
  const tidakBoleh = await pastikanBolehKeJenjang(sesi, jenjang);
  if (tidakBoleh) return { error: tidakBoleh };

  const admin = createAdminClient(jenjang);

  // Diambil dulu untuk dicatat di log — sesudah dihapus, nama & skornya
  // tidak bisa direkonstruksi lagi dari mana pun.
  const { data: siswa } = await admin
    .from("siswa")
    .select("nama, username")
    .eq("id", siswaId)
    .maybeSingle();

  const { data: nilaiLama } = await admin
    .from("nilai")
    .select("total_skor")
    .eq("siswa_id", siswaId)
    .eq("mapel_id", mapelId)
    .maybeSingle();

  // Urutannya: `nilai` dulu, baru `jawaban_siswa`. Kalau dibalik,
  // trigger scoring di 0007 berpotensi menulis ulang baris `nilai`
  // sebagai respons atas perubahan jawaban, dan kita justru menghapus
  // nilai yang baru saja dibuat ulang.
  const { error: errorNilai } = await admin
    .from("nilai")
    .delete()
    .eq("siswa_id", siswaId)
    .eq("mapel_id", mapelId);

  if (errorNilai) {
    return { error: "Gagal menghapus nilai lama. Tidak ada yang diubah." };
  }

  const { error: errorJawaban } = await admin
    .from("jawaban_siswa")
    .delete()
    .eq("siswa_id", siswaId)
    .eq("mapel_id", mapelId);

  if (errorJawaban) {
    return {
      error:
        "Nilai sudah terhapus, tapi jawabannya gagal dihapus. Coba jalankan reset sekali lagi.",
    };
  }

  // Log ditulis LANGSUNG ke tabelnya, bukan lewat RPC
  // `catat_log_aktivitas` seperti aksi lain di file ini. Sebabnya: RPC
  // itu diawali `if not is_guru()`, yang bertumpu pada `auth.uid()` —
  // dan service_role tidak membawa identitas user sama sekali, jadi RPC
  // itu pasti melempar error di sini.
  //
  // `guru_id` diisi HANYA kalau resetnya di jenjang sendiri; untuk reset
  // lintas jenjang, id guru milik project asal tidak punya arti di tabel
  // `guru` project tujuan (foreign key-nya akan gagal), jadi dibiarkan
  // null dan pelakunya dicatat lewat email di `detail_jsonb`.
  const lintasJenjang = jenjang !== sesi.jenjang;
  const { error: errorLog } = await admin.from("log_aktivitas").insert({
    guru_id: lintasJenjang ? null : sesi.guruId,
    aksi: "reset_ujian",
    entitas: "jawaban_siswa",
    entitas_id: mapelId,
    detail_jsonb: {
      oleh_nama: sesi.nama ?? sesi.email ?? "tidak diketahui",
      oleh_email: sesi.email,
      lintas_jenjang: lintasJenjang,
      jenjang_asal_sesi: sesi.jenjang,
      jenjang_target: jenjang,
      siswa_id: siswaId,
      siswa_nama: siswa?.nama ?? null,
      siswa_username: siswa?.username ?? null,
      mapel_id: mapelId,
      total_skor_sebelum_reset: nilaiLama?.total_skor ?? null,
    },
  });

  if (errorLog) {
    // Sama seperti aksi lain di file ini: gagal mencatat log tidak
    // membatalkan aksi yang sudah terjadi.
    console.error("Gagal mencatat log reset_ujian:", errorLog.message);
  }

  revalidatePath("/admin/nilai");
  revalidatePath("/admin/statistik");
  revalidatePath("/admin/log");
  return { error: null };
}

// ---------------------------------------------------------------------------
// Varian ADMIN dari overrideNilai() & hitungUlangNilaiMapel() di atas —
// fungsi guru biasa di atas SENGAJA tidak diubah. Pola parameter `jenjang`
// eksplisit + `pastikanBolehKeJenjang()` di sini SAMA PERSIS dengan
// `resetUjianSiswa()` (baca komentarnya kalau ragu). Bedanya:
// `resetUjianSiswa()` sudah lebih dulu SELALU memakai service_role (karena
// `jawaban_siswa` memang tidak punya policy DELETE untuk siapa pun), jadi
// dulu ini tidak perlu "dua jalur". Untuk override & hitung ulang, jalur
// guru biasa di atas TETAP lewat client cookie-bound (RLS, RPC
// `catat_log_aktivitas` yang mensyaratkan `is_guru()`) — itu masih benar
// untuk guru yang login di jenjangnya sendiri. Dua fungsi baru di bawah ini
// HANYA dipakai `<NilaiTable>` saat `isAdmin === true` (lihat
// src/components/admin/Nilai/NilaiTable.tsx), lewat service_role +
// `catatLogManual()` di admin-multi.ts (trigger DB diam untuk service_role
// sejak migrasi 0013_admin_lintas_jenjang_soal_nilai.sql).
// ---------------------------------------------------------------------------

/**
 * DINONAKTIFKAN SENGAJA — sama seperti `overrideNilai()` di atas, ini
 * varian admin-nya. Rekap Penilaian sekarang fixed/read-only untuk semua
 * pengguna, termasuk admin lintas jenjang, jadi jalur service_role ini
 * pun dimatikan di sini, bukan cuma disembunyikan di UI. Tidak lagi
 * memanggil `overrideNilaiAdminData` sama sekali.
 */
export async function overrideNilaiAdmin(): Promise<ActionResult> {
  return {
    error:
      "Nilai di Rekap Penilaian bersifat tetap dan tidak bisa diubah manual.",
  };
}

export async function hitungUlangNilaiMapelAdmin(params: {
  jenjang: Jenjang;
  mapelId: string;
}): Promise<ActionResult> {
  const { jenjang, mapelId } = params;

  if (!isJenjangValid(jenjang)) {
    return { error: "Jenjang tidak valid." };
  }

  const sesi = await getSesiGuru();
  const tidakBoleh = await pastikanBolehKeJenjang(sesi, jenjang);
  if (tidakBoleh) return { error: tidakBoleh };

  const konteks: KonteksAdmin = {
    guruId: sesi.guruId,
    nama: sesi.nama,
    email: sesi.email,
    jenjangSesi: sesi.jenjang,
  };

  try {
    await hitungUlangNilaiMapelAdminData(jenjang, mapelId, konteks);
  } catch (e) {
    return {
      error:
        e instanceof Error
          ? e.message
          : "Gagal menghitung ulang nilai. Coba lagi.",
    };
  }

  revalidatePath("/admin/nilai");
  revalidatePath("/admin/statistik");
  revalidatePath("/admin/log");
  return { error: null };
}