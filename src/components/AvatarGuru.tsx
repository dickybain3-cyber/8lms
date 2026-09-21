"use client";

import { useEffect, useState } from "react";
import { gambarPratinjau } from "@/lib/gambar";

/**
 * Foto profil bulat. Kalau `fotoUrl` kosong (atau gambarnya gagal dimuat —
 * mis. dihapus dari Cloudinary), yang tampil adalah siluet bawaan, bukan
 * ikon gambar rusak: guru tidak perlu tahu kenapa fotonya hilang untuk
 * tetap melihat header yang rapi.
 *
 * `ukuran` dalam piksel CSS. Gambar diminta ke Cloudinary dua kali lipat
 * dari itu (untuk layar rapat piksel) dan sudah dipotong persegi di sana
 * lewat `gambarPratinjau`, jadi ikon 40 px tidak mengunduh berkas 320 px.
 */
export default function AvatarGuru({
  fotoUrl,
  nama,
  ukuran = 40,
  className = "",
}: {
  fotoUrl?: string | null;
  nama?: string | null;
  ukuran?: number;
  className?: string;
}) {
  const [rusak, setRusak] = useState(false);

  // Foto diganti → beri kesempatan baru, jangan terjebak di status "rusak"
  // dari foto sebelumnya.
  useEffect(() => setRusak(false), [fotoUrl]);

  const tampil = Boolean(fotoUrl) && !rusak;

  return (
    <span
      role="img"
      aria-label={nama ? `Foto profil ${nama}` : "Foto profil"}
      style={{ width: ukuran, height: ukuran }}
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-200 ${className}`}
    >
      {tampil ? (
        <img
          src={gambarPratinjau(fotoUrl as string, Math.min(512, ukuran * 2))}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setRusak(true)}
        />
      ) : (
        <svg
          viewBox="0 0 40 40"
          className="h-full w-full text-slate-400"
          fill="currentColor"
          aria-hidden
        >
          <circle cx="20" cy="15" r="7" />
          <path d="M6 40c0-8.2 6.3-13 14-13s14 4.8 14 13z" />
        </svg>
      )}
    </span>
  );
}
