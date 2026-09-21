"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  jenisEventValid,
  pakaiMesinUjian,
  labelJenisEvent,
  type JenisEvent,
} from "@/lib/jenis-event";

export type ActionState = { error: string | null };

/**
 * ── DUA WAKTU YANG BERBEDA, DAN KENAPA KEDUANYA PERLU ──
 *
 * Sebuah mapel sekarang punya dua pengaturan waktu yang sering tertukar
 * padahal artinya sangat berbeda:
 *
 *   waktu_mulai / waktu_selesai  = JENDELA UJIAN. Kapan pintu ujian
 *     dibuka dan kapan ditutup. Di luar rentang ini, siswa tidak bisa
 *     membuka mapelnya sama sekali.
 *
 *   durasi_menit                 = LAMA PENGERJAAN masing-masing siswa,
 *     dihitung sejak dia menekan "Mulai Ujian" — bukan sejak pintu
 *     dibuka.
 *
 * Kenapa tidak cukup satu saja? Karena kalau hanya ada jendela, siswa
 * yang terlambat masuk (komputernya bermasalah, namanya belum terdaftar,
 * atau sekadar antre) otomatis kehilangan waktu pengerjaan — padahal
 * bukan salahnya. Dengan `durasi_menit`, setiap anak mendapat jatah yang
 * sama persis, siapa pun yang duduk lebih dulu.
 *
 * Deadline efektif seorang siswa adalah yang mana pun yang lebih DULU
 * tiba: (mulai_at + durasi_menit) atau waktu_selesai. Perhitungan itu
 * dilakukan oleh RPC `mulai_ujian` di database, bukan di sini — satu
 * tempat saja, dan tempat itu memakai jam server.
 *
 * `durasi_menit` boleh dikosongkan; artinya "sampai ujian ditutup",
 * yaitu perilaku lama sebelum kolom ini ada. Mapel-mapel yang sudah
 * telanjur dibuat tidak berubah perilakunya.
 */
function bacaDurasi(formData: FormData): number | null {
  const raw = String(formData.get("durasi_menit") ?? "").trim();
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n) : NaN;
}

function validasiDurasi(
  durasi: number | null,
  waktuMulai: string,
  waktuSelesai: string
): string | null {
  if (durasi === null) return null;
  if (Number.isNaN(durasi)) {
    return "Durasi pengerjaan harus berupa angka menit, atau dikosongkan.";
  }
  if (durasi < 1) {
    return "Durasi pengerjaan minimal 1 menit. Kosongkan kalau ingin siswa bisa mengerjakan sampai ujian ditutup.";
  }
  if (durasi > 600) {
    return "Durasi pengerjaan maksimal 600 menit (10 jam). Cek lagi angkanya.";
  }

  // Durasi yang lebih panjang dari jendelanya sendiri bukan error fatal —
  // deadline siswa tetap terpotong jam tutup, jadi ujiannya tetap jalan
  // benar. Tapi hampir selalu itu salah ketik (mis. jendela 90 menit tapi
  // durasi diisi 900), dan kalau dibiarkan lolos, guru baru sadar saat
  // siswa mengeluh waktunya terpotong di tengah ujian.
  const rentangMenit =
    (new Date(waktuSelesai).getTime() - new Date(waktuMulai).getTime()) / 60000;
  if (Number.isFinite(rentangMenit) && durasi > rentangMenit) {
    return `Durasi pengerjaan (${durasi} menit) lebih panjang daripada jendela ujiannya sendiri (${Math.round(
      rentangMenit
    )} menit). Perpanjang jam tutup, atau kecilkan durasinya.`;
  }
  return null;
}

/**
 * Ambil `jenis` sebuah event, dengan fallback dua-tahap seperti
 * `getSesiGuru()`: kolom ini baru ada sejak migrasi 0018, jadi kalau
 * project ini belum dimigrasi, selectnya akan gagal (kolom tidak ada).
 * Fallback-nya `'asesmen_akhir'` — BUKAN tebakan sembarangan, itu memang
 * `DEFAULT` kolomnya di migrasi 0018 dan satu-satunya jenis yang mungkin
 * ada di baris manapun sebelum migrasi itu jalan. `null` (event tidak
 * ditemukan) dibiarkan mengalir apa adanya ke pemanggil.
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
    const jenis = lengkap.data.jenis;
    return jenisEventValid(jenis) ? jenis : "asesmen_akhir";
  }

  // Kolom `jenis` belum ada di project ini (migrasi 0018 belum jalan) —
  // cek keberadaan eventnya saja lewat kolom yang pasti ada, lalu anggap
  // asesmen_akhir (lihat komentar di atas).
  const { data: eventLama } = await supabase
    .from("event")
    .select("id")
    .eq("id", eventId)
    .maybeSingle();

  return eventLama ? "asesmen_akhir" : null;
}

/**
 * Buat event baru. RLS mengizinkan guru full access ke tabel `event`
 * (lihat is_guru() di migrasi 0005), jadi cukup pakai client Supabase
 * biasa yang sudah login — tidak perlu service role key.
 */
