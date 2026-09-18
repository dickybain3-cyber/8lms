"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { gambarSrcSet, gambarTampil, gambarZoom } from "@/lib/gambar";

/**
 * Cara gambar soal ditampilkan ke siswa.
 *
 *  1. UKURAN YANG PAS. Gambar diberi lebar penuh kolom soal dengan batas
 *     tinggi yang ikut tinggi layar (`max-h-[45svh]`), bukan angka piksel
 *     tetap. Di HP potret itu berarti gambar mengambil kira-kira setengah
 *     layar — cukup besar untuk dibaca, tapi pilihan jawabannya masih
 *     kelihatan tanpa menggulir. `svh` (small viewport height) dipakai,
 *     bukan `vh`, supaya bilah alamat browser HP yang muncul-hilang tidak
 *     membuat tata letak melompat.
 *
 *  2. RINGAN. `srcset` + transformasi Cloudinary (lihat src/lib/gambar.ts)
 *     membuat HP hanya mengunduh ukuran yang benar-benar dipakai.
 *
 *  3. BISA DIPERBESAR. Ketuk gambar → layar penuh dengan cubit (pinch),
 *     geser, tombol +/−, ketuk dua kali, dan tombol tutup.
 *
 * CATATAN PENTING soal `alt`: sengaja kosong (`alt=""`) kalau tidak ada
 * keterangan. Gambar di sini adalah BAGIAN DARI SOAL — menuliskan
 * deskripsi otomatis ke dalamnya berisiko membocorkan jawaban ke pembaca
 * layar.
 */

const SKALA_MIN = 1;
const SKALA_MAKS = 6;

function jepit(nilai: number, min: number, maks: number) {
  return Math.min(maks, Math.max(min, nilai));
}

/**
 * Tombol "kembali" HP menutup lapisan, bukan meninggalkan ujian.
 *
 * ── MASALAH YANG DIPECAHKAN ──
 *
 * Mode perbesar adalah lapisan `position: fixed`, bukan halaman. Di mata
 * browser, tidak ada yang berubah saat ia terbuka. Jadi ketika siswa
 * memperbesar gambar lalu menekan tombol kembali HP — gerakan yang
 * SEPENUHNYA WAJAR, karena di setiap aplikasi galeri foto tombol itu
 * menutup gambar — browser justru meninggalkan halaman ujian. Di Android
 * yang berarti kembali ke daftar mapel, dan saat siswa masuk lagi
 * halamannya dimuat ulang dari awal: timer disinkronkan ulang, jawaban
 * dibaca ulang dari autosave, dan posisi soal kembali ke nomor satu.
 * Di tengah ujian berdurasi, itu kepanikan yang tidak perlu.
 *
 * ── CARA KERJANYA ──
 *
 * Saat lapisan dibuka, satu entri riwayat semu didorong. Tombol kembali
 * HP memakan entri itu (memicu `popstate`) dan yang terjadi hanyalah
 * lapisan tertutup — halaman ujian tidak tersentuh. Kalau lapisan
 * ditutup lewat tombol "Tutup", entri semu itu dibuang lagi dengan
 * `history.back()`, supaya riwayat tidak menumpuk: tanpa itu, siswa yang
 * membuka-tutup gambar lima kali harus menekan kembali enam kali untuk
 * benar-benar keluar.
 *
 * `window.history.state` yang sudah ada disalin ikut serta karena App
 * Router Next.js menyimpan kunci internalnya di sana; mendorong state
 * kosong membuat router kehilangan jejak posisinya saat `popstate`.
 */
export function useTutupSaatTombolKembali(tutup: () => void) {
  const tutupRef = useRef(tutup);

  useEffect(() => {
    tutupRef.current = tutup;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    let ditutupLewatKembali = false;

    window.history.pushState(
      { ...(window.history.state ?? {}), __lapisanGambar: true },
      ""
    );

    function onPop() {
      ditutupLewatKembali = true;
      tutupRef.current();
    }

    window.addEventListener("popstate", onPop);

    return () => {
      window.removeEventListener("popstate", onPop);
      if (!ditutupLewatKembali) {
        window.history.back();
      }
    };
  }, []);
}

