import Link from "next/link";

/**
 * Kotak perkakas tampilan untuk halaman admin.
 *
 * ── KENAPA INI ADA ──
 *
 * Halaman Kegiatan, Mapel, dan Input Soal masing-masing menyusun
 * judul, tombol, dan kartunya sendiri dengan kelas Tailwind yang
 * ditulis ulang dari nol. Hasilnya: judul halaman punya tiga ukuran
 * berbeda, tombol utama punya tiga bentuk berbeda, dan kartu daftar
 * punya tiga jarak tepi berbeda — padahal ketiganya adalah halaman yang
 * dipakai berurutan dalam satu alur kerja (pilih kegiatan → pilih mapel
 * → input soal). Guru yang berpindah antar ketiganya merasa seperti
 * berpindah antar tiga aplikasi.
 *
 * Yang lebih merepotkan: informasi terpenting di tiap halaman
 * tenggelam. Di halaman mapel, "12 soal · total skor 24" ditulis
 * sebagai teks abu-abu kecil menempel di bawah judul, padahal itulah
 * angka yang paling sering dicari guru.
 *
 * Komponen di sini menetapkan satu bentuk untuk masing-masing elemen
 * itu. Bukan soal keindahan — ini supaya guru mengenali "tombol utama
 * halaman ini" dan "angka penting halaman ini" tanpa harus membacanya
 * dulu setiap kali pindah halaman.
 *
 * Semuanya Server Component (tidak ada "use client") supaya bisa
 * dipakai langsung di dalam `page.tsx` yang async tanpa memaksa
 * halamannya jadi client.
 */

/** Tautan remah-roti di atas judul. */
export function Remah({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="group mb-3 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-[--primary]"
    >
      <i
        className="fas fa-arrow-left text-xs transition-transform group-hover:-translate-x-0.5"
        aria-hidden
      />
      {label}
    </Link>
  );
}

/**
 * Kepala halaman: judul, keterangan, dan tombol aksi.
 *
 * Tombol aksi dipaksa turun ke baris sendiri di layar sempit
 * (`flex-col` lalu `sm:flex-row`). Versi lama memakai `flex-wrap`
 * saja, yang di HP menghasilkan tombol "+ Tambah Soal" terjepit di
 * samping judul panjang dengan lebar 80 px — bisa diketuk, tapi harus
 * dicari dulu.
 */
export function KepalaHalaman({
  judul,
  keterangan,
  ikon,
  aksi,
}: {
  judul: string;
  keterangan?: React.ReactNode;
  ikon?: string;
  aksi?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3.5">
        {ikon && (
          <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#3b82f6] to-[#2563eb] text-white shadow-lg shadow-blue-600/25">
            <i className={`fas ${ikon}`} aria-hidden />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="font-serif text-[1.6rem] font-bold leading-tight text-ink">
            {judul}
          </h1>
          {keterangan && (
            <div className="mt-1 text-sm text-slate-500">{keterangan}</div>
          )}
        </div>
      </div>
      {aksi && <div className="flex shrink-0 flex-wrap gap-2">{aksi}</div>}
    </div>
  );
}

/**
 * Kartu angka penting.
 *
 * Dipakai untuk hal-hal seperti "12 soal", "total skor 24", "8 siswa
 * sudah submit" — angka yang sebelumnya hanya jadi teks kecil menempel
 * di bawah judul dan praktis tidak terbaca.
 */
export function Statistik({
  label,
  nilai,
  ikon,
  warna = "biru",
  catatan,
}: {
  label: string;
  nilai: React.ReactNode;
  ikon: string;
  warna?: "biru" | "hijau" | "emas" | "abu";
  catatan?: string;
}) {
  const skema = {
    biru: "from-blue-500/10 to-blue-500/[0.03] text-blue-600 border-blue-200/70",
    hijau:
      "from-emerald-500/10 to-emerald-500/[0.03] text-emerald-600 border-emerald-200/70",
    emas: "from-amber-500/10 to-amber-500/[0.03] text-amber-600 border-amber-200/70",
    abu: "from-slate-500/10 to-slate-500/[0.03] text-slate-600 border-slate-200",
  }[warna];

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border bg-gradient-to-br px-4 py-3 ${skema}`}
    >
      <i className={`fas ${ikon} text-lg`} aria-hidden />
      <div className="min-w-0">
        <p className="text-lg font-bold leading-none tabular-nums text-ink">
          {nilai}
        </p>
        <p className="mt-1 truncate text-[0.72rem] font-medium uppercase tracking-wide text-slate-500">
          {label}
        </p>
        {catatan && (
          <p className="mt-0.5 text-[0.68rem] text-slate-400">{catatan}</p>
        )}
      </div>
    </div>
  );
}

export function BarisStatistik({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>
  );
}

/** Wadah putih standar. `padat` untuk daftar yang barisnya punya padding sendiri. */
export function Kartu({
  children,
  className = "",
  padat = false,
}: {
  children: React.ReactNode;
  className?: string;
  padat?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)] ${
        padat ? "" : "p-5 sm:p-6"
      } ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Keadaan kosong.
 *
 * Versi lama cuma menulis "Belum ada soal di mapel ini." sebagai satu
 * baris abu-abu — benar, tapi tidak memberi tahu apa yang harus
 * dilakukan. Bentuk ini selalu memuat tombol langkah berikutnya, karena
 * halaman kosong adalah justru saat orang paling butuh diarahkan.
 */
export function Kosong({
  ikon,
  judul,
  keterangan,
  aksi,
}: {
  ikon: string;
  judul: string;
  keterangan?: string;
  aksi?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-12 text-center">
      <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-xl text-slate-400 shadow-sm">
        <i className={`fas ${ikon}`} aria-hidden />
      </span>
      <p className="font-serif text-lg font-semibold text-ink">{judul}</p>
      {keterangan && (
        <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-slate-500">
          {keterangan}
        </p>
      )}
      {aksi && <div className="mt-5 flex justify-center gap-2">{aksi}</div>}
    </div>
  );
}

/** Pemberitahuan sebaris. */
export function Info({
  nada = "info",
  children,
}: {
  nada?: "info" | "peringatan" | "sukses";
  children: React.ReactNode;
}) {
  const skema = {
    info: "border-blue-200 bg-blue-50 text-blue-900",
    peringatan: "border-amber-200 bg-amber-50 text-amber-900",
    sukses: "border-emerald-200 bg-emerald-50 text-emerald-900",
  }[nada];
  const ikon = {
    info: "fa-circle-info",
    peringatan: "fa-triangle-exclamation",
    sukses: "fa-circle-check",
  }[nada];

  return (
    <div
      className={`mb-5 flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm leading-relaxed ${skema}`}
    >
      <i className={`fas ${ikon} mt-0.5 shrink-0`} aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Kelas tombol, sebagai konstanta supaya bentuknya sama di semua halaman. */
export const TOMBOL_UTAMA =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#3b82f6] to-[#2563eb] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-600/30 disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none";

export const TOMBOL_BIASA =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-ink disabled:opacity-50";

export const TOMBOL_NONAKTIF =
  "inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-400";