export async function createEvent(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const nama = String(formData.get("nama") ?? "").trim();
  const tglMulai = String(formData.get("tgl_mulai") ?? "").trim();
  const tglSelesai = String(formData.get("tgl_selesai") ?? "").trim();
  const kelasUtamaRaw = String(formData.get("kelas_utama") ?? "").trim();
  const kelasUtama = Number(kelasUtamaRaw);
  const jenisRaw = String(formData.get("jenis") ?? "").trim();

  if (!nama) {
    return { error: "Nama event wajib diisi." };
  }
  if (!tglMulai || !tglSelesai) {
    return { error: "Tanggal mulai dan tanggal selesai wajib diisi." };
  }
  if (new Date(tglSelesai) < new Date(tglMulai)) {
    return { error: "Tanggal selesai tidak boleh sebelum tanggal mulai." };
  }
  if (![7, 8, 9].includes(kelasUtama)) {
    return { error: "Pilih jenjang kelas utama (7, 8, atau 9)." };
  }
  if (!jenisEventValid(jenisRaw)) {
    return { error: "Pilih jenis kegiatan." };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: guru } = await supabase
    .from("guru")
    .select("id")
    .eq("auth_id", user?.id ?? "")
    .maybeSingle();

  const { data: event, error } = await supabase
    .from("event")
    .insert({
      nama,
      tgl_mulai: tglMulai,
      tgl_selesai: tglSelesai,
      kelas_utama: kelasUtama,
      created_by: guru?.id ?? null,
      jenis: jenisRaw,
    })
    .select("id")
    .single();

  if (error) {
    // Migrasi 0018 belum jalan di project ini -> kolom `jenis` tidak ada.
    // Daripada mengunci guru tidak bisa membuat event SAMA SEKALI sampai
    // migrasinya jalan, coba lagi tanpa kolom itu — event akan memakai
    // DEFAULT lama tabelnya sendiri (tidak ada jenis) sampai migrasi
    // dijalankan. Guru tetap diberi tahu supaya tidak bingung jenis yang
    // dipilihnya "hilang".
    if (jenisRaw !== "asesmen_akhir") {
      return {
        error:
          "Gagal menyimpan jenis kegiatan — kemungkinan migrasi 0018 belum dijalankan di database ini. Hubungi admin sistem. (Kegiatan belum tersimpan.)",
      };
    }

    const ulang = await supabase
      .from("event")
      .insert({
        nama,
        tgl_mulai: tglMulai,
        tgl_selesai: tglSelesai,
        kelas_utama: kelasUtama,
        created_by: guru?.id ?? null,
      })
      .select("id")
      .single();

    if (ulang.error || !ulang.data) {
      return { error: "Gagal menyimpan event. Coba lagi." };
    }

    revalidatePath("/admin/event");
    revalidatePath("/admin");
    redirect(`/admin/event/${ulang.data.id}`);
  }

  if (!event) {
    return { error: "Gagal menyimpan event. Coba lagi." };
  }

  revalidatePath("/admin/event");
  revalidatePath("/admin"); // dashboard ikut menampilkan daftar kegiatan
  redirect(`/admin/event/${event.id}`);
}

/**
 * Update event yang sudah ada. Sama validasinya dengan createEvent, tapi
 * lewat `update` bukan `insert`. Kalau `kelas_utama` diubah, ini TIDAK
 * memvalidasi ulang bahwa kelas target mapel di dalamnya masih konsisten
 * (mis. mapel yang sudah punya mapel_kelas di jenjang lama) — kasus itu
 * jarang terjadi dan guru diasumsikan tahu dampaknya kalau sengaja ganti
 * jenjang event yang sudah berisi mapel.
 */
