import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Checkout ujian (migrasi 0024): 5 menit sebelum `mapel.waktu_selesai`, siswa
 * yang sudah mulai wajib menjawab satu pertanyaan ya/tidak lalu menekan
 * Checkout. Tidak memengaruhi nilai — yang tidak checkout hanya diberi catatan.
 *
 * Jendela yang sah ditegakkan RPC `checkout_ujian_siswa` memakai jam server.
 * Konstanta di sini hanya untuk LABEL di sisi admin dan harus sama dengan
 * `interval '5 minutes'` di 0024_checkout_ujian.sql.
 */
export const MENIT_CHECKOUT = 5;

/** Dikirim ExamClient begitu ujian dimulai, supaya PenjagaCheckout tidak
 *  menunggu putaran berikutnya untuk tahu ada ujian baru. */
export const EVENT_CEK_CHECKOUT = "lms:cek-checkout";

export type StatusCheckout =
  | "tidak_ikut" // belum/tidak memulai ujian, jadi tidak wajib checkout
  | "belum_waktunya"
  | "terbuka" // jendela sedang buka, siswa belum menekan
  | "sudah"
  | "terlewat"; // jendela sudah tutup, siswa tidak checkout

export const LABEL_CHECKOUT: Record<StatusCheckout, string> = {
  tidak_ikut: "—",
  belum_waktunya: "Belum waktunya",
  terbuka: "Belum checkout",
  sudah: "Sudah checkout",
  terlewat: "Tidak checkout",
};

export function hitungStatusCheckout(opts: {
  sudahMulai: boolean;
  sudahCheckout: boolean;
  waktuSelesai: string;
  sekarangMs: number;
}): StatusCheckout {
  if (opts.sudahCheckout) return "sudah";
  if (!opts.sudahMulai) return "tidak_ikut";
  const tutup = new Date(opts.waktuSelesai).getTime();
  if (opts.sekarangMs >= tutup) return "terlewat";
  return opts.sekarangMs >= tutup - MENIT_CHECKOUT * 60_000
    ? "terbuka"
    : "belum_waktunya";
}

/** Teks kolom Catatan di rekap nilai. Kosong = tidak ada yang perlu dicatat. */
export function catatanCheckout(
  status: StatusCheckout | null,
  masihDiRuang: boolean | null
): string {
  if (status === "terbuka" || status === "terlewat") return "Belum checkout";
  if (status === "sudah" && masihDiRuang === false) {
    return "Checkout, menjawab TIDAK di ruang ujian";
  }
  return "";
}

/** "08.25" dalam WIB, dari ISO UTC. */
export function jamWib(iso: string): string {
  return new Date(iso).toLocaleTimeString("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export interface DataCheckoutMapel {
  waktuSelesai: string;
  perSiswa: Map<string, { checkoutAt: string; masihDiRuang: boolean }>;
}

/**
 * `null` = checkout tidak berlaku untuk mapel ini: mapel lama, atau migrasi
 * 0024 belum dijalankan di project ini. Galat sengaja tidak dilempar, supaya
 * Pantau Ujian dan Rekap Nilai tetap jalan tanpa fitur ini.
 */
export async function muatCheckoutMapel(
  client: Pick<SupabaseClient, "from">,
  mapelId: string
): Promise<DataCheckoutMapel | null> {
  const { data: mapel, error: errMapel } = await client
    .from("mapel")
    .select("waktu_selesai, checkout_wajib")
    .eq("id", mapelId)
    .maybeSingle();
  if (errMapel || !mapel?.checkout_wajib) return null;

  const { data, error } = await client
    .from("checkout_ujian")
    .select("siswa_id, checkout_at, masih_di_ruang")
    .eq("mapel_id", mapelId);
  if (error) return null;

  return {
    waktuSelesai: mapel.waktu_selesai as string,
    perSiswa: new Map(
      (data ?? []).map((c) => [
        c.siswa_id as string,
        {
          checkoutAt: c.checkout_at as string,
          masihDiRuang: c.masih_di_ruang as boolean,
        },
      ])
    ),
  };
}

/** Status satu siswa dari hasil `muatCheckoutMapel`. */
export function checkoutSatuSiswa(
  data: DataCheckoutMapel | null,
  siswaId: string,
  sudahMulai: boolean,
  sekarangMs: number
): {
  status: StatusCheckout | null;
  checkoutAt: string | null;
  masihDiRuang: boolean | null;
} {
  if (!data) return { status: null, checkoutAt: null, masihDiRuang: null };
  const baris = data.perSiswa.get(siswaId);
  return {
    status: hitungStatusCheckout({
      sudahMulai,
      sudahCheckout: Boolean(baris),
      waktuSelesai: data.waktuSelesai,
      sekarangMs,
    }),
    checkoutAt: baris?.checkoutAt ?? null,
    masihDiRuang: baris?.masihDiRuang ?? null,
  };
}
