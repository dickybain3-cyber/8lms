"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * BILAH LOADING GLOBAL — jawaban untuk keluhan "guru jadi gatau itu stuck
 * atau lagi loading" tiap pindah menu di admin.
 *
 * ── KENAPA TIDAK PAKAI `loading.tsx` BAWAAN NEXT.JS SAJA ──
 *
 * `loading.tsx` per-route memang built-in, tapi dia mengganti SELURUH isi
 * `<main>` dengan skeleton sampai data halaman baru siap — untuk halaman
 * seperti daftar siswa dengan ratusan baris, itu berarti sidebar dan
 * header ikut "berkedip" karena seluruh pohon di bawah layout dirender
 * ulang dari nol. Yang diminta di sini lebih sederhana dan justru lebih
 * jelas: SATU indikator konsisten di posisi yang sama, yang bergerak
 * begitu tautan diklik dan berhenti begitu halaman baru siap — bukan
 * layar yang seluruhnya diganti skeleton.
 *
 * ── KENAPA "MEWAH TAPI RINGAN" DIWUJUDKAN SEBAGAI CSS, BUKAN LIBRARY ──
 *
 * Tidak ada dependensi baru (nprogress, dsb) yang perlu diunduh setiap
 * pemuatan admin. Seluruh animasi ini satu bilah gradasi + satu
 * transisi `width`, jadi ukurannya cuma beberapa baris JS dan tidak
 * memengaruhi waktu muat.
 *
 * ── CARA KERJANYA ──
 *
 * App Router (Next.js 13-15 tanpa `useLinkStatus`, yang belum tersedia
 * di versi project ini) tidak mengekspos event "mulai/selesai navigasi"
 * secara langsung. Trik yang dipakai di sini — dan yang dipakai hampir
 * semua implementasi "nprogress for App Router" di luar sana — adalah:
 *
 *   1. Pasang listener klik di `document` (capture phase, supaya
 *      tertangkap SEBELUM Next.js/Link menangani navigasinya sendiri).
 *   2. Kalau yang diklik adalah tautan internal yang sungguhan akan
 *      berpindah halaman (bukan `#anchor`, bukan `target="_blank"`,
 *      bukan tautan ke halaman yang sama), mulai animasikan bilahnya.
 *   3. Begitu `usePathname()` berubah — yang berarti Next.js SUDAH
 *      merender halaman tujuan — animasikan bilahnya ke 100% lalu
 *      sembunyikan.
 *
 * Bilah "berjalan maju sendiri tapi melambat" (bukan naik linear)
 * adalah pola yang sama dipakai YouTube/GitHub: user tahu ada progres
 * tanpa perlu progres itu benar-benar akurat — yang penting terlihat
 * BERGERAK, karena itulah bukti bahwa aplikasinya tidak macet.
 */
export default function NavigasiProgress() {
  const pathname = usePathname();
  const [persen, setPersen] = useState(0);
  const [tampil, setTampil] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const selesaiTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function mulai() {
    if (intervalRef.current) return; // sudah berjalan, jangan dobel
    setTampil(true);
    setPersen(8); // langsung melompat kecil — kesan "responsif seketika"

    intervalRef.current = setInterval(() => {
      setPersen((p) => {
        if (p >= 90) return p; // berhenti di 90%, sisanya menunggu pathname berubah
        // Melambat mendekati 90 — increment mengecil seiring p membesar.
        const langkah = Math.max(0.5, (90 - p) / 12);
        return Math.min(90, p + langkah);
      });
    }, 120);
  }

  function selesai() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setPersen(100);
    // Beri waktu transisi CSS mencapai 100% dulu sebelum disembunyikan,
    // supaya yang terlihat adalah bilah yang "sampai ke ujung", bukan
    // yang mendadak hilang di tengah jalan.
    selesaiTimeoutRef.current = setTimeout(() => {
      setTampil(false);
      setPersen(0);
    }, 220);
  }

  useEffect(() => {
    function onClickCapture(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // buka tab baru dll — biarkan browser yang urus

      const el = (e.target as HTMLElement)?.closest("a[href]");
      if (!el) return;

      const href = el.getAttribute("href") ?? "";
      const target = el.getAttribute("target");
      if (target && target !== "_self") return;
      if (!href || href.startsWith("#")) return;
      if (/^(https?:)?\/\//.test(href) || href.startsWith("mailto:")) return; // tautan keluar

      // Tautan ke path yang sama (mis. cuma beda query/hash) tidak akan
      // memicu perubahan `pathname`, jadi bilahnya tidak akan pernah
      // selesai kalau tetap dimulai di sini.
      const pathBaru = href.split("?")[0].split("#")[0];
      if (pathBaru === pathname) return;

      mulai();
    }

    function onPopState() {
      mulai();
    }

    document.addEventListener("click", onClickCapture, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("click", onClickCapture, true);
      window.removeEventListener("popstate", onPopState);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Pathname berubah -> Next.js sudah merender halaman tujuan -> selesai.
  useEffect(() => {
    if (intervalRef.current || tampil) selesai();
    return () => {
      if (selesaiTimeoutRef.current) clearTimeout(selesaiTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (!tampil) return null;

  return (
    <div
      className="fixed inset-x-0 top-0 z-[90] h-[3px]"
      role="progressbar"
      aria-label="Memuat halaman"
      aria-valuenow={Math.round(persen)}
    >
      <div
        className="h-full bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500 shadow-[0_0_10px_rgba(59,130,246,0.7)] transition-[width] duration-200 ease-out"
        style={{ width: `${persen}%` }}
      />
    </div>
  );
}
