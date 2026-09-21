"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  jenisEventValid,
  pakaiMesinTugas,
  labelJenisEvent,
  type JenisEvent,
} from "@/lib/jenis-event";
import { validasiNilai, parseNilai } from "@/lib/tugas";
import { BUCKET_TUGAS } from "@/lib/tugas-berkas";

export type ActionState = { error: string | null };

/**
 * Server Action untuk mesin TUGAS (Tahap 4). Dipisah dari
 * `src/app/admin/event/actions.ts` — yang mengurus event & mapel — dengan
 * alasan yang sama seperti `admin-multi-event.ts` dipisah dari
 * `admin-multi.ts`: berkas itu sudah panjang dan sudah teruji jalan, dan
 * menambah 300 baris di sana berarti kamu harus menimpanya. Berkas ini
 * cukup disalin masuk; kalau bermasalah, menghapusnya tidak membatalkan
 * apa pun yang sudah ada.
 *
 * Semua fungsi di sini memakai `createClient()` (cookie-bound, kena RLS),
 * BUKAN service role. Guru sudah punya akses penuh ke tabel `tugas`,
 * `tugas_kelas`, dan `pengumpulan_tugas` lewat policy `*_guru_all` di
 * migrasi 0019, jadi tidak ada alasan melewati RLS di sini. Konsekuensinya
 * disengaja: kalau suatu saat ada bug yang membuat sesi bukan-guru sampai
 * ke sini, database tetap menolaknya.
 */

// ---------------------------------------------------------------------------
// Pembacaan bersama
// ---------------------------------------------------------------------------

/**
 * Salinan `ambilJenisEvent()` dari `../../actions.ts`, yang di sana adalah
 * fungsi privat (tidak diekspor). Sengaja disalin, bukan diekspor dari
 * sana, supaya berkas Tahap 3 yang sudah teruji tidak perlu diubah sama
 * sekali untuk memasang Tahap 4.
 *
 * Fallback dua tahapnya persis sama: kalau kolom `jenis` belum ada
 * (migrasi 0018 belum jalan), anggap `asesmen_akhir` — itu DEFAULT kolom
 * dan satu-satunya jenis yang mungkin ada sebelum migrasi itu. Untuk
 * berkas INI, konsekuensinya justru yang diinginkan: di database yang
 * belum dimigrasi, semua event dianggap ujian, jadi `createTugas` menolak
 * dengan pesan yang jelas alih-alih gagal di trigger dengan pesan
 * Postgres mentah.
 */
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

/** Guru yang sedang login, untuk `created_by` / `dinilai_by`. `null` kalau
 *  barisnya tidak ketemu — kolomnya memang nullable, dan kehilangan jejak
 *  siapa yang menilai tidak boleh sampai menggagalkan penilaiannya. */
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
// Validasi form tugas
// ---------------------------------------------------------------------------

interface IsiFormTugas {
  judul: string;
  deskripsi: string;
  dibukaAt: string;
  tenggat: string;
  skorMaksimal: number;
  izinkanTerlambat: boolean;
  mintaTeks: boolean;
  mintaBerkas: boolean;
  kelasIds: string[];
}

function bacaFormTugas(formData: FormData): IsiFormTugas {
  return {
    judul: String(formData.get("judul") ?? "").trim(),
    deskripsi: String(formData.get("deskripsi") ?? "").trim(),
    dibukaAt: String(formData.get("dibuka_at") ?? "").trim(),
    tenggat: String(formData.get("tenggat") ?? "").trim(),
    skorMaksimal: Number(String(formData.get("skor_maksimal") ?? "").trim()),
    izinkanTerlambat: formData.get("izinkan_terlambat") !== null,
    mintaTeks: formData.get("minta_teks") !== null,
    mintaBerkas: formData.get("minta_berkas") !== null,
    kelasIds: formData.getAll("kelas_id").map(String).filter(Boolean),
  };
}

