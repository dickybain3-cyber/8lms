"use client";

import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import LogoutButton from "@/components/LogoutButton";
import JenjangSwitcherGlobal from "@/components/admin/JenjangSwitcherGlobal";
import NavigasiProgress from "@/components/admin/NavigasiProgress";
import { LOGO_URL, SEKOLAH } from "@/lib/branding";
import { JENJANG_LABEL, type Jenjang } from "@/lib/jenjang";

/**
 * Chrome admin/guru mengikuti desain acuan: sidebar gelap tetap di kiri
 * (260px) dengan menu berkelompok, area isi putih di kanan dengan header
 * sapaan. Di layar kecil sidebar berubah jadi laci yang digeser masuk
 * lewat tombol hamburger di topbar, dengan lapisan gelap di belakangnya.
 *
 * Menu dikelompokkan persis seperti rute yang sudah ada — tidak ada
 * halaman baru yang ditambahkan di sini, cuma cara menampilkannya.
 */

type MenuTunggal = {
  jenis: "tunggal";
  href: string;
  label: string;
  ikon: string;
  /** true = hanya muncul untuk akun dengan `guru.is_admin`. */
  adminSaja?: boolean;
};
type MenuGrup = {
  jenis: "grup";
  id: string;
  label: string;
  ikon: string;
  anak: { href: string; label: string; ikon: string; adminSaja?: boolean }[];
};

const MENU: (MenuTunggal | MenuGrup)[] = [
  { jenis: "tunggal", href: "/admin", label: "Dashboard", ikon: "fa-house" },
  {
    jenis: "grup",
    id: "data",
    label: "Data Master",
    ikon: "fa-database",
    anak: [
      { href: "/admin/siswa", label: "Data Siswa", ikon: "fa-user-graduate" },
      { href: "/admin/guru", label: "Data Guru", ikon: "fa-chalkboard-user" },
    ],
  },
  {
    jenis: "grup",
    id: "kegiatan",
    label: "Kegiatan",
    ikon: "fa-calendar-days",
    anak: [
      { href: "/admin/event", label: "Kelola Kegiatan", ikon: "fa-calendar-check" },
      // Bank Soal ditaruh di grup Kegiatan, tepat di bawah Kelola
      // Kegiatan — bukan sebagai menu tingkat atas sendiri. Alasannya
      // urutan kerja: guru membuka bank soal justru SAAT sedang
      // menyiapkan kegiatan ("soal PTS tahun lalu mana ya"), bukan
      // sebagai tujuan tersendiri. Menaruhnya bersebelahan dengan
      // tempat dia datang membuatnya ketemu tanpa dicari.
      { href: "/admin/bank-soal", label: "Bank Soal", ikon: "fa-box-archive" },
      // Halaman monitoring sudah ada sejak lama tapi TIDAK PERNAH punya
      // tautan di menu mana pun — satu-satunya cara membukanya adalah
      // mengetik /admin/monitoring di bilah alamat. Ini halaman yang
      // paling dibutuhkan justru saat ujian sedang berlangsung, jadi
      // ketiadaan tautannya adalah cacat yang paling mahal di seluruh
      // menu ini.
      {
        href: "/admin/monitoring",
        label: "Pantau Ujian",
        ikon: "fa-desktop",
        adminSaja: true,
      },
      { href: "/admin/nilai", label: "Rekap Penilaian", ikon: "fa-chart-line" },
      { href: "/admin/statistik", label: "Statistik", ikon: "fa-chart-pie" },
    ],
  },
  {
    jenis: "tunggal",
    href: "/admin/denah",
    label: "Tempat Duduk",
    ikon: "fa-chair",
    adminSaja: true,
  },
  {
    jenis: "tunggal",
    href: "/admin/log",
    label: "Log Aktivitas",
    ikon: "fa-clock-rotate-left",
  },
];

/**
 * Warna banner per jenjang. Bedanya SENGAJA mencolok (hijau / biru /
 * jingga), bukan tiga nuansa biru yang mirip: gunanya supaya guru yang
 * gonta-ganti sesi kelas 7 dan kelas 9 seharian langsung sadar dari
 * sudut mata kalau dia berada di jenjang yang salah — bukan baru sadar
 * sesudah membaca tulisannya.
 */
const WARNA_JENJANG: Record<Jenjang, string> = {
  7: "from-emerald-600 to-emerald-500",
  8: "from-blue-600 to-blue-500",
  9: "from-amber-600 to-amber-500",
};

