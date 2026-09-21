import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  faseTugas,
  formatTenggat,
  papanTugas,
  type PengumpulanRingkas,
} from "@/lib/tugas";
import { hitungDampakHapusTugas } from "../actions";
import TombolHapusTugas from "./TombolHapusTugas";
import PanelPenilaian, { type BarisSiswa } from "./PanelPenilaian";
import {
  BarisStatistik,
  Info,
  KepalaHalaman,
  Kosong,
  Remah,
  Statistik,
  TOMBOL_BIASA,
} from "@/components/ui/Panel";

/**
 * Detail satu tugas + daftar pengumpulan seluruh siswa sasarannya.
 *
 * ── SATU KEPUTUSAN YANG MENENTUKAN SELURUH BENTUK HALAMAN INI ──
 *
 * Yang ditampilkan adalah DAFTAR SISWA, bukan daftar pengumpulan.
 *
 * Bedanya terdengar sepele sampai kamu ingat bahwa siswa yang belum
 * menyentuh tugas sama sekali TIDAK punya baris `pengumpulan_tugas`. Kalau
 * halaman ini merender hasil query `pengumpulan_tugas`, yang tampil adalah
 * daftar anak yang sudah mengerjakan — dan anak yang belum mengerjakan,
 * yaitu justru yang paling perlu dilihat guru, tidak muncul di mana pun.
 *
 * Jadi urutannya dibalik: ambil seluruh siswa di kelas target lebih dulu,
 * lalu TEMPELKAN pengumpulan yang ada ke masing-masing. Siswa tanpa baris
 * pengumpulan tetap muncul, dengan status "belum mengumpulkan".
 *
 * Akibat langsungnya: `papanTugas()` menerima `target` terpisah dari
 * panjang daftar pengumpulan — lihat komentar di `src/lib/tugas.ts`.
 */