export default function GambarSoal({
  url,
  keterangan,
  /** Gambar kecil di dalam baris opsi/pasangan — batas tingginya lebih
   *  pendek supaya deretan opsi tetap terbaca sebagai daftar. */
  kecil = false,
}: {
  url: string;
  keterangan?: string | null;
  kecil?: boolean;
}) {
  const [terbuka, setTerbuka] = useState(false);
  const tutup = useCallback(() => setTerbuka(false), []);

  return (
    <>
      <figure className="my-2">
        <button
          type="button"
          onClick={() => setTerbuka(true)}
          aria-label="Perbesar gambar"
          className="group relative block w-full overflow-hidden rounded-xl border border-ink/10 bg-white touch-manipulation"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={gambarTampil(url)}
            srcSet={gambarSrcSet(url)}
            sizes="(max-width: 640px) 100vw, 640px"
            alt={keterangan ?? ""}
            loading="lazy"
            decoding="async"
            className={`mx-auto w-full object-contain ${
              kecil ? "max-h-[28svh]" : "max-h-[45svh]"
            }`}
          />
          <span className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1.5 rounded-lg bg-ink/75 px-2.5 py-1.5 text-[0.7rem] font-semibold text-white backdrop-blur-sm">
            <i className="fas fa-magnifying-glass-plus" aria-hidden />
            Perbesar
          </span>
        </button>
        {keterangan && (
          <figcaption className="mt-1.5 text-center text-xs text-ink/50">
            {keterangan}
          </figcaption>
        )}
      </figure>

      {terbuka && (
        <LayarPerbesar url={url} keterangan={keterangan} onTutup={tutup} />
      )}
    </>
  );
}

/**
 * Layar penuh untuk memperbesar. Cubit/geser ditangani lewat Pointer
 * Events — bukan mengandalkan cubit bawaan browser, karena cubit bawaan
 * memperbesar SELURUH halaman (termasuk header dan tombol navigasi soal),
 * yang justru membuat siswa tersesat dan sulit kembali.
 *
 * Diekspor supaya `KontenKaya` (gambar yang ditempel di tengah teks soal)
 * memakai layar perbesar yang SAMA PERSIS. Dua implementasi zoom yang
 * berbeda di aplikasi yang sama berarti dua perilaku berbeda untuk dua
 * gambar yang bagi siswa terlihat identik.
 */
