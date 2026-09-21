"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { bolehMengumpulkan, alasanTidakBolehMengumpulkan } from "@/lib/tugas";
import {
  BUCKET_TUGAS,
  pathBerkasTugas,
  validasiBerkas,
} from "@/lib/tugas-berkas";

export type ActionState = { error: string | null; pesan: string | null };

/**
 * Pengumpulan tugas oleh siswa.
 *
 * ── KENAPA BERKAS DIUNGGAH LEWAT SERVER ACTION, BUKAN LANGSUNG DARI
 *    BROWSER KE SUPABASE STORAGE ──
 *
 * Unggah langsung dari browser lebih hemat: berkasnya tidak singgah di
 * server Next.js sama sekali. Tapi ia menuntut dua hal yang tidak gratis
 * di sini: sesi Supabase harus tersedia di sisi client, dan pemanggil
 * harus menyusun path yang benar sendiri. Path yang salah di sisi client
 * akan ditolak policy storage dengan pesan mentah yang tidak berguna bagi
 * siswa kelas 7 yang sedang panik lima menit sebelum tenggat.
 *
 * Lewat Server Action, satu berkas 5 MB melewati server sekali — dan
 * sebagai gantinya, path, nama yang dibersihkan, validasi tipe/ukuran,
 * dan pengecekan pintu tenggat semuanya terjadi di satu tempat yang sama
 * dengan tempat barisnya ditulis. Kalau salah satunya gagal, tidak ada
 * berkas yatim yang tertinggal di storage tanpa baris yang menunjuknya.
 *
 * ── SEMUA JALUR DI SINI MEMAKAI CLIENT COOKIE-BOUND, BUKAN SERVICE ROLE ──
 *
 * RLS di 0019 yang menentukan boleh atau tidaknya. Pengecekan di berkas
 * ini ada supaya siswa membaca kalimat yang bisa dimengerti, bukan untuk
 * menggantikan RLS. Kalau suatu saat keduanya berbeda pendapat, yang
 * menang adalah database — dan itu memang yang diinginkan.
 */

interface Konteks {
  supabase: ReturnType<typeof createClient>;
  siswaId: string;
  tugas: {
    id: string;
    dibuka_at: string;
    tenggat: string;
    izinkan_terlambat: boolean;
    minta_teks: boolean;
    minta_berkas: boolean;
    sudahDinilai: boolean;
  };
}

/** Kumpulkan semua yang dibutuhkan tiap action + tolak lebih awal kalau
 *  pintunya tertutup. Mengembalikan pesan error siap pakai, bukan
 *  melempar — pemanggilnya mengembalikannya apa adanya ke form. */
async function siapkan(
  tugasId: string
): Promise<{ konteks: Konteks | null; error: string | null }> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { konteks: null, error: "Sesi kamu sudah habis. Masuk lagi ya." };
  }

  const { data: siswa } = await supabase
    .from("siswa")
    .select("id")
    .eq("auth_id", user.id)
    .maybeSingle();

  if (!siswa) {
    return {
      konteks: null,
      error:
        "Akun ini tidak terdaftar sebagai siswa. Hubungi wali kelasmu kalau ini keliru.",
    };
  }

  const { data: tugas } = await supabase
    .from("tugas")
    .select("id, dibuka_at, tenggat, izinkan_terlambat, minta_teks, minta_berkas")
    .eq("id", tugasId)
    .maybeSingle();

  // RLS `tugas_select_siswa` sudah menyaring ke tugas yang ditujukan ke
  // kelasnya, jadi "tidak ditemukan" di sini bisa berarti dua hal: tugas
  // memang tidak ada, atau tugas itu bukan untuk kelasnya. Keduanya
  // dijawab dengan kalimat yang sama — membedakannya justru membocorkan
  // keberadaan tugas kelas lain.
  if (!tugas) {
    return { konteks: null, error: "Tugas ini tidak ada atau bukan untuk kelasmu." };
  }

  const { data: pengumpulan } = await supabase
    .from("pengumpulan_tugas")
    .select("nilai")
    .eq("tugas_id", tugasId)
    .eq("siswa_id", siswa.id)
    .maybeSingle();

  return {
    konteks: {
      supabase,
      siswaId: siswa.id as string,
      tugas: {
        id: tugas.id as string,
        dibuka_at: tugas.dibuka_at as string,
        tenggat: tugas.tenggat as string,
        izinkan_terlambat: Boolean(tugas.izinkan_terlambat),
        minta_teks: Boolean(tugas.minta_teks),
        minta_berkas: Boolean(tugas.minta_berkas),
        sudahDinilai: pengumpulan?.nilai !== null && pengumpulan?.nilai !== undefined,
      },
    },
    error: null,
  };
}

/**
 * Simpan draf atau kumpulkan, tergantung field `aksi` di form.
 *
 * Satu action untuk dua tombol, bukan dua action, karena keduanya menulis
 * baris yang sama dengan validasi yang hampir sama — yang berbeda cuma
 * apakah `submitted_at` diisi. Memisahkannya berarti dua salinan dari
 * seluruh urusan unggah berkas di atas.
 */
