"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { bolehMengirimPesan, alasanTidakBolehMengirim } from "@/lib/forum";

export type ActionState = { error: string | null };

const JENIS_ISI_VALID = new Set(["teks", "sticker", "emoticon"]);

/**
 * Kirim pesan siswa ke ruang forum kelasnya sendiri.
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
 */
export async function kirimPesanSiswa(
  forumTopikId: string,
  kelasId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const isi = String(formData.get("isi") ?? "").trim();
  const jenisIsi = String(formData.get("jenis_isi") ?? "teks");

  if (!isi) {
    return { error: "Pesan tidak boleh kosong." };
  }
  if (isi.length > 2000) {
    return { error: "Pesan terlalu panjang (maksimal 2000 karakter)." };
  }
  if (!JENIS_ISI_VALID.has(jenisIsi)) {
    return { error: "Jenis pesan tidak dikenali." };
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

  const { error } = await supabase.from("forum_pesan").insert({
    forum_topik_id: forumTopikId,
    kelas_id: kelasId,
    siswa_id: siswa.id,
    isi,
    jenis_isi: jenisIsi,
  });

  if (error) {
    return { error: "Gagal mengirim pesan. Coba lagi." };
  }

  revalidatePath(`/siswa/forum/${forumTopikId}`);
  return { error: null };
}
