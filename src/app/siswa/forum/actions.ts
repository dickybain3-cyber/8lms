"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getJenjangFromServerCookies } from "@/lib/jenjang-server";
import { getCloudinaryConfig } from "@/lib/supabase/config";
import {
  bolehMengirimPesan,
  alasanTidakBolehMengirim,
  jenisIsiValid,
  rapikanIsiPesan,
  urlGambarForumSah,
  apakahUuid,
  BATAS_PANJANG_PESAN,
} from "@/lib/forum";

export type ActionState = { error: string | null };

/**
 * Kirim pesan siswa ke ruang forum kelasnya sendiri.
 *
 * Field FormData yang dibaca:
 *   - `isi`         teks / emoticon / sticker / keterangan foto
 *   - `jenis_isi`   "teks" | "sticker" | "emoticon" | "gambar"
 *   - `gambar_url`  WAJIB kalau jenis_isi = "gambar", diabaikan selain itu
 *   - `balas_ke_id` opsional — pesan lain di ruang yang sama yang dikutip
 *
 * ── KENAPA FASE DICEK DI SINI JUGA, PADAHAL SUDAH ADA POLICY RLS ──
 *
 * Policy `forum_pesan_insert_siswa` (0020) sudah menolak insert di luar
 * jendela `dibuka_at..ditutup_at` — itu jaring pengaman yang sebenarnya.
 * Pengecekan di sini murni supaya siswa yang mengirim pas beberapa detik
 * setelah forum tertutup mendapat kalimat manusiawi ("forum ini sudah
 * ditutup") alih-alih pesan error Postgres mentah soal row-level
 * security. Kalau dua-duanya sampai tidak sinkron suatu saat (mis. RLS
 * diubah tanpa mengubah `forum.ts`), RLS yang menang — pesan tetap
 * tertolak, cuma kalimatnya jadi kurang ramah.
 *
 * ── DUA HAL YANG HANYA DITEGAKKAN DI SINI, BUKAN OLEH RLS ──
 *
 * 1. `gambar_url`. Policy insert tidak melihat isi kolom ini. Klien
 *    (FormChatForum) memang selalu mengisinya dari hasil unggahan
 *    Cloudinary, tapi Server Action bisa dipanggil langsung dengan
 *    FormData apa pun — jadi URL-nya dicek di sini harus benar-benar
 *    berasal dari Cloudinary milik jenjang ini (`urlGambarForumSah`).
 * 2. `balas_ke_id`. FK cuma memastikan id-nya ADA, bukan bahwa pesan itu
 *    di forum_topik + kelas yang sama. Dicek di `pesanDibalasSah`.
 *
 * ── KOLOM BARU HANYA DIKIRIM KALAU TERISI ──
 *
 * `gambar_url` dan `balas_ke_id` (migrasi 0021) tidak dimasukkan ke
 * payload insert kalau kosong. Dengan begitu pesan teks/sticker/emoticon
 * biasa tetap berjalan di project yang 0021-nya belum sempat dijalankan;
 * hanya pesan foto/balasan yang gagal di sana (dan pesannya jelas, lihat
 * penanganan error insert di bawah).
 */
export async function kirimPesanSiswa(
  forumTopikId: string,
  kelasId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const jenisIsi = String(formData.get("jenis_isi") ?? "teks");
  if (!jenisIsiValid(jenisIsi)) {
    return { error: "Jenis pesan tidak dikenali." };
  }

  const isi = rapikanIsiPesan(jenisIsi, String(formData.get("isi") ?? ""));
  if (isi === null) {
    return { error: "Pesan tidak boleh kosong." };
  }
  if (isi.length > BATAS_PANJANG_PESAN) {
    return {
      error: `Pesan terlalu panjang (maksimal ${BATAS_PANJANG_PESAN} karakter).`,
    };
  }

  const gambarUrl = String(formData.get("gambar_url") ?? "").trim();
  if (jenisIsi === "gambar" && !gambarUrl) {
    return { error: "Foto belum selesai diunggah. Tunggu sebentar lalu kirim lagi." };
  }

  const balasKeIdMentah = String(formData.get("balas_ke_id") ?? "").trim();
  if (balasKeIdMentah && !apakahUuid(balasKeIdMentah)) {
    return { error: "Pesan yang dibalas tidak valid." };
  }

  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Sesi kamu berakhir. Masuk lagi ya." };
  }

  const { data: siswa } = await supabase
    .from("siswa")
    .select("id, kelas_id")
    .eq("auth_id", user.id)
    .maybeSingle();

  if (!siswa || siswa.kelas_id !== kelasId) {
    return { error: "Kamu tidak terdaftar di kelas ruang forum ini." };
  }

  const { data: topik } = await supabase
    .from("forum_topik")
    .select("dibuka_at, ditutup_at")
    .eq("id", forumTopikId)
    .maybeSingle();

  if (!topik) {
    return { error: "Forum tidak ditemukan." };
  }

  const waktu = {
    dibuka_at: topik.dibuka_at as string,
    ditutup_at: topik.ditutup_at as string,
  };
  if (!bolehMengirimPesan(waktu, Date.now())) {
    return { error: alasanTidakBolehMengirim(waktu, Date.now()) ?? "Belum bisa mengirim pesan." };
  }

  if (jenisIsi === "gambar") {
    let cloudName = "";
    try {
      const jenjang = getJenjangFromServerCookies();
      if (jenjang) cloudName = getCloudinaryConfig(jenjang).cloudName;
    } catch {
      // variabel env Cloudinary jenjang ini belum lengkap — ditangani di bawah
    }
    if (!cloudName) {
      return { error: "Pengaturan unggah foto belum lengkap. Hubungi gurumu." };
    }
    if (!urlGambarForumSah(gambarUrl, cloudName)) {
      return { error: "Foto tidak valid. Pilih ulang fotonya lalu coba lagi." };
    }
  }

  if (balasKeIdMentah) {
    const { data: dibalas } = await supabase
      .from("forum_pesan")
      .select("id")
      .eq("id", balasKeIdMentah)
      .eq("forum_topik_id", forumTopikId)
      .eq("kelas_id", kelasId)
      .maybeSingle();
    if (!dibalas) {
      return { error: "Pesan yang mau dibalas tidak ditemukan di ruang ini." };
    }
  }

  const { error } = await supabase.from("forum_pesan").insert({
    forum_topik_id: forumTopikId,
    kelas_id: kelasId,
    siswa_id: siswa.id,
    isi,
    jenis_isi: jenisIsi,
    ...(jenisIsi === "gambar" ? { gambar_url: gambarUrl } : {}),
    ...(balasKeIdMentah ? { balas_ke_id: balasKeIdMentah } : {}),
  });

  if (error) {
    if (jenisIsi === "gambar" || balasKeIdMentah) {
      return {
        error:
          "Gagal mengirim. Kalau ini terus terjadi untuk foto atau balasan, kemungkinan migrasi 0021 belum dijalankan di database kelas ini — hubungi admin sistem.",
      };
    }
    return { error: "Gagal mengirim pesan. Coba lagi." };
  }

  revalidatePath(`/siswa/forum/${forumTopikId}`);
  return { error: null };
}
