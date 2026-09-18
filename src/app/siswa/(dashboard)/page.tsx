import { createClient } from "@/lib/supabase/server";
import DashboardSiswaClient, { type MapelRow } from "./DashboardSiswaClient";

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
 * yang jamnya berdetak tiap detik — jadi kartu ujian berpindah ke "Ujian
 * Hari Ini" dan tombolnya bisa diklik tepat pada detiknya, tanpa
 * siapa pun menyentuh tombol refresh.
 *
 * Yang TIDAK berubah: urutan penentuannya. `submitted_at` tetap paling
 * menentukan (sudah dikumpulkan -> riwayat, apa pun jamnya), baru
 * setelah itu jamnya.
 *
 * ── KENAPA `waktuServer` DIOPER SEBAGAI PROP ──
 *
 * Jam HP siswa tidak bisa dipercaya (persis alasan yang sama kenapa
 * timer ujian memakai `server_now` dari Postgres — lihat komentar di
 * `ExamClient.tsx`). HP yang jamnya meleset 10 menit ke depan akan
 * menampilkan ujian sebagai "sudah dibuka" padahal server masih
 * menolaknya. Dengan mengirim jam server bersama datanya, client bisa
 * menghitung selisihnya sekali lalu memakai jam yang sudah dikoreksi
 * untuk seluruh sesi.
 */
export default async function SiswaDashboardPage({
  searchParams,
}: {
  searchParams: { pesan?: string };
}) {
  const supabase = createClient();

  // `mapel_select_siswa` sudah memfilter query ini ke mapel yang ditarget
  // ke kelas siswa yang login, terlepas dari jam mulai (lihat
  // docs/skema-database.md) — jadi aman ambil semua tanpa filter waktu di
  // sini, pengelompokan status dilakukan di client.
  const { data: mapelListRaw } = await supabase
    .from("mapel")
    .select("id, nama, waktu_mulai, waktu_selesai, durasi_menit, event(nama)")
    .order("waktu_mulai");

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

  return (
    <DashboardSiswaClient
      mapelList={mapelList}
      submittedByMapel={submittedByMapel}
      waktuServer={new Date().toISOString()}
      pesan={searchParams.pesan ?? null}
    />
  );
}
