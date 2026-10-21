"use client";

import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import LogoutButton from "@/components/LogoutButton";
import AvatarGuru from "@/components/AvatarGuru";
import JenjangSwitcherGlobal from "@/components/admin/JenjangSwitcherGlobal";
import NavigasiProgress from "@/components/admin/NavigasiProgress";
import { LOGO_URL_KECIL, SEKOLAH } from "@/lib/branding";
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
  // Profil sendiri (foto, username, password). Untuk SEMUA guru — bukan
  // `adminSaja`: halaman ini hanya pernah menyentuh akun si pemakainya.
  {
    jenis: "tunggal",
    href: "/admin/profil",
    label: "Profil Saya",
    ikon: "fa-user-gear",
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
  fotoUrl,
}: {
  children: React.ReactNode;
  userEmail?: string | null;
  namaGuru?: string | null;
  /** `guru.foto_url` (migrasi 0016). Kosong → avatar bulat bawaan. */
  fotoUrl?: string | null;
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
      <div className="sticky top-0 z-40 flex h-14 items-center gap-3 bg-gradient-to-r from-navy-800 to-navy-900 px-4 shadow-lg print:hidden lg:hidden">
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
        <Link
          href="/admin/profil"
          aria-label="Buka profil saya"
          className="ml-auto rounded-full ring-2 ring-white/30 transition-shadow hover:ring-white/60"
        >
          <AvatarGuru fotoUrl={fotoUrl} nama={namaGuru} ukuran={34} />
        </Link>
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
        className={`scroll-halus fixed inset-y-0 left-0 z-50 flex print:hidden w-[240px] flex-col overflow-y-auto bg-gradient-to-b from-navy-800 via-navy-900 to-navy-950 shadow-[4px_0_24px_rgba(8,22,58,0.25)] transition-transform duration-300 lg:inset-y-3 lg:left-3 lg:translate-x-0 lg:rounded-3xl ${
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

        <div className="mx-3.5 flex shrink-0 items-center gap-2.5 border-b border-white/10 py-3.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/95 p-1 shadow-md">
            <Image
              src={LOGO_URL_KECIL}
              alt={`Logo ${SEKOLAH.nama}`}
              width={40}
              height={40}
              className="h-full w-auto object-contain"
            />
          </span>
          <p className="min-w-0 font-serif text-[0.74rem] font-extrabold uppercase leading-tight tracking-wide text-white">
            LMS {SEKOLAH.nama}
            <span className="block text-[0.68rem] font-semibold tracking-[0.12em] text-navy-200">
              {SEKOLAH.kota}
            </span>
          </p>
        </div>

        <nav className="flex-1 px-2.5 py-2">
          <ul className="space-y-0.5">
            {menu.map((item) =>
              item.jenis === "tunggal" ? (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-[0.84rem] font-semibold transition-all ${
                      aktif(pathname, item.href)
                        ? "bg-white text-navy-800 shadow-[inset_4px_0_0_#facc15,0_10px_15px_-3px_rgba(0,0,0,0.2)]"
                        : "text-navy-100/85 hover:translate-x-1 hover:bg-white/10 hover:text-white"
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
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-[0.84rem] font-semibold transition-all ${
                      grupTerbuka === item.id
                        ? "bg-white/10 text-white"
                        : "text-navy-100/85 hover:bg-white/10 hover:text-white"
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
                    <ul className="mb-1 ml-5 mt-0.5 space-y-0.5 border-l-2 border-white/15 pl-2.5">
                      {item.anak.map((anak) => (
                        <li key={anak.href}>
                          <Link
                            href={anak.href}
                            className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[0.8rem] transition-all ${
                              aktif(pathname, anak.href)
                                ? "bg-white font-semibold text-navy-800 shadow-[inset_3px_0_0_#facc15]"
                                : "text-navy-100/80 hover:translate-x-1 hover:bg-white/10 hover:text-white"
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
          <div className="mx-2.5 mb-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-2.5 py-1.5 text-center" title="Bisa melihat data ketiga jenjang">
            <p className="text-[0.7rem] font-bold uppercase tracking-wide text-amber-300">
              <i className="fas fa-key mr-1.5" aria-hidden />
              Akun Admin
            </p>
          </div>
        )}

        <div className="mt-auto shrink-0 border-t border-white/10 p-2.5">
          <Link
            href="/admin/profil"
            className="mb-2 flex items-center gap-2.5 rounded-xl bg-white/[0.07] p-2 transition-colors hover:bg-white/[0.12]"
          >
            <AvatarGuru
              fotoUrl={fotoUrl}
              nama={namaGuru}
              ukuran={32}
              className="ring-2 ring-white/30"
            />
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[0.8rem] font-semibold text-white">
                {namaGuru ?? "Guru"}
              </span>
              <span className="block truncate text-[0.68rem] text-navy-200">
                {userEmail ?? (isAdmin ? "Administrator" : "Guru")}
              </span>
            </span>
          </Link>
          <LogoutButton className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300 transition-colors hover:bg-red-500 hover:text-white disabled:opacity-50" />
          <p className="mt-1.5 text-center font-mono text-[0.6rem] text-navy-300/60">
            Created by <b>{SEKOLAH.pembuat}</b>
          </p>
        </div>
      </aside>

      {/*
        Isi halaman. Sidebar mengambang di left-3 selebar 240 px, jadi
        tepi kanannya 252 px; bilah atas & isi memakai jarak 12 px (px-3)
        yang SAMA dengan jarak sidebar ke tepi layar — itu yang membuat
        sidebar dan halaman terbaca sebagai satu bingkai.
      */}
      <div className="lg:ml-[252px] print:ml-0">
        {/*
          ── Bilah atas layar lebar ──
          Satu kartu putih sejajar puncak sidebar, berisi tiga hal yang dulu
          memakan tiga baris (sapaan, banner jenjang, profil). Penanda
          jenjang tetap MENCOLOK (warna hijau/biru/jingga per jenjang) dan
          kini malah ikut lengket di atas saat menggulir — kesalahan yang
          mau dicegah ("mengetik data kelas 8 ke database kelas 7") terjadi
          justru saat orang sudah asyik mengisi form di bawah.
        */}
        <header className="sticky top-0 z-30 hidden bg-paper/95 px-3 pt-3 print:!hidden lg:block">
          <div className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200/70">
            {jenjang ? (
              <span
                className={`inline-flex shrink-0 items-center gap-2 rounded-xl bg-gradient-to-r ${WARNA_JENJANG[jenjang]} px-3 py-2 text-[0.78rem] font-extrabold uppercase tracking-wide text-white shadow-sm`}
              >
                <i className="fas fa-database text-white/80" aria-hidden />
                {isAdmin ? "Sesi" : "Mengelola"}: {JENJANG_LABEL[jenjang]}
              </span>
            ) : (
              <span className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-slate-500 px-3 py-2 text-[0.78rem] font-bold text-white">
                <i className="fas fa-circle-question" aria-hidden />
                Jenjang tidak diketahui — login ulang
              </span>
            )}
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[0.85rem] font-semibold text-slate-600">
                Selamat datang,{" "}
                <span className="font-bold text-navy-800">
                  {namaGuru ?? userEmail ?? "Admin"}
                </span>
              </p>
              <p className="truncate text-[0.68rem] text-slate-400">
                {jenjang
                  ? `Data yang kamu simpan masuk ke database ${JENJANG_LABEL[jenjang]}`
                  : `Panel pengelolaan ${SEKOLAH.namaPendek}`}
              </p>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-3">
              {isAdmin && jenjang && (
                /*
                  Suspense wajib: JenjangSwitcherGlobal memakai
                  useSearchParams(), dan Next.js mensyaratkan pembacanya
                  berada di dalam batas Suspense.
                */
                <Suspense fallback={null}>
                  <JenjangSwitcherGlobal jenjangSesi={jenjang} terang />
                </Suspense>
              )}
              <Link
                href="/admin/profil"
                aria-label="Buka profil saya"
                className="group flex items-center gap-2 rounded-full py-0.5 pl-0.5 pr-3 transition-colors hover:bg-navy-50"
              >
                <AvatarGuru
                  fotoUrl={fotoUrl}
                  nama={namaGuru}
                  ukuran={34}
                  className="ring-2 ring-slate-100 transition-shadow group-hover:ring-[--accent]"
                />
                <span className="text-left leading-tight">
                  <span className="block text-[0.78rem] font-semibold text-slate-700">
                    Profil saya
                  </span>
                  <span className="block text-[0.66rem] text-slate-400">
                    {isAdmin ? "Administrator" : "Guru"}
                  </span>
                </span>
              </Link>
            </div>
          </div>
        </header>

        {/* HP & tablet: penanda jenjang berupa pita tipis di bawah bilah biru. */}
        {jenjang ? (
          <div
            className={`bg-gradient-to-r ${WARNA_JENJANG[jenjang]} px-4 py-2 text-white shadow-md print:hidden lg:hidden`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 font-serif text-[0.85rem] font-extrabold uppercase tracking-wide">
                <i className="fas fa-database text-white/80" aria-hidden />
                {isAdmin ? "Sesi login" : "Sedang mengelola"}: {JENJANG_LABEL[jenjang]}
              </p>
              {isAdmin && (
                <Suspense fallback={null}>
                  <JenjangSwitcherGlobal jenjangSesi={jenjang} />
                </Suspense>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-slate-600 px-4 py-2 text-sm font-bold text-white print:hidden lg:hidden">
            <i className="fas fa-circle-question mr-2" aria-hidden />
            Jenjang aktif tidak diketahui — coba keluar lalu login ulang.
          </div>
        )}

        <main className="min-w-0 p-4 sm:p-5 lg:px-3 lg:pb-4 lg:pt-4 print:p-0">
          {children}
        </main>
      </div>
    </div>
  );
}