/** Cocok kalau path sama persis, atau anak dari href itu (kecuali "/admin"). */
function aktif(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminShell({
  children,
  userEmail,
  namaGuru,
  jenjang,
  isAdmin,
}: {
  children: React.ReactNode;
  userEmail?: string | null;
  namaGuru?: string | null;
  /** Jenjang project yang sedang aktif — sumbernya cookie `lms_jenjang`. */
  jenjang?: Jenjang | null;
  /** `guru.is_admin` (migrasi 0011) — penentu akses lintas jenjang. */
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Menu ber-tanda `adminSaja` disaring di sini. Ini murni kerapian UI,
  // BUKAN lapisan keamanan: halaman /admin/monitoring dan /admin/denah
  // masing-masing tetap memeriksa `sesi.isAdmin` sendiri di server, jadi
  // guru yang mengetik alamatnya langsung tetap ditolak di sana.
  const menu: (MenuTunggal | MenuGrup)[] = MENU.filter(
    (m) => !(m.jenis === "tunggal" && m.adminSaja && !isAdmin)
  ).map((m) =>
    m.jenis === "grup"
      ? { ...m, anak: m.anak.filter((a) => !(a.adminSaja && !isAdmin)) }
      : m
  );

  // Grup yang sedang terbuka. Awalnya: grup yang memuat halaman aktif —
  // supaya orang tidak perlu membuka sendiri menu tempat dia berada.
  const [grupTerbuka, setGrupTerbuka] = useState<string | null>(() => {
    const grup = MENU.find(
      (m) => m.jenis === "grup" && m.anak.some((a) => aktif(pathname, a.href))
    );
    return grup && grup.jenis === "grup" ? grup.id : null;
  });

  // Pindah halaman lewat menu -> laci di HP harus ikut menutup, kalau
  // tidak isinya ketutupan laci yang masih terbuka.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen bg-paper">
      <NavigasiProgress />
      {/* Topbar khusus layar kecil */}
      <div className="sticky top-0 z-40 flex h-14 items-center gap-3 bg-ink px-4 shadow-lg lg:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Buka menu"
          className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-white transition-colors hover:bg-white/20"
        >
          <i className="fas fa-bars" aria-hidden />
        </button>
        <span className="text-sm font-bold text-white">
          {SEKOLAH.namaPendek}
        </span>
      </div>

      {/* Lapisan gelap di belakang laci (HP saja) */}
      {drawerOpen && (
        <button
          type="button"
          aria-label="Tutup menu"
          onClick={() => setDrawerOpen(false)}
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col overflow-y-auto bg-ink shadow-[4px_0_20px_rgba(0,0,0,0.15)] transition-transform duration-300 lg:translate-x-0 ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          type="button"
          onClick={() => setDrawerOpen(false)}
          aria-label="Tutup menu"
          className="absolute right-4 top-4 text-lg text-white/70 hover:text-white lg:hidden"
        >
          <i className="fas fa-xmark" aria-hidden />
        </button>

        <div className="shrink-0 px-4 py-5 text-center">
          <Image
            src={LOGO_URL}
            alt={`Logo ${SEKOLAH.nama}`}
            width={50}
            height={50}
            className="mx-auto h-[50px] w-auto object-contain"
          />
          <p className="mt-3 font-serif text-[0.8rem] font-bold leading-snug text-white">
            LMS {SEKOLAH.nama}
            <br />
            {SEKOLAH.kota}
          </p>
        </div>

        <nav className="flex-1 px-3 py-2">
          <ul className="space-y-1.5">
            {menu.map((item) =>
              item.jenis === "tunggal" ? (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all ${
                      aktif(pathname, item.href)
                        ? "bg-gradient-to-br from-[#3b82f6] to-[#2563eb] text-white shadow-lg shadow-blue-600/30"
                        : "text-slate-300 hover:translate-x-1 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <i className={`fas ${item.ikon} w-5 text-center`} aria-hidden />
                    <span>{item.label}</span>
                  </Link>
                </li>
              ) : (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() =>
                      setGrupTerbuka((g) => (g === item.id ? null : item.id))
                    }
                    aria-expanded={grupTerbuka === item.id}
                    className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-medium transition-all ${
                      grupTerbuka === item.id
                        ? "bg-black/25 text-sky-400"
                        : "text-slate-300 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <i
                        className={`fas ${item.ikon} w-5 text-center`}
                        aria-hidden
                      />
                      {item.label}
                    </span>
                    <i
                      className={`fas fa-chevron-down text-[0.7rem] transition-transform ${
                        grupTerbuka === item.id ? "rotate-180" : ""
                      }`}
                      aria-hidden
                    />
                  </button>

                  {grupTerbuka === item.id && (
                    <ul className="ml-6 mt-1 space-y-1 border-l-2 border-blue-500/20 pl-3">
                      {item.anak.map((anak) => (
                        <li key={anak.href}>
                          <Link
                            href={anak.href}
                            className={`flex items-center gap-3 rounded-r-lg px-3 py-2.5 text-[0.85rem] transition-all ${
                              aktif(pathname, anak.href)
                                ? "bg-sky-400/10 font-semibold text-sky-400"
                                : "text-slate-300 hover:translate-x-1 hover:bg-white/5 hover:text-white"
                            }`}
                          >
                            <i
                              className={`fas ${anak.ikon} w-4 text-center text-[0.8rem]`}
                              aria-hidden
                            />
                            {anak.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            )}
          </ul>
        </nav>

        {/* Penanda hak akses, di sidebar supaya selalu kelihatan. */}
        {isAdmin && (
          <div className="mx-3 mb-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-center">
            <p className="text-[0.7rem] font-bold uppercase tracking-wide text-amber-300">
              <i className="fas fa-key mr-1.5" aria-hidden />
              Akun Admin
            </p>
            <p className="mt-0.5 text-[0.65rem] leading-snug text-amber-200/70">
              Bisa melihat data ketiga jenjang
            </p>
          </div>
        )}

        <div className="mt-auto shrink-0 border-t border-white/5 bg-ink-dark p-3">
          <LogoutButton className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300 transition-colors hover:bg-red-500 hover:text-white disabled:opacity-50" />
          <p className="mt-2 text-center font-mono text-[0.65rem] text-slate-500">
            Created by <b>{SEKOLAH.pembuat}</b>
          </p>
        </div>
      </aside>

      {/* Isi halaman. `lg:ml-[260px]` mengimbangi sidebar yang fixed. */}
      <div className="lg:ml-[260px]">
        <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4 shadow-[0_2px_15px_rgba(0,0,0,0.05)] sm:px-8">
          <div>
            <h1 className="text-[1.05rem] font-semibold text-slate-600">
              Selamat Datang,{" "}
              <span className="font-bold text-[--primary]">
                {namaGuru ?? userEmail ?? "Admin"}
              </span>
            </h1>
            <p className="text-[0.72rem] text-slate-400">
              Panel pengelolaan {SEKOLAH.namaPendek}
            </p>
          </div>
          <i className="fas fa-bell text-lg text-[--accent]" aria-hidden />
        </header>

        {/*
          Banner jenjang aktif. Ditaruh DI LUAR <main> dan di atas semua
          isi halaman, sengaja tidak bisa di-scroll lewat: kesalahan yang
          mau dicegah di sini ("mengetik data kelas 8 ke database kelas
          7") terjadi justru saat orang sudah asyik mengisi form di
          bawah, bukan saat dia baru membuka halaman.
        */}
        {jenjang ? (
          <div
            className={`bg-gradient-to-r ${WARNA_JENJANG[jenjang]} px-5 py-3.5 text-white shadow-md sm:px-8`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-3 font-serif text-lg font-extrabold uppercase tracking-wide sm:text-xl">
                <i className="fas fa-triangle-exclamation text-white/80" aria-hidden />
                {isAdmin ? "Sesi login" : "Sedang mengelola"}:{" "}
                {JENJANG_LABEL[jenjang]}
              </p>
              {isAdmin ? (
                /*
                  Suspense wajib: JenjangSwitcherGlobal memakai
                  useSearchParams(), dan Next.js mensyaratkan pembacanya
                  berada di dalam batas Suspense. Tanpa ini, `next build`
                  gagal pada halaman admin yang bisa dirender statis.
                */
                <Suspense fallback={null}>
                  <JenjangSwitcherGlobal jenjangSesi={jenjang} />
                </Suspense>
              ) : (
                <p className="text-[0.75rem] font-medium text-white/85">
                  Semua data yang kamu lihat &amp; simpan di sini masuk ke
                  database {JENJANG_LABEL[jenjang]}.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-slate-600 px-5 py-3.5 text-white sm:px-8">
            <p className="font-serif text-lg font-bold uppercase">
              <i className="fas fa-circle-question mr-2" aria-hidden />
              Jenjang aktif tidak diketahui — coba keluar lalu login ulang.
            </p>
          </div>
        )}

        <main className="min-w-0 p-5 sm:p-8">{children}</main>
      </div>
    </div>
  );
}
