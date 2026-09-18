import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ExamClient from "@/components/siswa/ujian/ExamClient";
import { acakSoalUntukSiswa } from "@/lib/acak-soal";
import type { SoalSiswa } from "@/types";

/**
 * Halaman pengerjaan ujian.
 *
 * Deadline TIDAK dihitung di sini. Halaman ini dirender di server Next.js,
 * yang jamnya belum tentu sama dengan jam database; satu-satunya sumber
 * waktu yang sah adalah RPC `mulai_ujian` yang mengembalikan `now()` milik
 * Postgres bersama deadline-nya.
 *
 * ── REVISI: SOAL & OPSI DIACAK PER SISWA ──
 *
 * `get_soal_untuk_siswa` mengembalikan soal dalam urutan `urutan` — sama
 * untuk semua orang. Pengacakannya dilakukan DI SINI, setelah data
 * diterima, memakai benih yang diturunkan dari `siswaId` + `mapelId`
 * (lihat penjelasan panjang di src/lib/acak-soal.ts).
 *
 * Kenapa di server, bukan di dalam ExamClient? Dua alasan:
 *
 *   1. Urutan sudah final sebelum HTML pertama dikirim, jadi tidak ada
 *      kedipan "soal 1 berubah jadi soal lain" sesaat setelah halaman
 *      tampil (yang akan terjadi kalau pengacakan baru berjalan di efek
 *      React setelah render pertama).
 *   2. ExamClient tetap tidak perlu tahu apa-apa soal pengacakan. Ia
 *      hanya menerima daftar soal dan menampilkannya berurutan — persis
 *      seperti sebelumnya.
 *
 * Karena benihnya tetap, memuat ulang halaman menghasilkan urutan yang
 * SAMA PERSIS. Itu wajib: siswa yang halamannya ter-refresh di tengah
 * ujian tidak boleh kehilangan peta pengerjaannya.
 */
export default async function UjianPage({
  params,
}: {
  params: { mapelId: string };
}) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: siswa } = await supabase
    .from("siswa")
    .select("id")
    .eq("auth_id", user?.id ?? "")
    .maybeSingle();

  const { data: mapel } = await supabase
    .from("mapel")
    .select("id, nama, waktu_mulai, waktu_selesai, durasi_menit")
    .eq("id", params.mapelId)
    .maybeSingle();

  if (!siswa || !mapel) {
    return (
      <ErrorState pesan="Ujian tidak ditemukan, atau kamu tidak punya akses ke ujian ini." />
    );
  }

  // Jendela ujian ditegakkan juga di sini, bukan cuma disembunyikan di
  // dashboard. Tanpa ini, siswa yang menyimpan tautan ujian bisa
  // membukanya (dan memulai timernya) sebelum jadwalnya dibuka.
  if (Date.now() < new Date(mapel.waktu_mulai).getTime()) {
    return (
      <ErrorState
        pesan={`Ujian "${mapel.nama}" belum dibuka. Silakan kembali pada ${new Date(
          mapel.waktu_mulai
        ).toLocaleString("id-ID", {
          day: "numeric",
          month: "long",
          hour: "2-digit",
          minute: "2-digit",
        })}.`}
      />
    );
  }

  const { data: soalList, error: rpcError } = await supabase.rpc(
    "get_soal_untuk_siswa",
    { p_mapel_id: params.mapelId }
  );

  if (rpcError) {
    return <ErrorState pesan={rpcError.message} />;
  }

  const soalAcak = acakSoalUntukSiswa(
    (soalList ?? []) as SoalSiswa[],
    `${siswa.id}:${params.mapelId}`
  );

  const { data: jawabanRow } = await supabase
    .from("jawaban_siswa")
    .select("jawaban_jsonb, submitted_at, mulai_at")
    .eq("mapel_id", params.mapelId)
    .eq("siswa_id", siswa.id)
    .maybeSingle();

  return (
    <ExamClient
      mapel={mapel}
      siswaId={siswa.id}
      soalList={soalAcak}
      jawabanAwal={
        (jawabanRow?.jawaban_jsonb as Record<string, unknown> | undefined) ?? {}
      }
      submittedAtAwal={jawabanRow?.submitted_at ?? null}
      sudahMulai={Boolean(jawabanRow?.mulai_at)}
    />
  );
}

function ErrorState({ pesan }: { pesan: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-6">
      <div className="w-full max-w-md rounded-lg border border-ink/10 bg-white p-6 text-center">
        <p className="mb-4 text-sm text-ink/70">{pesan}</p>
        <Link
          href="/siswa"
          className="text-sm font-medium text-teal hover:text-teal-light"
        >
          ← Kembali ke dashboard
        </Link>
      </div>
    </div>
  );
}
