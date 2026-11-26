"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Lapisan "Memuat…" di tengah layar setiap kali guru pindah halaman atau
 * pindah jenjang — menutup layar (dan menahan klik) sampai halaman baru
 * tampil, supaya tidak ada klik ganda ke tombol lain selama server masih
 * menyiapkan halaman.
 *
 * Dipicu oleh:
 *   - klik tautan internal (<a>/<Link>) ke URL yang berbeda,
 *   - kirim form GET (filter/cari di daftar siswa, guru, log, ...),
 *   - `window.dispatchEvent(new Event("lms:muat"))` dari kode lain.
 * Hilang saat path/query berubah, atau setelah 15 detik (jaring pengaman
 * kalau navigasi dibatalkan/gagal).
 */
const BATAS_MS = 15_000;

export default function LoadingNavigasi() {
  const pathname = usePathname();
  const kueri = useSearchParams().toString();
  const [aktif, setAktif] = useState(false);
  const pengaman = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Halaman baru sudah tampil -> sembunyikan.
  useEffect(() => {
    setAktif(false);
    if (pengaman.current) clearTimeout(pengaman.current);
  }, [pathname, kueri]);

  useEffect(() => {
    const mulai = () => {
      setAktif(true);
      if (pengaman.current) clearTimeout(pengaman.current);
      pengaman.current = setTimeout(() => setAktif(false), BATAS_MS);
    };

    const urlBeda = (url: URL) =>
      url.origin === window.location.origin &&
      (url.pathname !== window.location.pathname || url.search !== window.location.search);

    // Tautan: fase CAPTURE dan tanpa cek defaultPrevented, karena <Link>
    // Next.js selalu memanggil preventDefault lalu bernavigasi sendiri.
    function onKlik(e: MouseEvent) {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || !a.getAttribute("href") || a.hasAttribute("download")) return;
      if (a.target && a.target !== "_self") return;
      let url: URL;
      try {
        url = new URL(a.href, window.location.href);
      } catch {
        return;
      }
      if (urlBeda(url)) mulai();
    }

    // Form: hanya yang EKSPLISIT method="get" (form filter/cari). Form React
    // biasa (onSubmit + preventDefault) tidak berpindah halaman, jadi
    // diabaikan; dicek di fase bubble setelah handler-nya jalan.
    function onKirim(e: SubmitEvent) {
      const form = e.target as HTMLFormElement | null;
      if (!form || e.defaultPrevented) return;
      if ((form.getAttribute("method") ?? "").toLowerCase() !== "get") return;
      if (form.target && form.target !== "_self") return;
      mulai();
    }

    document.addEventListener("click", onKlik, true);
    document.addEventListener("submit", onKirim);
    window.addEventListener("lms:muat", mulai);
    return () => {
      document.removeEventListener("click", onKlik, true);
      document.removeEventListener("submit", onKirim);
      window.removeEventListener("lms:muat", mulai);
      if (pengaman.current) clearTimeout(pengaman.current);
    };
  }, []);

  if (!aktif || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      aria-label="Memuat halaman"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-white/55 backdrop-blur-[2px] animate-[muncul-muat_0.15s_ease-out_0.12s_both]"
    >
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-white px-8 py-6 shadow-2xl ring-1 ring-slate-200">
        <span className="relative h-12 w-12">
          <span className="absolute inset-0 rounded-full border-4 border-slate-200" />
          <span className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-[--primary] border-r-[--primary]" />
        </span>
        <span className="text-sm font-semibold text-slate-600">Memuat…</span>
      </div>
      <style>{`@keyframes muncul-muat{from{opacity:0}to{opacity:1}}`}</style>
    </div>
    ,
    document.body
  );
}