export function LayarPerbesar({
  url,
  keterangan,
  onTutup,
}: {
  url: string;
  keterangan?: string | null;
  onTutup: () => void;
}) {
  const [skala, setSkala] = useState(1);
  const geserRef = useRef({ x: 0, y: 0 });
  const [, paksaRender] = useState(0);
  const wadahRef = useRef<HTMLDivElement>(null);

  /** pointerId -> posisi terakhir. Dua entri = sedang mencubit. */
  const pointerRef = useRef(new Map<number, { x: number; y: number }>());
  const jarakAwalRef = useRef<number | null>(null);
  const skalaAwalRef = useRef(1);
  const ketukTerakhirRef = useRef(0);

  useTutupSaatTombolKembali(onTutup);

  const terapkan = useCallback((skalaBaru: number, dx = 0, dy = 0) => {
    const s = jepit(skalaBaru, SKALA_MIN, SKALA_MAKS);
    // Saat kembali ke ukuran normal, geseran ikut direset — kalau tidak,
    // gambar bisa "hilang" di luar layar padahal skalanya sudah 1.
    if (s === 1) {
      geserRef.current = { x: 0, y: 0 };
    } else {
      const batas = 300 * s;
      geserRef.current = {
        x: jepit(geserRef.current.x + dx, -batas, batas),
        y: jepit(geserRef.current.y + dy, -batas, batas),
      };
    }
    setSkala(s);
    paksaRender((n) => n + 1);
  }, []);

  // Escape untuk menutup, +/− untuk memperbesar dari papan ketik (lab
  // yang memakai komputer, bukan HP, tetap terlayani).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onTutup();
      if (e.key === "+" || e.key === "=") terapkan(skala + 0.5);
      if (e.key === "-" || e.key === "_") terapkan(skala - 0.5);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onTutup, skala, terapkan]);

  // Kunci gulir halaman di belakang selama layar perbesar terbuka.
  useEffect(() => {
    const asli = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = asli;
    };
  }, []);

  function jarakDuaJari(): number | null {
    const titik = Array.from(pointerRef.current.values());
    if (titik.length < 2) return null;
    return Math.hypot(titik[0].x - titik[1].x, titik[0].y - titik[1].y);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointerRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointerRef.current.size === 2) {
      jarakAwalRef.current = jarakDuaJari();
      skalaAwalRef.current = skala;
      return;
    }

    // Ketuk dua kali (dalam 300 ms) = perbesar/kembalikan. Ini gerakan
    // yang paling dikenal siswa dari aplikasi galeri foto.
    const sekarang = Date.now();
    if (sekarang - ketukTerakhirRef.current < 300) {
      terapkan(skala > 1 ? 1 : 2.5);
    }
    ketukTerakhirRef.current = sekarang;
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const sebelum = pointerRef.current.get(e.pointerId);
    if (!sebelum) return;
    pointerRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointerRef.current.size >= 2) {
      const jarak = jarakDuaJari();
      if (jarak && jarakAwalRef.current) {
        terapkan(skalaAwalRef.current * (jarak / jarakAwalRef.current));
      }
      return;
    }

    if (skala > 1) {
      terapkan(skala, e.clientX - sebelum.x, e.clientY - sebelum.y);
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    pointerRef.current.delete(e.pointerId);
    if (pointerRef.current.size < 2) jarakAwalRef.current = null;
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-ink/95 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Gambar soal diperbesar"
    >
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        {/*
          Tombol kembali diletakkan di KIRI ATAS, tempat yang sama dengan
          tombol kembali bawaan aplikasi Android/iOS. Tombol "Tutup" di
          kanan tetap dipertahankan untuk pemakai komputer. Keduanya
          menjalankan hal yang sama — yang penting siswa menemukan salah
          satunya tanpa berpikir, alih-alih meraih tombol kembali HP.
        */}
        <button
          type="button"
          onClick={onTutup}
          className="flex h-11 items-center gap-2 rounded-xl bg-white/15 pl-3 pr-4 text-sm font-semibold text-white transition-colors hover:bg-white/25"
        >
          <i className="fas fa-arrow-left" aria-hidden />
          Kembali
        </button>

        <p className="min-w-0 flex-1 truncate text-center text-sm text-white/70">
          {keterangan ?? "Gambar soal"}
        </p>

        <button
          type="button"
          onClick={onTutup}
          aria-label="Tutup"
          className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 text-white transition-colors hover:bg-white/25"
        >
          <i className="fas fa-xmark" aria-hidden />
        </button>
      </div>

      <div
        ref={wadahRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => terapkan(skala > 1 ? 1 : 2.5)}
        className="flex flex-1 select-none items-center justify-center overflow-hidden"
        style={{ touchAction: "none", cursor: skala > 1 ? "grab" : "zoom-in" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={gambarZoom(url)}
          alt={keterangan ?? ""}
          draggable={false}
          className="max-h-full max-w-full object-contain"
          style={{
            transform: `translate(${geserRef.current.x}px, ${geserRef.current.y}px) scale(${skala})`,
            transformOrigin: "center center",
            transition: pointerRef.current.size ? "none" : "transform 120ms ease-out",
          }}
        />
      </div>

      <div className="flex shrink-0 items-center justify-center gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <TombolZoom
          ikon="fa-magnifying-glass-minus"
          label="Perkecil"
          onClick={() => terapkan(skala - 0.5)}
          nonaktif={skala <= SKALA_MIN}
        />
        <button
          type="button"
          onClick={() => terapkan(1)}
          className="h-12 rounded-xl bg-white/15 px-5 text-sm font-semibold tabular-nums text-white transition-colors hover:bg-white/25"
        >
          {Math.round(skala * 100)}%
        </button>
        <TombolZoom
          ikon="fa-magnifying-glass-plus"
          label="Perbesar"
          onClick={() => terapkan(skala + 0.5)}
          nonaktif={skala >= SKALA_MAKS}
        />
      </div>

      <p className="pb-3 text-center text-[0.7rem] text-white/40">
        Cubit dua jari atau ketuk dua kali untuk memperbesar · tombol kembali
        HP menutup gambar ini, bukan keluar dari ujian
      </p>
    </div>
  );
}

function TombolZoom({
  ikon,
  label,
  onClick,
  nonaktif,
}: {
  ikon: string;
  label: string;
  onClick: () => void;
  nonaktif: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={nonaktif}
      aria-label={label}
      className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 text-lg text-white transition-colors hover:bg-white/25 disabled:opacity-30"
    >
      <i className={`fas ${ikon}`} aria-hidden />
    </button>
  );
}
