import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSesiGuru } from "@/lib/admin-guard";
import { parseJenjang, type Jenjang } from "@/lib/jenjang";
import type { SoalSiswa, TipeSoal } from "@/types";

/**
 * Pemuat data pratinjau soal untuk guru, dipakai bersama oleh:
 *  - /admin/event/[eventId]/mapel/[mapelId]/preview (tampilan laptop), dan
 *  - /pratinjau/[eventId]/[mapelId] (isi iframe "tampilan HP", di luar
 *    layout admin supaya lebar layarnya benar-benar selebar HP).
 *
 * ── MEMBUANG KUNCI JAWABAN ──
 *
 * Halaman ujian siswa tidak membaca tabel `soal` langsung; dia memanggil
 * RPC `get_soal_untuk_siswa` yang membuang field kunci dari
 * `konten_jsonb` DI DATABASE (0006_soal_siswa_rpc.sql). Pratinjau ini
 * membaca tabelnya langsung — guru memang berhak melihat kuncinya — jadi
 * pembersihan yang sama harus dikerjakan di sini.
 *
 * Bukan demi kerahasiaan dari gurunya sendiri, tapi demi KESETARAAN
 * BENTUK: kalau pratinjau menerima konten yang masih lengkap dengan
 * kunci, soal yang diam-diam bergantung pada field kunci untuk bisa
 * dirender akan terlihat baik-baik saja di sini dan baru ketahuan rusak
 * saat ujian sungguhan berlangsung — persis saat paling mahal untuk
 * menemukannya. Pratinjau harus gagal di tempat yang sama dengan tempat
 * ujian sungguhan akan gagal.
 *
 * Daftar field yang dibuang di bawah HARUS sinkron dengan yang dibuang
 * RPC-nya. Kalau nanti ada tipe soal baru dengan field kunci baru,
 * tambahkan di kedua tempat.
 */
const FIELD_KUNCI_TINGKAT_SOAL = [
  "kunci_jawaban",
  "jawaban_benar",
  "pasangan_benar",
];

export function bersihkanKunci(
  konten: Record<string, unknown>
): Record<string, unknown> {
  const salinan: Record<string, unknown> = { ...konten };

  for (const f of FIELD_KUNCI_TINGKAT_SOAL) {
    delete salinan[f];
  }

  // Kunci yang bersembunyi di dalam array juga harus dibuang — `benar`
  // pada tiap opsi pilgan, dan `jawaban_benar` pada tiap pernyataan
  // benar-salah bertingkat. Ini yang paling gampang terlewat karena
  // tidak terlihat di tingkat atas objeknya.
  if (Array.isArray(salinan.opsi)) {
    salinan.opsi = (salinan.opsi as Record<string, unknown>[]).map((o) => {
      const { benar: _benar, ...sisa } = o;
      return sisa;
    });
  }

  if (Array.isArray(salinan.pernyataan)) {
    salinan.pernyataan = (
      salinan.pernyataan as Record<string, unknown>[]
    ).map((p) => {
      const { jawaban_benar: _jb, ...sisa } = p;
      return sisa;
    });
  }

  return salinan;
}

type SoalRow = {
  id: string;
  tipe: TipeSoal;
  urutan: number;
  skor: string | number;
  konten_jsonb: Record<string, unknown>;
  gambar_url: string | null;
};

export interface DataPratinjau {
  mapelNama: string;
  soalList: SoalSiswa[];
  totalSkor: number;
  /** Jenjang lintas-project (khusus admin) — null = jenjang sesi sendiri. */
  jenjangAdmin: Jenjang | null;
}

/** null = mapel tidak ditemukan / bukan sesi guru. */
export async function muatPratinjauSoal(
  eventId: string,
  mapelId: string,
  jenjangParam: string | undefined
): Promise<DataPratinjau | null> {
  const sesi = await getSesiGuru();
  // Halaman /pratinjau berada di luar /admin, jadi middleware tidak
  // melempar orang yang bukan guru — penjaganya di sini.
  if (!sesi.guruId) return null;

  const jenjangQuery = parseJenjang(jenjangParam);
  // Lihat catatan yang sama di /admin/bank-soal/page.tsx: ditulis
  // sebagai `Jenjang | null` supaya TypeScript bisa menyempitkannya.
  const jenjangAdmin: Jenjang | null = sesi.isAdmin ? jenjangQuery : null;
  const client = jenjangAdmin
    ? await createAdminClient(jenjangAdmin)
    : await createClient();

  const { data: mapel } = await client
    .from("mapel")
    .select("id, nama")
    .eq("id", mapelId)
    .eq("event_id", eventId)
    .maybeSingle();

  if (!mapel) return null;

  const { data: soalRows } = await client
    .from("soal")
    .select("id, tipe, urutan, skor, konten_jsonb, gambar_url")
    .eq("mapel_id", mapelId)
    .order("urutan");

  const rows = (soalRows ?? []) as SoalRow[];

  return {
    mapelNama: mapel.nama as string,
    soalList: rows.map((s) => ({
      id: s.id,
      tipe: s.tipe,
      urutan: s.urutan,
      skor: Number(s.skor),
      konten_jsonb: bersihkanKunci(s.konten_jsonb),
      gambar_url: s.gambar_url,
    })),
    totalSkor: rows.reduce((t, s) => t + Number(s.skor), 0),
    jenjangAdmin,
  };
}