export async function simpanPengumpulan(
  tugasId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { konteks, error } = await siapkan(tugasId);
  if (!konteks) return { error, pesan: null };

  const { supabase, siswaId, tugas } = konteks;
  const aksi = String(formData.get("aksi") ?? "draf");
  const kumpulkan = aksi === "kumpul";
  const teks = String(formData.get("teks") ?? "").trim();
  const berkas = formData.get("berkas");

  if (tugas.sudahDinilai) {
    return {
      error:
        "Tugas ini sudah dinilai gurumu, jadi tidak bisa diubah lagi. Kalau perlu memperbaiki, minta gurumu membuka kuncinya.",
      pesan: null,
    };
  }

  const tertutup = alasanTidakBolehMengumpulkan(tugas, Date.now());
  if (tertutup) {
    return { error: tertutup, pesan: null };
  }

  // ── Unggah berkas (kalau ada yang dipilih) ──
  let patchBerkas: {
    berkas_path: string;
    berkas_nama: string;
    berkas_ukuran: number;
  } | null = null;

  const adaBerkasBaru =
    berkas instanceof File && berkas.size > 0 && berkas.name !== "";

  if (adaBerkasBaru) {
    const file = berkas as File;
    const galatBerkas = validasiBerkas({
      name: file.name,
      size: file.size,
      type: file.type,
    });
    if (galatBerkas) return { error: galatBerkas, pesan: null };

    const path = pathBerkasTugas(tugasId, siswaId, file.name);

    // Berkas lama dengan NAMA BERBEDA tidak tertimpa oleh upsert — ia
    // akan tetap duduk di storage selamanya sebagai sampah yang tidak
    // ditunjuk baris mana pun. Jadi dihapus dulu secara eksplisit, dan
    // hanya kalau namanya memang berubah.
    const { data: lama } = await supabase
      .from("pengumpulan_tugas")
      .select("berkas_path")
      .eq("tugas_id", tugasId)
      .eq("siswa_id", siswaId)
      .maybeSingle();

    const pathLama = (lama?.berkas_path as string | null) ?? null;
    if (pathLama && pathLama !== path) {
      await supabase.storage.from(BUCKET_TUGAS).remove([pathLama]);
    }

    const { error: unggahError } = await supabase.storage
      .from(BUCKET_TUGAS)
      .upload(path, file, { upsert: true, contentType: file.type });

    if (unggahError) {
      return {
        error:
          "Berkasnya gagal diunggah. Cek koneksimu lalu coba lagi — tulisan yang sudah kamu ketik tidak hilang.",
        pesan: null,
      };
    }

    patchBerkas = {
      berkas_path: path,
      berkas_nama: file.name,
      berkas_ukuran: file.size,
    };
  }

  // ── Kelengkapan, hanya saat benar-benar mengumpulkan ──
  //
  // Draf boleh setengah jadi — itu gunanya draf. Yang diperiksa
  // kelengkapannya cuma pengumpulan final, dan pemeriksaannya harus tahu
  // apa yang SUDAH tersimpan sebelumnya, bukan cuma apa yang dikirim
  // barusan: siswa yang sudah mengunggah foto kemarin lalu hari ini cuma
  // menambah tulisan tidak boleh disuruh mengunggah ulang fotonya.
  if (kumpulkan) {
    const { data: tersimpan } = await supabase
      .from("pengumpulan_tugas")
      .select("teks, berkas_path")
      .eq("tugas_id", tugasId)
      .eq("siswa_id", siswaId)
      .maybeSingle();

    const teksAkhir = teks !== "" ? teks : ((tersimpan?.teks as string) ?? "");
    const berkasAkhir =
      patchBerkas?.berkas_path ??
      ((tersimpan?.berkas_path as string | null) ?? null);

    if (tugas.minta_teks && teksAkhir.trim() === "") {
      return {
        error: "Tugas ini minta jawaban tertulis. Isi dulu kolom jawabannya ya.",
        pesan: null,
      };
    }
    if (tugas.minta_berkas && !berkasAkhir) {
      return {
        error: "Tugas ini minta lampiran berkas. Pilih berkasnya dulu ya.",
        pesan: null,
      };
    }
  }

  const { error: simpanError } = await supabase
    .from("pengumpulan_tugas")
    .upsert(
      {
        tugas_id: tugasId,
        siswa_id: siswaId,
        teks,
        ...(patchBerkas ?? {}),
        submitted_at: kumpulkan ? new Date().toISOString() : null,
      },
      { onConflict: "tugas_id,siswa_id" }
    );

  if (simpanError) {
    return {
      error:
        "Gagal menyimpan. Coba lagi sebentar lagi — kalau tetap gagal, laporkan ke gurumu.",
      pesan: null,
    };
  }

  revalidatePath(`/siswa/tugas/${tugasId}`);
  revalidatePath("/siswa");

  const terlambat =
    kumpulkan && Date.now() > new Date(tugas.tenggat).getTime();

  return {
    error: null,
    pesan: kumpulkan
      ? terlambat
        ? "Terkumpul, tapi setelah tenggat — gurumu akan melihat tanda terlambat."
        : "Berhasil dikumpulkan. Tenang, gurumu sudah bisa melihatnya."
      : "Draf tersimpan. Belum dikumpulkan — tekan Kumpulkan kalau sudah yakin.",
  };
}