function validasiFormTugas(isi: IsiFormTugas): string | null {
  if (!isi.judul) return "Judul tugas wajib diisi.";
  if (!isi.dibukaAt || !isi.tenggat) {
    return "Tanggal & jam dibuka serta tenggat wajib diisi.";
  }
  if (new Date(isi.tenggat) <= new Date(isi.dibukaAt)) {
    return "Tenggat harus setelah waktu tugas dibuka.";
  }
  if (!Number.isFinite(isi.skorMaksimal) || isi.skorMaksimal <= 0) {
    return "Skor maksimal harus angka lebih besar dari 0 (mis. 100).";
  }
  if (isi.skorMaksimal > 1000) {
    return "Skor maksimal terlalu besar (maksimal 1000). Cek lagi angkanya.";
  }
  // Dicerminkan constraint `tugas_minta_sesuatu` di 0019. Dicek di sini
  // juga supaya guru membaca kalimat, bukan pesan constraint Postgres.
  if (!isi.mintaTeks && !isi.mintaBerkas) {
    return "Pilih minimal satu bentuk pengumpulan: tulisan, berkas, atau keduanya.";
  }
  if (isi.kelasIds.length === 0) {
    return "Pilih minimal satu kelas target.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// CRUD tugas
// ---------------------------------------------------------------------------

export async function createTugas(
  eventId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const isi = bacaFormTugas(formData);
  const galat = validasiFormTugas(isi);
  if (galat) return { error: galat };

  const supabase = createClient();

  // Penjaga jenis event, cermin dari trigger
  // `cegah_tugas_di_event_bukan_assignment` (0019). Dicek di sini supaya
  // pesannya ramah; triggernya tetap yang mengikat.
  const jenis = await ambilJenisEvent(supabase, eventId);
  if (jenis === null) {
    return { error: "Kegiatan tidak ditemukan." };
  }
  if (!pakaiMesinTugas(jenis)) {
    return {
      error: `Kegiatan ini berjenis "${labelJenisEvent(
        jenis
      )}" — tidak memakai tugas. Buat kegiatan baru berjenis "Tugas" kalau memang itu yang dimaksud.`,
    };
  }

  const guruId = await guruSaatIni(supabase);

  const { data: tugas, error } = await supabase
    .from("tugas")
    .insert({
      event_id: eventId,
      judul: isi.judul,
      deskripsi: isi.deskripsi,
      dibuka_at: new Date(isi.dibukaAt).toISOString(),
      tenggat: new Date(isi.tenggat).toISOString(),
      skor_maksimal: isi.skorMaksimal,
      izinkan_terlambat: isi.izinkanTerlambat,
      minta_teks: isi.mintaTeks,
      minta_berkas: isi.mintaBerkas,
      created_by: guruId,
    })
    .select("id")
    .single();

  if (error || !tugas) {
    // Pesan yang paling mungkin ditemui di lapangan: migrasi 0019 belum
    // dijalankan di project jenjang ini. Disebut eksplisit supaya guru
    // tidak menghabiskan sore mencoba ulang form yang tidak salah.
    return {
      error:
        "Gagal menyimpan tugas. Kalau ini pertama kalinya, kemungkinan besar migrasi 0019 belum dijalankan di database jenjang ini — hubungi admin sistem.",
    };
  }

  const { error: kelasError } = await supabase
    .from("tugas_kelas")
    .insert(
      isi.kelasIds.map((kelasId) => ({ tugas_id: tugas.id, kelas_id: kelasId }))
    );

  if (kelasError) {
    // Tugas tanpa kelas target tidak terlihat oleh siapa pun (RLS siswa
    // menyaring lewat tugas_kelas). Jangan dibiarkan berdiri diam-diam
    // sebagai tugas "hantu" — beri tahu supaya guru memperbaikinya lewat
    // Edit Tugas, yang barisnya sudah ada.
    return {
      error:
        "Tugas tersimpan, tapi gagal menautkan kelas target — tugas ini BELUM terlihat oleh siswa mana pun. Buka Edit Tugas dan pilih ulang kelasnya.",
    };
  }

  revalidatePath(`/admin/event/${eventId}`);
  redirect(`/admin/event/${eventId}/tugas/${tugas.id}`);
}

export async function updateTugas(
  eventId: string,
  tugasId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const isi = bacaFormTugas(formData);
  const galat = validasiFormTugas(isi);
  if (galat) return { error: galat };

  const supabase = createClient();

  const { error } = await supabase
    .from("tugas")
    .update({
      judul: isi.judul,
      deskripsi: isi.deskripsi,
      dibuka_at: new Date(isi.dibukaAt).toISOString(),
      tenggat: new Date(isi.tenggat).toISOString(),
      skor_maksimal: isi.skorMaksimal,
      izinkan_terlambat: isi.izinkanTerlambat,
      minta_teks: isi.mintaTeks,
      minta_berkas: isi.mintaBerkas,
    })
    .eq("id", tugasId);

  if (error) {
    return { error: "Gagal menyimpan perubahan tugas. Coba lagi." };
  }

  // Rekonsiliasi kelas target, pola yang sama persis dengan `updateMapel`:
  // hapus yang tidak lagi dicentang, tambah yang baru, jangan sentuh yang
  // tidak berubah. Menghapus-lalu-insert-semua akan lebih pendek ditulis,
  // tapi sedetik di antara keduanya tugasnya tidak punya kelas target
  // sama sekali — dan di detik itu siswa yang sedang membuka halaman
  // tugasnya akan melihat 404.
  const { data: kelasLama } = await supabase
    .from("tugas_kelas")
    .select("kelas_id")
    .eq("tugas_id", tugasId);

  const idLama = new Set((kelasLama ?? []).map((k) => k.kelas_id as string));
  const idBaru = new Set(isi.kelasIds);

  const dihapus = [...idLama].filter((id) => !idBaru.has(id));
  const ditambah = [...idBaru].filter((id) => !idLama.has(id));

  if (ditambah.length > 0) {
    const { error: e } = await supabase
      .from("tugas_kelas")
      .insert(ditambah.map((kelasId) => ({ tugas_id: tugasId, kelas_id: kelasId })));
    if (e) {
      return {
        error: "Tugas tersimpan, tapi gagal menautkan sebagian kelas target baru.",
      };
    }
  }

  if (dihapus.length > 0) {
    const { error: e } = await supabase
      .from("tugas_kelas")
      .delete()
      .eq("tugas_id", tugasId)
      .in("kelas_id", dihapus);
    if (e) {
      return {
        error: "Tugas tersimpan, tapi gagal melepas sebagian kelas target lama.",
      };
    }
  }

  revalidatePath(`/admin/event/${eventId}/tugas/${tugasId}`);
  revalidatePath(`/admin/event/${eventId}`);
  redirect(`/admin/event/${eventId}/tugas/${tugasId}`);
}

/**
 * Dampak hapus tugas — dipakai modal konfirmasi. `pengumpulan_tugas`
 * ikut terhapus lewat `on delete cascade` (0019).
 *
 * BERKAS DI STORAGE TIDAK IKUT TERHAPUS oleh cascade — cascade hanya
 * berlaku di dalam Postgres, dan objek storage hidup di luar relasi itu.
 * `deleteTugas` di bawah karena itu menghapus objeknya lebih dulu secara
 * eksplisit. Kalau tidak, berkas-berkas itu akan menumpuk selamanya
 * sebagai sampah yang tidak bisa ditelusuri lagi dari tabel mana pun.
 */
export async function hitungDampakHapusTugas(tugasId: string): Promise<{
  jumlahPengumpulan: number;
  jumlahDinilai: number;
  jumlahBerkas: number;
}> {
  const supabase = createClient();

  const { count: jumlahPengumpulan } = await supabase
    .from("pengumpulan_tugas")
    .select("siswa_id", { count: "exact", head: true })
    .eq("tugas_id", tugasId)
    .not("submitted_at", "is", null);

  const { count: jumlahDinilai } = await supabase
    .from("pengumpulan_tugas")
    .select("siswa_id", { count: "exact", head: true })
    .eq("tugas_id", tugasId)
    .not("nilai", "is", null);

  const { count: jumlahBerkas } = await supabase
    .from("pengumpulan_tugas")
    .select("siswa_id", { count: "exact", head: true })
    .eq("tugas_id", tugasId)
    .not("berkas_path", "is", null);

  return {
    jumlahPengumpulan: jumlahPengumpulan ?? 0,
    jumlahDinilai: jumlahDinilai ?? 0,
    jumlahBerkas: jumlahBerkas ?? 0,
  };
}

export async function deleteTugas(
  eventId: string,
  tugasId: string
): Promise<ActionState> {
  const supabase = createClient();

  // 1. Berkas dulu, baris belakangan. Urutannya penting: kalau barisnya
  //    dihapus lebih dulu lalu penghapusan berkas gagal, tidak ada lagi
  //    catatan path-nya di mana pun dan berkas itu jadi sampah permanen.
  //    Sebaliknya kalau berkasnya hilang tapi barisnya masih ada, paling
  //    buruk guru menekan hapus sekali lagi.
  const { data: berkas } = await supabase
    .from("pengumpulan_tugas")
    .select("berkas_path")
    .eq("tugas_id", tugasId)
    .not("berkas_path", "is", null);

  const paths = (berkas ?? [])
    .map((b) => b.berkas_path as string | null)
    .filter((p): p is string => Boolean(p));

  if (paths.length > 0) {
    // Kegagalan di sini TIDAK menggagalkan penghapusan tugasnya. Guru
    // yang menekan "hapus" sudah memutuskan; menolak menghapus karena
    // satu objek storage rewel cuma membuatnya menekan tombol berkali-
    // kali tanpa penjelasan yang berguna.
    await supabase.storage.from(BUCKET_TUGAS).remove(paths);
  }

  const { error } = await supabase.from("tugas").delete().eq("id", tugasId);

  if (error) {
    return { error: "Gagal menghapus tugas. Coba lagi." };
  }

  revalidatePath(`/admin/event/${eventId}`);
  redirect(`/admin/event/${eventId}`);
}

// ---------------------------------------------------------------------------
// Penilaian
// ---------------------------------------------------------------------------

/**
 * Simpan nilai + catatan guru untuk satu pengumpulan.
 *
 * MENGOSONGKAN KOLOM NILAI ADALAH FITUR, BUKAN KECELAKAAN. Itu satu-
 * satunya cara guru memberi kesempatan perbaikan: selama `nilai` masih
 * terisi, policy `pengumpulan_update_own` (0019) mengunci barisnya dari
 * perubahan oleh siswa. Guru mengosongkan nilainya -> kuncinya lepas ->
 * siswa bisa memperbaiki dan mengumpulkan ulang. Karena itu string kosong
 * diterima sebagai nilai yang sah di `validasiNilai`, dan `dinilai_at`
 * ikut dikosongkan supaya statusnya benar-benar kembali "belum dinilai".
 */
export async function simpanPenilaian(
  eventId: string,
  tugasId: string,
  siswaId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const nilaiRaw = String(formData.get("nilai") ?? "");
  const catatan = String(formData.get("catatan_guru") ?? "").trim();

  const supabase = createClient();

  const { data: tugas } = await supabase
    .from("tugas")
    .select("skor_maksimal")
    .eq("id", tugasId)
    .maybeSingle();

  if (!tugas) {
    return { error: "Tugas tidak ditemukan." };
  }

  const skorMaksimal = Number(tugas.skor_maksimal);
  const galat = validasiNilai(nilaiRaw, skorMaksimal);
  if (galat) return { error: galat };

  const nilai = parseNilai(nilaiRaw);
  const guruId = await guruSaatIni(supabase);

  // `upsert`, bukan `update`: guru bisa memberi nilai pada siswa yang
  // belum punya baris sama sekali (mis. mengerjakan di kertas karena
  // laptopnya rusak, lalu gurunya memasukkan nilainya di sini). Barisnya
  // akan punya `submitted_at` null — dan itu jujur: yang terjadi memang
  // dia dinilai tanpa mengumpulkan lewat aplikasi.
  const { error } = await supabase.from("pengumpulan_tugas").upsert(
    {
      tugas_id: tugasId,
      siswa_id: siswaId,
      nilai,
      catatan_guru: catatan === "" ? null : catatan,
      dinilai_at: nilai === null ? null : new Date().toISOString(),
      dinilai_by: nilai === null ? null : guruId,
    },
    { onConflict: "tugas_id,siswa_id" }
  );

  if (error) {
    return { error: "Gagal menyimpan nilai. Coba lagi." };
  }

  revalidatePath(`/admin/event/${eventId}/tugas/${tugasId}`);
  return { error: null };
}

/**
 * URL unduh berumur pendek untuk satu berkas pengumpulan.
 *
 * Bucket `tugas` private (0019), jadi tidak ada URL permanen yang bisa
 * ditempel di HTML. Signed URL dibuat saat guru menekan tombolnya, berlaku
 * 5 menit — cukup untuk mengunduh, tidak cukup untuk jadi tautan yang
 * beredar di grup WhatsApp. Untuk berkas yang bisa berisi foto wajah anak,
 * itu bukan kehati-hatian yang berlebihan.
 */
export async function urlUnduhBerkas(
  path: string
): Promise<{ url: string | null; error: string | null }> {
  const supabase = createClient();

  const { data, error } = await supabase.storage
    .from(BUCKET_TUGAS)
    .createSignedUrl(path, 300);

  if (error || !data?.signedUrl) {
    return {
      url: null,
      error: "Berkas tidak bisa dibuka. Mungkin sudah dihapus siswa.",
    };
  }

  return { url: data.signedUrl, error: null };
}
