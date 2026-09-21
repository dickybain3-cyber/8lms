"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  jenisEventValid,
  pakaiMesinForum,
  labelJenisEvent,
  type JenisEvent,
} from "@/lib/jenis-event";

export type ActionState = { error: string | null };

/**
 * Server Action untuk mesin FORUM (Tahap 5). Dipisah dari
 * `.../tugas/actions.ts` dan dari `admin/event/actions.ts` dengan alasan
 * yang sama persis seperti Tahap 4 dipisah dari Tahap 3: berkas yang
 * sudah teruji jalan tidak perlu ditimpa untuk memasang mesin baru.
 *
 * Semua fungsi di sini memakai `createClient()` (cookie-bound, kena RLS),
 * BUKAN service role — sama alasannya dengan `tugas/actions.ts`. Guru
 * sudah punya akses penuh lewat policy `*_guru_all` di migrasi 0020.
 */

// ---------------------------------------------------------------------------
// Pembacaan bersama
// ---------------------------------------------------------------------------

/** Salinan `ambilJenisEvent()` dari `tugas/actions.ts` — disalin, bukan
 *  diimpor, dengan alasan yang sama: berkas Tahap 4 yang sudah teruji
 *  jalan tidak perlu diubah sama sekali untuk memasang Tahap 5. */
async function ambilJenisEvent(
  supabase: ReturnType<typeof createClient>,
  eventId: string
): Promise<JenisEvent | null> {
  const lengkap = await supabase
    .from("event")
    .select("jenis")
    .eq("id", eventId)
    .maybeSingle();

  if (!lengkap.error) {
    if (!lengkap.data) return null;
    return jenisEventValid(lengkap.data.jenis)
      ? lengkap.data.jenis
      : "asesmen_akhir";
  }

  const { data: eventLama } = await supabase
    .from("event")
    .select("id")
    .eq("id", eventId)
    .maybeSingle();

  return eventLama ? "asesmen_akhir" : null;
}

async function guruSaatIni(
  supabase: ReturnType<typeof createClient>
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("guru")
    .select("id")
    .eq("auth_id", user.id)
    .maybeSingle();

  return (data?.id as string | undefined) ?? null;
}

// ---------------------------------------------------------------------------
// Validasi form jadwal forum
// ---------------------------------------------------------------------------

interface IsiFormForum {
  dibukaAt: string;
  ditutupAt: string;
  kelasIds: string[];
}

function bacaFormForum(formData: FormData): IsiFormForum {
  return {
    dibukaAt: String(formData.get("dibuka_at") ?? "").trim(),
    ditutupAt: String(formData.get("ditutup_at") ?? "").trim(),
    kelasIds: formData.getAll("kelas_id").map(String).filter(Boolean),
  };
}

