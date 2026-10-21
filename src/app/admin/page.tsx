import Link from "next/link";
import { getSesiGuru } from "@/lib/admin-guard";
import { muatEventSesi } from "@/lib/event-sesi";
import DaftarEventKelompok from "@/components/admin/DaftarEventKelompok";
import { Info, Kosong, TOMBOL_UTAMA } from "@/components/ui/Panel";

/** Jumlah kegiatan SELESAI yang ditampilkan di dashboard; sisanya lewat "Lihat semua". */
const BATAS_SELESAI_DI_DASHBOARD = 6;

/**
 * Pintasan ke pekerjaan yang paling sering dilakukan guru, supaya dari HP
 * tidak perlu membuka laci menu dulu. Target sentuh setinggi 72 px.
 */
const PINTASAN = [
  { href: "/admin/event", label: "Kegiatan & Soal", ikon: "fa-calendar-check", warna: "bg-blue-50 text-blue-600", adminSaja: false },
  { href: "/admin/monitoring", label: "Pantau Ujian", ikon: "fa-desktop", warna: "bg-emerald-50 text-emerald-600", adminSaja: true },
  { href: "/admin/statistik", label: "Statistik Nilai", ikon: "fa-chart-pie", warna: "bg-violet-50 text-violet-600", adminSaja: false },
  { href: "/admin/nilai", label: "Rekap Nilai", ikon: "fa-chart-line", warna: "bg-amber-50 text-amber-600", adminSaja: false },
  { href: "/admin/bank-soal", label: "Bank Soal", ikon: "fa-box-archive", warna: "bg-sky-50 text-sky-600", adminSaja: false },
] as const;

export default async function AdminHomePage() {
  const [sesi, { daftar, error }] = await Promise.all([getSesiGuru(), muatEventSesi()]);

  return (
    <div>
      {/* Sapaan sudah ada di bilah atas — dashboard langsung ke pintasan
          supaya daftar kegiatan terlihat tanpa menggulir. */}
      <nav aria-label="Pintasan" className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {PINTASAN.filter((p) => sesi.isAdmin || !p.adminSaja).slice(0, 4).map((p) => (
          <Link
            key={p.href}
            href={p.href}
            className="flex min-h-[56px] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-navy-300 hover:shadow-md active:bg-slate-50"
          >
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${p.warna}`}>
              <i className={`fas ${p.ikon}`} aria-hidden />
            </span>
            <span className="text-sm font-semibold leading-snug text-ink">{p.label}</span>
          </Link>
        ))}
      </nav>

      {/*
        Kegiatan dikelompokkan: yang sedang berlangsung di atas, lalu yang
        akan datang, lalu yang sudah selesai di bawah. Yang selesai TIDAK
        disembunyikan — supaya guru/admin bisa membukanya lagi (Buka ulang
        → ubah tanggal) untuk ujian susulan.
      */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-serif text-lg font-bold text-navy-900">Kegiatan</h2>
        <Link href="/admin/event/baru" className={TOMBOL_UTAMA}>
          <i className="fas fa-plus" aria-hidden />
          Buat Kegiatan
        </Link>
      </div>
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
  );
}
