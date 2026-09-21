import { createClient } from "@/lib/supabase/server";
import DashboardSiswaClient, {
  type MapelRow,
  type TugasRow,
  type ForumRow,
} from "./DashboardSiswaClient";

/**
 * Dashboard siswa.
 *
 * ── REVISI: PENGELOMPOKAN PINDAH KE CLIENT ──
 *
 * Versi sebelumnya mengelompokkan mapel (berlangsung / akan datang /
 * riwayat) DI SINI, di server, memakai `Date.now()` milik server. Itu
 * berarti hasilnya beku pada detik halaman dirender. Siswa yang membuka
 * dashboard pukul 07.58 untuk ujian yang dibuka pukul 08.00 melihat
 * mapelnya duduk di "Jadwal Mendatang" — dan tetap di sana pukul 08.05,
 * pukul 08.10, sampai dia sadar sendiri harus menekan tombol muat ulang.
 * Di lab dengan 600 siswa, "coba refresh dulu" adalah kalimat yang
 * diulang pengawas puluhan kali di lima menit pertama setiap sesi.
 *
 * Sekarang server hanya bertugas MENGAMBIL DATA. Yang memutuskan sebuah
 * mapel sudah boleh dikerjakan atau belum adalah `DashboardSiswaClient`,
 * yang jamnya berdetak tiap detik.
 *
 * ── KENAPA `waktuServer` DIOPER SEBAGAI PROP ──
 *
 * Jam HP siswa tidak bisa dipercaya (persis alasan yang sama kenapa
 * timer ujian memakai `server_now` dari Postgres). Dengan mengirim jam
 * server bersama datanya, client bisa menghitung selisihnya sekali lalu
 * memakai jam yang sudah dikoreksi untuk seluruh sesi.
 *
 * ── TAMBAHAN TAHAP 4: TUGAS ──
 *
 * Tugas dimuat di sini juga, dan KEGAGALANNYA DIABAIKAN DENGAN SENGAJA.
 * Tabel `tugas` baru ada sejak migrasi 0019; di project jenjang yang
 * migrasinya belum jalan, query ini gagal. Yang TIDAK BOLEH terjadi
 * adalah kegagalan itu menjatuhkan seluruh dashboard — siswa akan
 * kehilangan akses ke ujiannya sendiri gara-gara fitur yang bahkan belum
 * dipasang di jenjangnya. Jadi: gagal -> daftar tugas kosong, sisanya
 * jalan seperti biasa. Pola yang sama persis dipakai untuk kolom
 * `event.jenis` di Tahap 3.
 *
 * ── TAMBAHAN TAHAP 5: FORUM ──
 *
 * Sama polanya dengan tugas: tabel `forum_topik` baru ada sejak migrasi
 * 0020, kegagalannya diabaikan dengan alasan yang sama persis. Tidak
 * ada query `forum_pesan` di sini sama sekali — dashboard cuma perlu
 * tahu forum MANA yang boleh dibuka siswa ini, bukan isi obrolannya;
 * RLS `forum_topik_select_siswa` sudah otomatis membatasi ke forum yang
 * kelasnya ditautkan ke siswa yang login.
 */
export default async function SiswaDashboardPage({
  searchParams,
}: {
  searchParams: { pesan?: string };
}) {
  const supabase = createClient();

  // `mapel_select_siswa` sudah memfilter query ini ke mapel yang ditarget
  // ke kelas siswa yang login, terlepas dari jam mulai — jadi aman ambil
  // semua tanpa filter waktu di sini.
  const lengkap = await supabase
    .from("mapel")
    .select(
      "id, nama, waktu_mulai, waktu_selesai, durasi_menit, event(nama, jenis)"
    )
    .order("waktu_mulai");

  const mapelListRaw = lengkap.error
    ? (
        await supabase
          .from("mapel")
          .select("id, nama, waktu_mulai, waktu_selesai, durasi_menit, event(nama)")
          .order("waktu_mulai")
      ).data
    : lengkap.data;

  const mapelList = (mapelListRaw ?? []) as unknown as MapelRow[];

  // RLS `jawaban_select_own` otomatis membatasi ke baris siswa yang login
  // sendiri, jadi tidak perlu filter siswa_id manual di sini.
  const { data: jawabanListRaw } = await supabase
    .from("jawaban_siswa")
    .select("mapel_id, submitted_at");

  const submittedByMapel: Record<string, string | null> = {};
  for (const j of jawabanListRaw ?? []) {
    submittedByMapel[j.mapel_id as string] =
      (j.submitted_at as string | null) ?? null;
  }

  // ── Tugas (0019). Gagal = kosong, lihat penjelasan di atas. ──
  const hasilTugas = await supabase
    .from("tugas")
    .select(
      "id, judul, dibuka_at, tenggat, izinkan_terlambat, minta_berkas, event(nama)"
    )
    .order("tenggat");

  const tugasList = (
    hasilTugas.error ? [] : (hasilTugas.data ?? [])
  ) as unknown as TugasRow[];

  const hasilPengumpulan = tugasList.length
    ? await supabase
        .from("pengumpulan_tugas")
        .select("tugas_id, submitted_at, nilai")
        .in(
          "tugas_id",
          tugasList.map((t) => t.id)
        )
    : { data: [], error: null };

  const pengumpulanByTugas: Record<
    string,
    { submitted_at: string | null; nilai: number | null }
  > = {};
  for (const p of hasilPengumpulan.error ? [] : (hasilPengumpulan.data ?? [])) {
    pengumpulanByTugas[p.tugas_id as string] = {
      submitted_at: (p.submitted_at as string | null) ?? null,
      nilai: p.nilai === null ? null : Number(p.nilai),
    };
  }

  // ── Forum (0020). Gagal = kosong, lihat penjelasan di atas. ──
  const hasilForum = await supabase
    .from("forum_topik")
    .select("id, dibuka_at, ditutup_at, event(nama)")
    .order("ditutup_at");

  const forumList = (
    hasilForum.error ? [] : (hasilForum.data ?? [])
  ) as unknown as ForumRow[];

  return (
    <DashboardSiswaClient
      mapelList={mapelList}
      submittedByMapel={submittedByMapel}
      tugasList={tugasList}
      pengumpulanByTugas={pengumpulanByTugas}
      forumList={forumList}
      waktuServer={new Date().toISOString()}
      pesan={searchParams.pesan ?? null}
    />
  );
}