export async function updateEvent(
  eventId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const nama = String(formData.get("nama") ?? "").trim();
  const tglMulai = String(formData.get("tgl_mulai") ?? "").trim();
  const tglSelesai = String(formData.get("tgl_selesai") ?? "").trim();
  const kelasUtamaRaw = String(formData.get("kelas_utama") ?? "").trim();
  const kelasUtama = Number(kelasUtamaRaw);

  if (!nama) {
    return { error: "Nama event wajib diisi." };
  }
  if (!tglMulai || !tglSelesai) {
    return { error: "Tanggal mulai dan tanggal selesai wajib diisi." };
  }
  if (new Date(tglSelesai) < new Date(tglMulai)) {
    return { error: "Tanggal selesai tidak boleh sebelum tanggal mulai." };
  }
  if (![7, 8, 9].includes(kelasUtama)) {
    return { error: "Pilih jenjang kelas utama (7, 8, atau 9)." };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("event")
    .update({
      nama,
      tgl_mulai: tglMulai,
      tgl_selesai: tglSelesai,
      kelas_utama: kelasUtama,
    })
    .eq("id", eventId);

  if (error) {
    return { error: "Gagal menyimpan perubahan event. Coba lagi." };
  }

  revalidatePath(`/admin/event/${eventId}`);
  revalidatePath("/admin/event");
  revalidatePath("/admin"); // dashboard: kegiatan yang dibuka ulang pindah ke "Sedang berlangsung"
  redirect(`/admin/event/${eventId}`);
}

/**
 * Hapus event. `on delete cascade` di migrasi 0002-0004 (mapel.event_id,
 * soal.mapel_id, jawaban_siswa.mapel_id, nilai.mapel_id — semua rantai
 * balik ke event ini) berarti ini akan ikut menghapus SEMUA mapel, soal,
 * jawaban siswa, dan nilai terkait secara permanen. UI wajib menampilkan
 * peringatan dampak ini SEBELUM memanggil action ini (lihat
 * `hitungDampakHapusEvent` + `DeleteEventButton.tsx`) — action ini sendiri
 * tidak mengecek ulang, cuma mengeksekusi setelah guru mengonfirmasi.
 */
export async function deleteEvent(eventId: string): Promise<ActionState> {
  const supabase = createClient();
  const { error } = await supabase.from("event").delete().eq("id", eventId);

  if (error) {
    return { error: "Gagal menghapus event. Coba lagi." };
  }

  revalidatePath("/admin/event");
  revalidatePath("/admin");
  redirect("/admin/event");
}

/**
 * Hitung dampak cascade sebelum event dihapus, dipakai untuk menyusun
 * pesan peringatan di UI ("Event ini punya N mapel, X jawaban siswa akan
 * ikut terhapus permanen"). Dipanggil dari Server Component halaman
 * detail event, bukan dari client, supaya angka selalu akurat per render
 * (bukan disimpan di state yang bisa basi).
 */
export async function hitungDampakHapusEvent(eventId: string): Promise<{
  jumlahMapel: number;
  jumlahJawabanSiswa: number;
  jumlahNilai: number;
}> {
  const supabase = createClient();

  const { data: mapelList } = await supabase
    .from("mapel")
    .select("id")
    .eq("event_id", eventId);

  const mapelIds = (mapelList ?? []).map((m) => m.id);
  if (mapelIds.length === 0) {
    return { jumlahMapel: 0, jumlahJawabanSiswa: 0, jumlahNilai: 0 };
  }

  const { count: jumlahJawabanSiswa } = await supabase
    .from("jawaban_siswa")
    .select("siswa_id", { count: "exact", head: true })
    .in("mapel_id", mapelIds);

  const { count: jumlahNilai } = await supabase
    .from("nilai")
    .select("siswa_id", { count: "exact", head: true })
    .in("mapel_id", mapelIds);

  return {
    jumlahMapel: mapelIds.length,
    jumlahJawabanSiswa: jumlahJawabanSiswa ?? 0,
    jumlahNilai: jumlahNilai ?? 0,
  };
}

/**
 * Tambah mapel ke sebuah event, sekaligus insert baris mapel_kelas
 * (many-to-many) untuk tiap kelas yang dicentang di form.
 */
export async function createMapel(
  eventId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const nama = String(formData.get("nama") ?? "").trim();
  const waktuMulai = String(formData.get("waktu_mulai") ?? "").trim();
  const waktuSelesai = String(formData.get("waktu_selesai") ?? "").trim();
  const kelasIds = formData.getAll("kelas_id").map(String).filter(Boolean);
  const durasi = bacaDurasi(formData);

  if (!nama) {
    return { error: "Nama mapel wajib diisi." };
  }
  if (!waktuMulai || !waktuSelesai) {
    return { error: "Tanggal & jam ujian dibuka dan ditutup wajib diisi." };
  }
  if (new Date(waktuSelesai) <= new Date(waktuMulai)) {
    return { error: "Jam ujian ditutup harus setelah jam ujian dibuka." };
  }
  if (kelasIds.length === 0) {
    return { error: "Pilih minimal satu kelas target." };
  }

  const galatDurasi = validasiDurasi(durasi, waktuMulai, waktuSelesai);
  if (galatDurasi) return { error: galatDurasi };

  const supabase = createClient();

  // Penjaga Tahap 3: mapel/soal cuma untuk event yang memakai mesin ujian
  // (asesmen_akhir/kuis_harian). Ini duplikat sengaja dari trigger DB
  // `trg_cegah_mapel_di_event_bukan_ujian` (migrasi 0018) — dicek juga di
  // sini supaya pesan errornya ramah dibaca di form, bukan pesan Postgres
  // mentah dari trigger.
  const jenis = await ambilJenisEvent(supabase, eventId);
  if (jenis !== null && !pakaiMesinUjian(jenis)) {
    return {
      error: `Event ini berjenis "${labelJenisEvent(
        jenis
      )}" — tidak memakai mapel/soal. Fitur untuk jenis ini menyusul di tahap berikutnya.`,
    };
  }

  const { data: mapel, error: mapelError } = await supabase
    .from("mapel")
    .insert({
      event_id: eventId,
      nama,
      waktu_mulai: new Date(waktuMulai).toISOString(),
      waktu_selesai: new Date(waktuSelesai).toISOString(),
      durasi_menit: durasi,
    })
    .select("id")
    .single();

  if (mapelError || !mapel) {
    return { error: "Gagal menyimpan mapel. Coba lagi." };
  }

  const { error: mapelKelasError } = await supabase
    .from("mapel_kelas")
    .insert(kelasIds.map((kelasId) => ({ mapel_id: mapel.id, kelas_id: kelasId })));

  if (mapelKelasError) {
    return {
      error:
        "Mapel tersimpan, tapi gagal menautkan kelas target. Coba tambah ulang.",
    };
  }

  revalidatePath(`/admin/event/${eventId}`);
  redirect(`/admin/event/${eventId}`);
}

/**
 * Update mapel yang sudah ada + rekonsiliasi mapel_kelas (many-to-many):
 * hapus baris yang kelasnya tidak lagi dicentang, insert baris baru untuk
 * kelas yang baru dicentang. Tidak menyentuh baris yang tidak berubah.
 */
export async function updateMapel(
  eventId: string,
  mapelId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const nama = String(formData.get("nama") ?? "").trim();
  const waktuMulai = String(formData.get("waktu_mulai") ?? "").trim();
  const waktuSelesai = String(formData.get("waktu_selesai") ?? "").trim();
  const kelasIdsBaru = formData.getAll("kelas_id").map(String).filter(Boolean);
  const durasi = bacaDurasi(formData);

  if (!nama) {
    return { error: "Nama mapel wajib diisi." };
  }
  if (!waktuMulai || !waktuSelesai) {
    return { error: "Tanggal & jam ujian dibuka dan ditutup wajib diisi." };
  }
  if (new Date(waktuSelesai) <= new Date(waktuMulai)) {
    return { error: "Jam ujian ditutup harus setelah jam ujian dibuka." };
  }
  if (kelasIdsBaru.length === 0) {
    return { error: "Pilih minimal satu kelas target." };
  }

  const galatDurasi = validasiDurasi(durasi, waktuMulai, waktuSelesai);
  if (galatDurasi) return { error: galatDurasi };

  const supabase = createClient();

  const { error: mapelError } = await supabase
    .from("mapel")
    .update({
      nama,
      waktu_mulai: new Date(waktuMulai).toISOString(),
      waktu_selesai: new Date(waktuSelesai).toISOString(),
      durasi_menit: durasi,
    })
    .eq("id", mapelId);

  if (mapelError) {
    return { error: "Gagal menyimpan perubahan mapel. Coba lagi." };
  }

  const { data: kelasLama } = await supabase
    .from("mapel_kelas")
    .select("kelas_id")
    .eq("mapel_id", mapelId);

  const idLama = new Set((kelasLama ?? []).map((k) => k.kelas_id));
  const idBaru = new Set(kelasIdsBaru);

  const dihapus = [...idLama].filter((id) => !idBaru.has(id));
  const ditambah = [...idBaru].filter((id) => !idLama.has(id));

  if (dihapus.length > 0) {
    const { error } = await supabase
      .from("mapel_kelas")
      .delete()
      .eq("mapel_id", mapelId)
      .in("kelas_id", dihapus);
    if (error) {
      return {
        error: "Mapel tersimpan, tapi gagal memperbarui sebagian kelas target.",
      };
    }
  }

  if (ditambah.length > 0) {
    const { error } = await supabase
      .from("mapel_kelas")
      .insert(ditambah.map((kelasId) => ({ mapel_id: mapelId, kelas_id: kelasId })));
    if (error) {
      return {
        error: "Mapel tersimpan, tapi gagal menautkan sebagian kelas target baru.",
      };
    }
  }

  revalidatePath(`/admin/event/${eventId}/mapel/${mapelId}`);
  revalidatePath(`/admin/event/${eventId}`);
  redirect(`/admin/event/${eventId}/mapel/${mapelId}`);
}

/**
 * Hapus mapel. Cascade (0003-0004): soal.mapel_id, jawaban_siswa.mapel_id,
 * nilai.mapel_id semua `on delete cascade` dari mapel — jadi menghapus
 * satu mapel ikut menghapus permanen semua soal, jawaban siswa, dan nilai
 * di mapel itu. UI wajib menampilkan dampak ini dulu (lihat
 * `hitungDampakHapusMapel` + tombol hapus di halaman detail mapel).
 */
export async function deleteMapel(
  eventId: string,
  mapelId: string
): Promise<ActionState> {
  const supabase = createClient();
  const { error } = await supabase.from("mapel").delete().eq("id", mapelId);

  if (error) {
    return { error: "Gagal menghapus mapel. Coba lagi." };
  }

  revalidatePath(`/admin/event/${eventId}`);
  redirect(`/admin/event/${eventId}`);
}

/** Dampak cascade hapus mapel — dipakai di modal konfirmasi hapus. */
export async function hitungDampakHapusMapel(mapelId: string): Promise<{
  jumlahSoal: number;
  jumlahJawabanSiswa: number;
  jumlahNilai: number;
}> {
  const supabase = createClient();

  const { count: jumlahSoal } = await supabase
    .from("soal")
    .select("id", { count: "exact", head: true })
    .eq("mapel_id", mapelId);

  const { count: jumlahJawabanSiswa } = await supabase
    .from("jawaban_siswa")
    .select("siswa_id", { count: "exact", head: true })
    .eq("mapel_id", mapelId);

  const { count: jumlahNilai } = await supabase
    .from("nilai")
    .select("siswa_id", { count: "exact", head: true })
    .eq("mapel_id", mapelId);

  return {
    jumlahSoal: jumlahSoal ?? 0,
    jumlahJawabanSiswa: jumlahJawabanSiswa ?? 0,
    jumlahNilai: jumlahNilai ?? 0,
  };
}

/**
 * Cek apakah sudah ada siswa yang submit di mapel ini (`submitted_at`
 * terisi) — dipakai untuk menampilkan peringatan tambahan di form edit
 * mapel. Keputusan desain: mengubah jadwal/kelas target mapel yang sudah
 * ada submission TETAP DIIZINKAN (guru mungkin memang perlu memperbaiki
 * jadwal salah ketik walau sudah ada yang mengerjakan), tapi guru harus
 * sadar dampaknya — mis. ubah waktu_selesai jadi lebih awal dari sekarang
 * bisa membuat siswa yang belum submit kehilangan akses mendadak.
 */
export async function cekMapelSudahDikerjakan(
  mapelId: string
): Promise<number> {
  const supabase = createClient();
  const { count } = await supabase
    .from("jawaban_siswa")
    .select("siswa_id", { count: "exact", head: true })
    .eq("mapel_id", mapelId)
    .not("submitted_at", "is", null);
  return count ?? 0;
}