function validasiFormForum(isi: IsiFormForum): string | null {
  if (!isi.dibukaAt || !isi.ditutupAt) {
    return "Tanggal & jam dibuka serta ditutup wajib diisi.";
  }
  if (new Date(isi.ditutupAt) <= new Date(isi.dibukaAt)) {
    return "Waktu ditutup harus setelah waktu dibuka.";
  }
  if (isi.kelasIds.length === 0) {
    return "Pilih minimal satu kelas target.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// CRUD forum_topik
// ---------------------------------------------------------------------------

export async function createForumTopik(
  eventId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const isi = bacaFormForum(formData);
  const galat = validasiFormForum(isi);
  if (galat) return { error: galat };

  const supabase = createClient();

  const jenis = await ambilJenisEvent(supabase, eventId);
  if (jenis === null) {
    return { error: "Kegiatan tidak ditemukan." };
  }
  if (!pakaiMesinForum(jenis)) {
    return {
      error: `Kegiatan ini berjenis "${labelJenisEvent(
        jenis
      )}" — tidak memakai forum. Buat kegiatan baru berjenis "Forum Diskusi" kalau memang itu yang dimaksud.`,
    };
  }

  // Skema TIDAK memaksa satu forum_topik per event lewat constraint unik
  // (lihat kepala 0020_forum.sql) — di sinilah batasan itu ditegakkan.
  // Dicek di Server Action, bukan cuma diandalkan dari UI ("tombol Buat
  // Forum disembunyikan kalau sudah ada"), karena URL /forum/baru tetap
  // bisa dibuka langsung.
  const { data: sudahAda } = await supabase
    .from("forum_topik")
    .select("id")
    .eq("event_id", eventId)
    .maybeSingle();

  if (sudahAda) {
    return {
      error:
        "Kegiatan ini sudah punya forum. Buka Pengaturan Forum untuk mengubah jadwal atau kelas targetnya, bukan membuat yang baru.",
    };
  }

  const guruId = await guruSaatIni(supabase);

  const { data: topik, error } = await supabase
    .from("forum_topik")
    .insert({
      event_id: eventId,
      dibuka_at: new Date(isi.dibukaAt).toISOString(),
      ditutup_at: new Date(isi.ditutupAt).toISOString(),
      created_by: guruId,
    })
    .select("id")
    .single();

  if (error || !topik) {
    return {
      error:
        "Gagal menyimpan forum. Kalau ini pertama kalinya, kemungkinan besar migrasi 0020 belum dijalankan di database jenjang ini — hubungi admin sistem.",
    };
  }

  const { error: kelasError } = await supabase
    .from("forum_kelas")
    .insert(
      isi.kelasIds.map((kelasId) => ({
        forum_topik_id: topik.id,
        kelas_id: kelasId,
      }))
    );

  if (kelasError) {
    return {
      error:
        "Forum tersimpan, tapi gagal menautkan kelas target — forum ini BELUM terlihat oleh siswa mana pun. Buka Pengaturan Forum dan pilih ulang kelasnya.",
    };
  }

  revalidatePath(`/admin/event/${eventId}`);
  redirect(`/admin/event/${eventId}`);
}

export async function updateForumTopik(
  eventId: string,
  forumTopikId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const isi = bacaFormForum(formData);
  const galat = validasiFormForum(isi);
  if (galat) return { error: galat };

  const supabase = createClient();

  const { error } = await supabase
    .from("forum_topik")
    .update({
      dibuka_at: new Date(isi.dibukaAt).toISOString(),
      ditutup_at: new Date(isi.ditutupAt).toISOString(),
    })
    .eq("id", forumTopikId);

  if (error) {
    return { error: "Gagal menyimpan perubahan jadwal forum. Coba lagi." };
  }

  // Rekonsiliasi kelas target — pola yang sama persis dengan
  // `updateTugas`: insert yang baru dulu, baru hapus yang dilepas, supaya
  // tidak ada jendela waktu di mana forum ini tanpa kelas target sama
  // sekali.
  const { data: kelasLama } = await supabase
    .from("forum_kelas")
    .select("kelas_id")
    .eq("forum_topik_id", forumTopikId);

  const idLama = new Set((kelasLama ?? []).map((k) => k.kelas_id as string));
  const idBaru = new Set(isi.kelasIds);

  const dihapus = [...idLama].filter((id) => !idBaru.has(id));
  const ditambah = [...idBaru].filter((id) => !idLama.has(id));

  if (ditambah.length > 0) {
    const { error: e } = await supabase.from("forum_kelas").insert(
      ditambah.map((kelasId) => ({
        forum_topik_id: forumTopikId,
        kelas_id: kelasId,
      }))
    );
    if (e) {
      return {
        error: "Jadwal tersimpan, tapi gagal menautkan sebagian kelas target baru.",
      };
    }
  }

  if (dihapus.length > 0) {
    // Melepas kelas dari forum TIDAK menghapus riwayat pesan kelas itu —
    // `forum_pesan.kelas_id` tetap menunjuk ke kelas yang sama, hanya saja
    // ruangnya tidak lagi muncul di kartu event ini. Baris `forum_kelas`
    // adalah TAUTAN, bukan wadah isinya.
    const { error: e } = await supabase
      .from("forum_kelas")
      .delete()
      .eq("forum_topik_id", forumTopikId)
      .in("kelas_id", dihapus);
    if (e) {
      return {
        error: "Jadwal tersimpan, tapi gagal melepas sebagian kelas target lama.",
      };
    }
  }

  revalidatePath(`/admin/event/${eventId}`);
  redirect(`/admin/event/${eventId}`);
}

/** Dampak hapus forum — dipakai modal konfirmasi. `forum_kelas`,
 *  `forum_pesan`, dan `forum_poin` semuanya ikut terhapus lewat
 *  `on delete cascade` (0020) — tidak ada berkas di storage untuk forum,
 *  jadi tidak perlu langkah pembersihan terpisah seperti `deleteTugas`. */
export async function hitungDampakHapusForum(forumTopikId: string): Promise<{
  jumlahKelas: number;
  jumlahPesan: number;
}> {
  const supabase = createClient();

  const { count: jumlahKelas } = await supabase
    .from("forum_kelas")
    .select("kelas_id", { count: "exact", head: true })
    .eq("forum_topik_id", forumTopikId);

  const { count: jumlahPesan } = await supabase
    .from("forum_pesan")
    .select("id", { count: "exact", head: true })
    .eq("forum_topik_id", forumTopikId);

  return {
    jumlahKelas: jumlahKelas ?? 0,
    jumlahPesan: jumlahPesan ?? 0,
  };
}

export async function deleteForumTopik(
  eventId: string,
  forumTopikId: string
): Promise<ActionState> {
  const supabase = createClient();

  const { error } = await supabase
    .from("forum_topik")
    .delete()
    .eq("id", forumTopikId);

  if (error) {
    return { error: "Gagal menghapus forum. Coba lagi." };
  }

  revalidatePath(`/admin/event/${eventId}`);
  redirect(`/admin/event/${eventId}`);
}

// ---------------------------------------------------------------------------
// Pesan & bonus poin
// ---------------------------------------------------------------------------

/**
 * Pesan dari GURU ke satu ruang kelas. Selalu bertipe teks — guru tidak
 * punya tombol sticker/emoticon (itu cara siswa menunjukkan hadir tanpa
 * menulis; tidak relevan untuk guru), dan pesan guru tidak pernah
 * menghasilkan poin untuk siapa pun (trigger `forum_pesan_tambah_poin`
 * di 0020 hanya menyala `when (new.siswa_id is not null)`).
 *
 * Tidak ada pengecekan `faseForum` di sini — guru boleh mengirim pesan
 * kapan pun, termasuk sebelum forum dibuka (mis. menyiapkan pertanyaan
 * pembuka) atau setelah ditutup (mis. mengumumkan hasil rekap). Yang
 * dibatasi jendela waktu hanya SISWA (lihat `bolehMengirimPesan` di
 * `forum.ts`, dicerminkan policy `forum_pesan_insert_siswa`).
 */
export async function kirimPesanGuru(
  eventId: string,
  forumTopikId: string,
  kelasId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const isi = String(formData.get("isi") ?? "").trim();
  if (!isi) {
    return { error: "Pesan tidak boleh kosong." };
  }
  if (isi.length > 2000) {
    return { error: "Pesan terlalu panjang (maksimal 2000 karakter)." };
  }

  const supabase = createClient();
  const guruId = await guruSaatIni(supabase);
  if (!guruId) {
    return { error: "Sesi guru tidak ditemukan. Masuk lagi ya." };
  }

  const { error } = await supabase.from("forum_pesan").insert({
    forum_topik_id: forumTopikId,
    kelas_id: kelasId,
    guru_id: guruId,
    isi,
    jenis_isi: "teks",
  });

  if (error) {
    return { error: "Gagal mengirim pesan. Coba lagi." };
  }

  revalidatePath(`/admin/event/${eventId}/forum/${kelasId}`);
  return { error: null };
}

/**
 * Toggle bonus +5 poin untuk SATU pesan.
 *
 * ── TOGGLE, BUKAN AKUMULASI — DAN KENAPA DIBACA DULU SEBELUM DITULIS ──
 *
 * Guru mengklik bubble pesan; klik pertama memberi bonus, klik kedua pada
 * bubble YANG SAMA membatalkannya. Nilai barunya adalah KEBALIKAN dari
 * yang tersimpan saat ini, bukan nilai yang dikirim dari client — kalau
 * dua tab guru yang sama terbuka bersamaan dan keduanya mengirim "set ke
 * true", yang terjadi seharusnya tetap toggle dari keadaan DATABASE saat
 * itu, bukan dari keadaan yang terakhir dilihat masing-masing tab.
 * Trigger `trg_forum_pesan_toggle_bonus` (0020) yang benar-benar menjaga
 * `forum_poin.poin_bonus` tetap sinkron; fungsi ini hanya menulis
 * penandanya.
 *
 * `bonusDiberikan` di hasil balik dipakai client untuk mengoreksi
 * indikator optimistiknya kalau ternyata beda dari yang diasumsikan
 * (mis. permintaan yang datang belakangan dari klik ganda yang tidak
 * sempat di-disable).
 */
export async function toggleBonusPesan(
  eventId: string,
  kelasId: string,
  pesanId: string
): Promise<{ error: string | null; bonusDiberikan: boolean | null }> {
  const supabase = createClient();

  const { data: pesan } = await supabase
    .from("forum_pesan")
    .select("bonus_diberikan, jenis_isi, siswa_id")
    .eq("id", pesanId)
    .maybeSingle();

  if (!pesan) {
    return { error: "Pesan tidak ditemukan.", bonusDiberikan: null };
  }
  if (pesan.jenis_isi !== "teks" || !pesan.siswa_id) {
    // Cermin constraint `forum_pesan_bonus_hanya_teks_siswa` (0020) —
    // dicek di sini supaya guru membaca kalimat, bukan pesan constraint
    // Postgres mentah, kalau suatu saat tombol bonus muncul di tempat
    // yang seharusnya tidak (bug UI).
    return {
      error: "Bonus cuma bisa diberikan untuk pesan teks dari siswa.",
      bonusDiberikan: null,
    };
  }

  const bonusBaru = !pesan.bonus_diberikan;

  const { error } = await supabase
    .from("forum_pesan")
    .update({ bonus_diberikan: bonusBaru })
    .eq("id", pesanId);

  if (error) {
    return { error: "Gagal menyimpan bonus. Coba lagi.", bonusDiberikan: null };
  }

  revalidatePath(`/admin/event/${eventId}/forum/${kelasId}`);
  return { error: null, bonusDiberikan: bonusBaru };
}
