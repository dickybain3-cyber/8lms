import { JENJANG_LABEL, type Jenjang } from "@/lib/jenjang";

/**
 * Penanda "baris ini milik database jenjang mana".
 *
 * Wajib dipasang di SETIAP daftar/tabel admin yang isinya bisa berasal
 * dari lebih dari satu project (statistik gabungan, daftar siswa
 * gabungan, dst) — termasuk di baris yang punya tombol aksi. Alasannya
 * praktis: aksi seperti reset ujian tidak bisa dibatalkan, dan satu-
 * satunya petunjuk bahwa admin sedang menyentuh data kelas 9 (bukan
 * kelas 7 yang sedang dia login-i) adalah penanda ini.
 *
 * Warnanya sengaja sama dengan banner jenjang di AdminShell (hijau /
 * biru / jingga) supaya "kelas 8 itu yang biru" jadi satu kebiasaan
 * membaca di seluruh panel, bukan kode warna baru per halaman.
 */
const GAYA: Record<Jenjang, string> = {
  7: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  8: "bg-blue-50 text-blue-700 ring-blue-200",
  9: "bg-amber-50 text-amber-700 ring-amber-200",
};

export default function BadgeJenjang({
  jenjang,
  ukuran = "kecil",
}: {
  jenjang: Jenjang;
  ukuran?: "kecil" | "besar";
}) {
  const ukuranCls =
    ukuran === "besar"
      ? "px-3.5 py-1.5 text-[0.85rem]"
      : "px-2.5 py-0.5 text-[0.68rem]";

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full font-bold uppercase tracking-wide ring-1 ${GAYA[jenjang]} ${ukuranCls}`}
    >
      <i className="fas fa-database text-[0.8em]" aria-hidden />
      {JENJANG_LABEL[jenjang]}
    </span>
  );
}