export default async function TugasDetailPage({
  params,
}: {
  params: { eventId: string; tugasId: string };
}) {
  const supabase = createClient();

  const { data: tugas } = await supabase
    .from("tugas")
    .select(
      "id, event_id, judul, deskripsi, dibuka_at, tenggat, skor_maksimal, izinkan_terlambat, minta_teks, minta_berkas, event(nama)"
    )
    .eq("id", params.tugasId)
    .maybeSingle();

  if (!tugas) {
    notFound();
  }

  const skorMaksimal = Number(tugas.skor_maksimal);
  const tenggat = tugas.tenggat as string;

  const { data: kelasTarget } = await supabase
    .from("tugas_kelas")
    .select("kelas_id, kelas(nama)")
    .eq("tugas_id", params.tugasId);

  const kelasIds = (kelasTarget ?? []).map((k) => k.kelas_id as string);
  const namaKelas = (kelasTarget ?? [])
    .map((k) => (k.kelas as unknown as { nama: string } | null)?.nama)
    .filter((n): n is string => Boolean(n))
    .sort();

  // Tugas tanpa kelas target adalah tugas yang tidak terlihat oleh siapa
  // pun. Itu bukan keadaan kosong yang biasa — itu kerusakan, dan
  // halamannya harus mengatakannya dengan jelas, bukan menampilkan daftar
  // kosong yang terlihat normal.
  const { data: siswaList } =
    kelasIds.length === 0
      ? { data: [] }
      : await supabase
          .from("siswa")
          .select("id, nama, username, kelas(nama)")
          .in("kelas_id", kelasIds)
          .order("nama");

  const { data: pengumpulanList } = await supabase
    .from("pengumpulan_tugas")
    .select(
      "siswa_id, teks, berkas_path, berkas_nama, berkas_ukuran, submitted_at, updated_at, nilai, catatan_guru, dinilai_at"
    )
    .eq("tugas_id", params.tugasId);

  const petaPengumpulan = new Map<string, (typeof pengumpulanList)[number]>();
  for (const p of pengumpulanList ?? []) {
    petaPengumpulan.set(p.siswa_id as string, p);
  }

  const baris: BarisSiswa[] = (siswaList ?? []).map((s) => {
    const p = petaPengumpulan.get(s.id as string);
    return {
      siswaId: s.id as string,
      nama: s.nama as string,
      username: s.username as string,
      kelasNama:
        (s.kelas as unknown as { nama: string } | null)?.nama ?? "—",
      pengumpulan: p
        ? {
            teks: (p.teks as string) ?? "",
            berkas_path: (p.berkas_path as string | null) ?? null,
            berkas_nama: (p.berkas_nama as string | null) ?? null,
            berkas_ukuran: (p.berkas_ukuran as number | null) ?? null,
            submitted_at: (p.submitted_at as string | null) ?? null,
            nilai: p.nilai === null ? null : Number(p.nilai),
            catatan_guru: (p.catatan_guru as string | null) ?? null,
            dinilai_at: (p.dinilai_at as string | null) ?? null,
          }
        : null,
    };
  });

  const papan = papanTugas(
    baris
      .map((b) => b.pengumpulan)
      .filter((p): p is NonNullable<typeof p> => p !== null) as PengumpulanRingkas[],
    tenggat,
    baris.length
  );

  const dampakHapus = await hitungDampakHapusTugas(params.tugasId);
  const fase = faseTugas(
    {
      dibuka_at: tugas.dibuka_at as string,
      tenggat,
      izinkan_terlambat: Boolean(tugas.izinkan_terlambat),
    },
    Date.now()
  );

  const eventNama =
    (tugas.event as unknown as { nama: string } | null)?.nama ?? "Kegiatan";

  return (
    <div>
      <Remah href={`/admin/event/${params.eventId}`} label={eventNama} />

      <KepalaHalaman
        judul={tugas.judul as string}
        ikon="fa-file-arrow-up"
        keterangan={
          <>
            <span className="mr-1 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
              <i className="fas fa-hourglass-end" aria-hidden />
              Tenggat {formatTenggat(tenggat)}
            </span>
            {namaKelas.length > 0 ? namaKelas.join(", ") : "Tanpa kelas target"}{" "}
            · Skor maksimal {skorMaksimal}
          </>
        }
        aksi={
          <>
            <Link
              href={`/admin/event/${params.eventId}/tugas/${tugas.id}/edit`}
              className={TOMBOL_BIASA}
            >
              <i className="fas fa-pen" aria-hidden />
              Edit Tugas
            </Link>
            <TombolHapusTugas
              eventId={params.eventId}
              tugasId={tugas.id as string}
              judul={tugas.judul as string}
              dampak={dampakHapus}
            />
          </>
        }
      />

      {/*
        Ditulis sebagai <div> sendiri, bukan lewat <Info>, supaya warnanya
        pasti merah tanpa bergantung pada varian `nada` yang tersedia di
        Panel.tsx. Ini satu-satunya pesan di halaman ini yang menandakan
        KERUSAKAN (tugas tak terlihat siapa pun), bukan sekadar informasi —
        dan pesan itu tidak boleh tampil dengan warna yang sama seperti
        keterangan biasa.
      */}
      {kelasIds.length === 0 && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <i className="fas fa-triangle-exclamation mr-2" aria-hidden />
          Tugas ini belum punya kelas target, jadi{" "}
          <strong>tidak terlihat oleh siswa mana pun</strong>. Buka{" "}
          <strong>Edit Tugas</strong> dan centang kelas yang dituju.
        </div>
      )}

      {fase === "belum_dibuka" && (
        <Info nada="info">
          Tugas ini belum dibuka ({formatTenggat(tugas.dibuka_at as string)}).
          Siswa sudah bisa melihatnya di dashboard supaya bisa bersiap, tapi
          tombol kumpulkannya masih terkunci.
        </Info>
      )}

      {fase === "lewat_tenggat" && !tugas.izinkan_terlambat && (
        <Info nada="info">
          Tenggat sudah lewat dan pengumpulan terlambat dimatikan — tidak akan
          ada pengumpulan baru yang masuk. Kalau masih ingin memberi
          kesempatan, ubah tenggatnya lewat <strong>Edit Tugas</strong>.
        </Info>
      )}

      <BarisStatistik>
        <Statistik
          label="Siswa sasaran"
          nilai={papan.target}
          ikon="fa-users"
          warna="abu"
        />
        <Statistik
          label="Sudah mengumpulkan"
          nilai={papan.terkumpul}
          ikon="fa-inbox"
          warna={papan.terkumpul > 0 ? "hijau" : "abu"}
        />
        <Statistik
          label="Belum mengumpulkan"
          nilai={papan.belum}
          ikon="fa-hourglass-half"
          warna={papan.belum > 0 ? "emas" : "abu"}
        />
        <Statistik
          label="Sudah dinilai"
          nilai={papan.dinilai}
          ikon="fa-check-double"
          warna="biru"
        />
      </BarisStatistik>

      {papan.rataRata !== null && (
        <Info nada="info">
          Rata-rata dari {papan.dinilai} pengumpulan yang sudah dinilai:{" "}
          <strong>
            {papan.rataRata.toFixed(1)} / {skorMaksimal}
          </strong>
          {papan.terlambat > 0 && (
            <>
              {" "}
              · {papan.terlambat} pengumpulan masuk setelah tenggat.
            </>
          )}
        </Info>
      )}

      {tugas.deskripsi ? (
        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
            Instruksi yang dibaca siswa
          </h2>
          {/*
            `whitespace-pre-wrap` bukan pemanis: instruksi tugas hampir
            selalu ditulis sebagai daftar langkah per baris, dan tanpa ini
            semuanya menyatu jadi satu paragraf yang tidak terbaca. Teks
            dirender sebagai teks, bukan HTML — tidak ada jalur XSS di sini.
          */}
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/80">
            {tugas.deskripsi as string}
          </p>
        </section>
      ) : (
        <Info nada="info">
          Tugas ini belum punya instruksi. Siswa cuma melihat judulnya —
          tambahkan penjelasan lewat <strong>Edit Tugas</strong> supaya tidak
          ada yang salah paham tentang apa yang harus dikumpulkan.
        </Info>
      )}

      {baris.length === 0 ? (
        <Kosong
          ikon="fa-users-slash"
          judul="Tidak ada siswa di kelas target"
          keterangan="Kelas yang dipilih belum punya siswa terdaftar, atau tugas ini belum punya kelas target sama sekali. Periksa lewat Edit Tugas."
        />
      ) : (
        <PanelPenilaian
          eventId={params.eventId}
          tugasId={tugas.id as string}
          tenggat={tenggat}
          skorMaksimal={skorMaksimal}
          mintaBerkas={Boolean(tugas.minta_berkas)}
          baris={baris}
        />
      )}
    </div>
  );
}
