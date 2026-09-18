"use client";

import { useCallback, useMemo, useState } from "react";
import { bersihkanHtml, escapeAtribut } from "@/lib/html-soal";
import { gambarSrcSet, gambarTampil } from "@/lib/gambar";
import { LayarPerbesar } from "./GambarSoal";

/**
 * Menampilkan isi soal yang ditulis guru lewat editor kaya — teks
 * berformat DENGAN gambar yang bisa berada di tengah kalimat.
 *
 * ── DUA BENTUK DATA YANG HARUS SAMA-SAMA JALAN ──
 *
 * Soal yang sudah ada di database ditulis sebelum editor kaya ada, jadi
 * isinya teks polos di field `pertanyaan` / `teks`. Soal baru menyimpan
 * HTML di field `*_html` DAN teks polos turunannya di field lama.
 * Komponen ini memilih: kalau ada HTML, pakai HTML; kalau tidak, render
 * teks polos persis seperti sebelumnya (`whitespace-pre-wrap`).
 *
 * Artinya tidak ada migrasi data yang perlu dijalankan, dan tidak ada
 * soal lama yang berubah tampilannya. Ini penting: soal-soal itu sudah
 * pernah dipakai ujian dan nilainya sudah tercatat — mengubah cara
 * tampilnya berarti mengubah soal yang sudah dinilai.
 *
 * ── KENAPA GAMBARNYA TIDAK PAKAI <GambarSoal> ──
 *
 * `GambarSoal` merender satu gambar sebagai blok tersendiri. Di sini
 * gambar berada DI DALAM aliran teks, disisipkan guru di posisi mana pun,
 * jumlahnya bisa berapa saja, dan bentuknya adalah string HTML — bukan
 * pohon komponen React. Jadi `<img>`-nya ditulis langsung ke HTML, dan
 * klik ditangkap satu kali di elemen pembungkus (event delegation) lalu
 * dibuka dengan `LayarPerbesar` YANG SAMA dipakai `GambarSoal`. Buat
 * siswa, memperbesar gambar tempelan dan gambar unggahan terasa persis
 * sama — termasuk perilaku tombol kembali HP-nya.
 */

/**
 * Tukar `src` mentah jadi URL Cloudinary yang sudah dikecilkan, dan
 * pasang `srcset` supaya HP hanya mengunduh ukuran yang dipakainya.
 *
 * Tanpa langkah ini, gambar tempelan akan dikirim dalam ukuran unggah
 * penuh (sampai 1600 px) ke setiap HP — persis pemborosan yang sudah
 * diperbaiki untuk gambar unggahan di src/lib/gambar.ts. URL aslinya
 * disimpan di `data-asli` karena mode perbesar butuh versi resolusi
 * tinggi, bukan versi kecil yang tampil di kartu soal.
 */
function siapkanUntukSiswa(htmlBersih: string): string {
  return htmlBersih.replace(/<img\b([^>]*)>/gi, (_seluruh, atribut: string) => {
    const src = /\ssrc="([^"]*)"/i.exec(atribut);
    if (!src) return "";

    const asli = src[1].replace(/&amp;/g, "&");
    const alt = /\salt="([^"]*)"/i.exec(atribut)?.[1] ?? "";
    const lebar = /\sdata-lebar="(\d+)"/i.exec(atribut)?.[1];
    const srcset = gambarSrcSet(asli);

    const gaya = lebar ? ` style="width:${lebar}%"` : "";
    const bagianSrcset = srcset ? ` srcset="${escapeAtribut(srcset)}"` : "";

    return (
      `<img src="${escapeAtribut(gambarTampil(asli))}"${bagianSrcset}` +
      ` sizes="(max-width: 640px) 100vw, 640px" alt="${escapeAtribut(alt)}"` +
      ` loading="lazy" decoding="async" class="gambar-isi-soal"${gaya}` +
      ` data-asli="${escapeAtribut(asli)}" />`
    );
  });
}

export default function KontenKaya({
  html,
  teks,
  /** Isi di dalam baris opsi/pernyataan — ukuran font & batas tinggi
   *  gambar dikecilkan supaya daftar opsi tetap terbaca sebagai daftar. */
  kecil = false,
  className = "",
}: {
  html?: string | null;
  teks?: string | null;
  kecil?: boolean;
  className?: string;
}) {
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  const tutupZoom = useCallback(() => setZoomUrl(null), []);

  // Disaring ULANG di sisi siswa, bukan hanya saat disimpan. Data di
  // database bisa saja ditulis lewat jalur lain (skrip impor, perbaikan
  // manual di dashboard Supabase), dan penyaring yang cuma dijalankan
  // saat menyimpan tidak melindungi apa pun terhadap data itu.
  const htmlSiap = useMemo(
    () => (html ? siapkanUntukSiswa(bersihkanHtml(html)) : ""),
    [html]
  );

  function onKlik(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (target.tagName !== "IMG") return;
    const asli = target.getAttribute("data-asli");
    if (asli) setZoomUrl(asli);
  }

  if (!htmlSiap) {
    // Jalur soal lama: teks polos, tampilan tidak berubah sedikit pun.
    return (
      <p
        className={`whitespace-pre-wrap leading-relaxed text-ink ${
          kecil ? "text-[15px]" : "text-[16px]"
        } ${className}`}
      >
        {teks ?? ""}
      </p>
    );
  }

  return (
    <>
      <div
        onClick={onKlik}
        className={`isi-soal leading-relaxed text-ink ${
          kecil ? "isi-soal-kecil text-[15px]" : "text-[16px]"
        } ${className}`}
        dangerouslySetInnerHTML={{ __html: htmlSiap }}
      />
      {zoomUrl && <LayarPerbesar url={zoomUrl} onTutup={tutupZoom} />}
    </>
  );
}
