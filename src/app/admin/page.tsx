import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { muatEventSesi } from "@/lib/event-sesi";
import DaftarEventKelompok from "@/components/admin/DaftarEventKelompok";
import { Info, Kosong, TOMBOL_UTAMA } from "@/components/ui/Panel";

/** Jumlah kegiatan SELESAI yang ditampilkan di dashboard; sisanya lewat "Lihat semua". */
const BATAS_SELESAI_DI_DASHBOARD = 6;

export default async function AdminHomePage() {
  const supabase = createClient();

  const [
    {
      data: { user },
    },
    { daftar, error },
  ] = await Promise.all([supabase.auth.getUser(), muatEventSesi()]);

  return (
    <div>
      <h1 className="mb-2 font-serif text-2xl text-ink">Dashboard Admin</h1>
      <p className="mb-6 text-sm text-ink/60">
        Login sebagai: {user?.email ?? "—"}
      </p>
      <Link
        href="/admin/event"
        className="inline-block rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-ink-light"
      >
        Kelola Event & Mapel →
      </Link>

      {/*
        Kegiatan dikelompokkan: yang sedang berlangsung di atas, lalu yang
        akan datang, lalu yang sudah selesai di bawah. Yang selesai TIDAK
        disembunyikan — supaya guru/admin bisa membukanya lagi (Buka ulang
        → ubah tanggal) untuk ujian susulan.
      */}
      <div className="mt-8">
        {error && <Info nada="peringatan">{error}</Info>}

        {!error && daftar.length === 0 ? (
          <Kosong
            ikon="fa-calendar-plus"
            judul="Belum ada kegiatan"
            keterangan="Kegiatan adalah wadah untuk satu rangkaian penilaian — misalnya 'PAS Ganjil 2025'. Di dalamnya baru ada mata pelajaran dan soal-soalnya."
            aksi={
              <Link href="/admin/event/baru" className={TOMBOL_UTAMA}>
                <i className="fas fa-plus" aria-hidden />
                Buat Kegiatan Pertama
              </Link>
            }
          />
        ) : (
          <DaftarEventKelompok
            daftar={daftar}
            jenjang={null}
            batasSelesai={BATAS_SELESAI_DI_DASHBOARD}
          />
        )}
      </div>

      <p className="mt-8 text-sm text-ink/40">
        Statistik dan Pengolahan Nilai dibangun di sesi berikutnya.
      </p>
    </div>
  );
}
