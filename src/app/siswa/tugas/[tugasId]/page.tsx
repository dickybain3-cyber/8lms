import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatTenggat } from "@/lib/tugas";
import FormPengumpulan, {
  type PengumpulanSaya,
  type TugasUntukSiswa,
} from "./FormPengumpulan";

/**
 * Halaman satu tugas untuk siswa: instruksi + form pengumpulan.
 *
 * ── TIDAK ADA PENGECEKAN "APAKAH TUGAS INI UNTUK KELASKU" DI SINI ──
 *
 * Dan itu disengaja. Policy `tugas_select_siswa` (0019) sudah menyaring
 * SELECT ke tugas yang ditujukan ke kelas siswa yang login, jadi tugas
 * kelas lain sudah tidak ada di hasil query — bukan "ada tapi ditolak",
 * melainkan benar-benar tidak terlihat. Menambahkan pengecekan kedua di
 * sini cuma menambah satu query yang jawabannya selalu sama, dan
 * menciptakan kesan keliru bahwa keamanannya bergantung pada kode
 * halaman. `notFound()` di bawah menangani keduanya sekaligus: tugas yang
 * memang tidak ada, dan tugas yang bukan haknya.
 *
 * Konsekuensi yang harus diingat kalau suatu saat halaman ini diubah
 * memakai service role (mis. untuk tampilan admin): penyaringnya hilang,
 * dan pengecekan kelas HARUS ditulis manual di titik itu.
 */
export default async function TugasSiswaPage({
  params,
}: {
  params: { tugasId: string };
}) {
  const supabase = createClient();

  const { data: tugas } = await supabase
    .from("tugas")
    .select(
      "id, judul, deskripsi, dibuka_at, tenggat, skor_maksimal, izinkan_terlambat, minta_teks, minta_berkas, event(nama)"
    )
    .eq("id", params.tugasId)
    .maybeSingle();

  if (!tugas) {
    notFound();
  }

  // RLS `pengumpulan_select_own` membatasi ke baris siswa yang login, jadi
  // tidak perlu filter siswa_id manual — pola yang sama dipakai dashboard
  // untuk `jawaban_siswa`.
  const { data: pengumpulan } = await supabase
    .from("pengumpulan_tugas")
    .select(
      "teks, berkas_path, berkas_nama, berkas_ukuran, submitted_at, nilai, catatan_guru"
    )
    .eq("tugas_id", params.tugasId)
    .maybeSingle();

  const tugasProps: TugasUntukSiswa = {
    id: tugas.id as string,
    judul: tugas.judul as string,
    dibuka_at: tugas.dibuka_at as string,
    tenggat: tugas.tenggat as string,
    izinkan_terlambat: Boolean(tugas.izinkan_terlambat),
    minta_teks: Boolean(tugas.minta_teks),
    minta_berkas: Boolean(tugas.minta_berkas),
    skor_maksimal: Number(tugas.skor_maksimal),
  };

  const awal: PengumpulanSaya | null = pengumpulan
    ? {
        teks: (pengumpulan.teks as string) ?? "",
        berkas_path: (pengumpulan.berkas_path as string | null) ?? null,
        berkas_nama: (pengumpulan.berkas_nama as string | null) ?? null,
        berkas_ukuran: (pengumpulan.berkas_ukuran as number | null) ?? null,
        submitted_at: (pengumpulan.submitted_at as string | null) ?? null,
        nilai: pengumpulan.nilai === null ? null : Number(pengumpulan.nilai),
        catatan_guru: (pengumpulan.catatan_guru as string | null) ?? null,
      }
    : null;

  const eventNama =
    (tugas.event as unknown as { nama: string } | null)?.nama ?? "Kegiatan";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/siswa" className="text-sm text-slate-500 hover:text-ink">
          ← Kembali ke beranda
        </Link>
        <p className="mt-3 flex flex-wrap items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-wide text-slate-400">
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">
            Tugas
          </span>
          {eventNama}
        </p>
        <h1 className="mt-1 font-serif text-2xl font-bold text-ink">
          {tugas.judul as string}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Tenggat {formatTenggat(tugas.tenggat as string)} · Skor maksimal{" "}
          {tugasProps.skor_maksimal}
        </p>
      </div>

      {tugas.deskripsi ? (
        <section className="card-mewah p-5">
          <h2 className="mb-2 text-[0.7rem] font-bold uppercase tracking-wide text-slate-500">
            Instruksi
          </h2>
          {/* `whitespace-pre-wrap`: guru menulis instruksi sebagai daftar
              langkah per baris. Tanpa ini semuanya menyatu jadi satu
              paragraf panjang yang justru paling sulit diikuti anak. */}
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/85">
            {tugas.deskripsi as string}
          </p>
        </section>
      ) : null}

      <FormPengumpulan
        tugas={tugasProps}
        awal={awal}
        // Jam server dikirim bersama datanya supaya hitung mundur di HP
        // siswa tidak bergantung pada jam HP-nya sendiri — alasan
        // lengkapnya ada di FormPengumpulan.tsx.
        waktuServer={new Date().toISOString()}
      />
    </div>
  );
}