/**
 * Tarik kembali pengumpulan (kosongkan `submitted_at`, isinya tetap ada
 * sebagai draf).
 *
 * Bukan delete. Menghapus barisnya akan menghilangkan jejak bahwa siswa
 * pernah mengumpulkan sekaligus membuang tulisannya — dan siswa yang
 * menekan "tarik kembali" hampir selalu bermaksud MEMPERBAIKI, bukan
 * membuang. Karena itu juga tidak ada policy delete untuk siswa di 0019.
 */
export async function tarikKembaliPengumpulan(
  tugasId: string
): Promise<ActionState> {
  const { konteks, error } = await siapkan(tugasId);
  if (!konteks) return { error, pesan: null };

  const { supabase, siswaId, tugas } = konteks;

  if (tugas.sudahDinilai) {
    return {
      error: "Sudah dinilai gurumu, jadi tidak bisa ditarik kembali.",
      pesan: null,
    };
  }

  // Menarik kembali di saat pintu sudah tertutup berarti siswa terjebak:
  // pengumpulannya hilang dan dia tidak bisa mengumpulkan lagi. Lebih
  // baik ditolak di sini dengan penjelasan daripada "berhasil" lalu
  // menyisakan kekosongan yang tidak bisa diperbaiki.
  if (!bolehMengumpulkan(tugas, Date.now())) {
    return {
      error:
        "Pengumpulan sudah ditutup, jadi kalau ditarik sekarang kamu tidak bisa mengumpulkan lagi. Hubungi gurumu kalau ada yang perlu diperbaiki.",
      pesan: null,
    };
  }

  const { error: updateError } = await supabase
    .from("pengumpulan_tugas")
    .update({ submitted_at: null })
    .eq("tugas_id", tugasId)
    .eq("siswa_id", siswaId);

  if (updateError) {
    return { error: "Gagal menarik kembali. Coba lagi.", pesan: null };
  }

  revalidatePath(`/siswa/tugas/${tugasId}`);
  revalidatePath("/siswa");
  return {
    error: null,
    pesan: "Ditarik kembali. Isinya masih tersimpan sebagai draf.",
  };
}

/** Hapus lampiran berkas (dan objeknya di storage). */
export async function hapusBerkasPengumpulan(
  tugasId: string
): Promise<ActionState> {
  const { konteks, error } = await siapkan(tugasId);
  if (!konteks) return { error, pesan: null };

  const { supabase, siswaId, tugas } = konteks;

  if (tugas.sudahDinilai) {
    return {
      error: "Sudah dinilai gurumu, jadi lampirannya tidak bisa dihapus.",
      pesan: null,
    };
  }

  const { data: baris } = await supabase
    .from("pengumpulan_tugas")
    .select("berkas_path")
    .eq("tugas_id", tugasId)
    .eq("siswa_id", siswaId)
    .maybeSingle();

  const path = (baris?.berkas_path as string | null) ?? null;
  if (!path) {
    return { error: "Tidak ada berkas untuk dihapus.", pesan: null };
  }

  // Urutan sama seperti `deleteTugas`: objek storage dulu, baru barisnya.
  // Kalau barisnya dikosongkan lebih dulu dan penghapusan objek gagal,
  // path-nya tidak tercatat di mana pun lagi.
  await supabase.storage.from(BUCKET_TUGAS).remove([path]);

  const { error: updateError } = await supabase
    .from("pengumpulan_tugas")
    .update({ berkas_path: null, berkas_nama: null, berkas_ukuran: null })
    .eq("tugas_id", tugasId)
    .eq("siswa_id", siswaId);

  if (updateError) {
    return { error: "Gagal menghapus lampiran. Coba lagi.", pesan: null };
  }

  revalidatePath(`/siswa/tugas/${tugasId}`);
  return { error: null, pesan: "Lampiran dihapus." };
}

/** Signed URL 5 menit supaya siswa bisa memeriksa ulang berkas yang sudah
 *  dia unggah. Bucketnya private, jadi tidak ada cara lain — dan policy
 *  storage di 0019 sudah membatasinya ke folder miliknya sendiri. */
export async function urlBerkasSaya(
  path: string
): Promise<{ url: string | null; error: string | null }> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from(BUCKET_TUGAS)
    .createSignedUrl(path, 300);

  if (error || !data?.signedUrl) {
    return { url: null, error: "Berkas tidak bisa dibuka." };
  }
  return { url: data.signedUrl, error: null };
}
