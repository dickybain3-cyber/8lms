import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSesiGuru } from "@/lib/admin-guard";
import { parseJenjang } from "@/lib/jenjang";
import type { SoalSiswa, TipeSoal } from "@/types";
import PreviewClient from "./PreviewClient";

/**
 * Pratinjau ujian untuk guru.
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

function bersihkanKunci(
  tipe: TipeSoal,
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

  void tipe;
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

export default async function PreviewPage({
  params,
  searchParams,
}: {
  params: { eventId: string; mapelId: string };
  searchParams: { jenjang?: string };
}) {
  const sesi = await getSesiGuru();
  const jenjangQuery = parseJenjang(searchParams.jenjang);

  // Lihat catatan yang sama di /admin/bank-soal/page.tsx: ditulis
  // sebagai `Jenjang | null` supaya TypeScript bisa menyempitkannya.
  const jenjangAdmin = sesi.isAdmin ? jenjangQuery : null;
  const client = jenjangAdmin
    ? createAdminClient(jenjangAdmin)
    : createClient();

  const { data: mapel } = await client
    .from("mapel")
    .select("id, nama")
    .eq("id", params.mapelId)
    .eq("event_id", params.eventId)
    .maybeSingle();

  if (!mapel) {
    notFound();
  }

  const { data: soalRows } = await client
    .from("soal")
    .select("id, tipe, urutan, skor, konten_jsonb, gambar_url")
    .eq("mapel_id", params.mapelId)
    .order("urutan");

  const rows = (soalRows ?? []) as SoalRow[];

  const soalList: SoalSiswa[] = rows.map((s) => ({
    id: s.id,
    tipe: s.tipe,
    urutan: s.urutan,
    skor: Number(s.skor),
    konten_jsonb: bersihkanKunci(s.tipe, s.konten_jsonb),
    gambar_url: s.gambar_url,
  }));

  const totalSkor = rows.reduce((t, s) => t + Number(s.skor), 0);
  const qs = jenjangAdmin ? `?jenjang=${jenjangAdmin}` : "";
  const kembaliHref = `/admin/event/${params.eventId}/mapel/${params.mapelId}${qs}`;

  // Tidak ada soal = tidak ada yang bisa dipratinjau. Tombol pratinjau di
  // halaman daftar sudah dinonaktifkan untuk keadaan ini, tapi alamatnya
  // masih bisa diketik/di-bookmark — jadi tetap ditangani di sini.
  if (soalList.length === 0) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-12 text-center">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-xl text-slate-400 shadow-sm">
          <i className="fas fa-eye-slash" aria-hidden />
        </span>
        <p className="font-serif text-lg font-semibold text-ink">
          Belum ada yang bisa dipratinjau
        </p>
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-slate-500">
          Mapel {mapel.nama} belum punya satu soal pun. Tambahkan soal dulu,
          lalu buka pratinjau untuk melihat tampilannya di sisi siswa.
        </p>
        <a
          href={kembaliHref}
          className="mt-5 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          <i className="fas fa-arrow-left" aria-hidden />
          Kembali
        </a>
      </div>
    );
  }

  return (
    <PreviewClient
      soalList={soalList}
      mapelNama={mapel.nama}
      kembaliHref={kembaliHref}
      totalSkor={totalSkor}
    />
  );
}
